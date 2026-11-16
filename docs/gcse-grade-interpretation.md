# GCSE grade interpretation correction

## What was wrong, and the audit evidence

Pearson enhanced-skills `g1`–`g9` columns describe **average percentage of available marks earned by students who ultimately achieved each final GCSE grade**. `g7 = 25` means Grade 7 students earned an average quarter of the available marks. It does **not** classify the question as Grade 7 or say that 25% of students answered it fully correctly.

The previous Insights implementation treated `metadata.grade` as a question classification, and Smart Shadow calculated a mark-weighted question-grade range from that field, then selected a comparison cohort from its rounded mean. Both assumptions were incorrect.

The checked-in [`v15` publication SQL](v15-atomic-reviewed-paper-publication.sql) explicitly assigns `'grade', case when p_tier='Foundation' then 3 else 7 end`, independently of Pearson performance. A read-only inspection of the deployed `publish_reviewed_exam_paper` function confirmed the same assignment. This explains the Foundation 3 / Higher 7 concentration. It does not establish the provenance of every historical import: the older recovery tool reads existing JSON, and the teacher-pilot seed also supplied author-entered practice `grade` values. There is no verified per-question GCSE-grade classification behind these fields.

No database updates, migrations, authentication changes or publication calls were made. The legacy field and original performance metadata remain stored. All runtime consumers of question `grade` have been removed; the loader retains its existing compatibility mapping.

## Field meanings

| Field / control | Meaning and treatment |
| --- | --- |
| `metadata.grade` → `BankQuestion.grade` | Legacy metadata, including tier-derived 3/7 placeholders and seed values. Retained for compatibility; never used to classify, filter, rank, select a student cohort, or report missing classification. The existing client maps it to a number or 0; original database JSON is unchanged. |
| `metadata.g1`–`g9` → `gradePerformance[1..9]` | Historical average % of available marks for each final student-result group. Numeric 0 is real evidence. Missing, nonnumeric, nonfinite or out-of-range percentages cannot support comparisons. Raw stored values are not repaired or rewritten. No interpolation or monotonicity is imposed. |
| Import `MappingRow.gradePercent` / publication `grade_percent` | The same part-level percentages. The current Foundation-oriented spreadsheet parser reads columns named `Grade n success percent` for 1–5; that source wording does not mean fully-correct rates. The existing publication RPC also writes only g1–g5. This PR does not reconstruct absent g6–g9 data or alter that RPC; existing g6–g9 from other imports remain available to the loader and all consumers. Extending this import path needs separate reviewed source-format and publication work. |
| `mean_pct` → `meanPct` | Legacy source summary with no verified cohort denominator supplied here. Preserved, not used as a question grade or a selected-grade performance estimate. |
| `marks` | Available marks on each mapped part. Complete known-part historical performance is `sum(part marks × part percentage) / sum(part marks)`, rounded to one decimal. All parts require valid percentages and positive finite marks. It is not a fully-correct probability. |
| Bank “Target student grade”; internal `grade` filter | Teacher-selected final student-result group. Filters/sorts its average mark shares; neutral percentage bands replace Accessible/Appropriate/Challenging claims. All nine groups are selectable regardless of paper tier; absent data stays absent. |
| Builder `orderSortGrade` | Explicit student-result group for mark-share ordering. Group structure, original order on ties and missing-data-last behavior remain. |
| Builder `performanceGrade` saved setting | Which student-result group to display in teacher statistics, or the existing `All grades` value. Not a question classification. Conventional tier columns also include any additional reported student-result groups. |
| Mean across grade groups | Existing optional sorting measure: an unweighted mean of complete available student-group mark percentages across g1–g9. Not a pupil-weighted overall mean or proof of difficulty. Different questions may report different groups. It is not used by Smart Shadow. |
| `targetedShadow.targetStudentGrade` | Explicit teacher-selected student-result group, persisted in existing optional configuration JSON. New selections also record `matchingBasis: student-grade-performance-v1`. Old saved selections retain their IDs/settings and open without inventing a missing target grade. |
| Insights target grade / performance band | Selects which student group's complete whole-question percentages to explore. Grade alone never removes questions for having a different legacy `grade`. Optional bands include all data, complete data, missing data and numeric mark-share intervals. |

## Insights statistics

The grade chart shows **median question-level average mark shares** for each final student grade, plus numbers of usable whole questions with complete data and missing data. These are descriptive summaries of resources, not pooled averages over students. Each usable whole question contributes once per reported student group. Groups can have different available-question samples; no cross-grade trend or statistical significance is claimed.

Skill rows group topic, enhanced skill and stored tier, independent of legacy question grade. Topic/skill/source filters still match the same mapped part; performance filters always evaluate **every known part of the whole question**. The selected group's median and data/missing counts use complete usable resources. Resource coverage status remains quantity only. Skills can appear in several rows, so row totals are not additive. Missing historical performance is separate from missing source/skill metadata and stored image readiness. CSV headings include the selected final student grade, performance filter, complete/missing data counts and resource-level median; the misleading stored-question-grade column is removed.

## Smart Shadow recommendations

The teacher chooses a final student grade explicitly, or starts from an existing explicit bank/builder student-grade preference. It is never inferred from question metadata. Changing it or difficulty clears approvals.

Skill-first coverage, reviewed complete official-shadow priority, actual tier/calculator compatibility, source-family/assessment/choice exclusions, multipart completeness, AO, marks and structure checks remain. Candidates are ranked deterministically: official status, exact enhanced-skill set, comparable history availability, closeness to the requested performance window, AO, marks, structure, then stable key.

Let `d = replacement percentage − original percentage`, using complete-part percentages at the same selected student grade:

- Same difficulty: `abs(d) ≤ 10` percentage points.
- Slightly easier: `5 ≤ d ≤ 20` points (more average marks historically earned).
- Slightly harder: `−20 ≤ d ≤ −5` points.

These transparent, bounded windows are **recommendation heuristics, not validated difficulty estimates or pedagogical equivalence**. Directed candidates rank nearest a 10-point difference; same candidates rank nearest zero. No candidate is auto-approved. When either complete performance profile is missing, same difficulty can offer a **Possible match** explicitly labelled skill-led with a visible warning; easier/harder produces no directed recommendation. Official whole-assessment conversion remains available independently of this matching workflow.

## Statistical and catalogue limits

The supplied data has no cohort sizes, score distributions, sampling errors, common-pupil identifiers, or calibration across examination series. Part weighting assumes the reported part means describe comparable final-grade groups; this cannot be verified from the supplied fields. Performance differences may reflect teaching, context, cohort composition or the mathematics. They do not establish causation, equivalence, scaffolding, challenge or a precise difficulty scale. Missing history is never inferred from tier, marks, AO, legacy grade or other student groups.

Whole-question completeness is relative to known imported parts/assets. The changes do not validate unknown missing parts or question content. Production metadata has not been repaired, and newly imported g6–g9 completeness depends on the import path described above.

## Before / after evidence

All browser examples use isolated synthetic examination-style fixtures, with intercepted Supabase and asset requests. They demonstrate calculations and workflows, not live statistical estimates or additional real-question validation. Before captures were taken from main (`dd5aba3`) before source changes. The legacy-3/7 regression retains the same g4 = 88 values before/after: the old Grade 4 classification filter incorrectly has no results; the new Grade 4 student-group view exposes those resources.

| View | Before | After |
| --- | --- | --- |
| Insights with legacy 3/7 metadata, desktop | [Incorrect empty Grade 4 view](grade-interpretation-examples/before-insights-desktop.png) | [Available Grade 4 student-group performance](grade-interpretation-examples/after-insights-desktop.png) |
| Same comparison, mobile | [Before](grade-interpretation-examples/before-insights-mobile.png) | [After](grade-interpretation-examples/after-insights-mobile.png) |
| Smart Shadow multipart comparison, desktop | [Question grade fact and inferred cohort](grade-interpretation-examples/before-shadow-desktop.png) | [Explicit student cohort, no question classification](grade-interpretation-examples/after-shadow-desktop.png) |
| Same comparison, mobile | [Before](grade-interpretation-examples/before-shadow-mobile.png) | [After](grade-interpretation-examples/after-shadow-mobile.png) |

Additional examples: [student-grade chart and tier comparison](grade-interpretation-examples/after-performance-chart.png), [student paper plus associated mark scheme](grade-interpretation-examples/targeted-student-and-mark-scheme.pdf), [teacher sources PDF](grade-interpretation-examples/targeted-teacher-sources.pdf). PDF examples are parsed by Playwright for sequential numbering, total marks and all selected multipart solution associations.

## Validation

- `npm run build`: passed; existing Vite bundle-size advisory remains.
- `npm test`: **271 passed across 28 files**.
- `npm run test:smoke`: **48 passed, 12 existing mobile skips** (desktop PDF/OCR/extraction duplicates). Existing real-examination OCR/numbering, A4 PDF, multipart association, saves, original preservation and access-control tests pass.
- Desktop/mobile interpretation flows check legacy 3/7 values cannot hide Grade 4 performance, percentage-band filtering/CSV, explicit target-grade selection, changing that selection clears approvals, and no cohort is inferred from question grade. Unit profiles span grades 1–9, include g7 = 25, real zero, missing/invalid data, grade-invariant matching, bounded directed windows and opposite recommendation directions for different selected student grades.
- An intermediate new bank-filter test failed on both viewports because its expected count omitted an intentional unknown-tier fixture record using the existing bank display fallback. The test now scopes the intended skill; the complete rerun passed. No pre-existing test failure was observed. After making the illustrative Higher fixture profile more realistic, its affected Insights/browser cases were rerun separately: **10 passed**.

CI results are recorded in the pull request. CI uploads fresh screenshots/PDFs in `assessment-export-evidence` on every PR run.
