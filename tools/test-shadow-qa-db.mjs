import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { registerVerifiedQa, verifyIntake } from "./shadow-qa-verifier.mjs";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { inspectShadowBundle, sha } from "../src/shadowBundle.ts";
import { evaluateShadowQa, readQaEvidence } from "../src/shadowQa.ts";

const db = new PGlite();
const owner = "11111111-1111-1111-1111-111111111111";
const member = "22222222-2222-2222-2222-222222222222";
const intake = "33333333-3333-3333-3333-333333333333";
const sourcePaper = { id: "44444444-4444-4444-4444-444444444444", exam_board: "Edexcel",
 qualification: "GCSE Mathematics", series: "June 2000", tier: "Foundation", paper_code: "1F" };
const zip = new JSZip();
const pdf = new TextEncoder().encode("%PDF-1.4\nSynthetic fixture\n%%EOF");
const png = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64"));
const [pdfHash, pngHash] = await Promise.all([sha(pdf), sha(png)]);
const parts = [], assets = [];
for (let n = 1; n <= 6; n++) {
 const question = `Q0${n}`;
 const id = `55555555-5555-5555-5555-55555555555${n}`;
 parts.push({ question, marks: n === 6 ? 15 : 13, topic: "Number", skill: "Integers",
  proposed_original_question_id: id, candidate_original_record_id: id, original_link_verification: "unverified",
  shadow_of_question_id: null, approved: false, ao: null, spec: null, ao_spec_status: "provisional" });
 for (const kind of ["question", "mark"]) {
  const relative_storage_path = `drafts/${question}/${kind}-${pngHash}.png`;
  assets.push({ number: n, kind, relative_storage_path, sha256: pngHash, approved: false, crop_review: "unreviewed", source_pages: [n] });
  zip.file(relative_storage_path, png);
 }
}
zip.file("question-paper.pdf", pdf).file("mark-scheme.pdf", pdf);
zip.file("intake.json", JSON.stringify({
 version: 1, kind: "official-shadow", status: "awaiting-review", original_paper_id: sourcePaper.id, shadow_set: "Set 1",
 metadata: { exam_board: "Pearson Edexcel", qualification: "GCSE Mathematics (1MA1)", series: sourcePaper.series,
  tier: sourcePaper.tier, paper_code: "1MA1/1F", calculator: false, total_marks: 80 },
 parts, assets, counts: { questions: 6, parts: 6, marks: 80, question_images: 6, mark_scheme_images: 6 },
 question_source_relative_path: "question-paper.pdf", mark_scheme_source_relative_path: "mark-scheme.pdf",
 source_files: { question: { sha256: pdfHash }, mark: { sha256: pdfHash } }, original_stored_image_verification: "outstanding",
 publication: { selectable: false, teacher_approved: false, question_records_created: false }, teacher_review: { synthetic: true },
}));
const validated = await inspectShadowBundle(await zip.generateAsync({ type: "uint8array" }), sourcePaper);
const bundle = validated.hash;
const manifest = validated.files.find(file => file.path === "intake.json").hash;
const version = character => "shadow-qa-3." + character.repeat(64);
const migration = new URL("../supabase/migrations/20261122130000_shadow_intake_qa.sql", import.meta.url);
try {
 await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create role test_verifier login;
  create schema auth;
  grant usage on schema auth to authenticated;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create function public.is_approved_owner() returns boolean language sql stable as $$select auth.uid()='${owner}'::uuid$$;
  create table public.shadow_papers(id uuid primary key,status text,intake_manifest_path text);
  create table public.questions(id int primary key);
  insert into public.questions values (7);
  insert into auth.users values ('${owner}'),('${member}');
  insert into public.shadow_papers values ('${intake}','awaiting-review','private/bundles/${bundle}/intake.json');
 `);
 await db.exec(await readFile(migration, "utf8"));
 await db.exec("grant mqb_shadow_qa_verifier to test_verifier");
 let last = null;
 async function record(kind, payload, expected = last) {
  const result = await db.query("select public.record_shadow_qa_event($1,$2,$3,$4) as id", [intake, expected, kind, payload]);
  last = result.rows[0].id;
  return last;
 }
 const useOwner = () => db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${owner}'`);
 const evidence = { manifestHash: manifest, questions: Object.fromEntries(parts.map((part, i) => [i + 1, {
  mathematics: "Checked method.", marking: "Synthetic scheme.", skill: "Integer rounding.",
  ...(i === 0 ? { annotation: "Annotated skill variant." } : {}),
  calculations: { [part.question]: { method: i === 5 ? "unsupported-chart" : "round", input: [149, 100], expected: 100 } },
  links: [{ part: part.question, kind: i < 2 ? "skill-variant" : "exact-replacement", originalHash: pngHash, evidence: "Synthetic link." }],
 }])) };
 async function asVerifier(operation) {
  await db.exec("reset role; set role test_verifier");
  try { return await operation(db); }
  finally { await useOwner(); }
 }
 async function attest(candidate) {
  const write = report => asVerifier(tx => registerVerifiedQa(tx.query.bind(tx), intake, report));
  await assert.rejects(asVerifier(tx => tx.exec("insert into public.shadow_qa_attestations default values")), /permission denied/i);
  await write(candidate);
  await write(candidate);
  await assert.rejects(write({ ...candidate, questions: candidate.questions.slice(1) }), /attested version cannot be changed/);
 }
 const bytes = Buffer.from(JSON.stringify(evidence));
 const approvedHash = createHash("sha256").update(bytes).digest("hex");
 const report = await verifyIntake({
  intake, evidenceBytes: bytes, approvedHash, parseEvidence: readQaEvidence,
  evaluate: async (verifiedIntake, proof) => {
   assert.equal(verifiedIntake, intake);
   const originalHashes = new Map(parts.map(part => [part.proposed_original_question_id, pngHash]));
   return { manifestHash: manifest, bundleHash: bundle, ruleVersion: proof.version,
    questions: evaluateShadowQa(validated, new Set(["Integers"]), originalHashes, [proof.pack]) };
  },
 });
 assert.equal(report.questions[5].status, "exception");
 assert.equal(report.questions.filter(item => item.status === "qa-passed").length, 5);
 await assert.rejects(verifyIntake({
  intake, evidenceBytes: Buffer.from("tampered"), approvedHash,
  parseEvidence: () => assert.fail("unapproved evidence reached evaluator"),
 }), /does not match/);
 const latest = async () => (await db.query("select payload from public.shadow_qa_events where kind='run' order by id desc limit 1")).rows[0].payload;
 await db.exec("set role anon");
 await assert.rejects(record("run", report), /permission denied/i);
 await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${member}'`);
 await assert.rejects(record("run", report), /Approved owner required/);
 await useOwner();
 await assert.rejects(db.exec("insert into public.shadow_qa_attestations default values"), /permission denied/i);
 await assert.rejects(registerVerifiedQa(db.query.bind(db), intake, report), /permission denied/i);
 await assert.rejects(db.exec("insert into public.shadow_qa_events default values"), /permission denied/i);
 await assert.rejects(record("run", { ...report, bundleHash: "f".repeat(64) }), /Invalid QA run/);
 const first = report.questions[0];
 const check = { state: "pass", evidence: "Synthetic verification." };
 await assert.rejects(record("run", { ...report, questions: [{ ...first, mathematics: check }] }), /Invalid QA questions/);
 await assert.rejects(record("run", { ...report, questions: [{ ...first, links: [{}] }] }), /Invalid QA links/);
 await attest(report);

 // Altering a single part of an attested report voids its batch eligibility.
 await record("run", { ...report, sample: [1], batchVerified: true,
  questions: [{ ...first, annotation: "Tampered evidence." }, ...report.questions.slice(1)] });
 const unverified = await latest();
 assert.equal(unverified.batchVerified, false);
 assert.deepEqual(unverified.sample, []);
 assert(unverified.questions.every(item => item.status === "exception"));
 await assert.rejects(record("batch", { numbers: [1] }), /completed audit/);
 await assert.rejects(record("audit", { number: 1, outcome: "pass" }), /not available/);
 await assert.rejects(record("decision", { number: 1, outcome: "approved", note: "Bypass" }), /verified run/);

 const originalRun = await record("run", { ...report, sample: [6] });
 const sample = (await latest()).sample;
 // The only annotated question is also a variant. The sample must still span
 // both variants and contain an ordinary question without sampling twice.
 assert.equal(sample.length, 3);
 assert.equal(new Set(sample).size, 3);
 assert(sample.includes(1) && sample.includes(2) && sample.some(n => n >= 3 && n <= 5));
 await assert.rejects(record("run", { ...report, manifestHash: "e".repeat(64) }), /cannot replace a verified run/);
 await assert.rejects(record("batch", {}), /completed audit/);
 await assert.rejects(record("audit", { number: 6, outcome: "pass" }), /not available/);
 await assert.rejects(record("audit", { number: sample[0], outcome: "pass" }, null), /another session/);
 await record("audit", { number: sample[0], outcome: "pass" });
 await assert.rejects(record("audit", { number: sample[0], outcome: "pass" }), /not available/);
 await record("audit", { number: sample[1], outcome: "substantive-error", note: "Wrong crop" });
 await assert.rejects(record("audit", { number: sample[2], outcome: "pass" }), /not available/);
 await assert.rejects(record("batch", {}), /completed audit/);
 await assert.rejects(record("run", report), /already been reviewed/);
 await record("decision", { number: 1, outcome: "held", note: "Revisit crop" });
 await assert.rejects(record("decision", { number: 1, outcome: "held", note: " Revisit crop " }), /already recorded/);
 await record("decision", { number: 1, outcome: "rejected", note: "Crop is unusable." });

 const next = { ...report, ruleVersion: version("d") };
 await attest(next);
 await record("run", next);
 for (const number of (await latest()).sample) await record("audit", { number, outcome: "pass" });
 await record("decision", { number: 6, outcome: "approved-with-changes", note: "Clarify examiner note." });
 await record("batch", { numbers: [6] });
 assert.deepEqual((await db.query("select payload->'numbers' numbers from public.shadow_qa_events where kind='batch'")).rows[0].numbers, [1, 2, 3, 4, 5]);
 await assert.rejects(record("batch", {}), /completed audit/);
 await assert.rejects(record("run", report), /already been reviewed/);
 await db.exec(`set request.jwt.claim.sub='${member}'`);
 assert.equal((await db.query("select count(*) from public.shadow_qa_events")).rows[0].count, 0);
 await db.exec("reset role");
 assert.equal((await db.query("select status from public.shadow_papers")).rows[0].status, "awaiting-review");
 assert.deepEqual((await db.query("select * from public.questions")).rows, [{ id: 7 }]);
 assert.equal((await db.query("select kind from public.shadow_qa_events where id=$1", [originalRun])).rows[0].kind, "run");
 const privateReportPath = process.env.MQB_QA_TEST_PRIVATE_REPORT;
 if (privateReportPath) {
  // Optional replay of a read-only verifier report. This connection is always
  // disposable PGlite; private bytes are never committed or printed.
  const privateReport = JSON.parse(await readFile(privateReportPath, "utf8"));
  const pilotId = "66666666-6666-6666-6666-666666666666";
  await db.query("insert into public.shadow_papers values ($1,'awaiting-review',$2)", [pilotId,
   `private/bundles/${privateReport.bundleHash}/intake.json`]);
  await asVerifier(connection => registerVerifiedQa(connection.query.bind(connection), pilotId, privateReport));
  let pilotEvent = null;
  async function pilotRecord(kind, payload) {
   const result = await db.query("select public.record_shadow_qa_event($1,$2,$3,$4) id", [pilotId, pilotEvent, kind, payload]);
   pilotEvent = result.rows[0].id;
  }
  await pilotRecord("run", privateReport);
  const stored = (await db.query("select payload from public.shadow_qa_events where id=$1", [pilotEvent])).rows[0].payload;
  assert.equal(stored.batchVerified, true);
  const changed = structuredClone(privateReport);
  changed.questions[0].mathematics.evidence += " changed";
  await assert.rejects(pilotRecord("run", changed), /cannot replace a verified run/);
  await assert.rejects(pilotRecord("batch", {}), /completed audit/);
  for (const number of stored.sample) await pilotRecord("audit", { number, outcome: "pass" });
  await pilotRecord("batch", {});
  const approved = (await db.query("select payload->'numbers' numbers from public.shadow_qa_events where id=$1", [pilotEvent])).rows[0].numbers;
  const passed = privateReport.questions.filter(item => item.status === "qa-passed").map(item => item.number);
  assert.deepEqual(approved, passed);
  console.log("Private disposable replay:", JSON.stringify({ qaPassed: passed.length, auditSampleSize: stored.sample.length,
   exceptions: privateReport.questions.length - passed.length, batchApproved: approved.length }));
  await db.exec("reset role");
 }
 // PGlite uses a single session. Switch its login identity only after the
 // owner assertions so the final call tests the real verifier login boundary.
 await db.exec("set session authorization test_verifier");
 await registerVerifiedQa(db.query.bind(db), intake, { ...report, ruleVersion: version("e") });
 console.log("Shadow QA PostgreSQL checks passed.");
} finally {
 await db.close();
}
