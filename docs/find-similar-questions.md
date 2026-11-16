# Find Similar Questions — Phase 1

Question Bank result cards now have **Find Similar** beside Preview/Add. It opens a native modal comparison without creating an assessment or requiring a basket selection. Original source details and all known mapped parts stay together, whether the teacher clicks part (a) or (b). The original question and marking images are available through the expandable original preview; alternatives start with their question previews open. Both support marking-image tabs and enlargement.

Choose **Target student grade** (1–9) and **Practice level**: Similar historical demand, More accessible practice, Greater challenge. An explicitly selected Question Bank student grade is used as the initial preference; otherwise the teacher chooses one. Nothing is inferred from legacy question `grade` metadata.

Three ranked whole questions appear first. **Show more similar questions** reveals three further matches at a time and reports when the list is exhausted. Desktop/tablet use the existing two-column comparison cards; phones show one full-width alternative with Previous/Next navigation. Matching explanations remain under **Why this question?**, while warnings and marks/AO/structure differences remain visible.

**+ Add to worksheet** uses `appendAssessmentGroupIds` and the existing basket state. All known parts and associated marking assets follow the selected representative. Counts and marks update in the dialog and bank basket. Added questions remain in the comparison with a disabled Added button; adding never toggles/removes the original or existing selections. Canonical source aliases are recognised as already added. An official shadow is a distinct resource and may coexist with its original.

Closing restores focus to the invoking card without navigating away or resetting filters. Native modal behavior contains keyboard focus; Escape closes the topmost enlarged preview before the comparison. Body scrolling is locked while the comparison is open and restored on close. Sticky mobile alternative navigation and a basket/return strip remain accessible while browsing.

## Shared matching and previews

`createSmartShadowMatcher` remains the single eligibility and ranking implementation. Its new `browse` method takes a question group, explicit final student grade, practice setting and result window. It calls the **same `ranked` / `assess` path** as existing `suggest` and `generate`; no independent scoring algorithm, question generator or service was introduced.

Existing default assessment-grade arguments, reserved replacement families, choice retention, three-suggestion behavior, official priority, duplicate prevention and generation revalidation are preserved. The only search optimisation indexes official candidate groups once instead of rescanning the full catalogue for them each time. New tests compare standalone recommendations with existing Smart Shadow recommendations for equivalent inputs and verify that browsing a different cohort does not change assessment suggestions or reservations.

The open comparison memoises one matcher per original/current loaded question catalogue. Changing student grade, practice, batch size or basket selections does **not rebuild** that catalogue. A bounded single-entry cache retains the full ranked metadata result for the active cohort/practice; showing more only slices it. Catalogue/link updates from the existing loader legitimately invalidate the matcher. It is not constructed for every result card.

`QuestionComparisons.tsx` extracts the existing targeted-shadow skill, preview and alternative cards without changing their default actions or layout. Smart Shadow still chooses/approves replacements; standalone browsing supplies an Add-to-worksheet action. The original preview defers images until expanded. Only revealed batches mount candidate previews, marking images load when selected, and inactive phone alternatives defer their preview entirely. Enlargements reuse the same private signed URLs and cropped-image rendering. There are no new signing requests, public URLs or permission changes.

## Interpretation and safeguards

Pearson `g1`–`g9` mean **average percentage of available marks earned by students who ultimately achieved each final GCSE grade**. They are neither intrinsic question grades nor the share answering fully correctly. Complete multipart scores use the existing mark weighting and require valid performance for every known part.

The PR #91 windows are unchanged:

- Similar: absolute difference at most 10 percentage points.
- More accessible: replacement mark share 5–20 points higher.
- Greater challenge: replacement mark share 5–20 points lower.

These are recommendation heuristics, not proof of difficulty or mathematical equivalence. Missing performance permits only an explicitly warned skill-led possible match under Similar historical demand. Directed practice requests require comparable complete history. Missing skills/compatibility, absent links or no qualifying candidate produce an explicit explanation. The feature never falls back to a broad topic or weakens tier/calculator rules.

No production question or assessment records were written during development. No schema, import workflow, auth, permissions, dependencies, numbering or PDF implementation was changed. The feature selects existing resources only, after teacher approval.

## Example and screenshots

The evidence uses **clearly synthetic examination-style Playwright fixtures**, not real Edexcel records or a claim of validated pedagogical equivalence. Every backend/asset request is intercepted and the workflow asserts zero writes. The static test prompts are labelled Fixture and are never published into the question bank.

The source is a two-part simultaneous-equations question, 5 marks, with part means 60% (2 marks) and 80% (3 marks) for final Grade 6 students: combined **72%**. Its first alternative has 65% and 75% with the same marks: **71%**. Seven eligible whole questions are revealed 3 → 6 → 7, including a separately warned missing-history candidate. The teacher adds the two-part alternative and a single-part alternative; the existing basket becomes two questions / 10 marks, and the builder includes both first-question marking images. Original/pre-existing selections remain unchanged in separate regression flows.

- [Desktop controls and source](find-similar-examples/desktop-controls.png)
- [Desktop previews and comparisons](find-similar-examples/desktop-previews.png)
- [Mobile controls](find-similar-examples/mobile-controls.png)
- [Mobile multipart preview and navigation](find-similar-examples/mobile-previews.png)
- [Tablet layout with a long skill name](find-similar-examples/tablet-preview.png)
- [320px phone layout](find-similar-examples/small-mobile-preview.png)

## Validation

- `npm run build`: passed, with the existing Vite bundle-size advisory.
- `npm test`: **285 passed across 29 files**.
- `npm run test:smoke`: **60 passed, 12 existing skips** (mobile duplicates of desktop PDF/OCR/extraction tests). No pre-existing failure was observed.
- The new browser flows pass at 1440px desktop, 900px tablet and 393px/320px phones. Existing Smart Shadow, saved assessment, sequential-numbering and actual examination/PDF smoke tests also pass.
- Screenshots were visually inspected. GitHub CI status is recorded in the pull request.

 Tests cover standalone matching, complete multipart originals/replacements, tier/calculator and asset gates, original/source-family exclusion, official priority and unreviewed rejection, deterministic batching/cache reuse, source aliases, explicit student grades and directed windows, missing history, no match, original/pre-existing basket preservation, duplicate additions, question/mark association, loading updates, keyboard focus, nested Escape, and desktop/tablet/phone rendering.

Initial new fixture runs exposed a double-encoded signed-path decoding/assertion issue, corrected in the fixtures. The enlarged-preview flow also exposed and fixed a real nested cancel-event bug: the parent now handles only its own Escape event. Existing Smart Shadow smoke workflows passed after the shared-card extraction.

## Limits

- Relevance depends on existing enhanced-skill mappings and metadata. No mathematical-content analysis, equivalence inference or generated question is added. Teachers preview and decide.
- Complete means complete relative to the known imported parts/assets. Undocumented missing source parts cannot be reconstructed. Unavailable signed links are explicit and can restrict matches; a URL alone cannot prove a remote asset will load, so existing image errors/retry and PDF checks remain in force.
- The corpus may lack eligible alternatives or selected-cohort history. Source cohort sizes/calibration remain unavailable; performance is descriptive rather than a definitive difficulty scale.
- The result browser intentionally retains already-added matches instead of reshuffling suggestions on every basket change. Matching excludes the original family; basket alias checks distinguish reviewed official variants from originals.
- Matching runs locally on records visible through the existing authorised loader. Reopening a comparison constructs a fresh matcher; it never persists or exposes a separate copy of the bank.
