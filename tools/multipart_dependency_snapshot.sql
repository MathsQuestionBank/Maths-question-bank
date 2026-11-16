-- Read-only snapshot for the dependency audit. Use an authorised SQL session.
-- Export the result as a JSON array to a LOCAL PRIVATE file, not the repository.
-- Storage paths can contain publisher account identifiers. The Python reporter
-- fingerprints those paths and never publishes them. No auth/user data selected.
select q.id, q.paper_id, p.exam_board, p.series, p.paper_code, p.tier,
       q.question_number, q.marks,
       q.metadata->>'id' as source_id,
       q.metadata->>'qnum' as qnum,
       q.metadata->>'question' as metadata_question,
       q.metadata->>'whole_key' as whole_key,
       q.metadata->>'part_of' as part_of,
       q.question_storage_path, q.mark_scheme_storage_path,
       q.metadata->'image_crops' as image_crops,
       q.metadata->'crop_review' as crop_review,
       q.metadata->'legacy_image_audit' as legacy_image_audit
from public.questions q
join public.exam_papers p on p.id = q.paper_id
where p.exam_board = 'Edexcel'
  and p.tier in ('Foundation', 'Higher')
  and q.shadow_paper_id is null and q.shadow_of_question_id is null
  and coalesce(q.metadata->>'content_rights', '') <> 'original'
order by p.series, p.tier, p.paper_code, q.question_number, q.id;
