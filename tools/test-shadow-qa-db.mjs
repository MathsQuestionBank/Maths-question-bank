import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const owner = "11111111-1111-1111-1111-111111111111";
const member = "22222222-2222-2222-2222-222222222222";
const intake = "33333333-3333-3333-3333-333333333333";
const bundle = "a".repeat(64);
const manifest = "b".repeat(64);
const version = character => "shadow-qa-2." + character.repeat(64);
const migration = new URL("../supabase/migrations/20261122130000_shadow_intake_qa.sql", import.meta.url);
try {
 await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
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
 let last = null;
 async function record(kind, payload, expected = last) {
  const result = await db.query("select public.record_shadow_qa_event($1,$2,$3,$4) as id", [intake, expected, kind, payload]);
  last = result.rows[0].id;
  return last;
 }
 const useOwner = () => db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${owner}'`);
 const check = { state: "pass", evidence: "Synthetic verification." };
 const report = {
  manifestHash: manifest, bundleHash: bundle, ruleVersion: version("c"),
  questions: Array.from({ length: 6 }, (_, i) => ({
   number: i + 1, status: i < 5 ? "qa-passed" : "exception",
   mathematics: { ...check, method: "part-calculations" },
   marking: i < 5 ? check : { ...check, state: "exception" }, skill: check,
   links: [{ part: `Q0${i + 1}`, kind: i < 2 ? "skill-variant" : "exact-replacement", evidence: "Synthetic link." }],
   ...(i === 0 ? { annotation: "Annotated skill variant." } : {}),
  })),
 };
 async function attest(candidate) {
  await db.exec("reset role");
  await db.query(`insert into public.shadow_qa_attestations
    (intake_id,bundle_hash,manifest_hash,rule_version,questions,verified_by) values($1,$2,$3,$4,$5::jsonb,'synthetic verifier')`,
   [intake, candidate.bundleHash, candidate.manifestHash, candidate.ruleVersion, JSON.stringify(candidate.questions)]);
  await useOwner();
 }
 const latest = async () => (await db.query("select payload from public.shadow_qa_events where kind='run' order by id desc limit 1")).rows[0].payload;
 await db.exec("set role anon");
 await assert.rejects(record("run", report), /permission denied/i);
 await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${member}'`);
 await assert.rejects(record("run", report), /Approved owner required/);
 await useOwner();
 await assert.rejects(db.exec("insert into public.shadow_qa_attestations default values"), /permission denied/i);
 await assert.rejects(db.exec("insert into public.shadow_qa_events default values"), /permission denied/i);
 await assert.rejects(record("run", { ...report, bundleHash: "f".repeat(64) }), /Invalid QA run/);
 const first = report.questions[0];
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
 console.log("Shadow QA PostgreSQL checks passed.");
} finally {
 await db.close();
}
