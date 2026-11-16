# Multipart numbering follow-up

## Cause and focused fix

The reported IDs `2022_3H_Q14a` and `2022_3H_Q14b` share one production image and have 2 + 3 = 5 marks. Grouping and mark association were correct. Recognition on a reconstruction of that image read `14`, `(a)`, `Simplify`, and the complete five-mark total at high confidence, but the parent-number safety heuristic rejected the heading.

That heuristic required the number-to-next-token gap to exceed 1.25 times the median of later inter-word gaps. Here the next token is the structural part label `(a)`, not ordinary prose. Its valid gap (~13.8 source pixels in the tested rendering) was smaller than the threshold (~14.8), particularly because spacing before the formula enlarged the later gaps.

The fix identifies a confident, explicit parenthesized part label followed by confident prose and omits only that relative prose-spacing comparison. Exact original reference/total/marks validation, absolute separation, first-row/prose-column checks, ambiguous-candidate rejection and diagram/mathematics protections remain active. No question number or source ID is hard-coded. The replacement continues to cover only the original numeral and total; `(a)`, `(b)`, their 2/3 marks, mathematical notation, answer lines and working space remain unchanged.

## Evidence and access limitation

The private production PNG could not be downloaded using the available credentials. The fixture is reconstructed from the matching public examination PDF using the precise crop already recorded in the production audit metadata. It is **not claimed to be byte-identical to the production image**. A direct check of that private PNG remains outstanding.

The source metadata and matching mathematical prompt identify **November 2022 Higher Paper 3, Q14**, despite the report describing June 2022. The public June question has different mathematics and was not used as a substitute. Fixture provenance is in `e2e/fixtures/edexcel-numbering/legacy-multipart-provenance.md`. No production records were modified.

The reconstructed heading failed before the fix at five render scales and passed afterwards at all five. A new real-OCR browser regression places its two part records first in a five-question assessment, checks sequential numbers and all totals, compares preview and actual student-PDF pixels outside the target regions, compares repeated PDF rasters, and reloads saved assessments without starting OCR again. The previous 16 real-image recognition cases remain covered.

## Validation

- Build: passed, with the existing bundle-size warning.
- Unit tests: 201 passed.
- Full smoke suite: 30 passed, 12 intentional mobile skips of desktop OCR/PDF cases.
- Before/after student PDFs, preview screenshots and PDF image crops are published by the Build workflow in `assessment-export-evidence` (14-day retention).

Ambiguous/unreadable images still fail explicitly and retain the optional advanced correction. The exact private production raster has not been directly verified. No production deployment was performed.
