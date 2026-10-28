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

## Supplied 2020/2021 Foundation papers

The additional private PDFs were checked locally against the replacement Foundation CSV. The validator now accepts an explicit series after its paper-code argument, e.g. `node tools/validate-real-papers.mjs question.pdf scheme.pdf mapping.csv 1F "November 2021"`.

| Mapping series | Paper | Complete questions | Mapped parts | Marks |
|---|---|---:|---:|---:|
| November 2021 | 1F | 28 | 37 | 80 |
| November 2021 | 2F | 28 | 41 | 80 |
| November 2021 | 3F | 28 | 40 | 80 |
| November 2020 | 1F | 30 | 40 | 80 |
| November 2020 | 2F | 29 | 39 | 80 |
| November 2020 | 3F | 29 | 46 | 80 |

All six pairs passed per-question mapped marks versus printed totals, unique selected-paper IDs, mapping-field validation, detected question/mark anchors and rendered crop validity. Mark tables begin on PDF page 6. Every question crop detected and trimmed a paper border. No question-number inference was needed. These checks are structural; no complete visual approval or live import/publication is claimed.

The 2021 mark schemes have `/Rotate 90` page metadata. This exposed a bug in text coordinates: reading raw PDF positions without the page viewport transform prevented table detection. Coordinates now use PDF.js `convertToViewportPoint`, matching rendering for rotated and ordinary pages. The CSV browser regression now uses a valid rotated-landscape scheme fixture and verifies preparation, marking-table detection, save and cross-device restoration. Local unit/build/browser checks passed after the fix.

The supplied `A20` question-paper covers print May/June 2020 dates, while their matching supplied mark schemes say November 2020. Opening questions/answers match, as do all per-question mark totals and November 2020 mapping allocations. Preserve this provenance discrepancy for owner confirmation; do not silently rewrite the source PDFs or claim official archive identification from filenames alone. The 2021 scheme filenames contain the release date January 2022, but their covers explicitly identify November 2021.

All new papers remain local validation inputs: none was uploaded, approved or published, and original saved reviews were not modified. Use the same website workflow above, selecting the confirmed series and paper code after full-size source review.

## Single-batch preparation and dedicated import identity

The new **Prepare a batch for review** section is part of the existing paper importer. It accepts a private ZIP with matched PDFs, the replacement mapping and precomputed unapproved crop proposals. **Prepare all papers for review** stages the whole batch in the signed-in owner's private account. It skips published papers and existing saved reviews, retains different source files, and uses non-overwriting writes. Per-paper failures remain visible; reselecting the same ZIP safely resumes missing work. It neither approves nor publishes content.

A private eight-paper package was generated outside Git: November 2022 2F/3F and November 2021/2020 1F/2F/3F. It excludes the already-approved November 2022 1F. The 2020 source-date note is shown during batch inspection and retained in intake metadata. No copyrighted source PDFs or mappings are committed or put on a public preview.

`tools/stage-review-batch.mjs /private/batch.zip` validates the same package locally without remote access. With `--stage`, it uses `MQB_IMPORT_EMAIL` and the proxy-bound `MQB_IMPORT_PASSWORD`, requires `NODE_USE_ENV_PROXY=1`, signs in normally and checks approved-owner access. The credentials are never logged; session storage stays in memory and that login is signed out locally on completion. The runner blocks publication RPCs and question-table writes. It reuses the exact browser batch code instead of maintaining another importer.

A dedicated user's intake reviews belong to that user's account. The teacher must sign into the website using the same import account to review them. The original owner's 1F review remains unchanged and belongs to the original account. Shared draft-review access across owners would require a separately reviewed access-control change; this feature does not change RLS.

The environment draft contains requirements for `MQB_IMPORT_EMAIL` and `MQB_IMPORT_PASSWORD`, restricted to ljisttslifnyrbuybfud.supabase.co. Values must be supplied securely in environment settings and applied/published by the user before live automation can be verified. No credentials are stored in code or chat, and no service-role key is required.
