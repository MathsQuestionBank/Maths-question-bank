-- V1.5: Atomic owner-controlled publication of an approved GCSE paper.
-- Additive migration. No existing rows or storage objects are removed.
-- The browser uploads only reviewed, cropped images before calling this RPC.
-- A failed RPC leaves the searchable bank unchanged; retry can reuse immutable image blobs.

create unique index if not exists exam_papers_unique_board_series_tier_code
on public.exam_papers (
  lower(btrim(exam_board)),
  lower(btrim(qualification)),
  lower(btrim(series)),
  lower(btrim(paper_code)),
  lower(btrim(coalesce(tier,'')))
);

create or replace function public.publish_reviewed_exam_paper(
  p_board text,
  p_qualification text,
  p_series text,
  p_code text,
  p_tier text,
  p_review_path text,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_paper uuid;
  v_item jsonb;
  v_part jsonb;
  v_parts jsonb;
  v_number integer;
  v_marks integer;
  v_total integer := 0;
  v_count integer := 0;
  v_question_path text;
  v_mark_path text;
  v_parts_seen text[] := array[]::text[];
  v_numbers_seen integer[] := array[]::integer[];
  v_part_id text;
  v_part_number text;
  v_tags jsonb;
  v_metadata jsonb;
  v_prefix text;
  v_whole_marks integer;
begin
  if auth.uid() is null or not public.is_approved_owner() then
    raise exception 'An approved owner session is required' using errcode='42501';
  end if;
  if p_board not in ('Edexcel','AQA') or p_qualification <> 'GCSE Mathematics'
    or p_tier not in ('Foundation','Higher')
    or p_code !~ '^[123][FH]$'
    or (p_tier='Foundation' and right(p_code,1)<>'F')
    or (p_tier='Higher' and right(p_code,1)<>'H')
    or p_series !~ '^(January|June|November|May|March|October|Summer|Autumn) 20[0-9]{2}$'
    then raise exception 'Invalid GCSE paper details'; end if;
  if jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) < 1
    or jsonb_array_length(p_items) > 50
    then raise exception 'A full set of reviewed questions is required'; end if;
  v_prefix := 'published-papers/' || lower(p_board) || '/' ||
    replace(lower(p_series),' ','-') || '/' || lower(p_code) || '/' || auth.uid()::text || '/';
  if p_review_path not like ('new-paper-intake/%/' || auth.uid()::text || '/extraction-review.json')
    or not exists (
      select 1 from storage.objects
      where bucket_id='exam-materials-private' and name=p_review_path
    ) then
    raise exception 'A saved owner review is required before publication'; end if;

  -- Storage is owned by the same approved user. Check all images before inserting anything.
  for v_item in select value from jsonb_array_elements(p_items) loop
    if v_item->>'approved' <> 'true' then
      raise exception 'All questions must be approved and saved first'; end if;
    v_number := (v_item->>'number')::integer;
    if v_number < 1 or v_number > 50 or v_number=any(v_numbers_seen) then
      raise exception 'Invalid or repeated complete question number'; end if;
    v_numbers_seen := array_append(v_numbers_seen,v_number);
    v_question_path := v_item->>'question_path';
    v_mark_path := v_item->>'mark_path';
    if v_question_path is null or v_mark_path is null
      or left(v_question_path,length(v_prefix))<>v_prefix
      or left(v_mark_path,length(v_prefix))<>v_prefix
      or v_question_path !~ '\.png$' or v_mark_path !~ '\.png$'
      or not exists (
        select 1 from storage.objects where bucket_id='exam-materials-private' and name=v_question_path
      )
      or not exists (
        select 1 from storage.objects where bucket_id='exam-materials-private' and name=v_mark_path
      ) then raise exception 'One or more reviewed images are missing from private storage'; end if;
    v_parts := v_item->'parts';
    if jsonb_typeof(v_parts) is distinct from 'array' or jsonb_array_length(v_parts)<1
      or jsonb_array_length(v_parts)>20 then
      raise exception 'Each complete question must contain its mapped parts'; end if;
    for v_part in select value from jsonb_array_elements(v_parts) loop
      v_part_number := btrim(v_part->>'question');
      v_part_id := btrim(v_part->>'id');
      if v_part_id is null or v_part_id='' or v_part_number is null
        or v_part_number !~* ('^Q0*'||v_number::text||'([a-z]|[ivx]|$)')
        or lower(v_part_id)=any(v_parts_seen) then
        raise exception 'Duplicate or mismatched question part'; end if;
      v_parts_seen := array_append(v_parts_seen,lower(v_part_id));
      v_marks := (v_part->>'marks')::integer;
      if v_marks<1 or v_marks>20
        or coalesce(v_part->>'topic','')=''
        or coalesce(v_part->>'skill','')=''
        or v_part->>'ao' not in ('AO1','AO2','AO3') then
        raise exception 'Invalid marks, topic, skill, or assessment objective'; end if;
      v_total := v_total+v_marks;
      v_count := v_count+1;
    end loop;
  end loop;

  if v_total<>80 then
    raise exception 'GCSE paper must total 80 marks; received %',v_total; end if;
  if v_count < jsonb_array_length(p_items) then
    raise exception 'Missing part mappings'; end if;
  if exists(
    select 1 from public.exam_papers
    where lower(btrim(exam_board))=lower(btrim(p_board))
      and lower(btrim(qualification))=lower(btrim(p_qualification))
      and lower(btrim(series))=lower(btrim(p_series))
      and lower(btrim(paper_code))=lower(btrim(p_code))
      and lower(btrim(coalesce(tier,'')))=lower(btrim(p_tier))
  ) then
    raise exception 'This paper is already published; no records were changed'; end if;

  insert into public.exam_papers(exam_board,qualification,series,paper_code,tier)
  values (p_board,p_qualification,p_series,p_code,p_tier) returning id into v_paper;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_number := (v_item->>'number')::integer;
    v_question_path := v_item->>'question_path';
    v_mark_path := v_item->>'mark_path';
    v_whole_marks := 0;
    for v_part in select value from jsonb_array_elements(v_item->'parts') loop
      v_whole_marks := v_whole_marks + (v_part->>'marks')::integer;
    end loop;
    for v_part in select value from jsonb_array_elements(v_item->'parts') loop
      v_tags := case when jsonb_typeof(v_part->'tags')='array' then v_part->'tags'
        else jsonb_build_array(v_part->>'topic') end;
      v_metadata := jsonb_build_object(
        'id',v_part->>'id',
        'qnum',v_number,
        'question',v_part->>'question',
        'paper',p_code,
        'series',p_series,
        'tier',p_tier,
        'calculator',left(p_code,1)<>'1',
        'source','Reviewed Enhanced Skills Mapping',
        'mapping_review_status','teacher_approved',
        'topic_review_status','teacher_approved',
        'image_status','reviewed',
        'crop_review',jsonb_build_object('question','approved','mark','approved'),
        'spec',coalesce(v_part->>'spec',''),
        'tags',v_tags,
        'topics',v_tags,
        'skill',v_part->>'skill',
        'topic',v_part->>'topic',
        'marks',(v_part->>'marks')::integer,
        'ao',v_part->>'ao',
        'whole_key',p_series||'_'||p_code||'_Q'||lpad(v_number::text,2,'0'),
        'whole_marks',v_whole_marks,
        'grade',case when p_tier='Foundation' then 3 else 7 end,
        'g1',(v_part->'grade_percent'->>'1')::numeric,
        'g2',(v_part->'grade_percent'->>'2')::numeric,
        'g3',(v_part->'grade_percent'->>'3')::numeric,
        'g4',(v_part->'grade_percent'->>'4')::numeric,
        'g5',(v_part->'grade_percent'->>'5')::numeric,
        'review_source',p_review_path,
        'published_by',auth.uid()::text
      );
      insert into public.questions(
        paper_id,question_number,topic,skill,assessment_objective,marks,
        metadata,question_storage_path,mark_scheme_storage_path
      )
      values (
        v_paper,v_part->>'question',v_part->>'topic',v_part->>'skill',
        v_part->>'ao',(v_part->>'marks')::integer,
        v_metadata,v_question_path,v_mark_path
      );
    end loop;
  end loop;
  return v_paper;
end;
$$;
revoke all on function public.publish_reviewed_exam_paper(text,text,text,text,text,text,jsonb) from public, anon;
grant execute on function public.publish_reviewed_exam_paper(text,text,text,text,text,text,jsonb) to authenticated;
