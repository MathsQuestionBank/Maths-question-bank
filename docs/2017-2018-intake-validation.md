# June/November 2017–2018 review intake

Original PDFs and CSVs are private inputs and are not committed. All staged proposals remain unapproved; no exam content was published.

## Mapping corrections and blocker

June 2017 Foundation 2F: the two duplicate `EDX-F-JUNE2017-2F-Q05A` rows refer to different parts. The Frequency tables row is Q5(a); the Pictograms row at Source Excel row 55 is Q5(b), confirmed on question PDF page 5 and mark scheme page 8. A separately named corrected Foundation CSV changes only that row’s Question ID to `EDX-F-JUNE2017-2F-Q05B` and Question to `Q05b`. A full cell comparison confirmed every other field, including marks and performance data, is unchanged. The original attachment and previously staged mapping sources remain untouched. Corrected 2F validates at 25 complete questions, 40 parts, 80 marks.

November 2018 Foundation 3F is held out of staging. The PDF and mark scheme have Q19(a)=2, Q19(b)=2, Q19(c)=3; the supplied CSV lacks Q19(c), totalling 77 marks. Missing grade-performance percentages, AO and mapping provenance were not fabricated. The source row requires a separate correction before this paper can pass the 80-mark gate.

## Real-file validation

| Series | Paper | Complete questions | Parts | Marks | Result |
|---|---|---:|---:|---:|---|
| June 2017 | 1F | 27 | 41 | 80 | Passed |
| June 2017 | 1H | 22 | 31 | 80 | Passed |
| June 2017 | 2F | 25 | 40 | 80 | Passed |
| June 2017 | 2H | 23 | 29 | 80 | Passed |
| June 2017 | 3F | 23 | 37 | 80 | Passed |
| June 2017 | 3H | 20 | 28 | 80 | Passed |
| November 2017 | 1F | 30 | 40 | 80 | Passed |
| November 2017 | 1H | 23 | 27 | 80 | Passed |
| November 2017 | 2F | 24 | 42 | 80 | Passed |
| November 2017 | 2H | 23 | 34 | 80 | Passed |
| November 2017 | 3F | 27 | 36 | 80 | Passed |
| November 2017 | 3H | 21 | 32 | 80 | Passed |
| June 2018 | 1F | 26 | 41 | 80 | Passed |
| June 2018 | 1H | 20 | 27 | 80 | Passed |
| June 2018 | 2F | 26 | 38 | 80 | Passed |
| June 2018 | 2H | 21 | 33 | 80 | Passed |
| June 2018 | 3F | 28 | 41 | 80 | Passed |
| June 2018 | 3H | 21 | 33 | 80 | Passed |
| November 2018 | 1F | 28 | 40 | 80 | Passed |
| November 2018 | 1H | 22 | 32 | 80 | Passed |
| November 2018 | 2F | 27 | 41 | 80 | Passed |
| November 2018 | 2H | 21 | 26 | 80 | Passed |
| November 2018 | 3F | — | 39 | 77 | Held: missing Q19(c) |
| November 2018 | 3H | 20 | 30 | 80 | Passed |

May-dated Paper 1 and Summer-labelled schemes are grouped under the user-supplied June series and corresponding CSV rows; original filenames and contents are unchanged.

The older Higher schemes use a `Question Working Answer Mark Notes` header. Detection now accepts the optional Working column without treating numbered examiner guidance as answers. A compact one-line mark row in November 2018 2F needed slightly more padding to meet the valid-crop minimum; the proposal stays clear of the next answer. Existing saved crops and approvals are never recalculated by these fixes.

Validation: 102 unit tests passed, production build passed (existing bundle-size warning), 13 browser checks passed with 3 intentional mobile PDF skips. The rotated browser fixture now also exercises the older Working-column header. All 23 candidate papers passed real-file per-question marks, source positions, mapped IDs, required metadata and crop-render checks. These are unapproved proposals, not a claim of complete teacher visual approval.

Staging uses the existing owner-scoped, non-overwriting batch path. Published papers and saved reviews are skipped. Foundation uses the corrected mapping copy; Higher uses the supplied Higher CSV. Reviews belong to the dedicated import account. The original owner’s approved November 2022 1F and the existing Higher publications are untouched.
