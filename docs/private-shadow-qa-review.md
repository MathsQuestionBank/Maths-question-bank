# Private shadow QA review

Apply the additive Supabase migration `20261122130000_shadow_intake_qa.sql` through the normal release process before testing review writes. It creates an owner-readable, append-only `shadow_qa_events` table and an owner-checked RPC. The RPC selects the audit sample and approves the batch atomically. Existing storage and question policies are unchanged. The review flow leaves the intake status, source manifest, original question records and selectable question records alone.

In **Import Exam Papers → Import Official Shadow Papers**, open **Review QA** beside a ZIP-staged intake. The owner can supply a reviewed evidence JSON file prepared from their private source review. The app reads the staged objects, reconstructs the bundle in memory, reruns the staging validator and checks the registered bundle hash. It checks the live taxonomy and the byte identity of cited original question crops, then evaluates the evidence. The pack hash identifies the evidence version in the audit trail.

Evidence packs remain private. They are selected locally and their source files stay outside Git and the public app build. A rule pack is bound to the SHA-256 of the exact `intake.json` bytes. Each supported question includes evidence for mathematical correctness, marking consistency and the proposed skill. A marking ambiguity is recorded with `markingException: true`. A replacement assessment cites the original part, its image checksum, the kind of link and the reason for that link. Where an independent numeric calculation is available, `calculation` contains postfix arithmetic tokens and the expected result. An example for an invented question follows.

```json
{
  "manifestHash": "<64 lowercase hex digits>",
  "questions": {
    "1": {
      "mathematics": "Two halves make one whole.",
      "marking": "The answer and scheme both give one.",
      "skill": "The task requires addition of fractions with equal denominators.",
      "calculation": [[0.5, 0.5, "+"], 1],
      "links": [
        {
          "part": "Q01",
          "kind": "lower-demand-variant",
          "originalHash": "<64 lowercase hex digits>",
          "evidence": "The original requires a common-denominator conversion."
        }
      ]
    }
  }
}
```

This version evaluates reviewed, source-bound evidence. It does not infer mathematical solutions or curriculum equivalence for arbitrary new PDFs. Missing evidence becomes an exception, even where the taxonomy label is valid. Replacement suitability is independent of question QA. A question can pass with a variant or unsuitable link, which must stay restricted from exact-replacement use.

Before batch approval, review the database-selected sample of 10%, rounded up, with a minimum of three where available. Sampling draws across annotated, variant and ordinary items where present. A substantive error blocks the whole run's batch and makes the affected run available for individual decisions. A new evidence version starts a fresh audit and retains the prior events. Each event records an authenticated actor and timestamp. Concurrent decisions use the last event ID as a precondition.

Teacher decisions record QA and approval only. Copyright or other clearance and publication still require a separate future action. The existing question-bank selectability code is outside this workflow.
