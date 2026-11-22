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
  intake_id, (payload->>'bundleHash'), (payload->>'ruleVersion')
) where kind = 'run';
alter table public.shadow_qa_events enable row level security;
revoke all on public.shadow_qa_events from public, anon, authenticated;
grant select on public.shadow_qa_events to authenticated;
create policy shadow_qa_events_owner_read on public.shadow_qa_events
  for select to authenticated using ((select public.is_approved_owner()));

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
begin
  if actor is null or not coalesce(public.is_approved_owner(), false) then
    raise exception 'Approved owner required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or length(p_payload::text) > 300000 then
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
    if exists (
      select 1 from public.shadow_qa_events where intake_id = p_intake and kind = 'run'
        and payload->>'ruleVersion' = p_payload->>'ruleVersion'
        and payload->>'bundleHash' = p_payload->>'bundleHash'
    ) then
      raise exception 'This version has already been reviewed';
    end if;
    if jsonb_array_length(p_payload->'questions') not between 1 and 50
      or exists (
       select 1 from jsonb_array_elements(p_payload->'questions') q
       where jsonb_typeof(q->'number') is distinct from 'number'
          or coalesce(q->>'number', '') !~ '^([1-9]|[1-4][0-9]|50)$'
          or coalesce(q->>'status', '') not in ('qa-passed', 'exception')
          or (q->>'status' = 'qa-passed' and (
            q->'mathematics'->>'state' is distinct from 'pass'
            or q->'marking'->>'state' is distinct from 'pass'
            or q->'skill'->>'state' is distinct from 'pass'))
      ) or (
       select count(distinct q->>'number') from jsonb_array_elements(p_payload->'questions') q
      ) <> jsonb_array_length(p_payload->'questions') then
      raise exception 'Invalid QA questions';
    end if;

    select count(*) into passed_count from jsonb_array_elements(p_payload->'questions') q where q->>'status' = 'qa-passed';
    with candidates as (
      select (q->>'number')::integer as number,
        case when q ? 'annotation' then 0
          when jsonb_path_exists(q, '$.links[*] ? (@.kind != "exact-replacement")') then 1
          else 2 end as risk,
        md5((p_payload->>'bundleHash') || (q->>'number')) as draw
      from jsonb_array_elements(p_payload->'questions') q where q->>'status' = 'qa-passed'
    ), ranked as (
      select *, row_number() over (partition by risk order by draw, number) as position from candidates
    )
    select coalesce(jsonb_agg(number order by position, risk, draw, number), '[]'::jsonb) into sample
    from (select * from ranked order by position, risk, draw, number limit greatest(3, (passed_count + 9) / 10)) selected;
    p_payload := jsonb_build_object(
      'questions', p_payload->'questions', 'ruleVersion', p_payload->'ruleVersion',
      'manifestHash', p_payload->'manifestHash', 'bundleHash', p_payload->'bundleHash', 'sample', sample);
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
      if target_question is null or length(coalesce(p_payload->>'note', '')) > 4000 then raise exception 'Invalid review details'; end if;
    end if;
    if p_kind = 'audit' then
      if audit_failed or not (current_run.payload->'sample' @> jsonb_build_array(target))
        or coalesce(p_payload->>'outcome', '') not in ('pass', 'substantive-error')
        or (p_payload->>'outcome' = 'substantive-error' and btrim(coalesce(p_payload->>'note', '')) = '')
        or exists (select 1 from public.shadow_qa_events where run_id = current_run.id
                    and (kind = 'batch' or (kind = 'audit' and payload->>'number' = target::text))) then
        raise exception 'This question is not available for sample audit';
      end if;
    elsif p_kind = 'decision' then
      if (target_question->>'status' <> 'exception' and not audit_failed)
        or coalesce(p_payload->>'outcome', '') not in ('approved', 'approved-with-changes', 'held', 'rejected')
        or btrim(coalesce(p_payload->>'note', '')) = '' then
        raise exception 'An exception and a decision note are required';
      end if;
    elsif p_kind = 'batch' then
      sample := current_run.payload->'sample';
      if audit_failed or jsonb_array_length(sample) = 0 or exists (
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
  insert into public.shadow_qa_events (intake_id, run_id, kind, payload, actor_id)
    values (p_intake, case when p_kind <> 'run' then current_run.id end, p_kind, p_payload, actor)
    returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.record_shadow_qa_event(uuid, bigint, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_shadow_qa_event(uuid, bigint, text, jsonb) to authenticated;
