# Official shadow-paper review handoff for Codex

## Source intake
The owner uploads Pearson-supplied shadow QP and mark scheme under **Import Exam Papers → Import Official Shadow Papers**, selecting the corresponding ORIGINAL published `exam_papers.id`, and naming the set (Set 1, Set 2, etc.). Original PDF/DOCX/DOC source files and intake metadata live in private bucket `exam-materials-private` in the `shadow-paper-intake/<original-paper-id>/<set>/<uploader-uid>/` folder.

A `public.shadow_papers` row records:
- `original_paper_id`, `shadow_set`, `question_source_path`, `mark_scheme_source_path`
- `question_format`, `mark_scheme_format`, `intake_manifest_path`
- `status`: awaiting-conversion, awaiting-review, in-review, reviewed.

## Important conversion and publishing rules
1. Download original files using an owner-authorised client. Never copy PDF/Word material into a public bucket.
2. If DOCX or DOC, convert to PDF in an appropriate office renderer (for example, desktop Word/LibreOffice) under Codex control; keep originals and archive converted PDF sources privately at distinct new paths (do not overwrite originals).
3. Visual compare the converted PDF against the original Word document, particularly equations, fractions, vector notation, page breaks, graphs and diagrams. Fix conversion fidelity before cropping.
4. Extract every complete numbered question and matching mark-scheme item using the existing PDF cropping and assessment structure tools. Maintain multipart question grouping and marks.
5. Verify all proposed shadow→original question links by question text / mathematics, exam series, tier, paper and part; number match alone is only a *candidate*. Confirm any numbering or marking differences. Record evidence of verification.
6. Save reviewed PNG crops to new content-addressed paths in the private bucket. Do not replace original image files.
7. Create new `public.questions` records for approved shadow questions only. Set `paper_id` to the source original `exam_papers.id` (the original record is not duplicated), `shadow_paper_id` to the chosen shadow set, and `shadow_of_question_id` to the VERIFIED corresponding original question-part ID. Preserve meaningful `question_number`, `marks`, `topic`, `skill`, `assessment_objective`, and `metadata` with distinct original/shadow provenance. Use `crop_review.question='approved'` and `crop_review.mark='approved'` **only after teacher approval**, following the application's publication controls.
8. The public app only treats questions as selectable shadows once `shadow_papers.status='reviewed'`, both image paths are present, and both crop reviews are approved. Set status to reviewed only when all intended shadow questions in that set are fully checked and securely linked.
9. Before inserting, ensure there is no existing row with the same `(shadow_paper_id,shadow_of_question_id)`; the unique index prevents duplicates.
10. Preserve all 90 original papers, existing original question IDs and assessments. Do not grant approval from a file's existence.

## Teacher workflow
- Original question cards show **View shadow** and **Add shadow** when a verified shadow is available. Multi-part shadow selection is disabled unless every part of the original question has a reviewed equivalent in the selected set.
- Teacher can also filter **Question versions** and add individual approved shadow questions.
- In the Assessment Builder choose a set and **Create Shadow Assessment**. This creates a new draft, replacing entire matched groups only and keeping unmatched originals with a warning. Save separately under **My Assessments**.
- Shadow questions do not inherit historic grade-performance statistics from the originals; do not present original performance as shadow performance.

## Verification
- Database counts before and after, storage referential integrity and saved assessment foreign keys.
- Test choosing a reviewed single question, multipart question, unmatched question, multiple sets and saving/reopening paired assessments.
- Test printing student questions and mark scheme, and confirm no private source URLs leak into public pages.
- Use the existing publication and licensing permissions; do not expose Pearson materials publicly without permission.
