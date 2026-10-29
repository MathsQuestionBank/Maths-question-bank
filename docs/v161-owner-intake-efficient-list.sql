-- V1.6.1: efficient read-only owner intake listing for large paper archives.
-- Reduces per-refresh recursive storage LIST + review download requests.
-- No storage objects, existing questions or saved reviews are modified.
create or replace function public.list_owner_exam_intake()
returns table(
  path text, board text, qualification text, series text, code text,
  question boolean, mark boolean, manifest boolean, review_saved boolean
)
language plpgsql
stable
security invoker
set search_path=public,storage,pg_temp
as $$
begin
  if auth.uid() is null or public.is_approved_owner() is distinct from true then
    raise exception 'An approved owner session is required' using errcode='42501';
  end if;
  return query
  with owner_files as (
    select
      o.name,
      split_part(o.name,'/',2) as item_board,
      split_part(o.name,'/',3) as item_qualification,
      split_part(o.name,'/',4) as item_series,
      split_part(o.name,'/',5) as item_code,
      split_part(o.name,'/',7) as filename
    from storage.objects o
    where o.bucket_id='exam-materials-private'
      and o.name like 'new-paper-intake/%'
      and split_part(o.name,'/',6)=auth.uid()::text
      and array_length(string_to_array(o.name,'/'),1)=7
  )
  select
    'new-paper-intake/' || f.item_board || '/' || f.item_qualification || '/'
      || f.item_series || '/' || f.item_code || '/' || auth.uid()::text as path,
    f.item_board as board,
    f.item_qualification as qualification,
    f.item_series as series,
    f.item_code as code,
    bool_or(f.filename='question-paper.pdf') as question,
    bool_or(f.filename='mark-scheme.pdf') as mark,
    bool_or(f.filename='intake.json') as manifest,
    bool_or(f.filename='extraction-review.json') as review_saved
  from owner_files f
  where f.item_qualification='GCSE-Mathematics'
  group by f.item_board,f.item_qualification,f.item_series,f.item_code
  order by f.item_series desc,f.item_code;
end;
$$;

revoke all on function public.list_owner_exam_intake() from public,anon;
grant execute on function public.list_owner_exam_intake() to authenticated;
