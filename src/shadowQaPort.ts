import JSZip from "jszip";
import { BUCKET, inspectShadowBundle, sha, type Original } from "./shadowBundle";
import { evaluateShadowQa, isBundlePath, parseShadowQaPack, shadowQaRuleVersion, type Part, type QaEvent } from "./shadowQa";
import { shadowStagingPort } from "./shadowStagingPort";
import { supabase } from "./supabase";

export type ReviewIntake = { id: string; original_paper_id: string; intake_manifest_path: string; shadow_set: string };
type Draft = { number: number; kind: "question" | "mark"; relative_storage_path: string; sha256: string };
const limit = 150 * 1024 * 1024;

async function readPrivate(path: string, max: number) {
 const { data, error } = await supabase.storage.from(BUCKET).download(path, {}, { cache: "no-store" });
 if (error || !data) throw Error("Could not read a private intake object.");
 if (data.size > max) throw Error("An intake object exceeds its size limit.");
 return new Uint8Array(await data.arrayBuffer());
}

export async function readQaManifest(intake: ReviewIntake) {
 const path = intake.intake_manifest_path;
 if (!isBundlePath(path, intake.original_paper_id)) throw Error("A complete staged ZIP is required.");
 const raw = await readPrivate(path, 2 * 1024 * 1024);
 const data = JSON.parse(new TextDecoder().decode(raw));
 if (data?.version !== 1 || data.kind !== "official-shadow" || data.status !== "awaiting-review"
  || data.original_paper_id !== intake.original_paper_id || data.shadow_set !== intake.shadow_set
  || !Array.isArray(data.assets) || data.assets.length > 100 || !Array.isArray(data.parts) || data.parts.length > 300) {
  throw Error("The stored intake manifest is invalid.");
 }
 for (const draft of data.assets) {
  if (!Number.isInteger(draft?.number) || draft.number < 1 || draft.number > 50
   || !["mark", "question"].includes(draft.kind) || !/^[0-9a-f]{64}$/.test(draft.sha256)
   || draft.relative_storage_path !== `drafts/Q${String(draft.number).padStart(2, "0")}/${draft.kind}-${draft.sha256}.png`) {
   throw Error("The manifest contains an invalid draft image path.");
  }
 }
 return { raw, hash: await sha(raw), folder: path.slice(0, -"intake.json".length),
  assets: data.assets as Draft[], parts: data.parts as Part[], teacherReview: data.teacher_review as unknown };
}
export type QaManifest = Awaited<ReturnType<typeof readQaManifest>>;

export async function readQaImages(manifest: QaManifest, number: number): Promise<Blob[]> {
 return Promise.all(["question", "mark"].map(async kind => {
  const asset = manifest.assets.find(item => item.number === number && item.kind === kind);
  if (!asset) throw Error("The paired draft image is missing.");
  const bytes = await readPrivate(manifest.folder + asset.relative_storage_path, 10 * 1024 * 1024);
  if (await sha(bytes) !== asset.sha256) throw Error("A draft image differs from the staged manifest.");
  return new Blob([new Uint8Array(bytes).buffer], { type: "image/png" });
 }));
}

export async function readQaEvidence(file: File) {
 if (file.size > 300000) throw Error("The QA evidence pack exceeds 300 KB.");
 const raw = new Uint8Array(await file.arrayBuffer());
 return { pack: parseShadowQaPack(JSON.parse(new TextDecoder().decode(raw))), version: `${shadowQaRuleVersion}.${await sha(raw)}` };
}
export type QaEvidence = Awaited<ReturnType<typeof readQaEvidence>>;

export async function runShadowQa(intake: ReviewIntake, evidence?: QaEvidence) {
 await shadowStagingPort.owner();
 const manifest = await readQaManifest(intake);
 if (evidence && evidence.pack.manifestHash !== manifest.hash) throw Error("The QA evidence pack belongs to a different manifest.");
 const packs = evidence ? [evidence.pack] : [];
 const { data, error } = await supabase.from("exam_papers")
  .select("id,exam_board,qualification,series,tier,paper_code").eq("id", intake.original_paper_id).single();
 if (error || !data) throw Error("The original paper is unavailable.");
 const original = data as Original;
 const zip = new JSZip();
 zip.file("intake.json", manifest.raw, { createFolders: false });
 const files = ["question-paper.pdf", "mark-scheme.pdf", ...manifest.assets.map(asset => asset.relative_storage_path)];
 if (new Set(files).size !== files.length) throw Error("Repeated staged file path.");
 let total = manifest.raw.length;
 for (let i = 0; i < files.length; i += 6) {
  await Promise.all(files.slice(i, i + 6).map(async path => {
   const bytes = await readPrivate(manifest.folder + path, (path.endsWith(".pdf") ? 30 : 10) * 1024 * 1024);
   total += bytes.length;
   if (total > limit) throw Error("The staged files exceed the expanded bundle limit.");
   zip.file(path, bytes, { createFolders: false });
  }));
 }
 const bundle = await inspectShadowBundle(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }), original);
 if (manifest.folder.slice(0, -1).split("/").pop() !== bundle.hash) throw Error("Staged files do not match the registered bundle hash.");

 // Stored skills can contain multiple semicolon-delimited labels.
 const taxonomy = new Set<string>();
 for (let offset = 0; ; offset += 1000) {
  const { data: rows, error: labelError } = await supabase.from("questions").select("skill").order("id").range(offset, offset + 999);
  if (labelError) throw Error("Live taxonomy is unavailable.");
  for (const row of rows ?? []) for (const label of (row.skill ?? "").split(";")) taxonomy.add(label.trim());
  if ((rows?.length ?? 0) < 1000) break;
 }
 const originalHashes = new Map<string, string>();
 if (packs.some(pack => pack.manifestHash === manifest.hash)) {
  const refs = new Map(manifest.parts.map(part => [part.proposed_original_question_id, part]));
  const { data: rows, error: refError } = await supabase.from("questions")
   .select("id,paper_id,question_number,marks,shadow_paper_id,question_storage_path").in("id", [...refs.keys()]);
  if (refError) throw Error("Current original-part evidence is unavailable.");
  const hashes = new Map<string, Promise<string | undefined>>();
  for (const row of rows ?? []) {
   const part = refs.get(row.id);
   if (!part || row.paper_id !== original.id || row.shadow_paper_id || row.marks !== part.marks
    || row.question_number.toLowerCase() !== part.question.toLowerCase() || !row.question_storage_path) continue;
   const path = row.question_storage_path;
   if (!hashes.has(path)) {
    // Missing/replaced original images make a link unsuitable independently of question QA.
    hashes.set(path, readPrivate(path, 10 * 1024 * 1024).then(sha).catch(() => undefined));
   }
  }
  for (const row of rows ?? []) {
   const pending = hashes.get(row.question_storage_path);
   const part = refs.get(row.id);
   if (!pending || !part || row.paper_id !== original.id || row.shadow_paper_id || row.marks !== part.marks
    || row.question_number.toLowerCase() !== part.question.toLowerCase()) continue;
   const hash = await pending;
   if (hash) originalHashes.set(row.id, hash);
  }
 }
 return { manifestHash: manifest.hash, bundleHash: bundle.hash, ruleVersion: evidence?.version ?? shadowQaRuleVersion,
  questions: evaluateShadowQa(bundle, taxonomy, originalHashes, packs) };
}

export async function listQaEvents(intakeId: string): Promise<QaEvent[]> {
 const events: QaEvent[] = [];
 for (let offset = 0; ; offset += 1000) {
  const { data, error } = await supabase.from("shadow_qa_events").select("id,kind,payload,actor_id,created_at")
   .eq("intake_id", intakeId).order("id").range(offset, offset + 999);
  if (error) throw Error(error.message);
  events.push(...(data ?? []) as QaEvent[]);
  if ((data?.length ?? 0) < 1000) return events;
 }
}

export async function recordQaEvent(intakeId: string, expected: number | null, kind: QaEvent["kind"], payload: QaEvent["payload"]) {
 const { error } = await supabase.rpc("record_shadow_qa_event", {
  p_intake: intakeId, p_expected_event: expected, p_kind: kind, p_payload: payload,
 });
 if (error) throw Error(error.message);
}
