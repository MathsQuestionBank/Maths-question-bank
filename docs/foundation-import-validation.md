# Foundation import development batch

Repository: MathsQuestionBank/Maths-question-bank. Supabase target: ljisttslifnyrbuybfud.
No other project is used. No production writes, publications, or migrations were performed.

## Included

- Coverage in the existing import area: published paper/part counts and marks, saved approval counts, resumable review, duplicate identity warnings, and visible read errors. November 2020–2022 is the requested backlog, not a complete official availability catalogue. Other database/intake papers appear automatically.
- PDF proposals include editable first/last pages. Printed total lines determine the end; near-top question headings and footer page numbers are distinguished. Existing single-page saved crops remain compatible.
- Saved reviews retain their original mapping filename, corrected coordinates, metadata edits and approvals; preparation stops on unreadable review data. Newly archived mappings cannot silently replace approved work. Navigation resumes at the first unapproved question.
- Interrupted uploads reuse only byte-identical PDFs. Different source files and previous review documents are never overwritten. The archive list refreshes after upload.
- Whole-question grouping supports enhanced Foundation IDs and published whole keys, prevents whole/part double-counting, and retains selected saved record IDs. Foundation grade filters and displays include grades 1–5.
- All supplied grade 1–9 percentages and available mapping provenance are exported. The additive SQL function replacement in `v16-preserve-enhanced-publication-metadata.sql` must be reviewed and applied before claiming these extra fields are retained by the live publishing RPC. It is not auto-applied. Existing V1.5 only stores grades 1–5.
- Bank and coverage queries paginate instead of silently stopping at 1,000 question records.

## Validation

Use Node 24 (tested 24.19.0); current resolved Supabase packages require Node >=22. CI now uses Node 24. No dependency declarations or lockfiles were changed. This repository has no committed lockfile, so future dependency resolutions can differ.

```sh
npm install --package-lock=false
npm test
npm run build
# Use an existing Chromium executable in this cloud image:
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:smoke -- --workers=2
# Otherwise install the browser with npx playwright install --with-deps chromium.
```

Real private-source validation (no files are uploaded or committed):

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node tools/validate-real-papers.mjs /private/question.pdf /private/mark-scheme.pdf
```

The supplied November 2022 2F PDFs contain 26 question groups / 80 printed marks; all question anchors were found, including Q18 on PDF pages 14–15 and Q24 on pages 20–21. The supplied 3F PDFs contain 30 groups / 80 printed marks. Both mark tables start on PDF page 6. Every proposed question/mark crop rendered. These checks establish text anchors, page ranges and renderability, not teacher approval or complete visual correctness. All proposals remain unapproved. No enhanced part counts were inferred from these PDFs.

The 26 groups / 44 parts / 80 marks unit regression is a synthetic structural fixture, not a claim to have accessed the live 1F saved review. Browser tests use mocked account/storage responses; they verify restoring corrected crops and approvals while ignoring a newer mapping, coverage status/error handling, and existing Higher assessment exports and reopening.

## Outstanding access and source requirements

- Runtime network policy denied the Maths Question Bank Supabase host and GitHub API. Requested additions are saved in the environment draft. Git read access to the selected repository works. Even after network access is enabled, private table/storage checks require an approved owner session through a supported secure route. No service-role key is needed in frontend code or chat.
- November 2022 1F live publication status, its saved approved review, and the nine Higher papers remain **unverified**. Do not re-extract, overwrite or publish 1F to resolve this uncertainty.
- Both supplied enhanced mapping workbooks exceed the attachment transfer tool's 32 MiB limit. Neither was read. A workbook reduced below 32 MiB or a smaller export of the relevant mapping worksheet is needed for real enhanced-mapping validation. The app's XLSX limit is now 64 MiB; that does not change the attachment tool limit.
- No PDFs for November 2020/2021 Foundation or June 2022 were supplied. Obtain the authorised matching question-paper and mark-scheme PDFs for 1F, 2F and 3F before claiming those imports. Check available mapping series before requesting further workbooks.
- SQL was not run against the live schema. Validate the additive function in a Maths Question Bank staging database, retaining existing RLS and unique constraints. Failed-publication unit tests mock the RPC; they cannot establish live transaction rollback or cross-browser account permissions.
- No exam paper has been imported, approved, or published by this development batch. Deployment and live verification remain separate steps after review and access.
