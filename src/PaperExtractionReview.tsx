import {publishReviewedPaper} from "./publishReviewedPaper";
import {preparePublication} from "./paperPublication";
import {useEffect,useRef,useState} from "react";
import type {PDFDocumentProxy} from "pdfjs-dist";
import {supabase} from "./supabase";
import {inspectFoundationMap,type MappingRow} from "./EnhancedMappingImporter";
import {loadSourcePdf,readPdfLines,drawSlice} from "./pdfExtraction";
import {validSlice,makeReviewDrafts,findMarkSchemeStartPage,isReviewable,totalMarks,type QuestionDraft,type Slice,type TextLine} from "./paperExtraction";

const bucket="exam-materials-private";
export type StagedSource={path:string;board:string;series:string;code:string;qualification:string};
type SavedReview={version:number;mappingFile:string;markSchemeStartPage?:number;items:{number:number;question:Slice;mark:Slice;approved:boolean;notes:string;questionManuallyAdjusted?:boolean;markManuallyAdjusted?:boolean;overrides?:{id:string;topic:string;strands:string;skills:string}[]}[]};
const cleaned=(s:string)=>s.toUpperCase().replace(/[^A-Z0-9]/g,"");
const safeSlice=(x:Slice|undefined,original:Slice,pageCount:number):Slice=>{
 if(!x||!validSlice(x,pageCount))return original;
 return {...x};
};
function CropPreview({pdf,slice,title}:{pdf:PDFDocumentProxy;slice:Slice;title:string}){
 const ref=useRef<HTMLCanvasElement>(null);const [error,setError]=useState("");
 useEffect(()=>{
  let active=true;
  const render=async()=>{if(!ref.current)return;try{await drawSlice(pdf,slice,ref.current);if(active)setError("")}catch(e){if(active)setError(e instanceof Error?e.message:"Cannot render crop")}};
  void render();return()=>{active=false};
 },[pdf,slice.page,slice.endPage,slice.top,slice.bottom]);
 return <div style={{flex:"1 1 320px",minWidth:0}}><strong>{title}</strong>{error&&<p role="alert">{error}</p>}<div style={{maxHeight:500,overflow:"auto",border:"1px solid #aaa",borderRadius:6,marginTop:8}}><canvas aria-label={title} ref={ref} style={{width:"100%",display:"block"}}/></div></div>;
}
export default function PaperExtractionReview({source,onPublished}:{source:StagedSource;onPublished?:()=>void}){
 const [busy,setBusy]=useState(false),[status,setStatus]=useState("");
 const [questionPdf,setQuestionPdf]=useState<PDFDocumentProxy|null>(null),[schemePdf,setSchemePdf]=useState<PDFDocumentProxy|null>(null);
 const [drafts,setDrafts]=useState<QuestionDraft[]>([]),[selected,setSelected]=useState(0);
 const [mappingFile,setMappingFile]=useState("");
 const [reviewSaved,setReviewSaved]=useState(false);
 const [publishedPaperId,setPublishedPaperId]=useState("");
 const [publishProgress,setPublishProgress]=useState("");
 const [markSchemeStartPage,setMarkSchemeStartPage]=useState<number|null>(null);
 const [autoSchemeStartPage,setAutoSchemeStartPage]=useState<number|null>(null);
 const extracted=useRef<{matches:MappingRow[];questionLines:TextLine[];markLines:TextLine[]}|null>(null);
 const selectedDraft=drafts[selected];
 const update=(fn:(d:QuestionDraft)=>QuestionDraft)=>{
  if(busy||publishedPaperId)return;
  setReviewSaved(false);
  setDrafts(current=>current.map((d,i)=>i===selected?fn({...d,approved:false}):d));
 };
 const updatePart=(id:string,key:"topic"|"strands"|"skills",value:string)=>update(d=>({...d,parts:d.parts.map(p=>p.id===id?{...p,[key]:value}:p)}));
 const adjust=(kind:"question"|"mark",key:keyof Slice,value:number)=>{
  update(d=>({...d,[kind]:{...d[kind],[key]:value},[kind==="question"?"questionManuallyAdjusted":"markManuallyAdjusted"]:true}));
 };
 const recalculateSchemeCrops=()=>{
  if(busy||publishedPaperId)return;
  if(!extracted.current||!schemePdf||markSchemeStartPage===null||!Number.isInteger(markSchemeStartPage)||markSchemeStartPage<1||markSchemeStartPage>schemePdf.numPages)return;
  const {matches,questionLines,markLines}=extracted.current;
  setReviewSaved(false);
  const proposed=makeReviewDrafts(matches,questionLines,markLines,markSchemeStartPage);
  setDrafts(existing=>existing.map(d=>{
   const fresh=proposed.find(p=>p.number===d.number);
   if(!fresh)return d;
   // Keep individually verified work unless it points before the real table starts.
   if(d.approved&&d.mark.page>=markSchemeStartPage)return d;
   return {...d,mark:fresh.mark,markDetected:fresh.markDetected,approved:false};
  }));
  setStatus("Mark-scheme proposals recalculated from PDF page "+markSchemeStartPage+". Check each crop and approve it before publishing.");
 };
 const process=async()=>{
  setReviewSaved(false);setPublishedPaperId("");setPublishProgress("");
  setBusy(true);setStatus("Downloading private PDFs…");setQuestionPdf(null);setSchemePdf(null);setDrafts([]);setSelected(0);setAutoSchemeStartPage(null);setMarkSchemeStartPage(null);extracted.current=null;
  try{
   const {data:{user}}=await supabase.auth.getUser();
   const {data:approved,error:authError}=await supabase.rpc("is_approved_owner");
   if(!user||authError||approved!==true)throw Error("Approved account access required.");
   const [qResponse,mResponse]=await Promise.all([
    supabase.storage.from(bucket).download(source.path+"/question-paper.pdf"),
    supabase.storage.from(bucket).download(source.path+"/mark-scheme.pdf")
   ]);
   if(qResponse.error||mResponse.error||!qResponse.data||!mResponse.data)throw Error("Question paper or mark scheme cannot be downloaded.");
   // PDF.js must not process both documents in parallel: older versions shared page mappings.
   // Read the question paper to completion before starting the mark scheme.
   setStatus("Reading question-paper pages…");
   const qPdf=await loadSourcePdf(qResponse.data);
   const questionLines=await readPdfLines(qPdf,undefined,"Question paper");
   setStatus("Reading mark-scheme pages…");
   const mPdf=await loadSourcePdf(mResponse.data);
   const markLines=await readPdfLines(mPdf,undefined,"Mark scheme");
   setQuestionPdf(qPdf);setSchemePdf(mPdf);
   setStatus("Finding the Enhanced Skills Mapping uploaded to your account…");
   const allFiles:{name:string}[]=[];
   for(let offset=0;;offset+=100){
    const {data,error}=await supabase.storage.from(bucket).list("enhanced-mapping-intake/"+user.id,{limit:100,offset,sortBy:{column:"name",order:"desc"}});
    if(error)throw new Error(error.message);
    allFiles.push(...(data||[]));if(!data||data.length<100)break;
   }
   const {data:old,error:reviewError}=await supabase.storage.from(bucket).download(source.path+"/extraction-review.json");
   if(reviewError&&!/not found|not exist/i.test(reviewError.message))throw Error("Cannot check saved review; preparation stopped to protect existing corrections: "+reviewError.message);
   let previous:SavedReview|undefined;
   if(old){try{previous=JSON.parse(await old.text()) as SavedReview;if(previous.version!==1||!previous.mappingFile||!Array.isArray(previous.items))throw Error("Invalid review")}catch{throw Error("Saved review cannot be read. Original file retained; do not overwrite it.")}}
   let matches:MappingRow[]=[];let sourceName="";
   const xlsx=(allFiles||[]).filter(x=>x.name.toLowerCase().endsWith(".xlsx")&&(!previous||x.name===previous.mappingFile));
   for(const file of xlsx){
    const {data,error}=await supabase.storage.from(bucket).download("enhanced-mapping-intake/"+user.id+"/"+file.name);
    if(error||!data)continue;
    const sheet=await inspectFoundationMap(new File([data],file.name,{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
    const filtered=sheet.rows.filter(r=>cleaned(r.board)===cleaned(source.board)&&cleaned(r.tier)===(source.code.endsWith("F")?"FOUNDATION":"HIGHER")&&cleaned(r.series)===cleaned(source.series)&&cleaned(r.paper)===cleaned(source.code));
    if(filtered.length){matches=filtered;sourceName=file.name;break}
   }
   if(!matches.length)throw Error("No matching mapping spreadsheet found for "+source.series+" "+source.code+". Archive the matching spreadsheet first.");
   const repeated=new Set<string>(),ids=new Set<string>();
   for(const row of matches){if(ids.has(cleaned(row.id)))repeated.add(row.id);ids.add(cleaned(row.id))}
   if(repeated.size)throw Error("Mapping contains repeated IDs for this paper: "+[...repeated].join(", ")+". Resolve them before review.");
   setMappingFile(sourceName);
   setStatus("Matching questions and suggesting crop positions…");
   const detectedStart=findMarkSchemeStartPage(markLines);
   setAutoSchemeStartPage(detectedStart);
   setMarkSchemeStartPage(detectedStart);
   extracted.current={matches,questionLines,markLines};
   let effectiveSchemeStart=detectedStart;
   let prepared=makeReviewDrafts(matches,questionLines,markLines,effectiveSchemeStart);
   if(previous){
      if(typeof previous.markSchemeStartPage==="number"&&Number.isInteger(previous.markSchemeStartPage)&&previous.markSchemeStartPage>=1&&previous.markSchemeStartPage<=mPdf.numPages){
       effectiveSchemeStart=previous.markSchemeStartPage;
       setMarkSchemeStartPage(effectiveSchemeStart);
       prepared=makeReviewDrafts(matches,questionLines,markLines,effectiveSchemeStart);
      }
      for(const d of prepared){
       const prior=previous.items.find(x=>x.number===d.number);
       if(!prior)continue;
       // Older unreviewed drafts stored the missing-question default (cover, 5–95%).
       // Prefer the newly detected source location instead of restoring that stale crop.
       const obsoleteCoverDefault=!d.questionDetected&&d.question.page>1&&
        prior.question?.page===1&&Math.abs((prior.question.top??0)-.05)<.002&&Math.abs((prior.question.bottom??0)-.95)<.002;
       const proposedQuestion={...d.question};
       const restoredQuestion=safeSlice(prior.question,d.question,qPdf.numPages);
       const restoredMark=safeSlice(prior.mark,d.mark,mPdf.numPages);
       const invalidSavedCrop=!prior.question||!validSlice(prior.question,qPdf.numPages)||!prior.mark||!validSlice(prior.mark,mPdf.numPages);
       if(!obsoleteCoverDefault)d.question=restoredQuestion;
       d.questionManuallyAdjusted=!obsoleteCoverDefault&&(prior.questionManuallyAdjusted===true||
         (prior.question?.page!==proposedQuestion.page||Math.abs((prior.question?.top??proposedQuestion.top)-proposedQuestion.top)>.002||prior.question?.bottom!==proposedQuestion.bottom||prior.question?.endPage!==proposedQuestion.endPage));
       // Older drafts could contain a crop from the numbered guidance (eg PDF page 3).
       // Never restore or keep approval for a page before the detected marking table.
       const invalidPreTable=effectiveSchemeStart!==null&&typeof prior.mark?.page==="number"&&prior.mark.page<effectiveSchemeStart;
       if(!invalidPreTable)d.mark=restoredMark;
       d.markManuallyAdjusted=prior.markManuallyAdjusted===true;
       d.notes=typeof prior.notes==="string"?prior.notes:"";
       if(Array.isArray(prior.overrides))d.parts=d.parts.map(original=>{const edit=prior.overrides?.find(x=>x.id===original.id);return edit?{...original,topic:typeof edit.topic==="string"?edit.topic:original.topic,strands:typeof edit.strands==="string"?edit.strands:original.strands,skills:typeof edit.skills==="string"?edit.skills:original.skills}:original});
       d.approved=prior.approved===true&&!invalidSavedCrop&&!invalidPreTable&&!obsoleteCoverDefault&&isReviewable(d,qPdf.numPages,mPdf.numPages);
      }
      setReviewSaved(true);
   }
   setDrafts(prepared);setSelected(Math.max(0,prepared.findIndex(d=>!d.approved)));
   setStatus(`Prepared ${prepared.length} complete questions from ${matches.length} mapped parts (${totalMarks(prepared)} marks). Mark-scheme table start: ${effectiveSchemeStart===null?"not automatically identified":`PDF page ${effectiveSchemeStart}`}. ${prepared.filter(x=>x.questionInferred).length} missing question-number positions inferred from printed total-mark lines. Check each crop before approval.`);
  }catch(e){setStatus(e instanceof Error?e.message:"Preparation failed.");}
  finally{setBusy(false)}
 };
 const save=async()=>{
  if(!drafts.length)return;setBusy(true);
  try{
   const {data:{user}}=await supabase.auth.getUser();const {data:approved}=await supabase.rpc("is_approved_owner");
   if(!user||approved!==true)throw Error("Approved account required.");
   const payload:SavedReview={version:1,mappingFile,markSchemeStartPage:markSchemeStartPage??undefined,items:drafts.map(d=>({number:d.number,question:d.question,mark:d.mark,approved:d.approved,notes:d.notes,questionManuallyAdjusted:d.questionManuallyAdjusted,markManuallyAdjusted:d.markManuallyAdjusted,overrides:d.parts.map(p=>({id:p.id,topic:p.topic,strands:p.strands,skills:p.skills}))}))};
   const {error}=await supabase.storage.from(bucket).upload(source.path+"/extraction-review.json",new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),{upsert:true,contentType:"application/json"});
   if(error)throw Error(error.message);
   setReviewSaved(true);
   setStatus(`Review progress saved privately: ${drafts.filter(d=>d.approved).length}/${drafts.length} complete questions approved. No live questions were changed.`);
  }catch(e){setStatus(e instanceof Error?e.message:"Could not save review progress.")}
  finally{setBusy(false)}
 };
 const publish=async()=>{
  if(busy||!reviewSaved||!questionPdf||!schemePdf||publishedPaperId)return;
  let summary:{questions:number;parts:number;marks:number};
  try{summary=preparePublication(drafts);}catch(e){setStatus(e instanceof Error?e.message:"Review is incomplete.");return}
  if(!window.confirm("Publish "+source.board+" "+source.series.replace(/-/g," ")+" "+source.code+
    " to the private Question Bank?\\n\\n"+summary.questions+" complete questions, "+summary.parts+" mapped parts, "+
    summary.marks+" marks.\\n\\nThis creates searchable records and cannot be undone here. The original review will be kept."))return;
  setBusy(true);setPublishProgress("Preparing publication…");
  try{
   const paperId=await publishReviewedPaper({source,drafts,questionPdf,schemePdf,mappingFile,progress:message=>{setStatus(message);setPublishProgress(message)}});
   setPublishedPaperId(paperId);
   setPublishProgress("Publication complete.");
   setStatus("Published successfully: "+summary.questions+" complete questions / "+summary.parts+
     " mapped parts / "+summary.marks+" marks. Open the Question Bank to see the Foundation questions.");
   onPublished?.();
  }catch(error){const message=error instanceof Error?error.message:"Publishing failed; no database records were changed.";setStatus(message);setPublishProgress(message)}
  finally{setBusy(false)}
 };
 const select=(i:number)=>setSelected(i);
 const approveAndNext=()=>{
  if(busy||publishedPaperId||!selectedDraft||!questionPdf||!schemePdf||
     !isReviewable(selectedDraft,questionPdf.numPages,schemePdf.numPages))return;
  setReviewSaved(false);
  setDrafts(current=>current.map((d,i)=>i===selected?{...d,approved:true}:d));
  if(selected<drafts.length-1)setSelected(selected+1);
  else setStatus("Final question checked. Save review progress to your account when ready.");
 };
 const revokeApproval=()=>{
  if(busy||publishedPaperId)return;
  setReviewSaved(false);
  setDrafts(current=>current.map((d,i)=>i===selected?{...d,approved:false}:d));
 };
 return <section className="panel" style={{marginTop:14,padding:18}}>
 <h3>Extract & match — {source.series} {source.code}</h3>
 <p className="hint">This works with complete question groups: multipart answers remain together. Auto-detected PDF crops are proposals only; check the images and scheme before approval.</p>
 <button className="primary" disabled={busy} onClick={()=>void process()}>{busy?"Preparing…":drafts.length?"Reload source and mapping":"Prepare question review"}</button>
 {status&&<p role="status">{status}</p>}
 {drafts.length>0&&questionPdf&&schemePdf&&<>
 <p><strong>{drafts.filter(x=>x.approved).length}/{drafts.length}</strong> complete questions approved · <strong>{drafts.flatMap(x=>x.parts).length}</strong> parts · <strong>{totalMarks(drafts)}</strong> marks · Mapping: {mappingFile}</p>
 <div className="library-toolbar" style={{alignItems:"end",flexWrap:"wrap"}}>
 <label>First marking-table page (PDF page)
 <input aria-label="First marking-table page" type="number" min="1" max={schemePdf.numPages} value={markSchemeStartPage??""} placeholder="Select page" onChange={e=>setMarkSchemeStartPage(e.target.value===""?null:Number(e.target.value))}/>
 </label>
 <button className="secondary small" disabled={busy||markSchemeStartPage===null||!Number.isInteger(markSchemeStartPage)||markSchemeStartPage<1||markSchemeStartPage>schemePdf.numPages} onClick={recalculateSchemeCrops}>Re-detect scheme crops</button>
 <span className="hint">{autoSchemeStartPage===null?"No marking-table header identified. Select the first real answer page and re-detect.":`Marking-table header detected on PDF page ${autoSchemeStartPage} (not the examiner guidance pages).`}</span>
 </div>
 <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
 {drafts.map((d,i)=><button key={d.number} className={i===selected?"primary small":"secondary small"} onClick={()=>select(i)} aria-pressed={i===selected}>{d.approved?"✓ ":""}Q{d.number}</button>)}
 </div>
 {selectedDraft&&<div>
 <h3>Q{selectedDraft.number} · {selectedDraft.parts.length} part(s) · {selectedDraft.parts.reduce((n,p)=>n+p.marks,0)} marks</h3>
 <p className="hint">Parts: {selectedDraft.parts.map(x=>x.question).join(", ")} · Topics: {[...new Set(selectedDraft.parts.flatMap(x=>x.strands.split(/[;,]/).map(y=>y.trim()).filter(Boolean)))].join(", ")}</p>
 <p className="hint">Question location: {selectedDraft.questionDetected?"Detected from question number":selectedDraft.questionInferred?"Inferred from the printed Total for Question line — check crop":selectedDraft.questionManuallyAdjusted?"Adjusted manually":"Not detected — estimated nearby page, adjust crop manually"}. Mark scheme location: {selectedDraft.markDetected?"Suggested by PDF text":selectedDraft.markManuallyAdjusted?"Adjusted manually":"Not detected — adjust crop manually"}.</p>
 <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
 {(["question","mark"] as const).map(kind=><fieldset key={kind} style={{flex:"1 1 320px",minWidth:0}}>
 <legend>{kind==="question"?"Question paper crop":"Mark scheme crop"}</legend>
 <div className="library-toolbar" style={{flexWrap:"wrap"}}>
 <label>Page<input aria-label={kind+" page"} type="number" min="1" max={kind==="question"?questionPdf.numPages:schemePdf.numPages} value={selectedDraft[kind].page} onChange={e=>adjust(kind,"page",Number(e.target.value))}/></label>
 <label>End page<input aria-label={kind+" end page"} type="number" min={selectedDraft[kind].page} max={kind==="question"?questionPdf.numPages:schemePdf.numPages} value={selectedDraft[kind].endPage??selectedDraft[kind].page} onChange={e=>adjust(kind,"endPage",Number(e.target.value))}/></label>
 <label>Top %<input aria-label={kind+" top"} type="number" min="0" max="100" step=".5" value={Math.round(selectedDraft[kind].top*1000)/10} onChange={e=>adjust(kind,"top",Number(e.target.value)/100)}/></label>
 <label>Bottom %<input aria-label={kind+" bottom"} type="number" min="0" max="100" step=".5" value={Math.round(selectedDraft[kind].bottom*1000)/10} onChange={e=>adjust(kind,"bottom",Number(e.target.value)/100)}/></label>
 </div>
 {validSlice(selectedDraft[kind],kind==="question"?questionPdf.numPages:schemePdf.numPages)
 &&<CropPreview pdf={kind==="question"?questionPdf:schemePdf} slice={selectedDraft[kind]} title={kind==="question"?"Question image":"Mark-scheme image"}/>}
 </fieldset>)}
 </div>
 <label>Review notes<textarea value={selectedDraft.notes} onChange={e=>update(d=>({...d,notes:e.target.value}))} rows={2} placeholder="Record image, answer or tag corrections needed"/></label>
 <p className="hint">Topic and skill fields can be corrected here; the original Pearson spreadsheet remains unchanged. Recheck both images after any edit.</p><div style={{overflowX:"auto"}}><table><thead><tr><th>Part</th><th>Marks</th><th>AO</th><th>Primary topic</th><th>All topics</th><th>Searchable skills</th><th>Grade 1–9 success (%)</th><th>Mapping review</th></tr></thead><tbody>{selectedDraft.parts.map(x=><tr key={x.id}><td>{x.question}</td><td>{x.marks}</td><td>{x.ao}</td><td><input aria-label={x.question+" primary topic"} value={x.topic} onChange={e=>updatePart(x.id,"topic",e.target.value)}/></td><td><input aria-label={x.question+" all topics"} value={x.strands} onChange={e=>updatePart(x.id,"strands",e.target.value)}/></td><td><input aria-label={x.question+" searchable skills"} value={x.skills} onChange={e=>updatePart(x.id,"skills",e.target.value)}/></td><td>{[1,2,3,4,5,6,7,8,9].map(g=>x.gradePercent[g]??"–").join(" / ")}</td><td>{x.review}</td></tr>)}</tbody></table></div>
 <p className="hint">Approve each complete question only after checking the question crop, mark scheme, parts and topic tags. One tap approves it and opens the next question. Any later edit removes its approval.</p>
 <div className="row" style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
 <button className="secondary" disabled={busy||selected===0} onClick={()=>select(selected-1)}>Previous question</button>
 <button className="secondary" disabled={busy||selected===drafts.length-1} onClick={()=>select(selected+1)}>Next without approval</button>
 <button className="primary" disabled={busy||!!publishedPaperId||!isReviewable(selectedDraft,questionPdf.numPages,schemePdf.numPages)} onClick={approveAndNext}>
 {selectedDraft.approved?(selected<drafts.length-1?"Next question":"Q"+selectedDraft.number+" approved"):(selected<drafts.length-1?"Approve Q"+selectedDraft.number+" & Next":"Approve Q"+selectedDraft.number)}
 </button>
 {selectedDraft.approved&&<button className="secondary" disabled={busy} onClick={revokeApproval}>Undo approval</button>}
 <span className="hint">{selectedDraft.approved?"Approved":selectedDraft.questionDetected&&selectedDraft.markDetected?"Ready for your review":"Check and adjust the proposed crops"}</span>
 </div>
 </div>}
 <div className="row" style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:16}}><button className="primary" disabled={busy} onClick={()=>void save()}>Save review progress to account</button></div>
 <section className="panel" style={{marginTop:18,padding:15}}>
 <h3>Publish Approved Paper</h3>
 <p className="hint">Publishes approved question and mark-scheme images to your private, account-protected question bank. This does not grant permission to distribute copyrighted papers publicly.</p>
 <p>{drafts.filter(d=>d.approved).length}/{drafts.length} questions approved · {drafts.flatMap(d=>d.parts).length} parts · {totalMarks(drafts)} marks</p>
 {publishedPaperId?<p role="status"><strong>Paper published successfully.</strong> You can now open the Enhanced Skills Mapped Question Bank.</p>:
 <><button className="primary" disabled={busy||!reviewSaved||drafts.some(d=>!d.approved)||totalMarks(drafts)!==80} onClick={()=>void publish()}>{busy?"Publishing reviewed images…":"Publish Approved Paper"}</button>
 {publishProgress&&<p role="status">{publishProgress}</p>}
 {!reviewSaved&&<p className="hint">Save review progress to account before publishing.</p>}
 {drafts.some(d=>!d.approved)&&<p className="hint">All complete questions must be approved.</p>}</>}
 </section>
 <p className="hint">Your original exam PDFs, mapping spreadsheet and saved review are retained. Publishing does not alter existing question records.</p>
 </>}
 </section>;
}
