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

An approved owner can submit a candidate report. The RPC only accepts automatic QA passes and records teacher decisions when the exact question report is independently attested in `shadow_qa_attestations`. The database compares the intake ID, bundle SHA-256, manifest SHA-256, rule version and complete question array. The version is `shadow-qa-3.<evidence-pack-sha256>`. Changing any evidence, outcome, classification, link or question list invalidates the attestation. Samples and batch membership are derived by the database.

### Run the verifier

Provision a dedicated PostgreSQL login through the database administration process and grant it membership in the migration's `mqb_shadow_qa_verifier` role. That role can execute `attest_shadow_qa_report` and has no direct table-write grant. Keep its login secret in the verifier job. The browser, ordinary authenticated users and Supabase service role cannot execute the attestation function. Submission uses the authenticated PostgreSQL login as provenance. An identical retry is idempotent. A different report for the same intake, bundle, manifest and evidence version is rejected.

Provide the approved source-reader bindings `MQB_IMPORT_EMAIL` and `MQB_IMPORT_PASSWORD` to the private runner. Supply `MQB_QA_APPROVED_PACK_SHA256` from a separately controlled verifier job configuration after reviewing the pack's transcription and rubric against the sources. The upload owner must have no access to the verifier database login or to this approval configuration. The verifier compares the approved digest before reading the intake and recomputes the complete report from the private staged bytes and current original-question evidence. It accepts no browser-generated final report.

Run from the repository root with Node 22 or later.

```sh
npx vite-node --script tools/verify-shadow-qa.mjs INTAKE_UUID /private/evidence.json
```

The command above is read-only. Add `--attest` and inject `MQB_QA_VERIFIER_DATABASE_URL` for the dedicated login to register the result in an authorised database. The CLI requires TLS certificate verification. For a local QA drill, `--report-file /private/new-report.json` writes the recomputed report to a new private file and performs no database writes. Keep source materials, evidence packs, reports and credentials outside the repository and CI artifacts.

The owner then selects the same evidence pack in **Review QA**. A matching recomputed report opens the sample before batch approval. A source, evidence or report change needs a new verification. Unsupported questions in an attested report remain eligible only for individual teacher decisions.

### Supported mathematical methods

The per-part `calculations` entries accept exact rational arithmetic or a named checker with `method`, `input` and `expected`. Foundation methods cover place-value rounding, ordering, principal square roots and integer powers, marked minor angles and angles around a point, simplified ratios, median and range, unit-rate comparison, translations, arithmetic sequences, set complements and event probabilities, integer-coefficient linear equations and upper-bound inequalities, graph lines, parallel lines and coverage comparisons. They evaluate mathematical properties against structured source inputs. Geometry input must identify the actual marked rays or plotted coordinates. Missing, unknown or ambiguous checks remain exceptions, including open chart construction and unclear marking allowances.

This workflow still needs a private, reviewed transcription for each new paper. It has no general PDF-to-proof extraction or hosted runner. The least-privilege CLI is suitable for a separate controlled job once those inputs are available.

## Sampling and decisions

Before batch approval, review the database-selected sample of 10%, rounded up, with a minimum of three where available. Sampling seeds annotated, variant and ordinary questions where present. It prioritises a distinct skill variant when an annotated question also belongs to the variant group, then fills remaining slots with a deterministic draw. A substantive error blocks the whole run's batch and makes the affected run available for individual decisions. A new evidence version starts a fresh audit and retains the prior events. Each event records an authenticated actor and timestamp. Concurrent decisions use the last event ID as a precondition.

Teacher decisions record QA and approval only. Copyright or other clearance and publication still require a separate future action. The existing question-bank selectability code is outside this workflow.
