# Insights skill-label audit and controlled wording map

The audit covers **all 3,181 existing Edexcel GCSE Foundation/Higher examination records** in the authorised read-only snapshot of 16 November 2026. It standardises labels **only in Insights**. No database records, assessment behaviour, matching logic, question content or original metadata are overwritten.

There are two separate causes of repeated coverage rows: spelling/wording/spacing variants, and the previous table key `(topic, skill, tier)`, which split an identical label across source topics and tiers. The new table unions those partitions for unambiguous canonical/retained labels. **Broad or truncated labels explicitly flagged for review retain their original topic/tier rows.** Repeated “Solving equations” rows therefore remain intentionally visible and marked as unresolved; they have not been guessed into a linear-equation category.

## Census and limits

| Measure | Count |
|---|---:|
| Stored examination paper identities | 90 |
| Mapped question records/parts | 3,181 |
| Whole-question families | 2,257 |
| Distinct complete raw `skill` field values | 672 |
| Distinct raw semicolon tokens, including spacing/case variants | 720 |
| Normalised token identities before semantic aliases | 638 |
| Canonical or retained label identities after mapping | 608 |
| Topic/skill/tier rows before | 780 |
| Coverage rows after, including unresolved partitions | 611 |
| Explicit controlled wording groups | 34 |
| Distinct unresolved labels / affected records | 6 / 121 |
| “Solving equations” records / whole families | 97 / 85 |
| Additional unmerged lexical candidate pairs | 46 |
| Actual source-content cases inspected in this audit | 3 |
| Private production images inspected | 0 |

Counts are mapped records and unique stored paper/original-number families. They are **not** asset-readiness counts, teacher approval or a certified number of independent mathematical competencies. Whole-question memberships match the existing assessment grouping on this snapshot. A question can contribute to several skills, but only once to each canonical skill. Totals across skills are not additive. Unknown/unimported printed parts cannot be reconstructed.

All 3,181 `questions.skill` values agree with `metadata.skill`. A separate retained `metadata.original_skill` exists on 2,897 records. It is useful evidence of an earlier description, **not independently established content verification or teacher approval**. The original mapping process and provenance of every retained description cannot be certified from this repository alone. Neither `spec` codes, tier, legacy `grade`, topics nor historical percentages are used to infer a question's mathematical type.

## Reports

- [Summary JSON](summary.json): denominators, counts and snapshot/rule hashes.
- [All complete stored fields CSV](stored-fields.csv): every one of the 672 original complete field values, mapped-record/whole-question counts and proposed canonical/retained labels.
- [Atomic-label CSV](atomic-labels.csv) and [JSON](atomic-labels.json): all 720 exact token variants, counts, canonical IDs/labels, decisions, original topics/tiers and rationale. JSON quoting makes leading/trailing spaces visible.
- [Canonical coverage JSON](canonical-coverage.json): union counts for every output row, including original variants and explicit unmerged review rows. These are mapped-question counts, **not complete-usable counts**; runtime availability remains governed by existing Insights/export checks.
- [Ambiguous records CSV](ambiguous-records.csv): all 121 unresolved records with source/database IDs, linked paper, series, part, original complete field, retained earlier description and specification. No publisher identifiers, storage paths, signed URLs or credentials are included.
- [Unmerged lexical candidates CSV](unmerged-lexical-candidates.csv): 46 pairs left separate. This is a review aid, not a confidence estimate or an equivalence decision. It deliberately includes false friends such as mean/median, 2-D/3-D, addition/subtraction and equations/inequalities.
- [Source-content evidence](source-evidence.json): three actual question-paper counterparts, one-based page references, source URL/hash and observations. No source PDFs or examination images are committed.
- [Controlled runtime registry](../../src/insightsSkillAliases.json): the exact versioned wording map and review rules used by Insights.

The full stored field and its semicolon tokens are both reported. Existing semicolon parsing is preserved; some imported Pearson-style descriptions use semicolons within a compound statement. This audit does not claim every fragment is a separate official enhanced skill or invent a missing authoritative curriculum list. Truncated tokens are not expanded from a guessed prefix.

## Why “Solving equations” must not be merged into linear equations

All 97 records containing this token are Foundation records, but their retained descriptions vary substantially:

| Retained `original_skill` description | Records |
|---|---:|
| Solve linear equations | 39 |
| Translate situations or procedures into algebraic expressions, formulae or equations | 13 |
| Rounding; Inequality notation to specify error interval | 13 |
| Graphs and equations of lines | 12 |
| Solve two simultaneous equations | 8 |
| Solve quadratic equations | 4 |
| Solve linear inequalities | 4 |
| Construct and interpret equations that describe inverse proportion | 2 |
| Represent the solution set of inequality on a number line | 2 |

Those numbers describe stored metadata, not content-confirmed classifications. Specification codes sometimes also conflict with the retained description, so using A17/A18/A19 or Foundation tier as an automatic classifier would be unsafe.

Actual wording **and rendered pages** of the November 2024 Edexcel Foundation 1F public question paper were inspected:

| Source case | PDF page | Evidence | Consequence |
|---|---:|---|---|
| Q10(b) | 8 | Asks for the equation of a supplied horizontal mirror line | This is not a generic instruction to solve for an unknown. |
| Q15(b) | 12 | Solve `4(3y + 1) = 28` | Explicitly a linear equation. |
| Q26 | 21 | Solve `x² − 2x − 15 = 0` | Explicitly a quadratic equation on a Foundation paper. |

All three have the “Solving equations” token in their stored skill field. They are direct counterexamples to blanket Foundation → linear mapping. Public counterparts were not byte-compared with private bank crops; the three observations do not certify the other 94 records. These observations are **not applied as hidden per-record exceptions**. The broad label remains separate until a record-level review can reconcile its wording, retained metadata and source assets.

This means the typed linear/quadratic totals remain **conservative label-evidence totals**: for example, six mapped whole questions explicitly labelled with the registered generic linear wording, and eleven explicitly labelled quadratic whole questions, before any narrower-task categories or unresolved records are added. It would be incorrect to conclude that Foundation has no quadratic resources from the currently explicit labels. The unresolved warning explains this in the dashboard and CSV.

“Solving simultaneous linear equations” and “Solving simultaneous linear and quadratic equations” also remain separate. The 18 records labelled “Solve two simultaneous equations” do not specify the types and stay separate from both. Four truncated label identities affect another six records. Together with the 97 broad-equation records, these make the 121-record review list.

## Controlled decisions

The registry uses exact, explicit aliases after the same NFKC, case and whitespace identity normalisation already used in Insights. It does not use stemming, fuzzy matching, broad topics, grades, tier, specification or source filenames to classify questions. Registry conflicts fail tests and fail initialisation rather than choosing an arbitrary mapping.

Representative decisions:

| Original variants | Canonical label | Snapshot union count |
|---|---|---:|
| Collect like terms; Collecting like terms; lower-case variant | Collecting like terms | 12 records / 10 whole questions |
| Solve a linear equation; Solve linear equations | Solving linear equations | 6 / 6 |
| Solve quadratic equations, including trailing-space variant | Solving quadratic equations | 12 / 11 |
| Pythagoras and trigonometry; Pythagoras’s Theorem and Trigonometry | Pythagoras' theorem and trigonometry | 46 / 42 |
| Two way tables | Two-way tables | Hyphenation only; combined Venn/tree descriptions stay separate |
| Volume cuboids and other right prisms (including cylinders) | Volume of cuboids and other right prisms (including cylinders) | Missing “of” restored; surface-area categories stay separate |

The registry also recognises “Roots and powers” / “Powers and roots”, equivalent median-class wording and forward map-to-real-distance wording, while keeping the inverse map-distance operation separate. Other rules cover verb/singular wording, such as drawing/constructing a box plot from summary statistics, and explicitly identical operations. The complete rationale is in the registry and atomic report. These are wording categories, not assertions that their questions have equal demand, identical structure, matching prerequisites or equivalent mathematical content.

Deliberately separate examples include linear/quadratic/simultaneous equations, equations/inequalities, mean/median, recurring/terminating decimals, 2-D/3-D shapes, two/three brackets, positive/negative standard form, and broad significant-figure rounding versus exactly two significant figures. Pure Pythagoras is not merged into the combined Pythagoras-and-trigonometry umbrella. Broad and narrow categories are not automatically collapsed.

No additional confirmed spelling error is silently guessed from edit distance. Unrecognised future wording is retained, and candidate pairs remain unapplied until a rationale and appropriate evidence are reviewed.

## Insights behaviour and counting

- **Rows:** unambiguous labels aggregate across original topics and tiers into one canonical row. The topic/tier cells list all original values contributing under the active filters. Filters still match skill, topic, calculator and source on the **same mapped part**.
- **Duplicates:** canonical memberships are deduplicated within a part; mapped records and whole-question objects are then counted with sets. Two aliases or several multipart siblings never add an extra whole question to the same canonical row. Original source IDs/grouping, marks and image readiness remain unchanged.
- **Unresolved rows:** broad/truncated labels explicitly flagged for review keep their old topic/tier partitions and display “Needs label review — unmerged”. Their counts are not assigned to an explicit equation type.
- **Owner visibility:** expand **Original labels** on a row to see exact contributing token strings and the unresolved reason. Quotes expose whitespace differences; the report also preserves complete original fields.
- **Filters:** canonical suggestions populate the existing skill search. Searching an original alias resolves the complete canonical group, including records using its other aliases. Partial text also searches the registered/original wording. No record is silently reclassified.
- **Summaries and tier comparison:** distinct labels and per-tier skill memberships use the same controlled resolver, with set-based whole-question counts. These remain metadata categories; unresolved labels are not proof of a specific skill's coverage.
- **CSV:** exports every filtered canonical/retained row, with its original labels, canonical key, resolution/review reason, original topics and tiers. Existing count, historical mark-share, availability and threshold columns are preserved. Formula-injection protection and quoting remain in place.
- **Historical performance:** unchanged `g1`–`g9` interpretation and mark-weighted whole-question calculation. Canonicalisation does not create question grades, pool pupil cohorts or invent missing performance.

The implementation lives in `insightsSkills.ts` and its explicit JSON registry. The Assessment Builder, shared grouping module, Find Similar, Smart Shadow matcher, question loader, saved assessments, PDF numbering/exports, authentication and database policies are untouched.

## Reproduction and future review

Run the [SELECT-only snapshot query](../../tools/insights_skill_snapshot.sql) through an authorised read-only connection and save its JSON-array result outside Git. Then, from the repository root:

```sh
python tools/audit_insights_skills.py \
  --snapshot /private/local/skill-audit-records.json \
  --snapshot-date 2026-11-16 --base-commit 2996986
python -m unittest discover -s tools -p 'test_*audit*.py' -v
npm run build
npm test
npm run test:smoke
```

The offline generator reads the same registry as runtime Insights and performs no network or database writes. Fuzzy lexical candidate generation is offline only and never changes a canonical ID. The TypeScript regression suite checks every one of the 720 report entries against the runtime resolver; Python tests protect union counts, unknown/source-evidence handling and the snapshot census.

To add a later alias, document its exact mathematical scope and rationale, inspect authorised source content where wording/metadata is insufficient, add positive and counterexample tests, regenerate the report and submit the registry change for review. Do not overwrite question metadata. To resolve the 121 flagged records, use their exact record IDs and authorised original source/crop evidence; retain uncertainty if provenance/content cannot be verified. The owner-only private export from PR #94 can help with mapped multipart cases; other cases require an authorised read-only development session or source export. No credential, signed link or examination image should be committed.

Validation results and synthetic desktop/mobile examples are recorded in the PR. No bank-wide image inspection, automatic question equivalence or teacher approval is claimed.

## Validation and screenshots

- `npm run build`: passed, with the existing bundle-size advisory.
- `npm test`: **338 passed across 31 files**, including 27 new canonical-label tests.
- Python audit suites: **13 passed**, including four new offline report tests.
- `npm run test:smoke`: **78 passed, 12 existing skips**.
- Final focused canonical-label workflow: **2 passed**, desktop and mobile, after changing the screenshot to show the grouped original labels.

[Desktop example](examples/desktop.png) · [Mobile example](examples/mobile.png). These use **synthetic metadata fixtures**, not production counts or examination images. They demonstrate alias grouping, multipart deduplication, original-label expansion and unmerged ambiguous rows. No private image requests are made by the dashboard tests. Existing assessment/PDF, Smart Shadow, Find Similar, saving and owner-access tests continue to pass. No pre-existing test failure was observed.
