# Private shadow QA review

Apply the additive Supabase migration `20261122130000_shadow_intake_qa.sql` through the normal release process before testing review writes. It creates an owner-readable, append-only `shadow_qa_events` table and a database-admin-only attestation table, and an owner-checked RPC. The RPC selects the audit sample and approves the batch atomically. Existing storage and question policies are unchanged. The review flow leaves the intake status, source manifest, original question records and selectable question records alone.

In **Import Exam Papers → Import Official Shadow Papers**, open **Review QA** beside a ZIP-staged intake. The owner can supply a reviewed evidence JSON file prepared from their private source review. The app reads the staged objects, reconstructs the bundle in memory, reruns the staging validator and checks the registered bundle hash. It checks the live taxonomy and the byte identity of cited original question crops, then evaluates the evidence. The pack hash identifies the evidence version in the audit trail.

Evidence packs remain private. They are selected locally and their source files stay outside Git and the public app build. A rule pack is bound to the SHA-256 of the exact `intake.json` bytes. Each supported question includes evidence for mathematical correctness, marking consistency and the proposed skill. A marking ambiguity is recorded with `markingException: true`. A replacement assessment cites the original part, its image checksum, the kind of link and the reason for that link. Each assessed part needs its own entry in `calculations` to pass mathematics QA. The verifier evaluates postfix arithmetic with exact rational arithmetic. Operands are bounded integers and an expected result is an integer or a numerator-denominator pair. An example for an invented question follows.

```json
{
  "manifestHash": "<64 lowercase hex digits>",
  "questions": {
    "1": {
      "mathematics": "Two halves make one whole.",
      "marking": "The answer and scheme both give one.",
      "skill": "The task requires addition of fractions with equal denominators.",
      "calculations": { "Q01": [[1, 2, "/", 1, 2, "/", "+"], 1] },
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

## Server trust boundary

An approved owner can submit a candidate report. The RPC only accepts automatic QA passes and records teacher decisions when the exact question report is independently attested in `shadow_qa_attestations`. The database compares the intake ID, bundle SHA-256, manifest SHA-256, rule version and complete question array. The version is `shadow-qa-2.<evidence-pack-sha256>`. Changing any evidence, outcome, classification, link or question list invalidates the attestation. Samples and batch membership are derived by the database.

A database administrator or separately authorised verifier must independently check the report against the private sources and pack before inserting the exact question array and provenance through a privileged database connection. Browser roles, including the Supabase service role via the Data API, have no grants on that table. The PR supplies no hosted verifier or signer. Until the verifier records a matching attestation, the dashboard displays a provisional report with decisions locked. A trusted report may include unsupported questions as exceptions for individual approval. Previously issued packs using a single `calculation` field need reviewed per-part checks before they can be used for automatic QA.

## Sampling and decisions

Before batch approval, review the database-selected sample of 10%, rounded up, with a minimum of three where available. Sampling seeds annotated, variant and ordinary questions where present. It prioritises a distinct skill variant when an annotated question also belongs to the variant group, then fills remaining slots with a deterministic draw. A substantive error blocks the whole run's batch and makes the affected run available for individual decisions. A new evidence version starts a fresh audit and retains the prior events. Each event records an authenticated actor and timestamp. Concurrent decisions use the last event ID as a precondition.

Teacher decisions record QA and approval only. Copyright or other clearance and publication still require a separate future action. The existing question-bank selectability code is outside this workflow.
