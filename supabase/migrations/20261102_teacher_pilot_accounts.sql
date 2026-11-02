-- Departmental teacher pilot. Edexcel archive and storage remain owner-only.
-- New users start unapproved; owner controls teacher access after verified signup.
alter table public.profiles add column if not exists email text;
update public.profiles p set email=u.email from auth.users u where p.user_id=u.id and p.email is distinct from u.email;

create or replace function public.create_pilot_profile()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(user_id,role,approved,email)
 values(new.id,'member',false,new.email)
 on conflict(user_id) do nothing;
 return new;
end;
$$;
revoke all on function public.create_pilot_profile() from public,anon,authenticated;
create trigger create_mqb_pilot_profile after insert on auth.users
for each row execute function public.create_pilot_profile();

-- A changed email address must require fresh staff approval.
create or replace function public.refresh_pilot_profile_email()
returns trigger language plpgsql security definer set search_path='' as $
begin
 update public.profiles
 set email=new.email, approved=case when role='member' then false else approved end
 where user_id=new.id;
 return new;
end;
$;
revoke all on function public.refresh_pilot_profile_email() from public,anon,authenticated;
create trigger refresh_mqb_pilot_profile_email after update of email on auth.users
for each row when (old.email is distinct from new.email)
execute function public.refresh_pilot_profile_email();

create or replace function public.is_approved_teacher()
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where user_id=auth.uid() and role='member' and approved=true)
$$;
revoke all on function public.is_approved_teacher() from public,anon;
grant execute on function public.is_approved_teacher() to authenticated;

create or replace function public.can_use_question_bank()
returns boolean language sql stable set search_path='' as $$
 select public.is_approved_owner() or public.is_approved_teacher()
$$;
revoke all on function public.can_use_question_bank() from public,anon;
grant execute on function public.can_use_question_bank() to authenticated;

create policy "Owner can review pilot accounts" on public.profiles
for select to authenticated using (public.is_approved_owner());

create or replace function public.set_teacher_approval(p_user_id uuid,p_approved boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_approved_owner() then
  raise exception 'Owner permission required' using errcode='42501';
 end if;
 if p_user_id is null or p_approved is null then
  raise exception 'Invalid approval request';
 end if;
 update public.profiles set approved=p_approved
 where user_id=p_user_id and role='member';
 if not found then raise exception 'Teacher profile not found' using errcode='42501'; end if;
 return true;
end;
$$;
revoke all on function public.set_teacher_approval(uuid,boolean) from public,anon;
grant execute on function public.set_teacher_approval(uuid,boolean) to authenticated;

-- The existing Edexcel and shadow content has no rights label and stays invisible to teachers.
-- Only explicitly original, text-only, paper-independent practice questions are selectable.
create policy "Approved teachers see original practice only" on public.questions
for select to authenticated using (
 public.is_approved_teacher()
 and metadata->>'content_rights'='original'
 and paper_id is null and shadow_paper_id is null
 and question_storage_path is null and mark_scheme_storage_path is null
);

-- Teacher-owned cloud work is independent. Existing owner policies remain unchanged.
create policy "Teacher owns own assessments" on public.assessments
for all to authenticated
using (public.is_approved_teacher() and created_by=(select auth.uid()))
with check (public.is_approved_teacher() and created_by=(select auth.uid()));

create policy "Teacher owns own folders" on public.assessment_folders
for all to authenticated
using (public.is_approved_teacher() and owner_id=(select auth.uid()))
with check (public.is_approved_teacher() and owner_id=(select auth.uid()));

create policy "Teacher owns selected visible questions" on public.assessment_questions
for all to authenticated
using (
 public.is_approved_teacher()
 and exists(select 1 from public.assessments a where a.id=assessment_id and a.created_by=(select auth.uid()))
 and exists(select 1 from public.questions q where q.id=question_id)
)
with check (
 public.is_approved_teacher()
 and exists(select 1 from public.assessments a where a.id=assessment_id and a.created_by=(select auth.uid()))
 and exists(select 1 from public.questions q where q.id=question_id)
);

create or replace function public.save_owned_assessment(
 p_id uuid,p_expected_revision bigint,p_title text,p_configuration jsonb,p_question_ids uuid[]
)
returns table(saved_id uuid,saved_revision bigint) language plpgsql set search_path='' as $$
declare v_id uuid;v_revision bigint;v_count integer;
begin
 if auth.uid() is null or not public.can_use_question_bank() then
  raise exception 'Not authorised' using errcode='42501';
 end if;
 if trim(coalesce(p_title,''))='' or p_configuration is null or jsonb_typeof(p_configuration)<>'object' then
  raise exception 'Invalid assessment';
 end if;
 if p_question_ids is null or cardinality(p_question_ids)=0 or cardinality(p_question_ids)>500 then
  raise exception 'Invalid questions';
 end if;
 select count(distinct q) into v_count from unnest(p_question_ids) as q;
 if v_count<>cardinality(p_question_ids) then raise exception 'Duplicate question IDs'; end if;
 -- RLS filters visible questions; this check also rejects guessed exam-paper UUIDs.
 select count(*) into v_count from public.questions where id=any(p_question_ids);
 if v_count<>cardinality(p_question_ids) then
  raise exception 'One or more questions are not available to this account' using errcode='42501';
 end if;
 if p_id is null then
  if p_expected_revision is not null then raise exception 'Invalid new revision'; end if;
  insert into public.assessments(created_by,title,configuration)
  values(auth.uid(),p_title,p_configuration)
  returning id,revision into v_id,v_revision;
 else
  select a.id,a.revision into v_id,v_revision from public.assessments a
  where a.id=p_id and a.created_by=auth.uid() for update;
  if v_id is null then raise exception 'Assessment not found' using errcode='42501'; end if;
  if p_expected_revision is null or v_revision<>p_expected_revision then
   raise exception 'Assessment was changed in another session' using errcode='40001';
  end if;
  update public.assessments set title=p_title,configuration=p_configuration,revision=revision+1
  where id=v_id returning revision into v_revision;
  delete from public.assessment_questions where assessment_id=v_id;
 end if;
 insert into public.assessment_questions(assessment_id,question_id,position)
 select v_id,x.question_id,x.ord::integer-1 from unnest(p_question_ids) with ordinality x(question_id,ord);
 return query select v_id,v_revision;
end;
$$;
create or replace function public.delete_owned_assessment(p_id uuid,p_expected_revision bigint)
returns boolean language plpgsql set search_path='' as $$
declare v_revision bigint;
begin
 if auth.uid() is null or not public.can_use_question_bank() then
  raise exception 'Not authorised' using errcode='42501';
 end if;
 select revision into v_revision from public.assessments
 where id=p_id and created_by=auth.uid() for update;
 if v_revision is null then raise exception 'Assessment not found' using errcode='42501'; end if;
 if p_expected_revision is null or v_revision<>p_expected_revision then
  raise exception 'Assessment changed in another session' using errcode='40001';
 end if;
 delete from public.assessments where id=p_id and created_by=auth.uid();
 return true;
end;
$$;
create or replace function public.change_owned_assessment_folder(p_old_name text,p_new_name text)
returns integer language plpgsql set search_path='' as $$
declare v_count integer;
begin
 if auth.uid() is null or not public.can_use_question_bank() then
  raise exception 'Not authorised' using errcode='42501';
 end if;
 if p_old_name is null or length(trim(p_old_name))=0 or lower(p_old_name) in ('all','unfiled') then raise exception 'Invalid folder'; end if;
 if p_new_name is null or length(trim(p_new_name))=0 or length(trim(p_new_name))>100 or lower(p_new_name)='all' then raise exception 'Invalid target folder'; end if;
 if p_new_name<>'Unfiled' and exists(select 1 from public.assessment_folders where owner_id=auth.uid() and name=p_new_name) then
  raise exception 'Folder already exists';
 end if;
 perform 1 from public.assessment_folders where owner_id=auth.uid() and name=p_old_name for update;
 if not found then raise exception 'Folder no longer exists'; end if;
 update public.assessments set configuration=jsonb_set(configuration,'{folder}',to_jsonb(p_new_name),true),revision=revision+1
 where created_by=auth.uid() and configuration->>'folder'=p_old_name;
 get diagnostics v_count=row_count;
 if p_new_name='Unfiled' then
  delete from public.assessment_folders where owner_id=auth.uid() and name=p_old_name;
 else
  update public.assessment_folders set name=p_new_name where owner_id=auth.uid() and name=p_old_name;
 end if;
 return v_count;
end;
$$;

-- Self-authored practice questions (not Pearson past-paper extracts); printable without images.
insert into public.questions(question_number,topic,skill,assessment_objective,marks,metadata)
select d.n::text,d.topic,d.skill,d.ao,d.marks,
 jsonb_build_object(
 'id', 'ORIGINAL-PRACTICE-'||lpad(d.n::text,2,'0'),
 'content_rights','original','demo',true,'exam_board','Original practice',
 'series','Original practice','tier',d.tier,'calculator',d.calculator,
 'prompt',d.prompt,'answer',d.answer,'tags',jsonb_build_array(d.topic),
 'grade',d.grade,'challenge','Practice'
 )
from (values
 (1,'Algebra','Solving linear equations','AO1',2,'Foundation',false,'Solve 3x + 7 = 25.','x = 6',3),
 (2,'Algebra','Expanding brackets','AO1',2,'Foundation',false,'Expand and simplify 4(3x - 2).','12x - 8',3),
 (3,'Algebra','Factorising expressions','AO1',2,'Foundation',false,'Factorise 18x + 12 fully.','6(3x + 2)',4),
 (4,'Number','Percentages','AO1',3,'Foundation',false,'Calculate 15% of 260.','39',4),
 (5,'Number','Highest common factor','AO1',2,'Foundation',false,'Find the highest common factor of 42 and 70.','14',4),
 (6,'Ratio','Sharing a ratio','AO2',3,'Foundation',false,'Share £96 in the ratio 3 : 5.','£36 and £60',4),
 (7,'Geometry','Pythagoras','AO1',3,'Higher',true,'A right-angled triangle has shorter sides 9 cm and 12 cm. Find its hypotenuse.','15 cm',5),
 (8,'Geometry','Circle area','AO1',2,'Higher',false,'A circle has radius 7 cm. Give its area in terms of pi.','49π cm²',5),
 (9,'Statistics','Mean','AO1',2,'Foundation',false,'Find the mean of 5, 8, 9 and 10.','8',3),
 (10,'Probability','Simple probability','AO1',2,'Foundation',false,'A bag contains 4 red counters and 7 blue counters. One is chosen randomly. Find P(red).','4/11',3),
 (11,'Algebra','Quadratic equations','AO2',3,'Higher',false,'Solve x² - 9x + 20 = 0.','x = 4 or x = 5',6),
 (12,'Algebra','Simultaneous equations','AO2',3,'Higher',false,'Solve x + y = 11 and x - y = 3.','x = 7, y = 4',6),
 (13,'Algebra','Straight line graphs','AO2',3,'Higher',false,'Find the equation of the straight line through (0, 2) and (3, 11).','y = 3x + 2',6),
 (14,'Ratio','Direct proportion','AO2',3,'Foundation',true,'Five identical books cost £17.50. Calculate the cost of eight books.','£28',4),
 (15,'Geometry','Angles in polygons','AO1',2,'Foundation',false,'Find the sum of the interior angles of a pentagon.','540 degrees',4),
 (16,'Number','Percentage decrease','AO3',4,'Higher',true,'A jacket costs £80. Its price is reduced by 12%. Find the sale price.','£70.40',5),
 (17,'Algebra','Nth term','AO2',3,'Foundation',false,'Find the nth term of 5, 8, 11, 14, ...','3n + 2',5),
 (18,'Number','Standard form','AO1',2,'Higher',false,'Write 0.00072 in standard form.','7.2 × 10⁻⁴',5)
) as d(n,topic,skill,ao,marks,tier,calculator,prompt,answer,grade);
