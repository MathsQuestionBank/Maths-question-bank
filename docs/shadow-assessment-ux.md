# Smart Shadow Assessment usability improvements

Replacement cards now put the source, skill, match category, grade, marks, assessment objective and historical performance ahead of the detailed matching explanation. **Why this question?** opens the existing reasons. Every existing warning stays visible outside that disclosure.

Desktop and tablet layouts use two wider comparison columns, with the third alternative on the next row. Phones below 720 CSS pixels show one full-width card at a time. Previous/Next controls announce the current alternative, remain reachable while scrolling the question, and stop at either end. Browsing never approves a replacement. The chosen alternative is retained, and **View chosen replacement** returns to it.

Question previews start open and use the full card width. Teachers can switch to the mark scheme and enlarge either preview as before, including every distinct multipart marking image. The enlarged dialog still supports Escape and restores focus through the browser's native dialog behavior.

## Clearer comparisons

Historical performance shows **Original** and **Replacement** together at the same final GCSE grade, using the existing mark-weighted calculation only when all mapped parts have data. The reference grade follows the existing matcher's original-question grade rule; matching/ranking itself is unchanged. Actual zero values remain zero. Missing values say **No data**; an unknown original grade does not produce a guessed comparison.

A neutral difference in percentage points accompanies comparable values. The card explains that this shows how pupils performed, not proof that a question is easier or harder. Differences in grade, marks, assessment objective and mapped-part count show the original values with a visible highlight. Metadata remains an aid to teacher judgement, not a guarantee of mathematical equivalence.

## Before and after

The before screenshots use the merged PR #88 implementation at `1c95ec5` in an isolated checkout. Both versions use the same synthetic fixtures and viewport widths, with a long skill name, three alternatives and a multipart first question. The numbers **82.7%** and **88.5%** are fixture values illustrating the comparison, not live examination statistics.

| Layout | Before | After |
| --- | --- | --- |
| Desktop, 1440px | [Before](shadow-ux-examples/before-desktop.png) | [After](shadow-ux-examples/after-desktop.png) |
| Tablet, 900px | [Before](shadow-ux-examples/before-tablet.png) | [After](shadow-ux-examples/after-tablet.png) |
| Phone, 393px | [Before](shadow-ux-examples/before-mobile.png) | [After](shadow-ux-examples/after-mobile.png) |

[Additional 320px phone example](shadow-ux-examples/after-small-mobile.png).

Full-component screenshots hold the sticky navigation in its normal starting position so that the screenshot scroll offset does not move it over the captured content. The browser tests separately verify that the actual navigation stays in the viewport while the teacher scrolls down to choose a replacement.

## Validation

- `npm run build`: passed; existing Vite bundle-size advisory remains.
- `npm test`: **234 passed** across 27 files.
- `npm run test:smoke`: **36 passed, 12 existing skips**. The skipped mobile cases avoid duplicating desktop PDF/OCR checks.
- New comparison unit tests cover mark-weighted multipart values, genuine zero, incomplete part history, missing original grades, grade/marks/AO/structure differences, and explicit comparison-grade labels.
- Browser coverage includes desktop 1440px, tablet 900px and phones at 393px and 320px; long skill names; three alternatives; missing grade/AO/source/history; and no alternatives. It checks column positions, visible card counts, image width and bounds, absence of horizontal overflow, navigation limits, retained choices, explicit approval, visible warnings with collapsed explanations, and enlarged multipart marking previews.
- Existing workflows still generate a separate assessment, preserve the original, save and reopen settings, and export matching sequential student, teacher and mark-scheme PDFs.

Only the targeted-shadow presentation, its comparison display and relevant tests changed. The matching algorithm, official-shadow priority, multipart grouping, saved configuration, assessment generation and export code are untouched. No production database changes or additional services were introduced. The PR is left unmerged; no deployment commands were run.
