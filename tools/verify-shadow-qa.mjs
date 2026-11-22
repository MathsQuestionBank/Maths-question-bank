import { readFile, writeFile } from "node:fs/promises";
import pg from "pg";
import { supabase } from "../src/supabase.ts";
import { runShadowQa } from "../src/shadowQaPort.ts";
import { readQaEvidence } from "../src/shadowQa.ts";
import { checkApprovedEvidence, registerVerifiedQa, verifyIntake } from "./shadow-qa-verifier.mjs";

const [id, path, mode, reportPath, extra] = process.argv.slice(2);
if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id ?? "")
 || !path || extra || (mode === "--report-file" ? !reportPath : !!reportPath || (!!mode && mode !== "--attest"))) {
 console.error("Usage: vite-node --script tools/verify-shadow-qa.mjs INTAKE_ID PRIVATE_PACK.json [--attest | --report-file PRIVATE_REPORT.json]");
 process.exit(2);
}

try {
 const bytes = await readFile(path);
 const approvedHash = process.env.MQB_QA_APPROVED_PACK_SHA256;
 checkApprovedEvidence(bytes, approvedHash);
 // This connection never uses the verifier's database credentials.
 supabase.auth.stopAutoRefresh();
 const { error: authError } = await supabase.auth.signInWithPassword({
  email: process.env.MQB_IMPORT_EMAIL,
  password: process.env.MQB_IMPORT_PASSWORD,
 });
 if (authError) throw new Error("Approved source reader could not authenticate.");
 const { data: intake, error } = await supabase.from("shadow_papers")
  .select("id,original_paper_id,intake_manifest_path,shadow_set,status").eq("id", id).single();
 if (error || !intake || !["awaiting-review", "in-review"].includes(intake.status)) {
  throw new Error("Could not read an intake awaiting review.");
 }
 const report = await verifyIntake({
  intake, evidenceBytes: bytes, approvedHash, parseEvidence: readQaEvidence, evaluate: runShadowQa,
 });
 if (mode === "--attest") {
  const connectionString = process.env.MQB_QA_VERIFIER_DATABASE_URL;
  if (!connectionString) throw new Error("A dedicated verifier database connection is required.");
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || [...url.searchParams].length) {
   throw new Error("Use a direct PostgreSQL URL without TLS query overrides.");
  }
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 15000 });
  try {
   await client.connect();
   await registerVerifiedQa(client.query.bind(client), id, report);
  } finally { await client.end(); }
 }
 if (mode === "--report-file") await writeFile(reportPath, JSON.stringify(report), { mode: 0o600, flag: "wx" });
 const exceptions = report.questions.filter(item => item.status === "exception").map(item => item.number);
 console.log(JSON.stringify({ mode: mode === "--attest" ? "attested" : "read-only", ruleVersion: report.ruleVersion,
  qaPassed: report.questions.length - exceptions.length, exceptions }));
} catch {
 // The CLI can receive credentials, database errors and copyrighted data. Keep
 // their values out of logs, including driver messages and stack traces.
 console.error("Verification stopped. Check the approved digest, source-reader access, bundle integrity and verifier role.");
 process.exitCode = 1;
}
