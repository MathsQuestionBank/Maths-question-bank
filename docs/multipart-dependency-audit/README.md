# Multipart dependency audit — partial content review, private-asset access blocked

**This is an audit and proposal, not permission to split any question. No application behaviour or production data has changed.** The complete mapped-record inventory is included, but the full content/crop audit is **not complete**. Available tools expose database metadata, not authenticated downloads from the private image bucket. No private production question or marking image was inspected. No finding is teacher-approved.

## Results and their limits

| Measure | Count | Meaning |
|---|---:|---|
| Edexcel GCSE Mathematics papers inventoried | 90 | Stored paper identities, both tiers |
| Mapped records inventoried | 3,181 | Records/parts, not whole questions |
| Whole-question metadata groups | 2,257 | Paper identity plus original question number |
| Multipart metadata candidates | 732 | Groups with multiple mapped records; not a certified total of all printed multipart questions |
| Mapped records in those candidates | 1,656 | Every one has a report entry |
| Source-paper groups content-reviewed | 42 | Six authentic QP/MS pairs, 45 QP pages and 36 MS pages |
| Parts examined in source counterparts | 91 | Actual wording, diagrams and associated marking sections, not topic/skill inference |
| Remaining metadata-only parts | 1,565 | Not content-inspected; classified uncertain |
| Source-only provisional independent | 51 | Mathematical independence with all owned givens retained; not verified private extraction |
| Source-only provisional dependent | 2 | Explicit earlier answer/method or student-constructed graph required |
| Source-only provisional shared-resource | 35 | Supplied context needed, without a required earlier student answer |
| Uncertain overall | 1,568 | 1,565 uninspected + 3 unresolved source cases |
| Private question / marking parts inspected | 0 / 0 | Do not conflate public counterpart review with production-crop review |
| Teacher-approved / bank extraction-ready | 0 / 0 | No proposals can enable part selection |

All **1,656 bank extraction records remain `not_ready`** because both private assets and their standalone crops have not been verified. That is an access/review blocker, not a conclusion that they are mathematically inseparable. The production `needs_crop` count is 0 **assessed**, not proof that no cropping is needed. All 1,656 require private-asset review.

A separate **source-only triage** describes work that appears feasible from the public source pages: 49 potential crop-review candidates, 30 needing shared-context packaging, and 12 needing further marking, scale, dependency or interpretation work. These are not production-readiness findings. In particular, two mathematically independent graph-drawing parts have marking follow-through rules that cannot simply be cropped into standalone marking instructions.

The six reviewed papers were selected from already available regression resources and their matching publicly available sources. They are a purposeful sample, **not representative statistics for the remaining bank**. Foundation calculator papers and many series remain unreviewed. No estimate of the bank-wide proportion of independent parts is justified.

## Files

- [Paper index](paper-index.md): all 90 papers, counts and links to each machine-readable paper report.
- [Summary JSON](summary.json): exact denominators, evidence counts, readiness and asset-reference shapes.
- [Uncertain-parts CSV](uncertain-parts.csv): all 1,568 unresolved records and reasons, grouped by paper. The other 88 source-backed proposals also still need teacher approval.
- [Source observations](source-observations.json): the 91 manually recorded source-content findings and rationale; these are assistant proposals, not teacher decisions.
- [Source locations](source-locations.json): exact one-based QP/MS PDF pages, including separate marking supplements.
- [Source manifest](source-manifest.json): 12 public PDF URLs, identities and content SHA-256 values. Full PDFs and contact sheets are not committed.
- [Access evidence](access-evidence.json): read-only census checks and explicit download/inspection limitations.
- [Proposed metadata schema](proposed-dependency-metadata.schema.json): **design only**, with no database migration or runtime consumer.
- [Safe future implementation plan](implementation-plan.md).

Each paper report supplies the board, series, paper code and tier once in its header. Each part entry preserves both the original source ID and database record ID, original question number/raw suffix, marks, classification, directional prerequisite IDs, shared-resource IDs, extraction readiness, evidence, confidence and review status. Requirements are **`null` when unknown**, rather than an empty list falsely asserting independence. Resource descriptions and source page references are included. Nested raw suffixes such as `aii` are retained; unreviewed nesting is not guessed.

Private storage paths can contain publisher account identifiers. Reports publish only SHA-256 **path fingerprints**, not those paths, credentials, signed URLs or private images. A path fingerprint is **not a content checksum**. Existing whole-image crop-review statuses are recorded as existing metadata, never interpreted as approval of a part crop or dependency decision.

## Existing implementation findings

The inspected main revision is `a8e456a` (merged Find Similar PR #92). None of these runtime files is modified:

- `src/assessmentGroups.ts`: `getAssessmentGroupKey` strips trailing letters from source IDs; `buildAssessmentGroups` includes all known siblings when any is selected. There is no semantic dependency graph. `appendAssessmentGroupIds` stores one representative per family, and rendering restores all siblings.
- `src/questionData.ts`: records carry part marks and source metadata, private image paths/URLs, whole-image percentage crops and crop-review states. It has no approved per-part regions or shared-context registry. Signed URLs come from the existing authenticated loader; no new access path was introduced.
- `src/paperExtraction.ts`, `src/paperPublication.ts`, `src/publishReviewedPaper.ts` and the checked-in v15 publication SQL: reviewed publication works at a whole-question draft with question/mark slices; several mapped part records receive the same immutable question and marking assets. Part records therefore do not imply distinct part images.
- Existing import metadata includes `whole_key`, `whole_marks`, some `part_of`, and legacy AI/image-audit fields. They can help locate records, but are **not dependency evidence or human approval**. Legacy shared-image reconciliation handles availability, not standalone semantics.
- `AssessmentPaper.tsx`, `App.tsx` and saved worksheet handling: marks, numbering and marking associations operate on expanded whole-question groups. Existing representative IDs do not record an intention to select only that one part.
- Find Similar and Smart Shadow use the same complete-group matcher, whole-skill coverage, compatible tier/calculator, asset checks, source-family exclusions and reviewed official links. Part selection would change the matching unit and cannot be enabled by altering grouping alone.

In this snapshot, all 3,181 references have matching Storage object-catalogue entries, and the bucket is private. Existence does **not** verify image contents, crop boundaries or whether a marking supplement was included.

Of the 732 multipart groups, **689 share one question and one marking asset**. Only 43 have more than one question-asset reference, and only 5 have more than one marking-asset reference. Thus **727 share a single marking asset**. Even distinct question images do not establish independence or isolated marking availability.

## Audit method

1. Take one authorised read-only metadata snapshot. Include existing Edexcel GCSE Foundation/Higher records, excluding original practice and linked shadows. Preserve linked paper identity, original references, record IDs, marks and existing crop metadata.
2. Identify metadata candidates by multiple known records under the same linked paper/original question number. Cross-check those memberships against the existing source-ID grouping. This is a census of mapped candidates, not proof that single-record questions contain no unrecorded printed subparts.
3. Obtain actual source content when available. For the six counterpart papers, inspect text **and rendered pages**; reading only extracted text loses mathematical layout, graph structure, radicals and diagram labels. Check the QP identity and marking-paper cover, record SHA-256 and one-based page references, and compare the 91 part mark allocations with the database (0 mismatches).
4. Review every part against the complete source question. Identify student-produced results/work separately from supplied givens and from text belonging only to that part. A repeated formula, a different object, or a supplied chart can eliminate an apparent dependency. A reference to another part is a prompt for examination, not an automatic dependency rule.
5. Inspect matching marking sections, right-hand guidance and supplements. **Follow-through permission does not by itself make an earlier answer a compulsory input.** Conversely, a source marking rule explicitly requiring an earlier completed answer/method matters. Never isolate just the answer cell and discard method marks, conditions or diagrams.
6. Record conceptual classification and extraction readiness separately. Private crops remain unverified. Even source-backed independence is provisional until the actual bank image, context and marking recipe are inspected and approved by a human teacher.
7. Leave remaining records uncertain, with unknown requirements. Do not classify them using topic, skill, AO, historical performance, numbering or whether they happen to have different images.

### Classification convention

An **independent** part can include its own complete local givens, diagram and working space. That owned context is not a requirement to include an unrelated assessed part. **Shared-resource** means it needs supplied material outside its own task, shared with or appearing within another part; it does not need the other task to be answered. **Dependent** means an earlier student answer, method or constructed work is genuinely needed. Requirements can coexist, so dependent parts may also require shared resources. **Uncertain** is retained for unresolved wording/context or missing evidence.

The report deliberately distinguishes a supplied identity from the proof a student writes, a given graph from a graph the student must draw, and a different second object/population from an earlier result. No question has been rewritten to make it independent.

## Representative source findings

| Source | Finding | Important extraction/marking implication |
|---|---|---|
| November 2024 Foundation 1F Q14(a),(b), QP p11; MS p9 | Independent: a height calculation and a separate cuboid surface-area task with different supplied dimensions | Keep each complete cuboid and its own givens. Current private whole-image crops are unverified. [Existing authentic regression excerpt](../../e2e/fixtures/edexcel-numbering/november-2024-1f-q14.png). |
| June 2022 Foundation 1F Q15(b), QP p10; MS p9 | Independent of (a), but a supplied calculation lies **above** the (b) marker | Cropping from the marker alone would omit essential information. This is owned given context, not the answer to (a). |
| November 2024 Foundation 1F Q11(b), QP p9; MS p8 | Shared survey givens, not dependent on the filled table | Needed counts are already supplied. MS follow-through from the table needs a separate marking review. |
| June 2022 Foundation 1F Q28(c), QP p21; MS p15 | Dependent on the graph constructed in (b) | Selecting (c) must include the prerequisite task/workspace. (b) itself repeats the equation/range and does not mathematically require (a), although its partial marking rule refers to (a). Do not invent an a→b→c chain. |
| November 2024 Foundation 1F Q22(b), QP p18; MS p15 | Dependent on (a)'s estimate and rounding method | Marking guidance explicitly requires a final answer to (a); supplying only raw journey data is insufficient. |
| November 2024 Foundation 1F Q7(a), QP p4; MS p6 | Shared accurately drawn triangle; physical print scale is essential | Resizing can change a measured-length answer. This is a risk to verify, not a demonstrated defect in current exports. Aspect ratio alone is not enough. |
| November 2022 Higher 3H Q14(a),(b), QP p11; MS p10 | Independent index and expansion tasks | Different complete expressions; neither result is reused. These are the legacy `2022_3H_Q14a/b` records, whose stored series is **November**, not June. [Existing authentic reproduction](../../e2e/fixtures/edexcel-numbering/november-2022-3h-q14-legacy.png). |
| November 2022 Higher 1H Q6(a)(ii), QP p6; MS p8 | Shared supplied ratios, not a compulsory dependence on (a)(i) | Nested labels must be preserved. Optional marking follow-through is a separate isolation issue. |
| November 2022 Higher 1H Q16(b), QP p16; MS p12 | Needs the identity **printed** in (a), not the student's proof | Carry the supplied identity as approved context without adding marks for an unwanted proof task. |
| June 2023 Higher 1H Q5(b), QP p5; MS p8 | Shared set definitions; completed Venn diagram not required | Marking follow-through still needs review. Do not automatically add (a) or reveal a completed answer diagram. |
| June 2022 Higher 3H Q17(b), QP p19; MS p15 | Independent: a different supplied Year 11 histogram from the Year 10 histogram drawn in (a) | A graph task following another graph task is not sufficient dependency evidence. Keep the complete Year 11 diagram and n definition. |

One-based PDF page numbers above are not inferred from filenames. Source URLs and full page lists are in the manifest and source-location files. These public counterparts have not been byte-compared with private bank crops.

### Uncertain source cases requiring teacher judgement

- **June 2022 1F Q16(b):** asks how an assumption change affects the earlier answer, but the mark scheme accepts qualitative earlier arrival without its numerical value. Determine whether preserving only the baseline context/task is sufficient without rewriting.
- **November 2024 1F Q19(b):** another qualitative earlier-answer comparison. The marking explicitly relates to the student's previous result; do not assume an automatic numerical dependency or safe standalone use.
- **November 2022 1H Q24(b):** different solids and independent area givens, but perpendicular height h is labelled only in the earlier cone diagram; the second labels slant height l. Confirm the required symbol context without introducing misleading first-solid information.

The remaining 1,565 metadata-only records are also listed in the uncertainty CSV. No hidden “probably independent” or automatic approval is assigned to them.

## Private access/export needed to finish

An approved existing development/test session capable of reading and signing objects in `exam-materials-private`, or an owner-created **read-only local export**, is required. Do not make the bucket public or supply a service-role key. A suitable export contains:

- The corresponding question/marking images for each audited record/family, with a manifest mapping **record ID → relative asset filename**. Include reused assets once, all distinct sibling assets, supplementary marking diagrams, and the exact existing `image_crops`/crop-review metadata.
- A complete bank-reference manifest to confirm that no mapped/printed parts were omitted. Include source paper identity, part labels, marks and any available source-PDF/crop provenance.
- Original immutable object bytes or content hashes and source dimensions. Measurement questions additionally need source PDF geometry/calibration so physical scale can be verified.

A short-lived signed-URL manifest is another read-only option if the URLs can be refreshed through the existing authorised session. Do not commit it. Store private raw exports outside the repository. The public-source review can then be checked against actual crop contents, followed by standalone question **and** marking crop approval and teacher decisions on ambiguous references.

## Reproduction and safeguards

The committed [SELECT-only query](../../tools/multipart_dependency_snapshot.sql) documents the snapshot fields. Run it through an authorised read-only session and save its JSON-array result **outside the repository**. Existing private paths can contain publisher identifiers.

```sh
python tools/multipart_dependency_audit.py \
  --catalogue /private/local/catalogue.json \
  --evidence docs/multipart-dependency-audit \
  --out /private/local/regenerated-report \
  --snapshot-date 2026-11-16 --base-commit a8e456a
python -m unittest discover -s tools -p 'test_multipart_dependency_audit.py' -v
```

The generator has no network or database client and never reads/writes image bytes. With metadata alone it emits only uncertain records. Source classifications come solely from the explicit reviewed observations, not heuristics. Its validator rejects missing prerequisites/resources, cycles, later-part prerequisites, unknown reviewed requirements, unsupported independence, teacher-approval claims and production-readiness claims. `null` is retained for unknown requirements. Existing source records, source images, numbering and crop data remain unchanged.

Validation: `npm run build` passed (existing bundle-size advisory); `npm test` passed **285 tests across 29 files**; the audit suite passed **9 tests**. `npm run test:smoke` passed **60 tests with 12 existing mobile skips** (desktop PDF/OCR/extraction duplicates). No pre-existing test failure was observed. GitHub CI status is recorded in the pull request. JSON documents, local report links, the proposed schema’s Draft 2020-12 meta-schema, all 12 source PDF hashes and all 2,257 group memberships were also checked. These checks validate the report/tooling and protect existing behaviour; they do not certify private crops or teacher approval. The nine audit tests cover inventory counts, evidence boundaries, unknown requirements, path privacy, dependency chains/cycles/direction and read-only SQL. Existing application build/unit/smoke checks are run separately; this PR does not implement part-level selection.
