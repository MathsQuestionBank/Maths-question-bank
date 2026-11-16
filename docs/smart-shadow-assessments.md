# Smart Shadow Assessments — Phase 1

Teachers can now open an assessment, choose **Create Targeted Shadow Assessment**, tick whole questions answered incorrectly, choose a target student grade and difficulty, preview up to three suggestions per question, and explicitly choose their replacements. **Generate Shadow Assessment** creates a separate editable draft, sequentially numbered from 1, with matching marking images and existing student/teacher PDF controls.

The original assessment is retained. A **Return to original assessment** button restores its open settings and order, including unsaved changes, during the current session. Save either draft to retain it across reloads. The new draft uses an insert, rather than updating the original account record. When the original has a saved identity, `linkedOriginalAssessmentId` records the relationship. Optional versioned provenance in the existing configuration JSON retains the original title, difficulty, optional target student grade/matching basis, original/replacement part IDs, replacement method and explicit unmatched parts. Backups, reopening and conflict comparison retain these fields; older assessments still open normally. No schema migration is required.

## Matching algorithm

`src/smartShadowMatching.ts` builds a catalogue of complete assessment groups and a skill index. Ranking is deterministic and independent of database row order. Metadata matching is a recommendation for teacher judgement, not a claim of pedagogical equivalence.

1. Group multipart questions using the existing grouping rules; every known part and distinct marking asset stays associated. Exclude the source assessment (including selected questions hidden by paper filters), other parts of those questions, and replacements already chosen. Complete stored board/series/paper/question references also identify legacy/new import aliases; source-ID families are used when those metadata fields are incomplete.
2. Prefer official shadows only when every original part has exactly one linked, reviewed part in the same shadow paper, with approved question/mark crops and both assets. Partial, duplicate-link, mixed-paper, orphan-linked or unreviewed variants are rejected. Existing whole-assessment official conversion and question-bank shadow actions remain available.
3. For smart alternatives, require coverage of **every enhanced skill** mapped to the original parts. Ignore broad category labels such as Algebra. Extra skills are flagged and rank below an exact skill set. There is no broad-topic fallback or generated question content.
4. Require known, matching tier and calculator requirements. The question bank's display fallbacks for missing tier/calculator metadata are not treated as evidence. Phase 1 conservatively excludes cross-tier recommendations. Stored tier is authoritative. Legacy question `grade` values are not qualification classifications. Both question and marking assets must be available through the normal loader (or existing original-practice text).
5. Compare **average % available marks for students achieving the explicitly selected final GCSE grade**, never an inferred question grade. All known parts need data, combined by part marks. Same difficulty permits a difference within 10 percentage points; easier requires a 5–20 point increase; harder a 5–20 point decrease. These bounded recommendation windows are not calibrated difficulty or pedagogical equivalence. Missing complete data permits only explicitly warned skill-led possible matches for same difficulty, never an invented directed estimate.
6. Rank official status, exact skill set, comparable performance availability, proximity to zero (same) or a 10-point directional difference, AO, marks and mapped-part count, then stable group key. No legacy question grade enters this ranking. There are no confidence percentages.
7. Label recommendations **Strong metadata match** only when exact skills, complete comparable performance, AO, marks and structure support it with no metadata warnings; otherwise show **Possible match — teacher review recommended**. Missing-data warnings remain visible. Explain **No suitable match** and allow explicit unmatched choices. Generation revalidates current records, selected student grade and duplicate exclusions.

See the [grade interpretation audit](gcse-grade-interpretation.md) for field meanings, derivations, source limitations and current before/after screenshots. Historical scores are average marks, not shares answering fully correctly. Samples can differ by paper and no cohort sizes are supplied.
Changing difficulty or target student grade clears previous choices. No replacement is silently accepted. Teachers can preview both question and mark scheme, enlarge the preview, change or reject a choice, or leave it unmatched. Only chosen replacements enter the new draft; unmatched originals are never silently copied into it.

## Initial Phase 1 example and screenshots

These initial captures predate the interpretation correction. Current comparison controls and evidence are in the [grade interpretation report](gcse-grade-interpretation.md#before--after-evidence).

The examples below come from isolated Playwright fixtures. Their source metadata, images and short mathematical prompts are **synthetic test data**, not live Edexcel records or a classroom-ready content recommendation. All Supabase and image requests were intercepted; no production records were read or written by this workflow test.

The fixture starts with five questions (21 marks). Questions 1–3 are targeted (13 marks), with a two-part first question. The generated assessment contains three replacements numbered 1–3 (5, 4 and 4 marks). Its mark scheme includes both distinct first-question part solutions, followed by the other two solutions. The source assessment and its original-numbering setting remain unchanged. The account copy reopens with its parent link, part provenance and sequential numbering intact.

- [Desktop selection, suggestions and previews](smart-shadow-examples/teacher-workflow-desktop.png)
- [Mobile selection and suggestions](smart-shadow-examples/teacher-workflow-mobile.png)
- [Generated assessment and matching mark scheme preview](smart-shadow-examples/generated-preview.png)
- [Example student assessment plus mark scheme PDF](smart-shadow-examples/targeted-student-and-mark-scheme.pdf)
- [Example teacher PDF with replacement source references](smart-shadow-examples/targeted-teacher-sources.pdf)

CI also uploads fresh screenshots and PDFs under the `assessment-export-evidence` artifact on every PR run (14-day retention).

## Initial Phase 1 validation (historical)

- `npm run build`: passed. Vite retains its existing bundle-size advisory.
- `npm test`: 228 tests passed across 26 files.
- `npm run test:smoke`: 34 passed, 12 skipped. Existing skips avoid repeating desktop PDF/OCR/extraction tests in the mobile project.
- New matcher regressions cover exact skills vs broad topics, grade proximity and directed choices, actual historic data, Foundation/Higher compatibility, calculator requirements and missing metadata, deterministic ranking, assessment/reservation/source-alias duplicate exclusion, multipart coverage/assets/marks, official prioritisation and invalid official groups, no match, explicit unmatched choices, revalidation and original preservation.
- Persistence regressions cover parent/provenance/numbering/export settings through backup and reopening, changed-provenance conflicts, and damaged optional metadata.
- New desktop and mobile teacher smoke flows select three of five questions, preview question and marking images, enlarge a preview, explicitly choose replacements, generate, save separately, restore the original, and reopen the linked follow-up. They also cover select all/clear, selected marks, changed difficulty, rejection, no match, explicit unmatched choices and cancellation.
- Actual Chromium A4 PDFs are parsed to check replacement question/solution association, all multipart solutions, sequential headings, total marks statements, teacher sources, absence of original fixture questions and nonempty pages. Existing real-examination OCR, PDF layout and numbering regressions also pass. Screenshots and the example PDFs were visually inspected.

The first PR CI run passed build/unit checks and the new targeted workflows, but exposed an existing OCR-cache smoke race: it clicked Save and immediately reloaded before the asynchronous save reached the fixture backend. The trace showed no save RPC, and the reopened fixture retained original numbering. Both existing save/reload checks now wait for the visible “Saved to your account” result before reloading; application numbering and save protections are unchanged.

## Limitations

- Recommendation coverage depends on the bank's existing enhanced-skill, student-group historical performance, tier, calculator and image metadata. Missing primary skills, unknown compatibility or missing assets can legitimately produce no match. Missing history/AO/source fields are never invented.
- Easier/harder is a historical average-mark-share suggestion at a selected student grade, not an analysis of the mathematics or a guarantee of scaffolding/challenge. The teacher chooses the final replacement.
- Phase 1 targets whole questions. A single incorrectly answered part does not produce a partial multipart substitution.
- “Complete” means complete relative to the parts/links/assets present in the authorised bank catalogue. Undocumented missing source parts cannot be reconstructed.
- The reported live bank currently has no linked official shadows. Official priority/completeness is tested with fixtures; this work does not populate or alter the live bank.
- This feature reuses the existing automatic numbering/export protections. A legacy image that cannot be safely recognised still requires the existing optional advanced correction before export; the matcher does not bypass those checks.
- Source links for an unsaved original have no account ID until it is saved. The open original can be restored during the session, and the targeted copy still retains original title/part provenance.
