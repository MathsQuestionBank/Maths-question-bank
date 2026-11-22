-- Review-first question extraction. Isolated from published GCSE and KS3 tables.
create table if not exists public.ks3_extracted_question_drafts (
 id uuid primary key default gen_random_uuid(),
 source_resource_id uuid not null references public.ks3_source_resources(id),
 owner_id uuid not null references auth.users(id),
 year_group smallint not null check(year_group between 7 and 9),
 unit_code text not null,
 source_question_slide integer not null check(source_question_slide>0),
 source_answer_slide integer check(source_answer_slide>0),
 question_text text not null,
 answer_text text not null default '',
 step_label text not null,
 difficulty text not null check(difficulty in ('Accessible','Developing','Challenge')),
 support text not null check(support in ('None','Concrete resources','Visual scaffold','Guided')),
 answer_status text not null check(answer_status in ('source-unverified','missing','teacher-written','teacher-verified')),
 review_status text not null default 'needs-review' check(review_status in ('needs-review','approved','excluded')),
 content_status text not null default 'draft' check(content_status='draft'),
 visual_check_required boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(source_resource_id,source_question_slide)
);
create index if not exists ks3_extracted_source_idx on public.ks3_extracted_question_drafts(source_resource_id);
alter table public.ks3_extracted_question_drafts enable row level security;
create policy "ks3 draft owner select" on public.ks3_extracted_question_drafts
for select to authenticated using (
 owner_id=(select auth.uid()) and
 exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.role='owner' and p.approved)
);
create policy "ks3 draft owner insert" on public.ks3_extracted_question_drafts
for insert to authenticated with check (
 owner_id=(select auth.uid()) and
 exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.role='owner' and p.approved)
);
create policy "ks3 draft owner update" on public.ks3_extracted_question_drafts
for update to authenticated using (
 owner_id=(select auth.uid()) and
 exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.role='owner' and p.approved)
) with check (
 owner_id=(select auth.uid()) and content_status='draft' and
 exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.role='owner' and p.approved)
);
