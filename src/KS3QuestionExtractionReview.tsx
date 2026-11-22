import { useEffect, useState } from "react";
import { useAccountRole } from "./AuthGate";
import { supabase } from "./supabase";
import { extractAllSlides, makeReviewDrafts, type ReviewedDraft } from "./ks3BulkQuestionExtract";

type Source={id:string;unit_code:string;original_filename:string;storage_path:string};
const bucket="ks3-source-private";
const difficulties=["Accessible","Developing","Challenge"] as const;
const supports=["None","Concrete resources","Visual scaffold","Guided"] as const;
const answerStatuses=["source-unverified","missing","teacher-written","teacher-verified"] as const;
const statuses=["needs-review","approved","excluded"] as const;
const topicNames:Record<string,string>={
"7.1":"Sequences","7.2":"Algebraic notation","7.3":"Equality and equivalence",
"7.4":"Place value and ordering","7.5":"FDP equivalence","7.6":"Addition and subtraction",
"7.7":"Multiplication and division","7.8":"Fractions and percentages of amounts",
"7.9":"Directed numbers","7.10":"Addition and subtraction of fractions",
"7.11":"Constructing and measuring","7.12":"Geometric reasoning",
"7.13":"Number sense","7.14":"Sets and probability","7.15":"Prime numbers and proof"
};

export default function KS3QuestionExtractionReview(){
  const owner=useAccountRole()==="owner";
  const [sources,setSources]=useState<Source[]>([]);
  const [sourceId,setSourceId]=useState("");
  const [drafts,setDrafts]=useState<ReviewedDraft[]>([]);
  const [active,setActive]=useState(0);
  const [totalSlides,setTotalSlides]=useState(0);
  const [sourceSlides,setSourceSlides]=useState<string[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const current=drafts[active];
  const source=sources.find(s=>s.id===sourceId);
  useEffect(()=>{
    if(!owner)return;
    let live=true;
    void supabase.from("ks3_source_resources").select("id,unit_code,original_filename,storage_path")
      .eq("year_group",7).eq("resource_type","exemplar").order("unit_code").then(({data,error:err})=>{
        if(!live)return;
        if(err)setError(err.message);
        else{setSources((data||[]) as Source[]);setSourceId(v=>v||(data?.[0]?.id??""))}
      });
    return()=>{live=false};
  },[owner]);
  const patch=(data:Partial<ReviewedDraft>)=>setDrafts(rows=>rows.map((r,i)=>i===active?{...r,...data}:r));
  const extract=async()=>{
    if(!source||busy)return;
    setBusy(true);setError("");setMessage("");setDrafts([]);setSourceSlides([]);setActive(0);
    try{
      const {data,error:downloadError}=await supabase.storage.from(bucket).download(source.storage_path);
      if(downloadError||!data)throw new Error(downloadError?.message||"Cannot download private source");
      const slides=await extractAllSlides(data);
      setTotalSlides(slides.length);
      setSourceSlides(slides);
      const proposals=makeReviewDrafts(slides);
      const {data:existing,error:existingError}=await supabase.from("ks3_extracted_question_drafts")
        .select("source_question_slide,source_answer_slide,question_text,answer_text,step_label,difficulty,support,answer_status,review_status")
        .eq("source_resource_id",source.id);
      if(existingError)throw new Error(existingError.message);
      const saved=new Map((existing||[]).map(r=>[r.source_question_slide,r]));
      setDrafts(proposals.map(p=>{
        const s=saved.get(p.sourceQuestionSlide);
        return s ? {...p,
          answerSlide:s.source_answer_slide,questionText:s.question_text,answerText:s.answer_text,
          stepLabel:s.step_label,difficulty:s.difficulty as ReviewedDraft["difficulty"],
          support:s.support as ReviewedDraft["support"],
          answerStatus:s.answer_status as ReviewedDraft["answerStatus"],
          review:s.review_status as ReviewedDraft["review"]
        }:p;
      }));
      setMessage(`Found ${proposals.length} proposed question records across ${slides.length} slides. Each pairing is UNVERIFIED; check against the original file before approving. Existing saved reviews, if any, have been restored.`);
    }catch(e){setError(e instanceof Error?e.message:String(e))}
    finally{setBusy(false)}
  };
  const save=async()=>{
    if(!source||!drafts.length||busy)return;
    setBusy(true);setError("");setMessage("");
    try{
      const {data:{user},error:authErr}=await supabase.auth.getUser();
      const {data:isOwner,error:roleErr}=await supabase.rpc("is_approved_owner");
      if(!user||authErr||roleErr||isOwner!==true)throw new Error("Approved owner account required.");
      const records=drafts.map(d=>({
        source_resource_id:source.id,owner_id:user.id,year_group:7,unit_code:source.unit_code,
        source_question_slide:d.sourceQuestionSlide,source_answer_slide:d.answerSlide,
        question_text:d.questionText,answer_text:d.answerText,step_label:d.stepLabel,
        difficulty:d.difficulty,support:d.support,answer_status:d.answerStatus,
        review_status:d.review,content_status:"draft",visual_check_required:true
      }));
      // Small sequential batches avoid large single requests.
      for(let i=0;i<records.length;i+=25){
        const {error:saveError}=await supabase.from("ks3_extracted_question_drafts")
          .upsert(records.slice(i,i+25),{onConflict:"source_resource_id,source_question_slide"});
        if(saveError)throw new Error(`Batch ${Math.floor(i/25)+1} failed: ${saveError.message}`);
      }
      setMessage(`Saved ${records.length} private question candidates for ${source.unit_code}. None published. You can return to this topic and continue reviewing.`);
    }catch(e){setError(e instanceof Error?e.message:String(e))}
    finally{setBusy(false)}
  };
  if(!owner)return null;
  return <section className="panel ks3-importer print-hide">
    <h2>Year 7 question extraction and review</h2>
    <p>Read previously stored exemplar PowerPoints. Pairing is tentative: many slides reuse question wording and may include diagrams or answers that text extraction cannot capture. Save as private drafts only; these questions are not yet printable or published.</p>
    <div className="filter-grid">
      <label>Choose topic<select value={sourceId} disabled={busy} onChange={e=>{setSourceId(e.target.value);setDrafts([]);setSourceSlides([]);setMessage("");setError("");}}>
        {sources.map(s=><option key={s.id} value={s.id}>{s.unit_code} — {topicNames[s.unit_code]||s.original_filename}</option>)}
      </select></label>
      <label>Source PowerPoint<output>{source?.original_filename||"No exemplar sources found"}</output></label>
    </div>
    <button type="button" className="secondary" disabled={!source||busy} onClick={()=>void extract()}>{busy?"Working…":"Extract and open question candidates"}</button>
    {!!drafts.length&&<>
      <p><strong>{drafts.length} proposed records</strong> from {totalSlides} slides · {drafts.filter(x=>x.review==="approved").length} teacher-approved · {drafts.filter(x=>x.answerStatus==="missing").length} marked missing answers.</p>
      <p><strong>Review warning:</strong> Slide images, graphs, diagrams and equations may be missing from the extracted text. Open the original PowerPoint to verify every question, its suggested answer and any multiple valid responses.</p>
      <label>Review candidate<select value={active} onChange={e=>setActive(Number(e.target.value))}>
        {drafts.map((d,i)=><option key={d.id} value={i}>Slide {d.sourceQuestionSlide} · {d.review}</option>)}
      </select></label>
      <div className="ks3-importer-preview">
        <div><h3>Candidate question · slide {current.sourceQuestionSlide}</h3><textarea rows={9} value={current.questionText} onChange={e=>patch({questionText:e.target.value,review:"needs-review"})}/></div>
        <div><h3>Suggested answer · slide {current.answerSlide??"none"}</h3><textarea rows={9} value={current.answerText} onChange={e=>patch({answerText:e.target.value,answerStatus:"teacher-written",review:"needs-review"})}/></div>
      </div>
      <div className="filter-grid">
        <label>Answer slide number (blank if none)<input type="number" min={1} max={totalSlides} value={current.answerSlide??""}
          onChange={e=>{const page=e.target.value?Number(e.target.value):null;patch({answerSlide:page,answerText:page?sourceSlides[page-1]||"": "",answerStatus:page?"source-unverified":"missing",review:"needs-review"});}}/></label>
        <label>Curriculum step / learning objective<input value={current.stepLabel} onChange={e=>patch({stepLabel:e.target.value,review:"needs-review"})}/></label>
        <label>Difficulty<select value={current.difficulty} onChange={e=>patch({difficulty:e.target.value as ReviewedDraft["difficulty"]})}>{difficulties.map(v=><option key={v}>{v}</option>)}</select></label>
        <label>Scaffolding<select value={current.support} onChange={e=>patch({support:e.target.value as ReviewedDraft["support"]})}>{supports.map(v=><option key={v}>{v}</option>)}</select></label>
        <label>Answer status<select value={current.answerStatus} onChange={e=>patch({answerStatus:e.target.value as ReviewedDraft["answerStatus"]})}>{answerStatuses.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
        <label>Review status<select value={current.review} onChange={e=>patch({review:e.target.value as ReviewedDraft["review"]})}>{statuses.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
      </div>
      <p>Generated solutions are <strong>not</strong> invented automatically. If the source has no answer, mark it as missing; a teacher can add a worked solution and verify it.</p>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
        <button type="button" className="secondary small" disabled={active===0||busy} onClick={()=>setActive(i=>i-1)}>Previous</button>
        <button type="button" className="secondary small" disabled={active===drafts.length-1||busy} onClick={()=>setActive(i=>i+1)}>Next</button>
        <button type="button" className="secondary small" disabled={busy} onClick={()=>patch({review:"excluded"})}>Exclude candidate</button>
        <button type="button" className="secondary small" disabled={busy||!current.questionText.trim()||!current.stepLabel.trim()||current.stepLabel==="Needs curriculum step review"||current.answerStatus==="source-unverified"||current.answerStatus==="missing"||!current.answerText.trim()} onClick={()=>patch({review:"approved"})}>Approve after visual + solution check</button>
      </div>
      <button type="button" disabled={busy} onClick={()=>void save()}>{busy?"Saving…":`Save ${drafts.length} private review drafts`}</button>
    </>}
    {message&&<p role="status">{message}</p>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}
