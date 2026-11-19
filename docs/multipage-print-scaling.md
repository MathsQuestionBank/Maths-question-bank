# Readable multi-page question and mark-scheme PDFs

## Cause and scope

The old print rule was:

```css
.paper .mqb-cropped-image {
  width: min(100%, calc(180mm * var(--mqb-crop-ratio, 1))) !important;
}
```

With crop ratio `retained width / retained height`, this caps **every image's height at 180 mm** by shrinking its width. A 1000 × 3000 source therefore prints approximately 60 mm wide, even though the A4 content area is about 180 mm wide. Mathematical text that would be 13 pt at full width becomes about 5 pt. Shorter images can still print at full width, which explains the inconsistent scales.

`CroppedImage` correctly measures natural dimensions and uses the stored crop percentages; the crop calculation was not the source of this height fit. Existing image grouping also correctly keeps distinct source images/crops and deduplicates shared multipart assets. Those grouping rules are unchanged.

Removing the CSS cap alone is insufficient: the source sits inside an absolutely positioned, clipped crop frame, and the question/image blocks previously requested unbreakable layout. A taller frame can overflow, be clipped or move with large gaps instead of providing sensible continuation pages.

## Implementation

- `assessmentImagePagination.ts` calculates contiguous source viewports at the existing **A4 / 15 mm margin / 180 mm content width**. It reserves space for the template's title, question heading, teacher source/statistics and continuation captions. No question-specific offsets or examination-number exceptions are used.
- Short images remain a single full-width image. Taller images are analysed locally for genuinely blank horizontal bands, with a 1 mm clear-band requirement. Vertical graph/table rules remain occupied, so spaces between horizontal grid lines are not treated as page breaks. Only near-continuous rules at the extreme scan edge can be ignored for seam analysis; they remain in the printed image.
- An unbroken graphic that fits a fresh page is kept intact. Otherwise the last usable blank band before the page allowance is preferred. If a continuous region is too tall, or pixel analysis is unavailable, the preview explicitly warns about a possible graph/table crossing a page boundary. There is no silent return to height fitting or image trimming.
- `AssessmentImage.tsx` reuses `CroppedImage` for each viewport. The original full-width crop and overlays are translated together behind an outer clip. All source rows, including blank working space, remain contiguous and appear exactly once. No new raster image is generated for printing.
- The analysis canvas is bounded to 800 pixels wide / 10,000 high and discarded. **Only analysis is downsampled.** PDF images still use the original private URL and native resolution. A bounded, in-memory plan cache avoids repeated work; no image/URL is persisted by this feature. A same-authorised-URL fetch is used only if normal image display has tainted the analysis canvas, following the existing numbering access pattern.
- Automatic overlays are rendered only on source viewports intersecting their original source-coordinate rectangles. This avoids duplicate number/total nodes. Manual masks retain their original full-crop coordinate system. Crop metadata, numbering recognition, saved correction keys and total calculations are unchanged.
- Each continuation has its question/mark-scheme number and total marks. Additional source images retain their existing order and get a continuation heading. The print layout allows breaks between source viewports while keeping an individual viewport together.
- Repeated page margins remain unchanged. Redundant artificial working space after image-based questions is omitted from print; the image's original working space is preserved. Compact title/mark-scheme spacing prevents empty opening or trailing pages caused by the surrounding template.
- Export readiness waits for pagination and every actual rendered image. It counts original asset blocks rather than assuming one `<img>` per asset. Existing image failures, stale numbering geometry and assessment-change checks still block export.

No database/storage/authentication changes, source-image edits, stored crop changes, new APIs or dependencies. Assessment selection, multipart grouping, saving, question order, matching and source metadata remain unchanged.

## Evidence: supplied description and source counterparts

The report supplied question numbers/marks and a description, but no exact source IDs, stored assets or crop dimensions. The available authorised read-only metadata and public papers contain these representative counterparts:

- **Edexcel June 2017 Higher Paper 2 Q8**, 2 marks: a supplied cumulative-frequency graph and one estimate.
- **Edexcel June 2019 Higher Paper 2 Q11(a–c)**, 6 marks: frequency/cumulative-frequency tables on printed page 10, then graph grid and later parts on printed page 11.

The actual public pages were inspected. Local test copies were rendered from those PDF regions at 2 pixels per PDF point and concatenated without changing their aspect ratio. They are **counterparts**, not proof of the exact owner's private stored crop. No production image was downloaded, changed or made public.

| Representative input | Native test-copy size | Before printed width | After printed width |
| --- | --- | --- | --- |
| Q8 source counterpart | 1030 × 1254 | 147.90 mm | 180.18 mm |
| Q11 source counterpart | 1030 × 2688 | 69.06 mm | 180.18 mm on both continuation pages |

Small deviations from nominal 180 mm are Chromium's page/unit rounding. Together, these two counterparts printed on **2 pages before** (long question reduced) and **3 pages after** (one short page plus two readable long-question pages). The graph remains intact on the final page; source-derived numbering positions replace the heading and total correctly. The original source bitmaps extracted from both PDFs have **identical RGB pixels and native dimensions** to their input PNGs. Existing source working areas remain visible; legitimate source whitespace is not removed to make a denser worksheet.

Source URLs, hashes, analysis-crop bounds and measurements are in [the evidence report](multipage-print-examples/measurements.json). The local source-counterpart PDFs/images are excluded from GitHub. The exact private stored assets still require owner confirmation using their normal authorised access if their dimensions/crops differ.

## Committed examples

These are **synthetic layout fixtures**, not production examination images or a classroom assessment supplied by the publisher. They exercise tables, a cumulative-frequency grid, multipart marks, source images and numbering without publishing examination material.

- [Before student PDF](multipage-print-examples/before-student.pdf): short question readable, long source reduced to one page.
- [After student PDF](multipage-print-examples/after-student.pdf): same inputs at consistent width; the long question spans two pages.
- [After combined questions + mark scheme](multipage-print-examples/after-combined.pdf).
- [After mark scheme only](multipage-print-examples/after-mark-scheme.pdf).
- [Native raster example](multipage-print-examples/native-raster.pdf): the PDF retains 1000 × 2600 source pixels.

| Comparison | Screenshot |
| --- | --- |
| Before: long image shrunk on one page | [Before](multipage-print-examples/before-long.png) |
| After: tables and first part | [After page 1 of long question](multipage-print-examples/after-long-1.png) |
| After: intact grid, final part and corrected total | [After page 2 of long question](multipage-print-examples/after-long-2.png) |
| Live paper preview | [Preview](multipage-print-examples/after-preview.png) |

## Regression coverage

Vitest covers crop dimensions, short images, contiguous full-width coverage, marks/template page allowances, graph/table rules (including faint lines), scan-edge rules, retained working space, invalid dimensions and explicitly warned fallback behaviour.

Chrome desktop PDF tests cover:

- Short and tall questions at equal text scale; print preview and the actual export button.
- A4 page sizes, complete source coverage and no accidental blank/heading-only pages.
- Tables and the complete grid on their intended pages; multipart marks and matching mark schemes.
- Multiple source images in part order; repeated exports, native raster dimensions, original/sequential numbering, cover and teacher-source options.
- Existing real Edexcel source-coordinate/OCR numbering tests. Their pixel comparator now reconstructs every source viewport across PDF pages, retaining the original full-resolution and unchanged-mathematical-content checks. It no longer assumes a complete question is confined to page 1.
- Mobile preview at 320 px without overflow. Actual PDF creation runs on desktop Chromium; the complementary projects explicitly skip the inapplicable cases.

## Limitations

Whitespace analysis is a layout heuristic, not semantic identification of every mathematical diagram. Very faint/noisy scans, an image that cannot be read into a canvas, or a genuinely oversized continuous graphic can require checking the clearly warned page boundary in preview. The original pixels are retained; the renderer never invents content or shrinks the question to conceal this limitation. Natural source blank working space can still produce an open area on a page.

Validation targets Chrome's A4 print engine at the supplied page settings. Other browsers, manual print scaling, changed paper sizes/margins, unusually long custom headings or particularly large optional statistics panels can alter pagination. No claim is made that every stored format or physical printer has been inspected.

## Final validation

| Command/check | Result |
| --- | --- |
| `npm run build` | Passed (existing Vite >500 kB chunk-size warning) |
| `npm test` | **352 passed**, 32 files |
| `npm run test:smoke -- --workers=2` | **83 passed, 17 project-specific skips**, 100 cases, no failures |
| `python -m unittest discover -s tools -p 'test_*.py'` | **13 passed** |
| Actual source-counterpart PDF inspection | 3 student pages; intact graph, correct replacement total; native RGB image pixels unchanged |
| Synthetic PDF font comparison | Short 13.27 → 13.28 pt; long 5.10 → 13.27 pt |

The 17 skips comprise the 12 existing desktop-only cases skipped on mobile, three new desktop PDF cases skipped on mobile, the new teacher PDF case skipped on mobile, and the mobile-preview case skipped on desktop. All corresponding applicable cases pass.

Initial development runs exposed and corrected: older page-one-only PDF assumptions; duplicate automatic overlays from hidden/off-page source views; a missing helper argument; a fixture URL decoding issue; an ES2020-incompatible test array accessor; and floating-point assertion precision. Two unrelated local artifact-file errors occurred when overlapping Playwright runs shared the output directory; the final full suite was run alone and passes. No unresolved failure is reported.
