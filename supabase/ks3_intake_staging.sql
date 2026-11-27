-- Separate private KS3 review area; existing GCSE tables are unchanged.
create table if not exists public.ks3_intake_drafts (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  owner_id uuid not null references auth.users(id),
  curriculum text not null default 'department-2026-27',
  year_group smallint not null check (year_group between 7 and 9),
  unit_code text not null,
  source_filename text not null,
  source_publisher text not null,
  question_slide integer not null check (question_slide > 0),
  answer_slide integer not null check (answer_slide > 0),
  question_text text not null default '',
  answer_text text not null default '',
  step_id text not null,
  difficulty text not null check (difficulty in ('Accessible','Developing','Challenge')),
  support text not null check (support in ('None','Concrete resources','Visual scaffold','Guided')),
  marks smallint check (marks between 0 and 30),
  question_image_path text not null,
  answer_image_path text not null,
  rights_basis text not null check (rights_basis in ('original','school-authorised-third-party')),
  publication_status text not null default 'staged' check (publication_status = 'staged'),
  created_at timestamptz not null default now(),
  unique(batch_id, question_slide)
);
create index if not exists ks3_intake_owner_batch_idx on public.ks3_intake_drafts(owner_id,batch_id);
alter table public.ks3_intake_drafts enable row level security;
create policy "ks3 owner read staged drafts" on public.ks3_intake_drafts
  for select to authenticated using (
    owner_id = (select auth.uid()) and
    exists (select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.role='owner' and p.approved)
  );
create policy "ks3 owner insert staged drafts" on public.ks3_intake_drafts
  for insert to authenticated with check (
    owner_id = (select auth.uid()) and
    exists (select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.role='owner' and p.approved)
  );
-- No UPDATE, DELETE or public-reading policies. These are immutable review records.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('ks3-intake-private','ks3-intake-private',false,6291456,array['image/png'])
on conflict(id) do nothing;
create policy "ks3 owner read private intake images" on storage.objects
  for select to authenticated using (
    bucket_id='ks3-intake-private' and
    (storage.foldername(name))[1] = (select auth.uid())::text and
    exists (select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.role='owner' and p.approved)
  );
create policy "ks3 owner insert private intake images" on storage.objects
  for insert to authenticated with check (
    bucket_id='ks3-intake-private' and
    (storage.foldername(name))[1] = (select auth.uid())::text and
    storage.extension(name) = 'png' and
    exists (select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.role='owner' and p.approved)
  );
