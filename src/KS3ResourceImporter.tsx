import { useState } from "react";
import { inspectSequencesExemplar, makeDrafts, type KS3ImportDraft } from "./ks3PptxImport";
import mapping from "./ks3/curriculum/y7-sequences-v2-reference.json";

const levels = ["Accessible", "Developing", "Challenge"] as const;
const supports = ["None", "Concrete resources", "Visual scaffold", "Guided"] as const;
const reference = mapping.steps;

export default function KS3ResourceImporter() {
  const [drafts, setDrafts] = useState<KS3ImportDraft[]>([]);
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const [allConfirmed, setAllConfirmed] = useState(false);
  const [includeRights, setIncludeRights] = useState(false);
  const current = drafts[active];
  const approved = drafts.filter(x => x.review === "approved");
  const pending = drafts.filter(x => x.review === "needs-review");
  const patch = (data: Partial<KS3ImportDraft>) => setDrafts(rows => rows.map((r, i) => i === active ? { ...r, ...data } : r));
  const inspect = async (file: File) => {
    setBusy(true); setError(""); setDrafts([]); setAllConfirmed(false); setIncludeRights(false);
    try {
      const pairs = await inspectSequencesExemplar(file);
      setSource(file.name); setDrafts(makeDrafts(pairs)); setActive(0);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const download = () => {
    if (!allConfirmed || !includeRights || pending.length || !approved.length) return;
    // Download is LOCAL ONLY. No database insertion, upload or publishing occurs.
    // Text is retained for review, but any third-party text/images must only be
    // redistributed in a way covered by the school's permissions.
    const manifest = {
      schemaVersion: 1, year: 7, unit: "7.1", curriculum: "Department SoL 2026–27 / White Rose V2",
      source, access: "department-internal-review", generatedAt: new Date().toISOString(),
      diagramStatus: "NOT_EXTRACTED_PPTX_SHAPES", items: approved.map(d => ({
        ...d, source: { publisher: "White Rose Maths", questionSlide: d.questionSlide, answerSlide: d.answerSlide },
        contentRights: "third-party-permission-to-be-confirmed", publicationStatus: "draft",
      })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "ks3-y7-sequences-review-drafts.json"; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="panel ks3-importer print-hide">
    <h2>KS3 resource intake — Year 7 Sequences</h2>
    <p>Review-first pilot: read the verified 51-slide exemplar PowerPoint and identify its 25 question/answer pairs. No content is sent to Supabase.</p>
    <label>Upload the Sequences exemplar PowerPoint (.pptx)
      <input type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
        disabled={busy} onChange={e => { const file = e.currentTarget.files?.[0]; if (file) void inspect(file); }} />
    </label>
    {busy && <p role="status">Inspecting the PowerPoint locally…</p>}
    {error && <p role="alert">{error}</p>}
    {!!drafts.length && <>
      <p role="status"><strong>{drafts.length} pairs found</strong> · {approved.length} reviewed and approved · {pending.length} need review · {drafts.filter(x => x.review === "excluded").length} excluded</p>
      <p><strong>Important:</strong> This text-only extraction does not reproduce PowerPoint diagrams, tables, shapes or mathematical positioning reliably. Open the source PowerPoint to visually inspect each question and answer; export full slides as images before any worksheet publication. The suggested step tags need your judgement.</p>
      <div className="filter-grid">
        <label>Question pair<select value={active} onChange={e => setActive(Number(e.target.value))}>
          {drafts.map((d, i) => <option key={d.id} value={i}>Slides {d.questionSlide}–{d.answerSlide}: {d.review}</option>)}
        </select></label>
        <label>Curriculum step<select value={current.stepId} onChange={e => patch({stepId:e.target.value})}>
          {reference.map(s => <option key={s.id} value={s.id}>{s.id} · {s.label}</option>)}
        </select></label>
        <label>Difficulty<select value={current.difficulty} onChange={e => patch({difficulty:e.target.value as KS3ImportDraft["difficulty"]})}>
          {levels.map(v => <option key={v}>{v}</option>)}
        </select></label>
        <label>Support<select value={current.support} onChange={e => patch({support:e.target.value as KS3ImportDraft["support"]})}>
          {supports.map(v => <option key={v}>{v}</option>)}
        </select></label>
        <label>Marks (optional)<input type="number" min={0} max={30} value={current.marks ?? ""} onChange={e => patch({marks:e.target.value === "" ? null : Math.min(30,Math.max(0,Number(e.target.value)))})}/></label>
      </div>
      <div className="ks3-importer-preview">
        <div><h3>Question · slide {current.questionSlide}</h3><pre>{current.questionText || "(No text extracted — inspect slide visually)"}</pre></div>
        <div><h3>Answer · slide {current.answerSlide}</h3><pre>{current.answerText || "(No text extracted — inspect slide visually)"}</pre></div>
      </div>
      <p>Suggested accessibility guidance: {reference.find(s => s.id === current.stepId)?.scaffold}</p>
      <p><strong>White Rose step:</strong> {reference.find(s => s.id === current.stepId)?.attainment === "higher-step" ? "Higher step" : "Core step"}</p>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,margin:"12px 0"}}>
        <button type="button" className="secondary small" onClick={() => patch({review:"approved"})}>Mark reviewed (text + slide checked)</button>
        <button type="button" className="secondary small" onClick={() => patch({review:"excluded"})}>Exclude</button>
        <button type="button" className="secondary small" onClick={() => patch({review:"needs-review"})}>Needs review</button>
        <button type="button" className="secondary small" disabled={active === 0} onClick={() => setActive(x => x - 1)}>Previous</button>
        <button type="button" className="secondary small" disabled={active === drafts.length - 1} onClick={() => setActive(x => x + 1)}>Next</button>
      </div>
      <label style={{display:"block",marginTop:12}}><input type="checkbox" checked={allConfirmed} onChange={e => setAllConfirmed(e.target.checked)}/> I have visually checked all approved question and answer slides against the PowerPoint.</label>
      <label style={{display:"block",marginTop:12}}><input type="checkbox" checked={includeRights} onChange={e => setIncludeRights(e.target.checked)}/> I understand this export is a departmental review draft, not permission to publish third-party content.</label>
      <button type="button" className="primary" disabled={!allConfirmed || !includeRights || !!pending.length || !approved.length} onClick={download}>Download reviewed draft manifest ({approved.length})</button>
      <p>Drafts remain in this browser tab until you leave or reload. A downloaded manifest can be retained securely for the next database-backed intake stage.</p>
    </>}
  </section>;
}
