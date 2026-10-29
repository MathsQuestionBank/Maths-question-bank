-- Synthetic Supabase API contract only. NEVER run this fixture on a real project.
create role anon;
create role authenticated;
create schema auth;
create schema storage;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function public.is_approved_owner() returns boolean language sql stable as $$select nullif(current_setting('test.approved',true),'')::boolean$$;
create table public.exam_papers(id uuid primary key default gen_random_uuid(),exam_board text not null,qualification text not null,series text not null,paper_code text not null,tier text not null);
create table public.questions(id uuid primary key default gen_random_uuid(),paper_id uuid references exam_papers(id),question_number text,topic text,skill text,assessment_objective text,marks integer,metadata jsonb,question_storage_path text,mark_scheme_storage_path text);
create table public.assessments(id uuid primary key default gen_random_uuid(),configuration jsonb);
create table storage.objects(bucket_id text,name text,primary key(bucket_id,name));
alter table public.exam_papers enable row level security;
alter table public.questions enable row level security;
alter table storage.objects enable row level security;
create policy owner_papers on exam_papers to authenticated using(public.is_approved_owner()) with check(public.is_approved_owner());
create policy owner_questions on questions to authenticated using(public.is_approved_owner()) with check(public.is_approved_owner());
create policy owner_storage on storage.objects to authenticated using(public.is_approved_owner());
grant usage on schema public,auth,storage to authenticated,anon;
grant select,insert on exam_papers,questions to authenticated;
grant select on storage.objects,assessments to authenticated;
-- Nine synthetic Higher identities; ensure migration/publication never changes them.
insert into exam_papers(exam_board,qualification,series,paper_code,tier)
select 'Edexcel','GCSE Mathematics','November '||y,n||'H','Higher' from generate_series(2020,2022)y cross join generate_series(1,3)n;
insert into questions(paper_id,question_number,metadata,marks) select id,'Q1','{"approved_crop":"unchanged","g9":99}',1 from exam_papers;
insert into assessments(configuration) values('{"ids":["legacy-part"],"title":"Existing assessment"}');
insert into storage.objects values('exam-materials-private','existing-approved-review');
create table baseline as select (select jsonb_agg(to_jsonb(p) order by id) from exam_papers p) papers,(select jsonb_agg(to_jsonb(q) order by id) from questions q) questions,(select jsonb_agg(to_jsonb(a) order by id) from assessments a) assessments;
create function test_items(code text default '1F') returns jsonb language sql as $$
 select jsonb_agg(jsonb_build_object('number',n,'approved',true,'question_path','published-papers/edexcel/november-2022/'||lower(code)||'/11111111-1111-4111-8111-111111111111/Q'||n||'/question.png','mark_path','published-papers/edexcel/november-2022/'||lower(code)||'/11111111-1111-4111-8111-111111111111/Q'||n||'/mark.png','parts',jsonb_build_array(jsonb_build_object('id',code||'-Q'||n,'question','Q'||n,'marks',20,'topic','Number','skill','Arithmetic','ao','AO1','spec','N1','original_skill','Pearson arithmetic','mapping_basis','Teacher review','mapping_review','Reviewed','tags',jsonb_build_array('Number','Algebra'),'grade_percent','{"1":0,"5":81.5,"9":95,"4":null}'::jsonb)))) from generate_series(1,4)n
$$;
insert into storage.objects
select 'exam-materials-private',v->>'question_path' from jsonb_array_elements(test_items()) v union all
select 'exam-materials-private',v->>'mark_path' from jsonb_array_elements(test_items()) v union all
select 'exam-materials-private','new-paper-intake/Edexcel/GCSE-Mathematics/November-2022/1F/11111111-1111-4111-8111-111111111111/extraction-review.json';
create function fail_question() returns trigger language plpgsql as $$begin if new.skill='force failure' then raise exception 'injected insert failure';end if;return new;end;$$;
create trigger fail_question before insert on questions for each row execute function fail_question();
