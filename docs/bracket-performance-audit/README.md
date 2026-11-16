# Bracket classifications and historical performance investigation

Snapshot: 16 November 2026, main `941f367` (PR #95). Read-only authorised examination metadata: **3,181 parts / 2,257 grouped whole questions**, Foundation 1,260 / Higher 997. No production writes, migrations, image changes or public storage access. PR #95's exact alias registry and historical audit remain intact.

## What was checked

All 3,181 stored records were screened using current skill, original imported skill, topic and specification metadata. This produced **165 bracket/algebra candidate parts in 117 source questions across 71 papers**. The actual mathematical tasks in all 117 question regions were checked using text and rendered public source-paper pages, including both tiers. Labels alone did not decide classifications. Public URLs, page numbers and SHA-256 hashes are in [the structured audit](bracket-source-audit.json) and [source manifest](public-source-manifest.json). [CSV](bracket-source-audit.csv) supports owner review.

**No private stored question/mark-scheme image bytes were inspected.** These are source-paper counterparts matched by board, series, paper, question reference, part and marks, not a certification of private crop content or mark-scheme separability. The November 2019 covers are raster: their dates, paper references and tiers were visually checked. June 2022 covers have paper references but no examination date; the series comes from the public source catalogue and stored paper metadata, not their earlier copyright year. No PDFs, examination screenshots, private paths, signed links or credentials are committed.

This is a targeted candidate audit, not proof that every possible bracket task in the bank was found. Other questions may contain embedded expansion not identified by metadata. The wider families below need separate content audits.

## Three mathematically distinct categories

| Canonical name | Operation | Example |
| --- | --- | --- |
| Expand single bracket | One distributive product | `3(x + 4)` |
| Expand 2 single brackets and simplify | Sum/difference of separate distributive products | `3(x + 2) + 2(x + 5)` |
| Expand double brackets and simplify | Product of two brackets | `(x + 3)(x + 4)` |

Three-bracket products stay outside these three categories, even though one possible working step expands two brackets. Conceptual, modelling and alternative-method questions are not promoted into focused practice without teacher review.

Outcome: **22 source-verified part proposals in 21 whole questions**, 115 checked parts outside the target task types, 16 conceptual/method-dependent cases, and 12 three-bracket tasks. Nine of the latter have broad stored labels, giving **25 teacher-review records** in [teacher-review.csv](teacher-review.csv). Three already have explicit three-bracket labels and retain them. These are assistant proposals for owner PR review, **not teacher-approved classifications**.

Representative source checks:

- June 2018 3F Q20 / 3H Q2: `5(p + 3) − 2(1 − 2p)` expands **two separate single-bracket terms**, not a product of two brackets.
- November 2018 2F Q26(a): `(5x + 2)(2x − 3)` is a **double-bracket product**.
- November 2023 1F Q27(a): `(3x + 2)(2x − 5)` was hidden under broad `Algebraic manipulation`; the focused double-bracket membership is added while the broad source classification is preserved.
- November 2020 1F Q19(a): `x(x − 4)` is a single-bracket task stored as `Factors and multiples`; that erroneous canonical membership is replaced for this exact record only. Original metadata/title remain available.
- June 2025 3F Q21(c,d) tests single and double brackets in different parts: the whole question counts once under each genuine skill.
- November 2024 1H Q11(a) asks about coefficients in a factorisation relationship. Expansion can justify the relationship; it is not automatically equivalent focused double-bracket practice. Retained for teacher review.

## Before / after coverage

Counts are whole original examination questions, once **per skill**, with separate source papers/tiers retained. A multipart question can genuinely have multiple skills. These are metadata/asset-readiness counts using existing grouping rules, not verified standalone part crops.

| Tier | Before PR (separate legacy entries) | After source-backed canonical coverage |
| --- | --- | --- |
| Foundation | Single-bracket wording group: 3 | Expand single bracket: **8** |
| Foundation | `Expand brackets and collect like terms`: 2 | Expand 2 single brackets and simplify: **3** |
| Foundation | `Expand and simplify double brackets`: 1; `two brackets`: 2; `two linear brackets`: 1 | Expand double brackets and simplify: **5** |
| Higher | Generic `Expand expressions`: 13; negative-index expansion: 1; three separately named three-bracket tasks | Single: **2**, two-single: **3**, double: **1**; unrelated/ambiguous original skills retained |

These are not sums of legacy search hits: genuine content checks recover tasks from broad labels and distinguish operations. The exact before/after rows and all historical results are in [coverage-and-performance.json](coverage-and-performance.json).

`bracketSkillReview.json` binds every overlay to database ID, paper ID, source ID, question/part reference, stored skill, marks, board, series, paper and tier. Any changed identity fails closed and requests review. Uninspected legacy expansion labels are retained with an explicit review warning; there is no title-, tier- or specification-based inference. Other verified skills remain attached. Unknown records never acquire the three focused categories from ambiguous wording.

Insights, its filters/summaries/CSV, and **Question Bank** use the same canonical membership function. The bank has canonical/retained filters plus explicit original-label filters, displays original titles and canonical skills, and retains flexible keyword searches. Explicit `double brackets` searches use the verified double category and cannot pull in either single-bracket category. Other exact canonical/alias searches use shared memberships. The index is memoised per loaded catalogue, not rebuilt per card. Smart Shadow and Find Similar ranking deliberately remain unchanged.

## Why the historical line decreased

The screenshot is reproduced **exactly** by the original available-question calculation. Its medians are not a calculation bug:

| Final GCSE grade | All-tier median % | Whole questions with data | Missing data (of 2,257) |
| --- | --- | --- | --- |
| 1 | 20 | 1,259 | 998 |
| 2 | 38 | 1,259 | 998 |
| 3 | 34.7 | 2,050 | 207 |
| 4 | 48 | 2,256 | 1 |
| 5 | 67 | 2,256 | 1 |
| 6 | 52.3 | 997 | 1,260 |
| 7 | 67.7 | 997 | 1,260 |
| 8 | 82 | 997 | 1,260 |
| 9 | 93 | 997 | 1,260 |

Grades 1–2 contain Foundation questions only. Grade 3 adds 791 Higher questions. Grades 4–5 include 997 Higher questions; Grades 6–9 contain Higher only. One Foundation whole question lacks complete performance, and **206 Higher whole questions lack Grade 3**. Changing populations explain these aggregate decreases. This does not prove all individual profiles are monotonic, nor would it justify adjusting values to force an increasing line.

The stored `g1`–`g9` values mean **average percentage of available marks earned by students who ultimately achieved that final GCSE grade**. They are not question grades, pupil fully-correct rates or full-mark rates. Original values and the legacy `grade` field remain unchanged; the legacy field is not used to classify question difficulty.

## Comparison modes and exact calculation

The original available-at-each-grade calculation stays the default. Chart tier uses **actual source tier**, not a display fallback or legacy grade. All nine grades remain visible with unavailable values labelled `No data`.

`Compare the same questions` takes the intersection of usable whole questions having valid data on **every displayed selected grade**. Available grades come from the data, not fixed tier assumptions. The same population keys are reused for every point. Owners can select fewer grades. All-tier Grades 1–9 currently have an empty intersection; the UI explains this and offers the actual overlapping grades 3–5. No compatibility constraint or missing value is silently relaxed.

| Tier / selected comparison | Included at every point | Excluded | Median percentages in displayed grade order |
| --- | --- | --- | --- |
| Foundation / 1–5 | 1,259 | 1 | 20, 38, 56, 72, 85 |
| Higher / 3–9 | 791 | 206 | 7.7, 18, 35.8, 53, 69, 82.5, 93.3 |
| Higher / 4–9 | 997 | 0 | 17, 34.6, 52.3, 67.7, 82, 93 |
| All / 1–9 | 0 | 2,257 | No data |
| All / 3–5 | 2,050 | 207 | 34.7, 51.8, 71 |

For each whole question and final grade: require every mapped part to have finite positive marks and a finite performance value between 0 and 100 inclusive; zero is valid. Compute `sum(part marks × part %) / sum(part marks)`, rounded to one decimal using the existing function. Then take the **unweighted median of whole-question percentages**, averaging the two central values for even sample sizes and rounding to one decimal. Do not sum part percentages, duplicate whole questions, impute missing parts or weight the bank-wide median by question marks.

An independent Python check grouped the metadata by paper ID and original integer question number, then recomputed all mark-weighted averages and medians without importing the application functions: all **8 comparison cases / 57 grade rows** agree (2,257 whole questions).

The chart reports included and excluded whole questions, plus missing values at the individual grade. In same-question mode, excluded means incomplete on **any** selected grade; this can exceed the missing-at-that-grade count. Empty comparisons and samples under five show explicit cautions (five is a display caution, not a statistical confidence threshold). The SVG draws straight observed segments with gaps at missing values; nothing is smoothed or adjusted. A data table provides exact accessible values. [CSV calculations](historical-calculations.csv) include population hashes to demonstrate identical question sets.

Even a fixed question set compares **different historical student cohorts**. Cohort sizes, response distributions and cross-paper calibration are unavailable. Part averages may derive from different samples; mark weighting reproduces existing practice, not a pooled pupil statistic or a definitive difficulty estimate. No uncertainty intervals or equivalence claims can be inferred.

## Wider audit priorities

[Machine-readable priorities](wider-audit-priorities.json) are metadata-only candidate counts, **not counts of proven classification errors**; families overlap and include legitimate multi-skill questions. Do not add them together. No bank-wide reclassification was applied.

| Priority | Family | Candidate records | Next source-content review |
| --- | --- | --- | --- |
| P1 | Equations | 225 | Separate linear, quadratic, simultaneous, identities and modelling. `Solving equations` remains unresolved (97 raw token occurrences). Never infer linear from Foundation. |
| P1 | Factorisation | 44 | Separate common factors, quadratic variants and difference of squares; distinguish numerical factors. This bracket audit directly found the Q19(a) single-bracket mislabel above, but does not validate all factorisation labels. |
| P1 | Algebraic simplification | 213 | Separate collection, index laws, distributive products, cancellation and algebraic fractions; preserve legitimate compound skills. |
| P2 | Fractions / percentages / ratio | 711 | Distinguish operations, conversions, reverse/change percentage and direct/inverse proportion. Broad wording is not evidence of equivalence. |
| P2 | Graphs / coordinates | 269 | Separate plotting, interpretation, gradients, line equations, transformations and statistics; inspect diagrams and shared context. |
| P2 | Probability / statistics | 305 | Separate technique and representation skills; check fragmented compound labels and dependencies. |

Review should use the existing owner-only audit ZIP workflow for private crops where necessary. Record source wording, part, dependencies, mark scheme and reviewer approval before new record-specific overlays. Do not broaden PR #95 aliases to merge mathematically different operations.

## Validation and evidence

Unit tests cover source-identity binding, stale/unknown metadata, all 22 proposals, the three distinct categories, genuine multi-skill membership, tier counts, whole-question deduplication, strict bracket searches and original metadata preservation; historical tests cover realistic profiles, zeros/invalid values, actual-tier filtering, multipart mark weighting, median rounding, unavailable grades and identical populations. Existing PR #95 registry audit parity remains tested.

Playwright uses **clearly synthetic data/assets** with source-identity fixtures for UI behaviour; screenshots are not claims of private image inspection. The full existing smoke suite covers assessment, Find Similar, Smart Shadow, numbering and PDF flows. See PR test results and [screenshots](screenshots/) for desktop/mobile examples. No source examination image is included in the screenshot artifacts.

Final local validation:

| Check | Result |
| --- | --- |
| `npm run build` | Passed; existing Vite >500 kB chunk-size warning remains |
| `npm test` | **387 passed**, 33 files |
| `npm run test:smoke -- --workers=2` | **82 passed, 12 existing skips**, no failures |
| Final chart spacing/header browser regression run | **4 passed**, desktop/mobile; 320 px overflow and checkbox direction assertions |
| `python -m unittest discover -s tools -p 'test_*.py'` | **13 passed** |
| Independent Python snapshot calculation | All **57 grade rows / 8 comparison cases** agree |
| `git diff --check` | Passed |

The smoke skips are the existing desktop-only PDF/OCR/extraction cases excluded from the mobile project; those cases pass in desktop Chromium. Initial new-test failures (JSON fixture import, a missing exact-original filter option, and an incorrect query-count expectation) were corrected and the suite rerun. No unresolved failure was observed. Screenshot inspection also caught inherited vertical checkbox styling; the final focused run verifies the corrected row layout.
