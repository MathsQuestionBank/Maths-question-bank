# PR #64 review and release guide

Scope: MathsQuestionBank/Maths-question-bank; Supabase ljisttslifnyrbuybfud only.
No production migration, upload, content approval, publication, merge or deployment was performed during this review.

## Data preservation and fixes

- V16 replaces the existing V15 publication function with the same signature and security-invoker model. It preserves RLS, only inserts new papers/questions, and never updates existing papers, questions, assessments or stored reviews. The V15 case-insensitive unique paper index prevents concurrent duplicates. V16 now checks the prerequisite function/index and runs in a transaction.
- Mandatory null inputs and a null owner result fail closed. Question-part references and grade percentages are validated. A V16 capability RPC prevents the new frontend from silently losing grades 6–9 or provenance on an older server. Old V15 clients remain compatible with the V16 publication signature.
- A valid saved crop, multipage range, approval, note or mapping edit takes precedence over extraction guesses. Invalid or mismatched saved reviews block preparation rather than being repaired and overwritten. Re-detection leaves approved crops alone. Original mapping files remain immutable.
- Review saving checks the current account copy before overwriting it. A later save from another device requires reloading rather than losing its changes. This check is not an atomic storage compare-and-swap: use one active editing device/tab at a time. Explicit Save is required before leaving or changing devices.
- Coverage refreshes after a successful review save. It derives approval states from saved JSON and publication from real paper/question records; a failed read is visible rather than claimed as missing content.
- Real 2F/3F marks now include continuation content before the next question on later pages and exclude the separate modified-large-print appendix. Canvas previews ignore stale render completions. New question crops detect and trim the outer paper border, including rounded corners and margins on every page. Existing approved crops retain their original appearance. A border toggle and optional left/right controls let the teacher change them explicitly; those choices are saved and checked before publication. Diagrams and notation remain rendered from the original PDF.
- The replacement CSV has blank enhanced skills for 8 parts of 2F and 11 parts of 3F. Those rows use their supplied original Pearson skill for review; no classifications are invented and no source CSV is altered. Saved teacher edits still win over this fallback.
- Exam series are normalised to canonical month/year before new intake, avoiding a case/whitespace mismatch with publication paths.

## Evidence and limits

Final local checks: 96 unit tests across 13 files passed; production build passed (existing chunk-size warning); 12 Playwright tests passed with 2 intentional mobile PDF skips.

`tools/test-publication-sql.sh` creates a disposable, network-isolated PostgreSQL 17 container with synthetic Supabase-shaped schemas and RLS. It tests V15 publication before V16, repeatable migration, anonymous/non-owner rejection, invalid input rejection, transactional rollback after a late insert failure, old data preservation, exact metadata retention and simultaneous duplicate publication. It never accepts or uses a production connection string. CI runs this suite alongside unit, build and browser checks.

The synthetic database is a contract test, not a clone of the live project's policies, grants, constraints or triggers. The approved owner must still verify the actual staging schema, policies and private Storage MIME permissions. In particular, the private bucket must accept `text/csv`, XLSX, PDF, JSON and PNG where used. Do not widen bucket permissions or make it public.

Both replacement source mappings were compared field-by-field with XLSX equivalents generated locally solely for format testing: 2,057 Foundation and 1,552 Higher rows produced identical parsed records, including original skill, AO, marks, tags and grade percentages. Previous superseded XLSX sources were not used for imports.

Real November 2022 source PDFs and replacement Foundation CSV: 2F has 26 groups / 38 parts / 80 marks; 3F has 30 groups / 47 parts / 80 marks. Every proposed image was rendered; per-question marks match printed totals; contact sheets were inspected for all 56 question/mark pairs. All proposals remain unapproved. Teacher visual review remains required, including full-size multi-page crops (2F Q18 and Q24).

Owner-only production checks remain unperformed by agreement: 1F publication and saved-review status, the nine existing Higher records and their deployed image access. No production writes were made. Automated assessment regressions cover legacy IDs, multipart grouping, whole/part double-count prevention, order, export modes and saved assessments.

## Release decision

Keep PR #64 unmerged pending owner/staging verification. Local tests establish compatibility with the documented V15 schema, not unconditional production readiness.

Before production rollout:

1. Confirm the Maths Question Bank project ID and preserve a database backup plus the original private review/source files.
2. On a staging copy with the real schema and RLS, verify the V15 unique index and owner/non-owner access. Review and apply `docs/v16-preserve-enhanced-publication-metadata.sql` there, then test metadata, failure rollback and private images. Apply no migration to production until these checks pass and the owner authorises it.
3. Owner-check 1F's saved approved crops and publication state; verify the existing nine Higher identities/counts and saved assessments. Do not re-extract, republish or patch existing records to make checks pass.
4. Require green PR CI and review; merge/deploy only after explicit approval. V16 is required before the updated frontend can publish; upload/extraction/review themselves do not require a new database table or migration.
5. Repeat a signed-in owner smoke test after approved deployment. No automatic exam-content publication is part of deployment.

## Website: import and review 2F and 3F

After the reviewed frontend is deployed, sign in with the approved owner account and open **Import Exam Papers**.

1. Under **Import Enhanced Skills Mapping**, select `Foundation_Enhanced_Multi_Topic_Mapping.csv`, click **Inspect spreadsheet**, then **Archive mapping for review** once. The unrelated historical duplicate warning does not duplicate or change published data. Use the Higher CSV for later Higher work.
2. Under **Import New Exam Paper**, select Edexcel, GCSE Mathematics, Foundation, November 2022, and paper 2. Choose the supplied 2F examination PDF and its matching 2F mark scheme. Click **Check paper**, then **Archive PDFs for review**. Repeat with paper 3 and the matching 3F PDFs. Existing published papers are rejected; retries retain byte-identical archived files and never replace different PDFs.
3. In **Review Imported Papers**, open the relevant row with **Extract & review**, then **Prepare question review**. Expect 26 complete questions / 38 parts / 80 marks for 2F, and 30 / 47 / 80 for 3F. The first standard marking-table page is PDF page 6 in both schemes.
4. Inspect both full-size previews, all parts, diagrams, AO, marks, Pearson/enhanced skills, topic tags and grade percentages. Adjust start/end pages, top/bottom and left/right percentages if needed. New proposals remove the detected paper border; use the border toggle to compare or opt out. Existing saved reviews keep their original border setting until edited. The crops are suggestions; preparation does not approve anything.
5. Use **Approve Qn & Next** after each review. Any later crop or mapping edit removes that question's approval. Use **Undo approval** before re-detecting an approved crop you intentionally wish to change.
6. Click **Save review progress to account** regularly and before refreshing, leaving or changing devices. On another device, sign in to the same account, reopen the paper and prepare the review: original mapping, saved coordinates and edits are restored, and navigation resumes at the first unapproved question. Close the previous editing tab. If another device saved later, reload before saving; its changes are retained.
7. Coverage distinguishes **Extraction required**, **Awaiting review**, **Partially approved**, **Fully approved**, **Published** and **Import error** from real saved data. **Fully approved** is not published. Leave **Publish Approved Paper** untouched while reviewing; publication is a separate explicit owner action and requires the verified V16 backend.

## Source corrections for later

Do not modify the source CSVs as part of this PR. Foundation contains duplicate `EDX-F-June2017-2F-Q05a` (case-insensitive). Higher contains AO `0` for `EDX-H-JUNE2025-1H-Q02B` and `EDX-H-JUNE2025-1H-Q03A`; those parts need a source-backed correction before their paper can be published. Neither issue affects November 2022 2F/3F.
