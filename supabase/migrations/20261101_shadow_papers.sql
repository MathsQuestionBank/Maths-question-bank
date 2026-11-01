-- Separate official Pearson shadow sets while preserving the original 90 exam paper identities
-- and the existing assessment_questions -> questions relationship.
create table if not exists public.shadow_papers (
 id uuid primary key default gen_random_uuid(),
 original_paper_id uuid not null references public.exam_papers(id) on delete restrict,
 shadow_set text not null check (length(trim(shadow_set)) between 1 and 60),
 question_pdf_path text not null,
 mark_scheme_pdf_path text not null,
 intake_manifest_path text not null,
 status text not null default 'awaiting-review' check (status in ('awaiting-review','in-review','reviewed')),
 uploaded_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 unique (original_paper_id, shadow_set)
);
alter table public.shadow_papers enable row level security;
create policy "Approved owner manages private shadow paper sources"
 on public.shadow_papers for all to authenticated
 using (public.is_approved_owner())
 with check (public.is_approved_owner() and uploaded_by = auth.uid());
grant select,insert,update,delete on public.shadow_papers to authenticated;

alter table public.questions add column if not exists shadow_paper_id uuid references public.shadow_papers(id) on delete restrict;
alter table public.questions add column if not exists shadow_of_question_id uuid references public.questions(id) on delete restrict;
alter table public.questions add constraint shadow_pair_complete
 check ((shadow_paper_id is null) = (shadow_of_question_id is null));
create unique index if not exists question_shadow_unique_original_per_set
 on public.questions(shadow_paper_id,shadow_of_question_id) where shadow_paper_id is not null;
create index if not exists question_shadow_original_lookup
 on public.questions(shadow_of_question_id) where shadow_of_question_id is not null;
comment on column public.questions.shadow_of_question_id is 'Explicitly verified source link; never infer from question number alone.';
comment on column public.questions.shadow_paper_id is 'Optional official shadow set. Source PDF archive and publication review live in shadow_papers.';
