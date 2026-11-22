-- Private source-material staging separate from questions and GCSE.
create table if not exists public.ks3_source_resources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  batch_id uuid not null,
  year_group smallint not null check (year_group between 7 and 9),
  unit_code text not null,
  resource_type text not null check (resource_type in ('exemplar','lower-guidance','higher-guidance')),
  original_filename text not null,
  storage_path text not null unique,
  bytes integer not null check (bytes > 0 and bytes <= 20971520),
  source_publisher text not null default 'White Rose Maths',
  rights_status text not null default 'restricted-review' check(rights_status='restricted-review'),
  created_at timestamptz not null default now(),
  unique(batch_id,unit_code,resource_type)
);
create index if not exists ks3_source_resources_owner on public.ks3_source_resources(owner_id,batch_id);
alter table public.ks3_source_resources enable row level security;
create policy "ks3 source owner read" on public.ks3_source_resources
for select to authenticated using (
  owner_id=(select auth.uid()) and
  exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.role='owner' and p.approved=true)
);
create policy "ks3 source owner insert" on public.ks3_source_resources
for insert to authenticated with check (
  owner_id=(select auth.uid()) and
  exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.role='owner' and p.approved=true)
);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('ks3-source-private','ks3-source-private',false,20971520,
array['application/pdf','application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict(id) do nothing;
create policy "ks3 source owner private read" on storage.objects
for select to authenticated using (
  bucket_id='ks3-source-private' and
  (storage.foldername(name))[1]=(select auth.uid())::text and
  exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.role='owner' and p.approved=true)
);
create policy "ks3 source owner private insert" on storage.objects
for insert to authenticated with check (
  bucket_id='ks3-source-private' and
  (storage.foldername(name))[1]=(select auth.uid())::text and
  storage.extension(name) in ('pdf','pptx') and
  exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.role='owner' and p.approved=true)
);
