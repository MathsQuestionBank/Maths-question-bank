import { useEffect, useRef, useState } from "react";
import { useAccountRole } from "./AuthGate";
import { supabase } from "./supabase";
import { inspectSequencesExemplar, makeDrafts, type KS3ImportDraft } from "./ks3PptxImport";
import { loadSlidePdf, releaseSlidePair, renderSlidePair, type SlidesPdf, type SlideImages } from "./ks3SlideImages";
import mapping from "./ks3/curriculum/y7-sequences-v2-reference.json";

const levels = ["Accessible", "Developing", "Challenge"] as const;
const supports = ["None", "Concrete resources", "Visual scaffold", "Guided"] as const;
const reference = mapping.steps;
const bucket = "ks3-intake-private";
const maxImageBytes = 6 * 1024 * 1024;

export default function KS3ResourceImporter() {
  const isOwner = useAccountRole() === "owner";
  const [drafts, setDrafts] = useState<KS3ImportDraft[]>([]);
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [visualConfirmed, setVisualConfirmed] = useState(false);
  const [pdf, setPdf] = useState<SlidesPdf | null>(null);
  const [pair, setPair] = useState<SlideImages | null>(null);
  const [renderBusy, setRenderBusy] = useState(false);
  const [renderError, setRenderError] = useState("");
  const [saving, setSaving] = useState(false);
  const pdfRef = useRef<SlidesPdf | null>(null);
  const renderToken = useRef(0);
  const current = drafts[active];
  const approved = drafts.filter(x => x.review === "approved");
  const pending = drafts.filter(x => x.review === "needs-review");
  const patch = (data: Partial<KS3ImportDraft>) => setDrafts(rows => rows.map((r, i) => i === active ? { ...r, ...data } : r));
  const clearPdf = () => { renderToken.current++; setPdf(null); setPair(null); pdfRef.current?.destroy().catch(() => undefined); pdfRef.current = null; };
  useEffect(() => () => {
    renderToken.current++;
    pdfRef.current?.destroy().catch(() => undefined);
  }, []);
  const inspect = async (file: File) => {
    setBusy(true); setError(""); setNotice(""); setDrafts([]); clearPdf();
    setVisualConfirmed(false); setRightsConfirmed(false);
    try {
      const pairs = await inspectSequencesExemplar(file);
      setSource(file.name); setDrafts(makeDrafts(pairs)); setActive(0);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const loadPdf = async (file: File) => {
    setBusy(true); setError(""); setVisualConfirmed(false); clearPdf();
    try {
      const parsed = await loadSlidePdf(file);
      pdfRef.current = parsed; setPdf(parsed); setNotice("Slide PDF loaded. Inspect every pair against the original PowerPoint before approving.");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    const token = ++renderToken.current;
    if (!pdf || !current) { setPair(null); return; }
    let next: SlideImages | null = null;
    setRenderBusy(true); setRenderError(""); setPair(null);
    void renderSlidePair(pdf, current.questionSlide, current.answerSlide).then(result => {
      next = result;
      if (token === renderToken.current) setPair(result);
      else releaseSlidePair(result);
    }).catch(e => { if (token === renderToken.current) setRenderError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (token === renderToken.current) setRenderBusy(false); });
    return () => {
      if (token !== renderToken.current) return;
      // URLs are released after the preview unmounts; the selected pair will be rebuilt on change.
      if (next) window.setTimeout(() => releaseSlidePair(next), 0);
    };
  }, [pdf, current?.questionSlide, current?.answerSlide]);
  const download = () => {
    if (!rightsConfirmed || !visualConfirmed || pending.length || !approved.length || !pdf) return;
    const manifest = {
      schemaVersion: 2, year: 7, unit: "7.1", curriculum: "Department SoL 2026–27 / White Rose V2",
      source, access: "department-internal-review", generatedAt: new Date().toISOString(),
      diagramStatus: "PDF_SLIDE_RENDERING_REQUIRED", items: approved.map(d => ({
        ...d, source: { publisher: "White Rose Maths", questionSlide: d.questionSlide, answerSlide: d.answerSlide },
        contentRights: "school-authorised-third-party-needs-record", publicationStatus: "draft",
      })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "ks3-y7-sequences-review-drafts.json"; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const save = async () => {
    if (!isOwner || !pdf || !rightsConfirmed || !visualConfirmed || pending.length || !approved.length || saving) return;
    setSaving(true); setError(""); setNotice("");
    let stored = 0;
    try {
      const [{ data: { user }, error: authError }, { data: owner, error: ownerError }] = await Promise.all([
        supabase.auth.getUser(), supabase.rpc("is_approved_owner"),
      ]);
      if (!user || authError || ownerError || owner !== true) throw new Error("An approved owner account is required.");
      // Each attempt uses a new batch; never overwrite or modify other stored drafts.
      const batchId = crypto.randomUUID();
      const records = [];
      for (const item of approved) {
        setNotice(`Staging slide pair ${stored + 1} of ${approved.length}…`);
        const images = await renderSlidePair(pdf, item.questionSlide, item.answerSlide);
        try {
          if (images.question.size > maxImageBytes || images.answer.size > maxImageBytes)
            throw new Error(`Slides ${item.questionSlide}–${item.answerSlide} exceed the 6 MB/image bucket limit. Export at a smaller resolution.`);
          const base = `${user.id}/${batchId}/${item.id}`;
          const qPath = `${base}-question.png`, aPath = `${base}-answer.png`;
          const qUpload = await supabase.storage.from(bucket).upload(qPath, images.question, { contentType:"image/png", upsert:false });
          if (qUpload.error) throw new Error(qUpload.error.message);
          const aUpload = await supabase.storage.from(bucket).upload(aPath, images.answer, { contentType:"image/png", upsert:false });
          if (aUpload.error) throw new Error(aUpload.error.message);
          records.push({
            batch_id: batchId, owner_id: user.id, curriculum:"department-2026-27",
            year_group:7, unit_code:"7.1", source_filename:source, source_publisher:"White Rose Maths",
            question_slide:item.questionSlide, answer_slide:item.answerSlide,
            question_text:item.questionText, answer_text:item.answerText,
            step_id:item.stepId, difficulty:item.difficulty, support:item.support, marks:item.marks,
            question_image_path:qPath, answer_image_path:aPath,
            rights_basis:"school-authorised-third-party", publication_status:"staged",
          });
        } finally { releaseSlidePair(images); }
        stored++;
      }
      const { error: insertError } = await supabase.from("ks3_intake_drafts").insert(records);
      if (insertError) throw new Error(`Images uploaded, but metadata staging failed: ${insertError.message}`);
      setNotice(`Saved ${records.length} reviewed pairs to PRIVATE KS3 staging (batch ${batchId}). Nothing is published to the question bank.`);
    } catch (e) {
      setError(`Staging stopped after ${stored} complete image pairs. ${e instanceof Error ? e.message : String(e)}. Some private uploads may need cleanup before retrying.`);
    } finally { setSaving(false); }
  };
  if (!isOwner) return null;
  return <section className="panel ks3-importer print-hide">
    <h2>KS3 resource intake — Year 7 Sequences</h2>
    <p>Owner-only pilot. Supply both the original 51-slide PowerPoint and a PDF exported from that same PowerPoint (File → Export → PDF). Every PDF page must correspond to the same-numbered slide. Full slide images preserve diagrams and mathematical layout.</p>
    <label>1. Original exemplar PowerPoint (.pptx)
      <input type="file" accept=".pptx" disabled={busy || saving} onChange={e => { const file=e.currentTarget.files?.[0]; if (file) void inspect(file); }} />
    </label>
    {!!drafts.length && <label>2. PDF exported from the same PowerPoint (all 51 slides, in order)
      <input type="file" accept="application/pdf,.pdf" disabled={busy || saving} onChange={e => { const file=e.currentTarget.files?.[0]; if (file) void loadPdf(file); }} />
    </label>}
    {busy && <p role="status">Inspecting uploaded resource locally…</p>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!!drafts.length && <>
      <p role="status"><strong>{drafts.length} pairs identified</strong> · {approved.length} approved · {pending.length} need review · {drafts.filter(x => x.review === "excluded").length} excluded</p>
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
      {!pdf && <p role="alert">A matching slide PDF is required before questions can be visually approved or staged.</p>}
      {renderBusy && <p>Rendering complete slide images…</p>}
      {renderError && <p role="alert">{renderError}</p>}
      {pair && <div className="ks3-importer-preview">
        <div><h3>Question · slide {current.questionSlide}</h3><img src={pair.questionUrl} alt={`Full question slide ${current.questionSlide}`} style={{maxWidth:"100%"}}/></div>
        <div><h3>Answer · slide {current.answerSlide}</h3><img src={pair.answerUrl} alt={`Full answer slide ${current.answerSlide}`} style={{maxWidth:"100%"}}/></div>
      </div>}
      <details><summary>Extracted editable text (may omit diagrams and equations)</summary>
        <div className="ks3-importer-preview">
          <div><pre>{current.questionText || "(No text extracted)"}</pre></div>
          <div><pre>{current.answerText || "(No text extracted)"}</pre></div>
        </div>
      </details>
      <p>Suggested scaffold: {reference.find(s => s.id === current.stepId)?.scaffold}</p>
      <p>{reference.find(s => s.id === current.stepId)?.attainment === "higher-step" ? "White Rose Higher step" : "Core step"}</p>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,margin:"12px 0"}}>
        <button type="button" className="secondary small" disabled={!pair || renderBusy || saving} onClick={() => patch({review:"approved"})}>Approve this pair (images checked)</button>
        <button type="button" className="secondary small" disabled={saving} onClick={() => patch({review:"excluded"})}>Exclude</button>
        <button type="button" className="secondary small" disabled={saving} onClick={() => patch({review:"needs-review"})}>Needs review</button>
        <button type="button" className="secondary small" disabled={active === 0 || saving} onClick={() => setActive(x => x - 1)}>Previous</button>
        <button type="button" className="secondary small" disabled={active === drafts.length - 1 || saving} onClick={() => setActive(x => x + 1)}>Next</button>
      </div>
      <label style={{display:"block",marginTop:12}}><input type="checkbox" checked={visualConfirmed} disabled={!pdf || saving} onChange={e => setVisualConfirmed(e.target.checked)}/> I checked that the PDF pages match the PowerPoint slides and all approved pairs were visually reviewed.</label>
      <label style={{display:"block",marginTop:12}}><input type="checkbox" checked={rightsConfirmed} disabled={saving} onChange={e => setRightsConfirmed(e.target.checked)}/> I confirm our school is authorised to store these White Rose materials in this restricted departmental system. Staging does not publish them.</label>
      <div style={{display:"flex",flexWrap:"wrap",gap:10,marginTop:15}}>
        <button type="button" className="secondary" disabled={!pdf || !rightsConfirmed || !visualConfirmed || !!pending.length || !approved.length || saving} onClick={download}>Download review manifest</button>
        <button type="button" className="primary" disabled={!pdf || !rightsConfirmed || !visualConfirmed || !!pending.length || !approved.length || saving} onClick={() => void save()}>{saving ? "Saving to private staging…" : `Save ${approved.length} reviewed pairs to private staging`}</button>
      </div>
      <p>Nothing is published to the teacher question bank. Files remain private and can only be staged by approved owner accounts.</p>
    </>}
  </section>;
}
