import { useEffect, useState } from "react";
import { decisions, reviewState, shadowQaRuleVersion, type QaEvent } from "./shadowQa";
import { listQaEvents, readQaEvidence, readQaImages, readQaManifest, recordQaEvent, runShadowQa,
 type QaEvidence, type QaManifest, type ReviewIntake } from "./shadowQaPort";

const title = (value: string) => value.replace(/-/g, " ");
const labels = { approved: "Approve", "approved-with-changes": "Approve with changes", held: "Hold", rejected: "Reject" };
const questionName = (number: number) => `Q${String(number).padStart(2, "0")}`;

export default function ShadowQaReview({ intake }: { intake: ReviewIntake }) {
 const [events, setEvents] = useState<QaEvent[]>([]);
 const [manifest, setManifest] = useState<QaManifest>();
 const [loaded, setLoaded] = useState(false);
 const [message, setMessage] = useState("");
 const [busy, setBusy] = useState(false);
 const [selected, setSelected] = useState<number>();
 const [filter, setFilter] = useState("exceptions");
 const [images, setImages] = useState<string[]>([]);
 const [imageError, setImageError] = useState("");
 const [note, setNote] = useState("");
 const [evidence, setEvidence] = useState<QaEvidence>();

 useEffect(() => {
  let active = true;
  Promise.all([listQaEvents(intake.id), readQaManifest(intake)]).then(([history, source]) => {
   if (!active) return;
   setEvents(history);
   setManifest(source);
   setLoaded(true);
  }).catch(error => { if (active) setMessage(`Could not open QA review. ${error.message}`); });
  return () => { active = false; };
 }, [intake]);

 const { run, audited, failed, recorded, notes, batched } = reviewState(events);
 const questions = run?.payload.questions ?? [];
 const sample = run?.payload.sample ?? [];
 const current = questions.find(item => item.number === selected);
 const sameManifest = !!manifest && (!run || manifest.hash === run.payload.manifestHash);
 const version = run?.payload.ruleVersion;
 const currentVersion = sameManifest && (version === shadowQaRuleVersion || !!version?.startsWith(shadowQaRuleVersion + "."));
 const evidenceUsed = !!evidence && events.some(event => event.kind === "run" && event.payload.ruleVersion === evidence.version);
 const canRun = loaded && sameManifest && (!run || !!evidence && !evidenceUsed);
 async function selectEvidence(file: File | undefined) {
  setEvidence(undefined);
  setMessage("");
  if (!file) return;
  try {
   const input = await readQaEvidence(file);
   if (input.pack.manifestHash !== manifest?.hash) throw Error("The evidence pack belongs to a different manifest.");
   setEvidence(input);
  } catch (error) {
   setMessage(error instanceof Error ? error.message : "Invalid QA evidence pack.");
  }
 }

 useEffect(() => {
  setImages([]);
  setImageError("");
  setNote("");
  if (!manifest || !sameManifest || selected === undefined) return;
  let active = true;
  let urls: string[] = [];
  readQaImages(manifest, selected).then(blobs => {
   if (!active) return;
   urls = blobs.map(blob => URL.createObjectURL(blob));
   setImages(urls);
  }).catch(error => { if (active) setImageError(error.message); });
  return () => {
   active = false;
   for (const url of urls) URL.revokeObjectURL(url);
  };
 }, [manifest, sameManifest, selected]);

 async function save(kind: QaEvent["kind"], payload?: QaEvent["payload"]) {
  setBusy(true);
  setMessage("");
  try {
   const result = kind === "run" ? await runShadowQa(intake, evidence) : payload ?? {};
   await recordQaEvent(intake.id, events[events.length - 1]?.id ?? null, kind, result);
   setEvents(await listQaEvents(intake.id));
   setNote("");
   setMessage(kind === "batch" ? "Batch teacher approval recorded." : "Saved.");
  } catch (error) {
   setMessage(error instanceof Error ? error.message : "Could not save QA review.");
   // Refresh the event sequence after a conflicting or uncertain response.
   try { setEvents(await listQaEvents(intake.id)); } catch { /* retain the last loaded view */ }
  } finally { setBusy(false); }
 }

 const pending = (number: number) => {
  const decision = recorded.get(number);
  return !decision || decision === "held";
 };
 const passed = questions.filter(item => item.status === "qa-passed");
 const exceptions = questions.filter(item => (failed || item.status === "exception") && pending(item.number));
 const approved = questions.filter(item => ["approved", "approved-with-changes"].includes(recorded.get(item.number) ?? ""));
 const rejected = questions.filter(item => recorded.get(item.number) === "rejected");
 const sampleComplete = sample.length > 0 && sample.every(item => audited.has(item));
 const filtered = filter === "all" ? questions : filter === "passed" ? passed :
  filter === "audit" ? questions.filter(item => sample.includes(item.number)) : exceptions;
 const canAudit = current && currentVersion && !failed && !batched && sample.includes(current.number) && !audited.has(current.number);
 const canDecide = current && currentVersion && (failed || current.status === "exception");

 return <section aria-label="Shadow paper quality review">
  <h4>Shadow paper quality review</h4>
  <p className="hint">Question suitability and replacement suitability are checked separately. Teacher decisions apply only to this private intake review.</p>
  {loaded && sameManifest && <div className="library-toolbar">
   <label>Reviewed evidence pack (JSON) <input type="file" accept=".json,application/json" disabled={busy}
    onChange={event => void selectEvidence(event.target.files?.[0])} /></label>
   <button type="button" className="secondary" disabled={busy || !canRun}
    onClick={() => void save("run")}>{run ? "Start new QA run" : "Run automated QA"}</button>
  </div>}
  {!run && loaded && <p className="hint">Without a source-bound evidence pack, mathematical and skill checks stay unresolved.</p>}
  {run && canRun && <p>A new evidence version starts a fresh audit. Previous decisions remain in the audit trail.</p>}
  {!loaded && !message && <p role="status">Loading private intake…</p>}
  {busy && <p role="status">Checking or saving private QA evidence…</p>}
  {message && <p role="status">{message}</p>}
  {loaded && !sameManifest && <p role="alert">The staged manifest differs from the reviewed version. Reconcile the intake before recording decisions.</p>}
  {run && <>
   <p>{passed.length} QA passed · {exceptions.length} unresolved · {approved.length} teacher approved · {rejected.length} rejected · {questions.length} questions</p>
   <p className="hint">Rules {run.payload.ruleVersion} · Audit {audited.size} of {sample.length}</p>
   {failed && <p role="alert">Sample audit found a substantive error. Batch approval is blocked. Review the escalated questions individually or rerun with a corrected rule version.</p>}
   <div className="library-toolbar">
    <label>Show questions <select value={filter} onChange={e => { setFilter(e.target.value); setSelected(undefined); }}>
     <option value="exceptions">Unresolved exceptions</option><option value="audit">Audit sample</option>
     <option value="passed">QA passed</option><option value="all">All questions</option>
    </select></label>
    <button type="button" className="primary" disabled={busy || !currentVersion || failed || batched || !sampleComplete}
     onClick={() => void save("batch")}>Approve QA-passed batch ({passed.length})</button>
   </div>
   <ul aria-label="Review questions" className="row" style={{ display: "flex", gap: 8, flexWrap: "wrap", listStyle: "none", padding: 0 }}>
    {filtered.map(item => <li key={item.number}><button type="button" className="secondary small"
     aria-pressed={item.number === selected} onClick={() => setSelected(item.number)}>
     {questionName(item.number)} · {title(recorded.get(item.number) ?? item.status)}
    </button></li>)}
   </ul>
   {filtered.length === 0 && <p>No questions in this view.</p>}
   {current && <div className="panel" style={{ padding: 16 }}>
    <h4>{questionName(current.number)} · {title(recorded.get(current.number) ?? current.status)}</h4>
    {imageError ? <p role="alert">{imageError}</p> : images.length === 0 ? <p role="status">Loading verified draft images…</p> :
     <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 270px), 1fr))", gap: 12, alignItems: "start" }}>
      {images.map((url, index) => <figure key={url} style={{ margin: 0, minWidth: 0 }}>
       <figcaption>{index === 0 ? "Question paper" : "Mark scheme"}</figcaption>
       <img src={url} alt={`${questionName(current.number)} ${index === 0 ? "question paper" : "mark scheme"}`}
        style={{ width: "100%", background: "white" }} />
      </figure>)}
     </div>}
    {manifest?.teacherReview != null && <details><summary>Source QA flags</summary>
     <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(manifest.teacherReview, null, 2)}</pre>
    </details>}
    <dl>
     <dt>Mathematics · {current.mathematics.state}</dt><dd>{current.mathematics.evidence}</dd>
     <dt>Marking · {current.marking.state}</dt><dd>{current.marking.evidence}</dd>
     <dt>Skill · {current.skill.state}</dt><dd>{current.skill.evidence}</dd>
     {current.links.map(link => <div key={link.part}><dt>{link.part} original link · {title(link.kind)}</dt><dd>{link.evidence}</dd></div>)}
     {current.annotation && <><dt>QA annotation</dt><dd>{current.annotation}</dd></>}
     {notes.get(current.number) && <><dt>Latest decision note</dt><dd>{notes.get(current.number)}</dd></>}
    </dl>
    {(canAudit || canDecide) && <>
     <label>{canAudit ? "Audit note" : "Decision and any changes"}<br />
      <textarea value={note} onChange={event => setNote(event.target.value)} maxLength={4000} rows={3} /></label>
     <div className="row" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {canAudit && <>
       <button type="button" className="secondary" disabled={busy || images.length !== 2}
        onClick={() => void save("audit", { number: current.number, outcome: "pass", note })}>Audit passed</button>
       <button type="button" className="secondary" disabled={busy || images.length !== 2 || !note.trim()}
        onClick={() => void save("audit", { number: current.number, outcome: "substantive-error", note })}>Report substantive error</button>
      </>}
      {canDecide && decisions.map(outcome => <button type="button" className="secondary" key={outcome}
       disabled={busy || !note.trim() || (outcome.startsWith("approved") && images.length !== 2)}
       onClick={() => void save("decision", { number: current.number, outcome, note })}>{labels[outcome]}</button>)}
     </div>
    </>}
   </div>}
   <details><summary>Audit trail</summary><ol>
    {events.map(event => <li key={event.id}>
     {event.created_at ? new Date(event.created_at).toLocaleString() : `Event ${event.id}`} · {event.kind}
     {event.actor_id ? ` · ${event.actor_id}` : ""}
     {event.payload.ruleVersion ? ` · ${event.payload.ruleVersion}` : ""}
     {event.payload.number ? ` · ${questionName(event.payload.number)}` : ""}
     {event.payload.outcome ? ` · ${title(event.payload.outcome)}` : ""}
     {event.payload.numbers ? ` · ${event.payload.numbers.length} questions` : ""}
     {event.payload.note ? ` · ${event.payload.note}` : ""}
    </li>)}
   </ol></details>
  </>}
 </section>;
}
