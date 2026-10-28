set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
set test.approved='true';
create function test_publish(items jsonb default test_items(),board text default 'Edexcel',code text default '1F',review text default 'new-paper-intake/Edexcel/GCSE-Mathematics/November-2022/1F/11111111-1111-4111-8111-111111111111/extraction-review.json') returns uuid language sql as $$select publish_reviewed_exam_paper(board,'GCSE Mathematics','November 2022',code,'Foundation',review,items)$$;
grant execute on function test_publish(jsonb,text,text,text),test_items(text) to authenticated;
create function expect_rejection(items jsonb,pattern text,board text default 'Edexcel',code text default '1F',review text default 'new-paper-intake/Edexcel/GCSE-Mathematics/November-2022/1F/11111111-1111-4111-8111-111111111111/extraction-review.json') returns void language plpgsql as $$
declare papers_before bigint;questions_before bigint;rejected boolean:=false;
begin
 select count(*) into papers_before from exam_papers;select count(*) into questions_before from questions;
 begin perform test_publish(items,board,code,review);
 exception when others then
  if sqlerrm not ilike '%'||pattern||'%' then raise exception 'Wrong rejection: % (expected %)',sqlerrm,pattern;end if;rejected:=true;
 end;
 if not rejected then raise exception 'Expected rejection: %',pattern;end if;
 if papers_before<>(select count(*) from exam_papers) or questions_before<>(select count(*) from questions) then raise exception 'Partial writes after failure';end if;
end;$$;
set role authenticated;
select expect_rejection(test_items(),'Invalid GCSE',null);
select expect_rejection(test_items(),'Invalid GCSE','Edexcel','1F',null);
select expect_rejection(jsonb_set(test_items(),'{0,approved}','false'),'approved');
select expect_rejection(jsonb_set(test_items(),'{0,approved}','"true"'),'approved');
select expect_rejection(jsonb_set(jsonb_set(test_items(),'{0,number}','5'),'{0,parts,0,question}','"Q5"'),'numbering');
select expect_rejection(jsonb_set(test_items(),'{0,parts,0,question}','"Q1apple"'),'mismatched');
select expect_rejection(jsonb_set(test_items(),'{0,parts}',jsonb_build_array(
 jsonb_set(jsonb_set(test_items()->0->'parts'->0,'{question}','"Q1a"'),'{marks}','10'),
 jsonb_set(jsonb_set(jsonb_set(test_items()->0->'parts'->0,'{question}','"Q01a"'),'{marks}','10'),'{id}','"alias"')
)),'mismatched');
select expect_rejection(jsonb_set(test_items(),'{0,parts,0,ao}','null'),'objective');
select expect_rejection(jsonb_set(test_items(),'{0,parts,0,grade_percent,9}','101'),'percentage');
select expect_rejection(jsonb_set(test_items(),'{0,parts,0,grade_percent,9}','"bad"'),'percentage');
select expect_rejection(jsonb_set(test_items(),'{0,parts,0,marks}','19'),'80 marks');
select expect_rejection(jsonb_set(test_items(),'{0,question_path}','"published-papers/other/question.png"'),'images');
select expect_rejection(jsonb_set(test_items(),'{0,parts}',(test_items()->0->'parts')||(test_items()->0->'parts')),'whole-question');
select expect_rejection(jsonb_set(test_items(),'{3,parts,0,skill}','"force failure"'),'injected insert failure');
set test.approved='false';
select expect_rejection(test_items(),'approved owner');
set test.approved='';
select expect_rejection(test_items(),'approved owner');
set test.approved='true';
select reviewed_publication_version();
select test_publish();
select expect_rejection(test_items(),'already published');
reset role;
do $$begin
 if (select jsonb_agg(to_jsonb(p) order by id) from exam_papers p where tier='Higher') is distinct from (select papers from baseline) then raise exception 'Existing papers changed';end if;
 if (select jsonb_agg(to_jsonb(q) order by id) from questions q where paper_id in(select id from exam_papers where tier='Higher')) is distinct from (select questions from baseline) then raise exception 'Existing questions changed';end if;
 if (select jsonb_agg(to_jsonb(a) order by id) from assessments a) is distinct from (select assessments from baseline) then raise exception 'Assessments changed';end if;
 if exists(select 1 from questions where paper_id in(select id from exam_papers where paper_code='1F') and (metadata->>'g9'<>'95' or metadata->>'original_skill'<>'Pearson arithmetic' or metadata->>'g1'<>'0' or metadata->'g4'<>'null' or metadata->'tags'<>'["Number","Algebra"]')) then raise exception 'Metadata lost';end if;
 if (select jsonb_agg(to_jsonb(q) order by id) from questions q where paper_id in(select id from exam_papers where paper_code='3F')) is distinct from (select questions from v15_baseline) then raise exception 'V15 publication changed';end if;
 if has_function_privilege('anon','public.reviewed_publication_version()','EXECUTE') then raise exception 'Anonymous capability executable';end if;
 if has_function_privilege('anon','public.publish_reviewed_exam_paper(text,text,text,text,text,text,jsonb)','EXECUTE') then raise exception 'Anonymous RPC executable';end if;
 if not exists(select 1 from storage.objects where name='existing-approved-review') then raise exception 'Existing review removed';end if;
end;$$;
select 'PASS: rejection, rollback, owner checks, metadata and existing synthetic records';
