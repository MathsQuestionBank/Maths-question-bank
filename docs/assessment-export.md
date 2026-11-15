# Assessment numbering and PDF export

## Teacher workflow

1. Add questions to the basket and open **Assessment Builder**. Arrange complete questions by dragging, moving to a position, or using the existing sort controls. Multipart questions move together and their marks are counted once.
2. Choose the paper tier and calculator settings. These settings can exclude selected questions; the preview and export use the same filtered assessment. Check the displayed question count and total marks.
3. Under **Question numbering**, tick **Hide original question numbers and use the assessment order** for sequential numbering from 1. Leave it unticked to retain original numbers. Existing assessments and new assessments retain the previous default of original numbering. Cover page, name/class fields and original-total replacement remain configurable.
4. For sequential output, use **Review next image** to inspect each source image that needs replacement print. Move or resize the shaded number/total covers until they avoid question content. Disable individual covers where needed, or select **Original number and total are already cropped out or absent**. Confirm only after checking mathematics, part labels, diagrams, marks, answer lines and working space. Mark-scheme images have their own reviews.
5. Choose an export:

   | Control | Output |
   | --- | --- |
   | Questions only | Student question paper |
   | Teacher copy | Same question numbering, with optional source references |
   | Mark scheme only | Matching marking pages |
   | Questions + mark scheme | Student paper followed by matching marking pages |

   A teacher copy can show sources with each question, on a separate reference sheet, or omit them. Historic performance remains optional on teacher copies and marking pages; it does not print on student question pages.
6. Use **Print … / save PDF** and choose A4 in the browser print dialog. Inspect the print preview, particularly unusually tall source images. Save to your account to retain the selected order, numbering, cover, export/source options, and reviewed covers when reopening later.

## Implementation

- `assessmentNumbering.ts` supplies the same parent question number to student, teacher and marking output. It reads stored question references rather than changing question text or image labels. Sequential numbers reflect the current filtered assessment order after additions, removals and moves. Missing original numbering is explicitly shown as **Original unknown**.
- Teacher references use stored board, series, tier, paper and original question number where available. Missing metadata is omitted or reported as unavailable. The display's default Higher tier is not presented as source metadata. Shadows are identified as shadows and use their explicit link to the original question; mixed original/shadow selections remain distinct.
- `assessmentGroups.ts` retains existing whole-question grouping and mark totals. It selects question and marking assets independently, keeps distinct multipart images/crops, and deduplicates shared images. The documented V6.2 whole-question images duplicated under sibling part directories are treated as one asset. Modern distinct per-part assets are retained.
- `AssessmentPaper.tsx` renders the shared preview and print layout. Source images pass directly to the browser print engine without application-side screenshot rasterization or downsampling. A4 print rules preserve aspect ratio, reserve working space, avoid splitting questions where possible, and separate the optional cover, marking pages and source sheet.
- `numberingMasks.ts` and `AssessmentMaskEditor.tsx` reuse the existing crop display and assessment-local covers. Suggested and legacy masks remain proposals until reviewed. A review is tied to the source image identity, crop, cover geometry/enabled state and whether a footer cover will print. Changing any of these requires another review; renewing a signed URL for the same file preserves it. Number and total covers can be positioned horizontally and vertically and enabled independently.
- The export path in `App.tsx`, `assessmentGroups.ts` and `assessmentExport.ts` checks the required assets, pending mask reviews and decoded images before opening the print dialog. Missing selected IDs, unavailable required assets, failed image loads and empty assessments block export instead of silently producing an incomplete paper. Unavailable saved IDs remain in the saved selection.
- Saved settings remain in the existing assessment configuration. Backup duplicate detection and browser/account reconciliation compare the full printable configuration, including masks and teacher options. No production question data, authentication, permissions or database schema is changed by this implementation.

## Manual checks and limitations

Image masking cannot establish automatically whether nearby ink is a mathematical expression or the original number. Review the suggested rectangles before confirming them; the editor does not automatically certify content safety. When an original number is already correct in a recognized archived Edexcel question at the same assessment position, the existing printed-number shortcut avoids unnecessary covers.

Very tall source crops are scaled proportionally to a maximum image height of 180 mm for A4. This prevents image truncation but may reduce readability; inspect the printed size and working space. Longer multipart groups may span pages when the complete group cannot fit. The source image's original resolution and crop limit PDF quality. Covers and layout cannot restore content missing from the stored image or recover an incorrect crop.

If no safe cover placement exists, retain original numbering or have the source crop reviewed through the existing authorized crop workflow. This assessment editor preserves the original images and does not write crop changes to question-bank records. Teacher references cannot supply missing database metadata. Browser print settings, including headers/footers and scaling, should be checked in the final preview.

## Regression coverage

| Scenario | Automated checks |
| --- | --- |
| Single question; sequential starts at 1 | Numbering unit tests; single-question PDF test |
| Different papers; identical original numbers | Numbering/grouping tests; student and teacher PDF text checks |
| Multipart selection and marks | Grouping tests; distinct question/mark assets and combined PDF checks |
| Reordering and removal | Grouping/numbering tests; builder and PDF order checks |
| Save, reopen and export | Worksheet/reconciliation tests; mocked account save/reopen browser flow |
| Original and sequential modes | Numbering tests; original and sequential PDF output |
| Student, teacher, mark scheme and combined exports | Actual Chromium PDF text, page, content and source checks |
| Missing source metadata; shadow/mixed selections | Source-reference unit tests; export browser fixtures |
| Overlapping proposed covers and changed reviews | Mask unit tests; translucent editor and blocked-export browser check |
| Missing images and stale saved IDs | Export/group readiness tests; failed-image and stale-ID browser checks |
| Long assessments and tall images | Multipage A4 PDFs; question order, page content and blank-page checks |

Run the repository's required checks:

```sh
npm run build
npm test
npm run test:smoke
```

Playwright uses local mocked Supabase responses and fixture images for these flows. PDF assertions inspect Chromium-generated documents; desktop-only PDF cases are skipped in the mobile project. These fixtures do not exhaustively validate every historical examination layout. Test results and example artifacts belong in the pull request's validation report.

## Validation report — 15 November 2026

The unmodified baseline (`2049e58`) passed build, 96 unit tests, and 19 smoke tests with one intentional mobile skip. No pre-existing failures were found.

The completed implementation passed `npm run build` (existing bundle-size warning), all 157 unit tests across 19 files, and all 25 smoke tests with seven intentional mobile skips of desktop PDF cases. The unit suite also passed under the CI runner's Node 20. The matching export/reopen flow passed three consecutive runs with repeated cached-image reopening. An initial GitHub CI failure exposed rendering tests initializing a live Supabase client; these tests now mock that client and run without a native WebSocket or database connection.

The Build workflow publishes an **assessment-export-evidence** artifact for 14 days, containing generated PDF examples, screenshots, test diagnostics, and this guide. Open the successful run from the pull request's checks to download it. The examples use synthetic question/source fixtures, including the student paper, teacher copy, separate source sheet, matching mark scheme, reopened/reordered combined output, long A4 paper, and tall cropped images. No production examination data was used for the evidence.
