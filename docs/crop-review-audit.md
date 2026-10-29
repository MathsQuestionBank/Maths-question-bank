# Pending-paper review audit

The user authorised review of all papers currently awaiting review, approval only of verified complete questions, and leaving uncertain questions unapproved. Publication remains a separate action and is not authorised. The initial dedicated-import-account inventory contains 80 pending papers and 2,025 unapproved questions. Existing approved reviews and published papers are excluded from edits.

## Crop corrections

Question crops end 0.014 page heights below the printed total instead of 0.035, with a next-question cap. The June 2019 2F Q1 regression verifies that none of Q2 appears. Saved crops are still restored exactly; tighter guesses do not overwrite an existing review on load.

The outer-frame detector previously selected the first long line in the bottom-page search band. A question's total underline could be mistaken for the outer border, clipping the bottom of the total text. New crops opt into `borderVersion: 2`, which selects the outermost qualifying bottom frame line. An absent version retains legacy rendering, including approved saved crops. Version changes are validated, restored and compared before publication, and invalidate the preview render dependency when edited.

June 2019 2F Q1's question crop and Q7's mark crop were explicitly corrected and saved unapproved during review. Q7 retains its answer and both guidance lines while dropping the blank tail and header-only next page. Broader mark proposals use the original PDF's full-width marking-table borders locally to preserve full rows and diagrams; they require visual verification before approvals are saved. Column vectors and other tall notation also require checking above the detected text baseline.

## Preservation

Private audit originals, sources, proposed images and decisions remain outside Git. Before any saved review update, the latest exact review must match the audited original, an immutable content-hash backup is retained, and the resulting review is read back with cache bypass. Existing approvals, notes, source mapping references and immutable Pearson/grade data are retained. Only reviewed pending items may change. No publication RPC, paper/question-table write, production migration, merge or production deployment is part of this audit.

Local checks for the detector correction: 108 unit tests, production build and 13 Playwright tests passed; 3 intentional mobile PDF skips. Real-PDF crop inspection is additional evidence, not an assertion that all pending papers have completed visual review.
