-- Review records are private. This migration has no publication or storage writes.
create table public.shadow_qa_events (
  id bigint generated always as identity primary key,
  intake_id uuid not null references public.shadow_papers(id) on delete restrict,
  run_id bigint references public.shadow_qa_events(id) on delete restrict,
  kind text not null check (kind in ('run', 'audit', 'decision', 'batch')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check ((kind = 'run') = (run_id is null))
);
create index shadow_qa_events_intake_order on public.shadow_qa_events (intake_id, id);
create index shadow_qa_events_run on public.shadow_qa_events (run_id, id);
create unique index shadow_qa_events_run_version on public.shadow_qa_events (
  intake_id, (payload->>'bundleHash'), (payload->>'ruleVersion'), (payload->>'batchVerified')
) where kind = 'run';
alter table public.shadow_qa_events enable row level security;
revoke all on public.shadow_qa_events from public, anon, authenticated, service_role;
revoke all on sequence public.shadow_qa_events_id_seq from public, anon, authenticated, service_role;
grant select on public.shadow_qa_events to authenticated;
create policy shadow_qa_events_owner_read on public.shadow_qa_events
  for select to authenticated using ((select public.is_approved_owner()));

-- A separate privileged verifier attests to the exact report after checking the
-- private source and per-part calculations. Browser roles cannot mint attestations.
create table public.shadow_qa_attestations (
  intake_id uuid not null references public.shadow_papers(id) on delete restrict,
  bundle_hash text not null check (bundle_hash ~ '^[0-9a-f]{64}$'),
  manifest_hash text not null check (manifest_hash ~ '^[0-9a-f]{64}$'),
  rule_version text not null check (rule_version ~ '^shadow-qa-3[.][0-9a-f]{64}$'),
  questions jsonb not null check (jsonb_typeof(questions) = 'array'),
  verified_by text not null check (length(btrim(verified_by)) between 1 and 200),
  created_at timestamptz not null default now(),
  primary key (intake_id, bundle_hash, manifest_hash, rule_version)
);
alter table public.shadow_qa_attestations enable row level security;
revoke all on public.shadow_qa_attestations from public, anon, authenticated, service_role;

-- The login is provisioned separately and inherits only this capability.
create role mqb_shadow_qa_verifier nologin;
create function public.attest_shadow_qa_report(p_intake uuid, p_report jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  registered_path text;
  registered_status text;
  existing jsonb;
begin
  if not pg_has_role(session_user, 'mqb_shadow_qa_verifier', 'member') then
    raise exception 'Dedicated QA verifier required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_report) is distinct from 'object' or length(p_report::text) > 300000
    or coalesce(p_report->>'bundleHash','') !~ '^[0-9a-f]{64}$'
    or coalesce(p_report->>'manifestHash','') !~ '^[0-9a-f]{64}$'
    or coalesce(p_report->>'ruleVersion','') !~ '^shadow-qa-3[.][0-9a-f]{64}$'
    or jsonb_typeof(p_report->'questions') is distinct from 'array' then
    raise exception 'Invalid verifier report';
  end if;
  if jsonb_array_length(p_report->'questions') not between 1 and 50 then
    raise exception 'Invalid verifier question count';
  end if;
  select intake_manifest_path, status into registered_path, registered_status
    from public.shadow_papers where id = p_intake for update;
  if registered_status is null or registered_status not in ('awaiting-review', 'in-review')
    or registered_path is null
    or registered_path not like ('%/bundles/' || (p_report->>'bundleHash') || '/intake.json') then
    raise exception 'The verifier report does not match the registered intake';
  end if;
  select questions into existing from public.shadow_qa_attestations
    where intake_id = p_intake and bundle_hash = p_report->>'bundleHash'
      and manifest_hash = p_report->>'manifestHash' and rule_version = p_report->>'ruleVersion';
  if found then
    if existing is distinct from p_report->'questions' then
      raise exception 'An attested version cannot be changed';
    end if;
    return;
  end if;
  insert into public.shadow_qa_attestations (intake_id, bundle_hash, manifest_hash, rule_version, questions, verified_by)
  values (p_intake, p_report->>'bundleHash', p_report->>'manifestHash', p_report->>'ruleVersion',
    p_report->'questions', session_user);
end;
$$;
revoke all on function public.attest_shadow_qa_report(uuid,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.attest_shadow_qa_report(uuid,jsonb) to mqb_shadow_qa_verifier;

-- Direct writes have no grant. This operation serializes each intake and derives
-- the sample and approved question list from its stored evidence and events.
create function public.record_shadow_qa_event(
  p_intake uuid, p_expected_event bigint, p_kind text, p_payload jsonb
) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  intake public.shadow_papers%rowtype;
  current_run public.shadow_qa_events%rowtype;
  last_event bigint;
  new_id bigint;
  sample jsonb;
  passed_count integer;
  target integer;
  target_question jsonb;
  audit_failed boolean;
  batch_verified boolean;
  previous_decision jsonb;
begin
  if actor is null or not coalesce(public.is_approved_owner(), false) then
    raise exception 'Approved owner required' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('run', 'audit', 'decision', 'batch')
    or jsonb_typeof(p_payload) is distinct from 'object' or length(p_payload::text) > 300000 then
    raise exception 'Invalid QA payload';
  end if;

  select * into intake from public.shadow_papers where id = p_intake for update;
  if not found or intake.status not in ('awaiting-review', 'in-review')
     or intake.intake_manifest_path !~ '/bundles/[0-9a-f]{64}/intake\.json$' then
    raise exception 'A staged ZIP intake awaiting review is required';
  end if;
  select id into last_event from public.shadow_qa_events
    where intake_id = p_intake order by id desc limit 1;
  if last_event is distinct from p_expected_event then
    raise exception 'QA changed in another session. Refresh and retry.' using errcode = '40001';
  end if;
  select * into current_run from public.shadow_qa_events
    where intake_id = p_intake and kind = 'run' order by id desc limit 1;

  if p_kind = 'run' then
    if coalesce(p_payload->>'ruleVersion', '') !~ '^[a-z0-9.-]{1,80}$'
      or coalesce(p_payload->>'manifestHash', '') !~ '^[0-9a-f]{64}$'
      or coalesce(p_payload->>'bundleHash', '') !~ '^[0-9a-f]{64}$'
      or intake.intake_manifest_path not like ('%/bundles/' || (p_payload->>'bundleHash') || '/intake.json')
      or jsonb_typeof(p_payload->'questions') is distinct from 'array' then
      raise exception 'Invalid QA run';
    end if;
    if jsonb_array_length(p_payload->'questions') not between 1 and 50
      or exists (
       select 1 from jsonb_array_elements(p_payload->'questions') q
       where jsonb_typeof(q->'number') is distinct from 'number'
          or coalesce(q->>'number', '') !~ '^([1-9]|[1-4][0-9]|50)$'
          or coalesce(q->>'status', '') not in ('qa-passed', 'exception')
          or jsonb_typeof(q->'links') is distinct from 'array'
          or (q ? 'annotation' and (
            jsonb_typeof(q->'annotation') is distinct from 'string' or btrim(q->>'annotation') = ''))
          or exists (
            select 1 from jsonb_array_elements(jsonb_build_array(q->'mathematics', q->'marking', q->'skill')) c
            where coalesce(c->>'state', '') not in ('pass', 'exception')
              or jsonb_typeof(c->'evidence') is distinct from 'string' or btrim(c->>'evidence') = '')
          or (q->>'status' = 'qa-passed' and (
            q->'mathematics'->>'method' is distinct from 'part-calculations'
            or q->'mathematics'->>'state' is distinct from 'pass'
            or q->'marking'->>'state' is distinct from 'pass'
            or q->'skill'->>'state' is distinct from 'pass'))
      ) or (
       select count(distinct q->>'number') from jsonb_array_elements(p_payload->'questions') q
      ) <> jsonb_array_length(p_payload->'questions') then
      raise exception 'Invalid QA questions';
    end if;

    if exists (
      select 1 from jsonb_array_elements(p_payload->'questions') q
      where jsonb_array_length(q->'links') not between 1 and 26
        or exists (select 1 from jsonb_array_elements(q->'links') l
          where coalesce(l->>'part', '') !~ ('^Q' || lpad(q->>'number', 2, '0') || '[a-z]*$')
            or coalesce(l->>'kind', '') not in ('exact-replacement', 'skill-variant', 'lower-demand-variant', 'unsuitable')
            or jsonb_typeof(l->'evidence') is distinct from 'string' or btrim(l->>'evidence') = '')
        or (select count(distinct l->>'part') from jsonb_array_elements(q->'links') l) <> jsonb_array_length(q->'links')
    ) then raise exception 'Invalid QA links'; end if;

    select exists (
      select 1 from public.shadow_qa_attestations verified
      where verified.intake_id = p_intake
        and verified.bundle_hash = p_payload->>'bundleHash'
        and verified.manifest_hash = p_payload->>'manifestHash'
        and verified.rule_version = p_payload->>'ruleVersion'
        and verified.questions = p_payload->'questions'
    ) into batch_verified;
    if not batch_verified and current_run.payload->'batchVerified' = 'true'::jsonb then
      raise exception 'An unverified report cannot replace a verified run';
    end if;
    if exists (
      select 1 from public.shadow_qa_events where intake_id = p_intake and kind = 'run'
        and payload->>'ruleVersion' = p_payload->>'ruleVersion'
        and payload->>'batchVerified' = batch_verified::text
        and payload->>'bundleHash' = p_payload->>'bundleHash'
    ) then
      raise exception 'This version has already been reviewed';
    end if;
    -- An untrusted report remains useful for individual review. It cannot certify
    -- any item or supply a batch sample, even with fabricated calculations.
    if not batch_verified then
      p_payload := jsonb_set(p_payload, '{questions}', (
        select jsonb_agg(jsonb_set(q, '{status}', '"exception"') order by ord)
        from jsonb_array_elements(p_payload->'questions') with ordinality as items(q, ord)
      ));
    end if;

    select count(*) into passed_count from jsonb_array_elements(p_payload->'questions') q where q->>'status' = 'qa-passed';
    with candidates as (
      select (q->>'number')::integer as number, q ? 'annotation' as annotated,
        jsonb_path_exists(q, '$.links[*] ? (@.kind != "exact-replacement")') as variant,
        jsonb_path_exists(q, '$.links[*] ? (@.kind == "skill-variant")') as skill_variant,
        md5((p_payload->>'bundleHash') || (q->>'number')) as draw
      from jsonb_array_elements(p_payload->'questions') q where q->>'status' = 'qa-passed'
    ), annotation_draw as (
      select number, 0 as priority from candidates where annotated order by variant, draw, number limit 1
    ), variant_draw as (
      select number, 1 as priority from candidates
      where variant and number not in (select number from annotation_draw)
      order by skill_variant desc, draw, number limit 1
    ), ordinary_draw as (
      select number, 2 as priority from candidates where not annotated and not variant order by draw, number limit 1
    ), seeded as (
      select * from annotation_draw union all select * from variant_draw union all select * from ordinary_draw
    ), selected as (
      select c.number, coalesce(s.priority, 3) as priority, c.draw
      from candidates c left join seeded s using (number)
      order by priority, draw, number limit greatest(3, (passed_count + 9) / 10)
    )
    select coalesce(jsonb_agg(number order by priority, draw, number), '[]'::jsonb) into sample from selected;
    p_payload := jsonb_build_object(
      'questions', p_payload->'questions', 'ruleVersion', p_payload->'ruleVersion',
      'manifestHash', p_payload->'manifestHash', 'bundleHash', p_payload->'bundleHash',
      'sample', sample, 'batchVerified', batch_verified);

  else
    if current_run.id is null then raise exception 'Run QA first'; end if;
    select exists (
      select 1 from public.shadow_qa_events where run_id = current_run.id and kind = 'audit'
        and payload->>'outcome' = 'substantive-error'
    ) into audit_failed;
    if p_kind in ('audit', 'decision') then
      if jsonb_typeof(p_payload->'number') is distinct from 'number' or coalesce(p_payload->>'number', '') !~ '^([1-9]|[1-4][0-9]|50)$' then
        raise exception 'Invalid question number';
      end if;
      target := (p_payload->>'number')::integer;
      select q into target_question from jsonb_array_elements(current_run.payload->'questions') q
        where (q->>'number')::integer = target;
      if target_question is null or (p_payload ? 'note' and jsonb_typeof(p_payload->'note') is distinct from 'string') or length(coalesce(p_payload->>'note', '')) > 4000 then raise exception 'Invalid review details'; end if;
    end if;
    if p_kind = 'audit' then
      if current_run.payload->'batchVerified' is distinct from 'true'::jsonb
        or audit_failed or not (current_run.payload->'sample' @> jsonb_build_array(target))
        or coalesce(p_payload->>'outcome', '') not in ('pass', 'substantive-error')
        or (p_payload->>'outcome' = 'substantive-error' and btrim(coalesce(p_payload->>'note', ''), E' \t\r\n') = '')
        or exists (select 1 from public.shadow_qa_events where run_id = current_run.id
                    and (kind = 'batch' or (kind = 'audit' and payload->>'number' = target::text))) then
        raise exception 'This question is not available for sample audit';
      end if;
    elsif p_kind = 'decision' then
      if current_run.payload->'batchVerified' is distinct from 'true'::jsonb
        or (target_question->>'status' <> 'exception' and not audit_failed)
        or coalesce(p_payload->>'outcome', '') not in ('approved', 'approved-with-changes', 'held', 'rejected')
        or btrim(coalesce(p_payload->>'note', ''), E' \t\r\n') = '' then
        raise exception 'A verified run, an exception and a decision note are required';
      end if;
      select payload into previous_decision from public.shadow_qa_events
        where run_id = current_run.id and kind = 'decision' and payload->>'number' = target::text
        order by id desc limit 1;
      if previous_decision->>'outcome' = p_payload->>'outcome'
        and previous_decision->>'note' = btrim(p_payload->>'note', E' \t\r\n') then
        raise exception 'This decision is already recorded';
      end if;
    elsif p_kind = 'batch' then
      sample := current_run.payload->'sample';
      if current_run.payload->'batchVerified' is distinct from 'true'::jsonb
        or audit_failed or jsonb_array_length(sample) = 0 or exists (
        select 1 from jsonb_array_elements_text(sample) n
        where not exists (
          select 1 from public.shadow_qa_events where run_id = current_run.id and kind = 'audit'
            and payload->>'number' = n and payload->>'outcome' = 'pass'
        )
      ) or exists (select 1 from public.shadow_qa_events where run_id = current_run.id and kind = 'batch') then
        raise exception 'Batch approval requires a completed audit with no substantive errors';
      end if;
      p_payload := jsonb_build_object('numbers', (
        select jsonb_agg((q->>'number')::integer order by (q->>'number')::integer)
        from jsonb_array_elements(current_run.payload->'questions') q where q->>'status' = 'qa-passed'
      ));
    else
      raise exception 'Unknown QA action';
    end if;
  end if;
  if p_kind in ('audit', 'decision') then
    p_payload := jsonb_build_object('number', target, 'outcome', p_payload->>'outcome',
      'note', btrim(coalesce(p_payload->>'note', ''), E' \t\r\n'));
  end if;
  insert into public.shadow_qa_events (intake_id, run_id, kind, payload, actor_id)
    values (p_intake, case when p_kind <> 'run' then current_run.id end, p_kind, p_payload, actor)
    returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.record_shadow_qa_event(uuid, bigint, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.record_shadow_qa_event(uuid, bigint, text, jsonb) to authenticated;
