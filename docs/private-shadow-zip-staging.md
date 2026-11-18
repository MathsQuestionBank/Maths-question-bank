# Complete shadow ZIP staging

This extends **Import Exam Papers → Import Official Shadow Papers**, reusing
ShadowPaperImporter, the existing Supabase client, getUser/is_approved_owner,
exam-materials-private and shadow_papers. There is no new backend, migration,
policy, credential or selectable-question write. The existing source-only upload
option is retained. The ZIP option is the resumable route for complete bundles.

## Owner workflow and Android

After this code receives an authorised deployment or an authenticated HTTPS
preview, sign in with the existing MathsQuestionBank owner credentials. Select
the original paper and set, choose **Prepared shadow paper ZIP** using Android's
Files picker, check the counts, then select **Stage or resume ZIP privately**.
The file picker is a normal browser input; no desktop file paths are required.
The client is responsive and uses Web Crypto, supported by Android Chrome over
HTTPS. A different preview origin requires signing in again with the same account.
No remote preview URL was provisioned and no deployment was performed here.
The current public website therefore does not yet have this ZIP option.

## Bundle format

intake.json is version 1, kind official-shadow, status awaiting-review. It includes
the exact original paper identity, set, metadata, 80-mark accounting, individual
part classifications, proposed original IDs explicitly marked unverified, null
approved AO/specification fields with separate candidates, outstanding original
image verification and teacher-review flags. Each question has exactly one draft
PNG of each kind. Source PDFs are question-paper.pdf and mark-scheme.pdf.
Every source/crop has a SHA-256 checksum; draft paths include their image hashes.
The prepared pilot bundle is outside the repository; no Pearson bytes are committed.

ZIP size is limited to 60 MB; declared expansion to 150 MB; entries to 1000; each
entry to 30 MB; manifest to 2 MB. The central directory is inspected before
JSZip expands entries. Streaming size limits also stop entries that understate
their expanded size; CRC is checked as each entry is read. ZIP64, encryption, multi-disk ZIPs, traversal, links,
duplicate/case-colliding names and unexpected files are rejected. CRC, file
signatures, PNG dimensions, hashes, marks, counts and provisional status are checked.
Live checks confirm the selected original paper, proposed part IDs/references/marks
and that every proposed label exists in the current stored skill vocabulary.
These checks do not approve counterpart links or claim visual verification.

## Remote writes and retry

1. Verify owner access, paper/part metadata and current intake identity.
2. Create a no-overwrite upload-claim.json under
   shadow-paper-intake/<paper-id>/<canonical-set-slug>/.
   This private sidecar claims the set for one content hash and preserves the first
   uploader identity. A conflicting bundle stops for reconciliation.
3. Write bundle files under
   <claim-root>/<claim-owner>/bundles/<bundle-hash>/.
   The pilot has 55 payload files (2 PDFs, 52 PNGs and intake.json), plus the claim.
4. Before each write, reconcile any existing file using download + SHA-256.
   Reuse identical bytes; fail on different bytes. Every upload uses upsert:false.
   An uncertain upload response is followed by read-back, never a blind overwrite.
5. Only once every payload has passed remote verification, insert one
   shadow_papers row with status awaiting-review and the absolute private source
   and manifest paths. No public.questions rows are created or updated.
6. Read the intake back and verify all payload objects again before reporting
   success. A lost registration response is reconciled by lookup; an identical
   completed retry performs no file uploads or additional registration.

Selecting the same ZIP after interruption resumes the remote state. No browser
checkpoint or stored credentials are needed. Standard per-file uploads are used,
not byte-level resumable transfer; a failed individual file may need retransmission.
The manifest is byte-preserved, including any local-preparation status field;
the intake row and final remote verification determine remote staging success.
No signed URLs are persisted or exported by this workflow.

A pre-existing legacy intake/folder, different file bytes, a different bundle for
the set, multiple case-variant intake rows, or a reviewed set fail closed. The
uploader does not delete or repair those automatically. Review the private claim,
objects and intake row using an owner account; keep valid artifacts and reconcile
explicitly before retrying. Existing database uniqueness remains the final guard
against duplicate registrations. The source-only uploader does not use ZIP claims;
do not run the two upload routes concurrently for the same set.

## Privacy and approval

Objects remain in the existing private bucket. Draft paths have no corresponding
questions records, so the existing owner-only staging access remains in effect.
Proposed IDs remain manifest metadata, not shadow_of_question_id database links.
Original questions and all current permissions remain untouched. Q7 print scale,
Q22(b)'s example, part classifications and AO/specification review remain pending.
Successful staging is neither teacher approval nor publication.

## Development verification

- npx vitest run src/shadowBundle.test.ts src/shadowAssessments.test.ts src/questionBankInsights.test.ts
- node tools/test-shadow-bundle-upload.mjs (starts/stops its own local test server; also runs in CI)
- npm run build

Browser tests intercept every Supabase request with synthetic responses, including
Storage writes. Desktop and Android-sized runs cover owner denial, selection,
validation without uploads, interruption, retry, duplicate reconciliation and
provisional metadata preservation. Unit tests cover corruption, conflicts,
missing read-back, lost registration responses and legacy/reviewed intakes.
The actual pilot ZIP was also validated locally: 26 questions, 41 unchanged part
classifications, 80 marks, 55 files and unchanged flags. Nothing was sent remotely.

For a local system Chromium, set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH; otherwise
the browser check uses Playwright’s installed Chromium. Mobile coverage is touch
viewport emulation, not a physical Android-device test. The ZIP and source PDFs
stay outside Git and must be uploaded separately after deployment approval.
