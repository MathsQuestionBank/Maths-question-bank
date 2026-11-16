-- SELECT-only label audit snapshot. Save the JSON array outside the repository.
-- No private storage paths, signed URLs, publisher identities or credentials.
select q.id, q.paper_id, p.exam_board, p.series, p.paper_code, p.tier,
       q.question_number, q.skill, q.topic, q.marks, q.assessment_objective,
       q.metadata->>'id' as source_id,
       q.metadata->>'original_skill' as original_skill,
       q.metadata->>'spec' as specification,
       q.metadata->>'skill' as metadata_skill,
       q.metadata->>'mapping_basis' as mapping_basis
from public.questions q
join public.exam_papers p on p.id=q.paper_id
where p.exam_board='Edexcel' and p.qualification='GCSE Mathematics'
  and p.tier in ('Foundation','Higher')
  and q.shadow_paper_id is null and q.shadow_of_question_id is null
  and coalesce(q.metadata->>'content_rights','') <> 'original'
order by p.series,p.paper_code,q.question_number,q.id;
