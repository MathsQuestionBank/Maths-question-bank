# Pending-paper review audit

The user authorised review of all papers currently awaiting review, approval only of verified complete questions, and leaving uncertain questions unapproved. Publication remains a separate action and is not authorised. The initial dedicated-import-account inventory contains 80 pending papers and 2,025 unapproved questions. Published papers are excluded from edits. Pre-audit approvals are retained; the user separately requested crop corrections to November 2022 Foundation 1F while retaining its 26 approvals. Approvals created during this audit may be withdrawn if a later cross-check reveals uncertainty, with the previous review backed up.

## Latest unpublished-paper checkpoint — 29 October 2026

The latest read-only publication snapshot leaves 54 unpublished papers from the original inventory. All 54 have now had every question and mark-scheme crop pair visually inspected: 1,343 complete question groups, with 1,223 approvals saved and freshly read back. The remaining 120 groups are unapproved with notes about source classifications, common-question AO differences, or provisional mapping rows. These flags do not assert that tier-specific AO differences are errors, and source values were preserved.

Across the full audit, 61 paper reviews / 1,532 groups have verified saves, including seven papers subsequently published separately. Papers already published when a save was attempted were skipped. The audit did not publish any paper, modify published question records, or change saved assessments. The separate November 2022 Foundation 1F correction retained all 26 pre-existing approvals and was verified before that paper appeared published.

June 2022, June 2024 and June 2025 are included. Marking appendices, alternative methods, separate answer diagrams, multipart grouping, raised numerators and exponents were checked against the actual PDFs. June 2022 Foundation 2F Q24b retains the user-specified 75% Grade 5 value and its original 107% provenance. June 2025 Higher 1H Q2/Q3 remain unapproved for the existing provisional mapping flags.

One concurrent change was preserved: November 2019 Higher 2H's remote review had all 25 approvals rather than the audit's expected 22. Only three approval flags differed; crop coordinates, notes and metadata matched. The newer remote review was not overwritten, and the paper subsequently appeared published.

Private per-question exceptions and source backups remain outside Git. Use the current branch preview with the dedicated import account to inspect saved reviews. These counts are a dated snapshot, not a claim that the original 80 papers remain unpublished or were all approved by this audit.

Verification on the latest PR code: 136 unit tests, production build, 13 Playwright tests (three intentional mobile PDF skips), and the isolated PostgreSQL V15/V16 compatibility/concurrency suite passed. Regression fixtures now tolerate floating-point crop arithmetic, distinguish the retained duplicate warning from a refresh error, and use existing PDF pages when testing failed-render canvas clearing. No product code changed in this checkpoint. Real-schema/RLS staging verification remains a release gate; no production SQL was run.

## Crop corrections

Question crops end 0.014 page heights below the printed total instead of 0.035, with a next-question cap. The June 2019 2F Q1 regression verifies that none of Q2 appears. Saved crops are still restored exactly; tighter guesses do not overwrite an existing review on load.

The outer-frame detector previously selected the first long line in the bottom-page search band. A question's total underline could be mistaken for the outer border, clipping the bottom of the total text. New crops opt into `borderVersion: 2`, which selects the outermost qualifying bottom frame line. An absent version retains legacy rendering, including approved saved crops. Version changes are validated, restored and compared before publication, and invalidate the preview render dependency when edited.

June 2019 2F Q1's question crop and Q7's mark crop were explicitly corrected and saved unapproved during review. Q7 retains its answer and both guidance lines while dropping the blank tail and header-only next page. Broader mark proposals use the original PDF's full-width marking-table borders locally to preserve full rows and diagrams; they require visual verification before approvals are saved. Column vectors and other tall notation also require checking above the detected text baseline.

## Preservation

Private audit originals, sources, proposed images and decisions remain outside Git. Before any saved review update, the latest exact review must match the audited original, an immutable content-hash backup is retained, and the resulting review is read back with cache bypass. Existing approvals, notes, source mapping references and immutable Pearson/grade data are retained. Only reviewed pending items may change. No publication RPC, paper/question-table write, production migration, merge or production deployment is part of this audit.

Question-number anchors also respect the preceding printed total, preventing a fraction denominator in Q4 from becoming the Q5 anchor. Mark-scheme anchors align with the first table question’s number column, preventing multiplication working digits from becoming later question anchors. Both have regression tests. The new boundaries and marking anchors were checked against all 80 real pending papers / 2,025 questions with no structural failures; saved reviews were not overwritten by this check.

The assessment browser test now awaits both its confirmation dialog and completed versioned save, with a valid RPC response. It verifies that the original browser assessment is retained after the cloud copy completes; previously the test could end while dialog acceptance was still pending. No assessment product code changed.

Local checks for the detector correction: 113 unit tests, production build and 13 Playwright tests passed; 3 intentional mobile PDF skips. Real-PDF crop inspection is additional evidence, not an assertion that all pending papers have completed visual review.


## Saved visual-review progress (initial snapshot)

| Paper | Visually reviewed groups | Approved | Left unapproved |
|---|---:|---:|---|
| June 2019 2F | 29 | 27 | Q6, Q12: Geometry additional tags on money/time tasks |
| June 2017 1F | 27 | 24 | Q7: Geometry tag on money task; Q21, Q24: common-question AO differences |
| June 2017 1H | 22 | 19 | Q1, Q4: common-question AO differences; Q3: Ratio tag on decimal multiplication |

All saved results were freshly read back. These counts describe the initial completed papers, not completion of the full 80-paper audit. Differences in common-question AO labels may be deliberate tier-specific classifications; neither source AO was replaced or declared invalid. Both pending reviews carry a verification note. Earlier approvals created by this audit for Foundation Q21/Q24 were withdrawn once the Higher comparison identified that uncertainty. Pre-audit approvals and published papers remain untouched.


## Multi-page marking-table joins

A crop may optionally retain one `fragments` entry per source page, with separate top/bottom bounds. Every page from `page` through `endPage` must appear exactly once in order; first/last fragment endpoints must match the overall crop. Missing pages, reversed bounds, invalid or tiny fragments are rejected. Legacy crops without fragments keep their existing rendering. Global endpoint edits update the corresponding fragment; changing the page range clears obsolete fragments and requires re-review. Saved restoration, preview dependencies and publication comparison include the page joins.

This removes repeated table headers and blank page tails while retaining all actual continuation rows, including alternative solutions and marking notes. A real June 2017 2F Q18 join was visually checked against both source pages. The CSV browser fixture now spans two marking pages with red repeated headers and blue continuation guidance: the saved join renders zero red header pixels while retaining the blue guidance, and survives reopening on another device and editing its first endpoint. Unit tests reject dropped continuation pages and unsaved join changes before publication. These joins are review proposals; they do not approve questions automatically.


Mutable review reads now use a unique Storage `cacheNonce` plus `cache: no-store` for coverage, preparation, pre-save comparison and publication comparison. Immutable PDFs/mappings retain their existing reads. This prevents cached earlier approvals or crop coordinates from being mistaken for the latest account state; the cross-device browser regression checks distinct nonempty nonces on every review read. It does not turn the stale-copy check into an atomic compare-and-swap.

## Separate answer-diagram pages

June 2018 Higher 1H prints the Q18 answer graph after Q20's marking table. Explicit `selectedPagesOnly: true` crops can now join strictly increasing selected source pages, keeping the diagram with its own question and excluding intervening questions. Without this flag, fragments still require every page in the range. Each section can have its own horizontal bounds. Legacy crop rendering is unchanged.

The review screen exposes saved page-section bounds for correction; every edit removes approval. Invalid page selections or crop bounds block saving and retain previous account progress. Restoration and publication comparison include the selection flag and section bounds. Browser coverage uses two continuation sections plus a separate green diagram page, with an unrelated red page between them: the rendered crop retains blue guidance and green diagram content, excludes all red content, and survives another-device restoration. The same test verifies invalid section bounds cannot overwrite the saved review.

Validation: 116 unit tests, production build, and 13 Playwright browser tests passed, with 3 intentional mobile PDF skips. No SQL migration is needed for these optional saved-review fields. This change does not publish or approve any question automatically.
