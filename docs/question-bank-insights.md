# Question Bank Insights — coverage dashboard, Phase 1

The existing owner-only **Account → View Insights** page now includes a coverage dashboard. Its four existing overview cards and asynchronous image-URL count are preserved. The paper counter is corrected to use linked paper identity and full source metadata, replacing the truncated source-ID prefix calculation. No new route, database table, migration, role or external chart service is introduced.

The owner can filter enhanced skills by tier, stored GCSE grade, topic, skill text and calculator requirement, with an exam-board filter when several boards are represented. Rows are sortable and paginated; the default order puts the fewest complete usable resources first. CSV exports **all filtered rows**, including other pages, in the selected sort order. The CSV includes mapped-record, whole-question, available/usable, calculator and threshold columns, with quoting and spreadsheet-formula protection.

Quantity thresholds default to 0 / 1–4 / 5–9 / 10+ for No / Limited / Developing / Good coverage. The owner can change the developing/good starting values, validate them and reset them. Settings are kept in this browser only, not in question records or assessment settings. Status describes resource quantity, never educational quality.

Additional sections show whole-question inventory, actual stored grade classifications, an interactive grade chart, Foundation/Higher comparisons, resource readiness and actual board/series/paper metadata. Section shortcuts and collapsed counting definitions reduce scrolling. Tables become labelled cards on narrow screens while retaining native table headers and accessible names.

## Counting methods

- **Existing overview:** unchanged record, mapping and image-link calculations; the paper count uses linked paper IDs/full stored board–series–paper–tier identities rather than the first seven source-ID characters. Reimported identical source identities are deduplicated; linked papers with unknown descriptions remain countable. Mapping coverage checks topic/skill presence; the new completeness checks cover additional fields.
- **Examination scope:** examination coverage excludes records already identified by the loader as original practice or linked/official shadow variants. The overview still includes all loaded records. No new classification is guessed from a filename or an exam board name.
- **Whole questions:** use `buildAssessmentGroups`, including its original/nested multipart source-ID families and its shared/distinct image rules. A selected parent can contain several mapped question records. Completeness means all **known imported parts**, not independent validation against the original examination paper. Missing/incorrect import identities can limit grouping accuracy.
- **Available:** a grouped whole question has its complete *stored question-image set*, using the same legacy shared-image rules as assessment exports.
- **Complete usable:** both stored question/marking image sets are present; all known parts have positive marks and a positive question reference; no applicable crop is flagged `needs-fix`. This is inventory readiness, not pedagogical approval, an image-content check or a guarantee of current PDF readiness. Missing classifications remain explicit, and unreviewed crops remain outstanding rather than silently approved or rejected.
- **Grades:** use only integer `metadata.grade` classifications from 1 to 9. Historical grade-performance percentages are not classifications. Missing/invalid grades stay **Unclassified**. A usable multipart question with parts at Grades 3 and 4 appears once in each relevant grade bar/skill row. It is not assigned an inferred mean, minimum or maximum grade. Those totals are not additive.
- **Skills:** split semicolon-separated stored skill values, normalise case/spacing for comparison and deduplicate membership within each row. Rows identify topic, skill, actual tier and actual stored grade. Grade/topic/skill/calculator/board filters must match the **same part**, so one sibling's grade cannot qualify another sibling's skill. Whole-question siblings remain part of availability/readiness checks.
- **Tier/calculator:** use source metadata, including explicit unknown values. The bank UI's Higher/non-calculator display fallbacks are not evidence. Whole-question balances use consistent group values; mixed/unknown groups are reported separately.
- **Tier comparison:** skills are deduplicated across topic/grade rows before applying the limited-quantity threshold, so one multipart question or several grade rows do not inflate a skill's total.
- **Series/papers:** show actual stored board, series (including year), paper and tier fields; missing fields remain unknown. Counts distinguish mapped records from their whole-question groups.
- **Readiness:** distinguish missing stored references, references awaiting/unavailable signed URLs, metadata omissions and applicable crop decisions. Record counts are labelled as records; shared whole-question assets need not be attached separately to every sibling. The page downloads no images and makes no per-file existence requests. A path alone cannot prove that the physical object exists; the live export flow continues to enforce its own loading/numbering checks.

## Known limits and honest empty states

There is no authoritative expected enhanced-skill reference list in the repository. The table shows observed mappings only. It does not manufacture zero-count rows for skills never mapped into the bank. **No coverage** means zero complete usable resources in an observed row.

If Grade 4 classifications have not been stored, Foundation + Grade 4 correctly shows no matching rows, even when Grade 4 historical performance data exists. The dashboard lists the grades actually present and offers **Show all stored grades** and **Show unclassified grades**. Populating a missing classification requires a separate, reviewed metadata task; this change does not assign or alter grades.

Unknown source metadata and undocumented missing parts cannot be reconstructed. The current loader exposes a GCSE bank without an explicit qualification dimension. Future Further Maths/Statistics views should supply a correctly scoped catalogue or add a real qualification field; the dashboard does not infer one. Board filtering and pure aggregation functions already support additional boards and paper/series names without an Edexcel-specific list.

## Screenshots

All examples use isolated synthetic fixtures. They illustrate all quantity bands, a multipart question, several boards, missing classifications and delayed signing. They are **not published production bank statistics**. A separate read-only aggregate inspection was used during development; no production question data was changed.

- [Desktop dashboard](insights-examples/desktop-dashboard.png)
- [Desktop Foundation / Grade 4 skills](insights-examples/desktop-foundation-grade-4.png)
- [Tablet skills table](insights-examples/tablet-foundation-grade-4.png)
- [Mobile Foundation / Grade 4 skills](insights-examples/mobile-foundation-grade-4.png)
- [Honest missing-grade empty state](insights-examples/missing-grade-classification.png)

## Validation

- `npm run build`: passed, with the existing Vite bundle-size advisory.
- `npm test`: 259 passed across 28 files.
- `npm run test:smoke`: 44 passed, 12 existing skips for mobile duplicates of desktop PDF/OCR checks.
- Unit regressions cover multipart/shared image counting, identical original numbers from different boards/papers, grade/tier/topic/board/calculator filters, semicolon skill grouping, thresholds, missing metadata, no inferred grades or curriculum gaps, readiness/crop flags, original/shadow exclusion, tier totals and CSV quoting/formula protection.
- Desktop/mobile browser tests exercise Foundation/Grade 4 statuses, topic/board/calculator filters, sorting, threshold validation/reset/storage, pagination-independent filtered CSV downloads, grade-chart links, tier shortcuts, readiness and series views, missing-grade actions, delayed signing, owner-only access and zero per-image fetches. They include 1440px desktop, 900px tablet and phones down to 320px, with no page-level horizontal overflow.
- Existing question-bank, builder, targeted-shadow, saved-worksheet, sequential-numbering and actual PDF regressions remain in the full suite.

The PR is for review. No merge or deployment commands were run.
