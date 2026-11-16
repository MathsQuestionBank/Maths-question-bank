# Proposed dependency metadata and safe implementation plan

**Design only.** This PR does not implement any step below, write metadata to Supabase, create a migration, change grouping, or consume the audit classifications in the application.

## Store an approved family document, not inferred flags

The [draft JSON Schema](proposed-dependency-metadata.schema.json) describes a versioned review document for one linked paper/original question family. Its stable identity is `paper_id + original_question_number`; source record UUIDs identify leaves. Do not rely on a year-only filename or assume raw `aii` establishes a particular nested path.

A first implementation could store one `multipart_dependency_review_v1` document in the **existing metadata JSON of a designated stable anchor record**, rather than duplicating a mutable graph into every sibling. It records the complete member-ID set, revision and source fingerprint. The loader builds a family lookup from this document. This requires no new question-content table, and no migration should be assumed necessary until a concrete owner review/save design is agreed. Anchor changes, new members or changed source assets must invalidate the relevant review; do not silently pick another anchor.

The document contains:

- A per-part printed path such as `["a", "ii"]`, actual source record ID, conceptual classification and directional `answer_dependencies`, each with an evidence reason and type: earlier answer, method or constructed work.
- Separate `shared_resource_ids` for required supplied text/formulas/data/diagrams outside the part. A supplied identity can be context; the proof of that identity is a different assessed task. Owned context remains attached to its part.
- Question and marking render recipes, referencing immutable content hashes, actual source dimensions and verified regions. Recipes can assemble multiple existing regions/pages while preserving their order and meaning. Do not crop from a part marker alone when the givens lie above it.
- A resource registry with stable IDs, ownership/provenance and whether it is supplied by the examination or produced by a prerequisite task. A student-drawn graph is **not** replaced with the completed mark-scheme graph.
- Per-part/resource review status, human reviewer identity, time, evidence and revision. An assistant proposal is always a draft. Existing whole-image crop approval, publication, AI audit flags or matching approval are not dependency approval.

The schema is a proposed shape, **not an authentication or approval mechanism**. A future save operation must validate the existing approved-owner authority server-side using the established access model; it must not trust client-set `actor_kind: human`, a reviewer string, or editable JWT `user_metadata`. No new role or policy is added here.

## Approval gates and cross-field validation

Before a part becomes selectable on its own, a human teacher must verify the actual private question image, all required context, its matching marking images and all criteria/supplements. Classification approval and question/marking extraction approval are distinct checks, even if recorded in one review transaction.

The future validator must require:

1. Every reference points to a known part/resource in the correct source family. Prerequisites are directional, earlier and acyclic; nested paths are explicitly verified rather than decoded heuristically.
2. Every required prerequisite and context resource is approved at the same valid source revision. No dangling resource, unresolved classification or stale asset can become an approved selectable unit.
3. All regions fit the actual coordinate frame (`left + width ≤ 1`, `top + height ≤ 1`), preserve notation/labels/answer space and agree with the referenced source dimensions/content hash. Existing percentage crop and numbering positions must not be reused in a different coordinate frame.
4. Supplied resources have approved render regions; student-work resources have an approved producing task/workspace. Data/diagrams carry zero marks. They do not automatically add the marks of the part they originally appeared beside.
5. Marking recipes retain the entire relevant method/accuracy/communication criteria and right-hand guidance, including supplements. An optional follow-through rule is reviewed separately; it neither automatically creates a question prerequisite nor becomes a valid standalone rubric by deleting its earlier reference.
6. Measurement resources have verified **physical print calibration** from source PDF geometry. Uniform resizing preserves angles but can change measured lengths; preserving aspect ratio alone does not suffice. Verify the actual PDF at A4/100% scale. No scale fix or export change is included in this audit.

If the question logic is independent but its unchanged marking rubric cannot be isolated safely, the part stays unavailable until an approved marking solution exists. Do not invent marking guidance or automatically generate mathematics to fill a gap.

## Select parts through an explicit closure and resource plan

For an approved future part-selection mode:

- Independent: include the chosen part and its owned complete context.
- Dependent: take the transitive prerequisite closure, with original earlier-task order. Dependencies can form chains and multiple prerequisites. Add only the prerequisites established by evidence, not every earlier sibling.
- Shared-resource: include the selected task and its necessary supplied context, without adding unrelated tasks or marks.
- Uncertain, missing, incomplete or stale review: **new selections continue using the complete original question** with a clear explanation. No permissive fallback.

Represent the resulting assessment unit explicitly: requested part IDs, prerequisite-task IDs, supplied resource IDs, assessed IDs/marks, recipe revisions and teacher-visible reasons for automatic inclusion. By default, a prerequisite that the pupil must complete remains an assessed task with its original marks. If a teacher instead provides an approved result as unmarked context, that is a separate explicit mode with a verified resource and revised mark total, never an automatic answer leak.

A source family can render as one compound block containing only the approved selected/prerequisite tasks, in original internal order. Resource IDs/revisions deduplicate common context once within that block. Where a given is already owned by an included part, the approved recipe must account for it rather than printing it again. Deduplication cannot be based just on a file URL: one file can contain several part regions, while two files can repeat the same context.

Do not invent a chain for June 2022 Foundation Q28: the reviewed source says (c) uses (b)'s constructed graph, while (b) supplies its own function/range. Its existing marking follow-through from (a) is a separate approval blocker. The example does not license enabling (b)/(c) before standalone marking review.

## Saved assessments, marks and PDF compatibility

Existing saved representative `ids` have **whole-question semantics**. Never reinterpret them as single-part selections after metadata approval. Keep their current order, marks, numbering and marking assets.

A later saved configuration can opt in through a versioned selection model, for example:

```json
{
  "selection_model_version": 2,
  "units": [{
    "paper_id": "source-paper-uuid",
    "original_question_number": 28,
    "requested_part_ids": ["source-part-c-uuid"],
    "resolved_prerequisite_ids": ["source-part-b-uuid"],
    "dependency_review_revision": 1,
    "dependency_review_snapshot_sha256": "verified-review-content-hash"
  }]
}
```

This is an illustrative configuration shape, not real saved data or implemented behavior. Old configurations continue through the old grouping path. If an already saved version-2 recipe becomes stale/unavailable, block incomplete export and offer explicit repair or a teacher-confirmed whole-question replacement with its changed mark total; do not silently expand its marks or drop tasks.

Question numbering still follows assessment order. Preserve original source references and printed subpart identity; do not blindly rename mathematical or diagram labels. Totals must sum only assessed tasks once, including assessed prerequisites but excluding supplied context. Whole-question source totals/numbering masks are not automatically valid for a newly extracted part. Marking images/criteria must follow exactly the resolved assessed part IDs and recipe versions.

No behaviour in this section is implemented in this PR.

## Find Similar and Smart Shadow

Keep complete-question matching as the existing default. A later reviewed part mode should supply an explicit unit to the **shared matcher**, rather than changing its meaning of a whole group or copying its ranking algorithm.

- Candidate unit = approved assessed part set + prerequisite closure + approved context/marking recipe. An independent candidate cannot stand in for a graph-dependent source without showing that structural difference to the teacher.
- Apply skill-first coverage, actual tier/calculator compatibility and source-family duplicate/original exclusions to the resolved unit. Preserve the existing source-family exclusion policy until a deliberate new policy is reviewed; do not start offering siblings as alternatives just because splitting exists.
- Match marks, AO and structure using all assessed tasks, including assessed prerequisites; show any additional workload and skill coverage introduced by a prerequisite.
- Historical `g1`–`g9` remain average available marks earned by final-student-grade groups. Combine only the actual assessed parts with complete comparable data, weighted by marks; context resources have neither marks nor performance percentages. Never use legacy question `grade` as difficulty.
- Reviewed official shadow links still require complete, approved correspondence for the selected resolved unit, including its own dependency/context/marking approvals. An original part's approval does not approve a shadow crop or graph. No incomplete or unreviewed replacement is substituted.
- Keep teacher preview/approval and provenance for both original and replacement units. No automatic substitution or generation of missing content.

## Suggested delivery sequence after this audit

1. Obtain private read-only assets/manifest and finish the 1,565 uninspected records, confirm the 91 counterpart-to-bank matches, and check whether single-record families hide additional printed multipart tasks. Resolve the three explicit source uncertainties with a teacher.
2. Complete question/mark crop and supplement review, including print-scale calibration. Approve a small, diverse pilot set: genuinely independent algebra/arithmetic, a different-object case, shared graphs/data, real constructed-work dependencies, nested parts and marking follow-through.
3. Build the human review workflow and immutable recipe/version storage in a **separate PR**. Validate authority, graph completeness, stale-source invalidation and transactional consistency. Leave the builder unchanged until review data exists.
4. Add the opt-in selection resolver and resource-aware renderer behind a limited pilot. Preserve default/legacy whole grouping. Add versioned saving and explicit incomplete-export blocking before enabling it for teachers.
5. Extend the shared matcher and official-shadow correspondence only after unit semantics, marks and source rendering are reliable. Retain the same default complete-question workflow.
6. Run regressions for direct/multi-parent/chained dependencies, unknown/dangling/cyclic/stale metadata, shared context emitted once, owned context above markers, mark-only dependencies and supplements, asset failures, measurement accuracy, legacy save reopening, repeated saves/exports, grade-cohort statistics, and student/teacher/marking PDFs with source association and pixel-preserved mathematics.

These are review gates for future work, not claims that the remaining content or extraction review has already been completed.
