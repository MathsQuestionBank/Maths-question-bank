-- Teacher access to recent Edexcel GCSE Mathematics questions from the approved centre archive.
-- Owner access to ALL series and private imports remains unchanged.
-- Five-year cutoff is conservative: a series expires at the START of its exam month,
-- rather than relying on unknown sitting dates. November 2021 is already excluded.

create or replace function public.eligible_edexcel_series(p_series text)
returns boolean
language sql stable
set search_path = ''
as $$
 select case
  when p_series ~ '^(June|November) 20[0-9]{2}$' then
   make_date(right(p_series, 4)::int,
     case when split_part(p_series, ' ', 1)='June' then 6 else 11 end, 1) <= current_date
   and
   (make_date(right(p_series, 4)::int,
     case when split_part(p_series, ' ', 1)='June' then 6 else 11 end, 1) + interval '5 years')::date > current_date
  else false
 end;
$$;
revoke all on function public.eligible_edexcel_series(text) from public, anon;
grant execute on function public.eligible_edexcel_series(text) to authenticated;

-- Only visible to manually approved teacher accounts. This is SELECT only:
-- no publishing, editing, deleting, exporting archive metadata or changing crops.
create policy "Approved teachers read eligible Edexcel GCSE papers"
on public.exam_papers for select to authenticated
using (
 (select public.is_approved_teacher())
 and exam_board = 'Edexcel'
 and qualification = 'GCSE Mathematics'
 and public.eligible_edexcel_series(series)
);

-- Keep existing original-practice access; add only reviewed/linked paper references.
-- Shadow papers stay owner-only, regardless of the original paper's eligibility.
create policy "Approved teachers read eligible Edexcel GCSE questions"
on public.questions for select to authenticated
using (
 (select public.is_approved_teacher())
 and paper_id is not null
 and shadow_paper_id is null
 and shadow_of_question_id is null
 and exists (
  select 1 from public.exam_papers p
   where p.id = paper_id
     and p.exam_board = 'Edexcel'
     and p.qualification = 'GCSE Mathematics'
     and public.eligible_edexcel_series(p.series)
 )
);

-- Permit signed URLs for exact eligible individual question/mark-scheme images.
-- Never expose entire PDFs, shadow source files, import assets or older questions.
-- Referencing the RLS-filtered questions table keeps the storage rule in sync
-- with the teacher question-access policy.
create policy "Approved teachers read eligible Edexcel question images"
on storage.objects for select to authenticated
using (
 bucket_id = 'exam-materials-private'
 and (select public.is_approved_teacher())
 and exists (
  select 1 from public.questions q
   where q.shadow_paper_id is null
     and (q.question_storage_path = storage.objects.name
       or q.mark_scheme_storage_path = storage.objects.name)
 )
);

create index if not exists mqb_question_storage_path_lookup
 on public.questions(question_storage_path) where question_storage_path is not null;
create index if not exists mqb_mark_storage_path_lookup
 on public.questions(mark_scheme_storage_path) where mark_scheme_storage_path is not null;
