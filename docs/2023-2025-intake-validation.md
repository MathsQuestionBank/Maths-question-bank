# November 2023, June/November 2024 and June 2025 intake

All 48 supplied PDFs form 24 complete paper/mark-scheme pairs. Source PDFs, replacement mappings and prepared ZIPs remain private and outside Git. May-dated Paper 1 uses the June mapping series.

## Validation

Every paper passed unique selected-part IDs, required metadata and percentage checks, per-question mapped marks against printed totals, question/mark anchors and rendered-crop validity. Each totals 80 marks. Proposals remain unapproved and require full-size teacher visual review; structural validation is not approval.

| Series | Paper | Complete questions | Mapped parts | Marks |
|---|---|---:|---:|---:|
| June 2024 | 1F | 28 | 41 | 80 |
| June 2024 | 1H | 23 | 33 | 80 |
| June 2024 | 2F | 28 | 42 | 80 |
| June 2024 | 2H | 22 | 32 | 80 |
| June 2024 | 3F | 29 | 40 | 80 |
| June 2024 | 3H | 21 | 31 | 80 |
| June 2025 | 1F | 26 | 39 | 80 |
| June 2025 | 1H | 17 | 28 | 80 |
| June 2025 | 2F | 29 | 39 | 80 |
| June 2025 | 2H | 23 | 30 | 80 |
| June 2025 | 3F | 30 | 43 | 80 |
| June 2025 | 3H | 23 | 28 | 80 |
| November 2023 | 1F | 27 | 39 | 80 |
| November 2023 | 1H | 22 | 33 | 80 |
| November 2023 | 2F | 30 | 37 | 80 |
| November 2023 | 2H | 21 | 29 | 80 |
| November 2023 | 3F | 29 | 38 | 80 |
| November 2023 | 3H | 24 | 35 | 80 |
| November 2024 | 1F | 26 | 41 | 80 |
| November 2024 | 1H | 20 | 29 | 80 |
| November 2024 | 2F | 28 | 38 | 80 |
| November 2024 | 2H | 22 | 28 | 80 |
| November 2024 | 3F | 27 | 39 | 80 |
| November 2024 | 3H | 23 | 29 | 80 |

## Source issues resolved for review

November 2024 2F Q17's question PDF prints “Total for Question is 17 is 6 marks”. The extractor now accepts this extra “is” consistently when finding question totals and page bounds. A regression test ensures Q17 ends on its own page rather than including Q18. The independent real-PDF validator also recognises the printed typo. No PDF text or approved crop is changed.

The supplied Higher mapping has invalid AO0 for June 2025 1H Q02b and Q03a. These are identical common questions to Foundation 1F Q20b and Q21a respectively, where the supplied Foundation mapping has AO1. A separate Higher review CSV changes just these two AOs to AO1 and adds two explicit teacher-verification notes. All Higher skills, marks, specification references and cohort performance figures are retained. Q03a's Higher specification A21 differs from Foundation A2; this discrepancy is explicitly flagged without replacing the Higher reference. The original CSV remains unchanged; teacher verification is required before approval.

The Foundation review copy retains earlier documented corrections, including the user-specified June 2022 2F Q24b Grade 5 success percentage of 75%. This is an explicit user override, not a value inferred from the original mean score of 1.07. Existing reviews keep their pinned mappings; this batch does not update earlier reviews.

June 2025 3F's 54-page scheme includes duplicate material and modified-large-print appendices. The existing standard-section end detection limits extraction to the first standard section.

## Checks and staging

104 unit tests and the production build passed (existing bundle-size warning). Playwright: 13 passed, 3 intentional mobile PDF skips. The batch uses the existing owner-scoped, non-overwriting importer; existing reviews and published papers are skipped. No question approval, content publication, database migration, merge or deployment is authorised by this intake.
