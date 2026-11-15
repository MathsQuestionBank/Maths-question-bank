# Automatic assessment numbering and PDF export

Select questions, arrange them, enable **Hide original question numbers and use the assessment order**, and export. Number and total replacements are located automatically; there is no per-question approval step for supported images. The first analysis of a new legacy image takes local processing time. Export becomes available automatically when required images are ready.

## What changed after PR #85

PR #85's default covers were estimated rectangles anchored to the cropped frame. Real full-width Edexcel crops retain a left page margin; for example, a printed number around 7% into the image cannot be covered by a rectangle spanning only the first 3.5%. Total statements also sit above lower page rules rather than flush with the image bottom. Changing those defaults would merely move the error to other layouts.

The new pipeline locates text in the **original image coordinate system**, then applies the actual crop and identical image scaling in preview and print. It replaces the leading numeral and the complete parenthesized total statement in place, preserving the verified marks. Mathematical expressions, multipart labels, diagrams, marks, answer lines and working space are not rewritten.

## Position sources and reuse

1. Newly extracted PNGs can carry exact PDF-derived text rectangles in a bounded PNG metadata chunk. The existing owner publication workflow computes these positions while creating new immutable images. Image pixels and existing stored images remain unchanged. No database migration, full-PDF access for teachers, authentication or permission change is needed.
2. Optional existing `metadata.numbering_positions` can supply validated source positions.
3. Legacy images are recognised locally using self-hosted Tesseract workers, English data and WebAssembly. Images are not uploaded to an OCR service, and no third-party CDN is needed at runtime. The engine loads only when needed.
4. Successful geometry is cached by SHA-256 of the actual image bytes, original reference, marks and image kind. It is independent of assessment position, so reorder/removal generates the latest numbers without scanning again. New assessments in the same browser reuse successful processing. Different image content, dimensions, question references or marks cannot inherit an old cached layout.

The source recogniser requires the expected parent number and exact total-marker wording/marks, checks confidence and gutter/line relationships, and rejects ambiguous mathematics. An isolated heading skipped by page OCR can be recovered only from a verified isolated ink cluster in the detected leading gutter, with digit recognition and neighbouring-ink checks. Mark-table labels require separate parent-column evidence; multipart labels are retained.

## Optional advanced correction

A layout that cannot be identified safely blocks sequential export with an explicit reason. Use original numbering or **Advanced numbering adjustment** for that exceptional image. Supported images do not require this step. Detected positions seed the advanced controls when available.

A confirmed correction is stored with the assessment and reused in the browser. New corrections include a source-content hash; a saved correction can be reused on another device when the source bytes still match. Signed-link renewal does not require another correction. Changes to the source bytes, crop, cover geometry or footer option invalidate the corresponding approval. Older URL-only saved covers remain proposals if recognition fails; they are not blindly trusted on changed images.

## Existing export features

Student, teacher and marking output share the same parent numbering and assessment order. Original numbering remains available. Multipart/nested parts move together and marks are counted once. Student, teacher, mark-scheme-only and combined exports, optional covers and teacher statistics remain available. Teacher references can be inline, on a separate sheet or excluded; they come from stored metadata. Save/reopen, backups and account reconciliation preserve the existing configuration.

Missing images, unavailable saved references, unsafe numbering and source-dimension mismatches block incomplete PDFs. Image decoding and fonts complete before printing. Existing A4 margin, tall-image and blank-page safeguards remain in place.

## Actual examination evidence and limits

The regression fixtures contain 16 authentic Edexcel question excerpts across June 2022 Foundation, November 2022 Higher, June 2023 Higher and November 2024 Foundation. They include single/double-digit numbers, multipart questions, different crop heights, total positions and both tiers. Provenance and copyright attribution are recorded in `e2e/fixtures/edexcel-numbering/README.md` and `provenance.json`; full examination PDFs are not committed.

Browser tests exercise all 16 legacy images with real OCR and no supplied positions or manual approvals, then reopen using cached results without loading OCR again. Separate tests cover all 16 supplied source layouts, extra crop boundaries, an already-cropped-out number, and embedded PNG geometry. Actual preview and PDF rasters are compared before/after: changed pixels outside the detected print regions are tightly bounded. The original Q14/five-mark example is visibly replaced by Q1 and `(Total for Question 1 is 5 marks)`, while diagrams, part marks, rules and working space remain intact.

This demonstrates the tested layouts, not every historical image. Low-quality scans, missing or conflicting totals/metadata, combined text/graphics, unusual mark tables and ambiguous numbering can still need the optional adjustment or original numbering. The PDF-coordinate producer safely recognised 10 of the 16 source-layout cases in a separate audit; unsupported source text formats fall back to the image recogniser, which processed all 16 tested legacy crops. No claim is made that every PDF font or image format is automatic.

Caches may be unavailable under browser privacy/quota settings; that may repeat automatic processing. Very tall scans still need a printed readability check. Existing source resolution and incorrect crops cannot be repaired by numbering. Production questions were not modified and no production deployment was performed.

## Verification and downloadable examples

Run `npm run build`, `npm test` and `npm run test:smoke`. Build/dev prepares the pinned, self-hosted OCR resources from installed dependencies into ignored `public/ocr/`; generated binaries are not committed.

The Build workflow uploads **assessment-export-evidence** for 14 days. It includes before/after real-paper screenshots, original and renumbered PDFs, OCR/cache examples, crop examples, pixel comparison counts and this guide. Existing synthetic regression tests continue to cover student/teacher/marking outputs, reorder/removal, saved settings, missing images/references, shadow selections and long A4 assessments.

Final local validation: build passed with the existing bundle-size warning; 200 unit tests passed across 25 files; 29 Playwright tests passed with 11 intentional mobile skips of desktop OCR/PDF cases. Development regressions caught browser SVG decoding differences and replacement glyph overhang; both were corrected before the complete passing run. The Q14 before/after comparison recorded **zero changed pixels outside the target regions** in both preview and actual PDF raster output.
