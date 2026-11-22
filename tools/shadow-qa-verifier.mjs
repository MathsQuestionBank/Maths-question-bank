import { createHash } from "node:crypto";

/** The expected digest comes from the verifier's trusted job configuration. */
export function checkApprovedEvidence(bytes, expectedHash) {
 if (!/^[0-9a-f]{64}$/.test(expectedHash ?? "")) {
  throw new Error("A verifier-approved evidence SHA-256 is required.");
 }
 const actual = createHash("sha256").update(bytes).digest("hex");
 if (actual !== expectedHash) throw new Error("Evidence pack does not match the verifier-approved digest.");
 return actual;
}

export async function verifyIntake({ intake, evidenceBytes, approvedHash, parseEvidence, evaluate }) {
 const digest = checkApprovedEvidence(evidenceBytes, approvedHash);
 const evidence = await parseEvidence(new File([evidenceBytes], "private-evidence.json"));
 if (!evidence.version.endsWith("." + digest)) throw new Error("Evaluator and verifier versions disagree.");
 // The verifier recomputes from private files and source records. The owner
 // cannot submit a report or a precomputed pass list to this entry point.
 return evaluate(intake, evidence);
}

export async function registerVerifiedQa(query, intakeId, report) {
 await query("select public.attest_shadow_qa_report($1::uuid, $2::jsonb)", [intakeId, JSON.stringify(report)]);
}
