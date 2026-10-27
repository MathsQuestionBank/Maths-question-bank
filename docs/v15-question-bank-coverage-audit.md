# V1.5 baseline audit — Maths Question Bank
**Audit date:** 27 October 2026  
**Source:** Live Maths Question Bank Supabase project `ljisttslifnyrbuybfud`. Read-only SQL queries; no questions or assessments altered.

## Coverage
- **284 question/part records**, drawn from **9 Edexcel GCSE Mathematics Higher papers**.
- November 2020: 1H 30 records, 2H 31, 3H 33.
- November 2021: 1H 29, 2H 34, 3H 31.
- November 2022: 1H 32, 2H 32, 3H 32.
- Every imported paper totals **80 question marks** (9 × 80 = 720). Record counts include separately mapped parts, so they are not counts of complete printed questions.
- **Zero Foundation-tier papers** and **zero AQA papers** in `exam_papers`. No June series are registered. This describes this live database only.
- Topics: Algebra 92; Ratio 50; Number 48; Geometry 44; Statistics 30; Probability 20. These are primary-topic counts, not comprehensive curriculum coverage.
- Assessment objectives: AO1 106 records / 227 marks; AO2 90 / 207; AO3 88 / 286. Single recorded AO per part; inspect mixed-AO questions before treating these as authoritative exam AO coverage.

## Completeness checks
- All 284 records link to an existing paper and have nonempty topic, skill, positive marks, AO1/2/3, metadata, question image path and mark-scheme image path.
- **568/568** referenced asset paths matched `storage.objects` (existence only; crop/image correctness not visually reviewed).
- All 284 metadata records contain `g4` to `g9`, `mean_pct`, and `spec` keys. Their source quality and accuracy have **not** been validated.
- 47 records have 2+ topic tags. The others may still have cross-topic content awaiting classification.
- Mapping review status: `source_only` 237; `suggested_from_mapping` 28; `suggested` 19. **47** records explicitly show suggested mapping. Note that `source_only` does **not** establish human verification.
- Topic review status: `source_only` 236; `suggested_from_mapping` 28; `suggested` 20.
- **284/284 metadata records say `image_status: not_uploaded` despite 568/568 stored files existing**. Treat as stale metadata; inspect sampled images before correcting statuses. Do not overwrite paths or import duplicate assets.
- Question-image paths and mark-scheme paths exist; the audit did **not** inspect the visual accuracy of crop boundaries or text.

## Prioritised V1.5 backlog
1. **P0 – Foundation import**: onboard a permitted Edexcel Foundation exam series, starting with one complete 1F paper and verified mark scheme, then the matching 2F/3F. Track source series/year, calculator mode, tier, parts, totals, crop QA and storage integrity. Verify licensing/permission before broader publication.
2. **P0 – Review quality flags**: queue 47 suggested-map records for human review, then examine `source_only` status for accuracy; add explicit `verified` status only upon review.
3. **P1 – Metadata integrity**: distinguish asset existence from visual QA; once confirmed, correct stale `image_status` safely with an auditable migration. Validate grade-percentage provenance and units before using for ranking.
4. **P1 – Broaden Edexcel across June series**, starting with both tiers; prevent duplicates using exam board + qualification + series + paper code + question/part identifier.
5. **P2 – AQA**: add distinct board-specific metadata, tier/paper structure and rights assessment. Do not assume Edexcel specification topic codes map directly to AQA.
6. **P2 – Intelligent assembly**: only after verified metadata, introduce tier/grade/AO/calculator balance, target marks, part-group safety, repeat avoidance, manual overrides and transparent selection rationale.

## Definition of done for each imported paper
Paper and mark scheme reference verified; every question included and mapped; complete part-group relationships; all images present and visually spot-checked; marks reconcile with original paper; filters work for tier, board, calculator, topic, AO and grades; worksheet export produces consecutive questions and matching scheme; ingestion is idempotent; no existing accounts or saved assessments are modified.

## Important caution
The current live corpus is stronger in raw technical completeness than its coverage: all registered Higher papers reconcile to full marks and their assets exist, but Foundation, June and AQA coverage are absent and substantial mapping provenance remains unreviewed. Do **not** present 284 records as 284 distinct exam questions.
