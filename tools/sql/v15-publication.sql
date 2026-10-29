-- Exercise the old frontend payload before replacing the RPC.
insert into storage.objects
select 'exam-materials-private',v->>'question_path' from jsonb_array_elements(test_items('3F')) v union all
select 'exam-materials-private',v->>'mark_path' from jsonb_array_elements(test_items('3F')) v union all
select 'exam-materials-private','new-paper-intake/Edexcel/GCSE-Mathematics/November-2022/3F/11111111-1111-4111-8111-111111111111/extraction-review.json';
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
set test.approved='true';
set role authenticated;
select publish_reviewed_exam_paper('Edexcel','GCSE Mathematics','November 2022','3F','Foundation','new-paper-intake/Edexcel/GCSE-Mathematics/November-2022/3F/11111111-1111-4111-8111-111111111111/extraction-review.json',test_items('3F'));
reset role;
create table v15_baseline as select jsonb_agg(to_jsonb(q) order by id) questions from questions q where paper_id in(select id from exam_papers where paper_code='3F');
