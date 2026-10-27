import {useEffect,useRef,useState} from "react";
import type {PDFDocumentProxy} from "pdfjs-dist";
import {supabase} from "./supabase";
import {inspectFoundationMap,type MappingRow} from "./EnhancedMappingImporter";
import {loadSourcePdf,readPdfLines,drawSlice} from "./pdfExtraction";
import {makeReviewDrafts,isReviewable,totalMarks,type QuestionDraft,type Slice} from "./paperExtraction";

const bucket="exam-materials-private";
export type StagedSource={path:string;board:string;series:string;code:string;qualification:string};
type SavedReview={version:number;mappingFile:string;items:{number:number;question:Slice;mark:Slice;approved:boolean;notes:string}[]};
const cleaned=(s:string)=>s.toUpperCase().replace(/[^A-Z0-9]/g,"");
const safeSlice=(x:Slice|undefined,original:Slice,pageCount:number):Slice=>{
 if(!x||!Number.isFinite(Number(x.page))||!Number.isFinite(Number(x.top))||!Number.isFinite(Number(x.bottom)))return original;
 const page=Math.trunc(Number(x.page)),top=Number(x.top),bottom=Number(x.bottom);
 return page>=1&&page<=pageCount&&top>=0&&bottom<=1&&bottom-top>=.025?{page,top,bottom}:original;
};
function CropPreview({pdf,slice,title}:{pdf:PDFDocumentProxy;slice:Slice;title:string}){
 const ref=useRef<HTMLCanvasElement>(null);const [error,setError]=useState("");
 useEffect(()=>{
  let active=true;
  const render=async()=>{if(!ref.current)return;try{await drawSlice(pdf,slice,ref.current);if(active)setError("")}catch(e){if(active)setError(e instanceof Error?e.message:"Cannot render crop")}};
  void render();return()=>{active=false};
 },[pdf,slice.page,slice.top,slice.bottom]);
 return <div style={{flex:"1 1 320px",minWidth:0}}><strong>{title}</strong>{error&&<p role="alert">{error}</p>}<div style={{maxHeight:500,overflow:"auto",border:"1px solid #aaa",borderRadius:6,marginTop:8}}><canvas aria-label={title} ref={ref} style={{width:"100%",display:"block"}}/></div></div>;
}
export default function PaperExtractionReview({source}:{source:StagedSource}){
 const [busy,setBusy]=useState(false),[status,setStatus]=useState("");
 const [questionPdf,setQuestionPdf]=useState<PDFDocumentProxy|null>(null),[schemePdf,setSchemePdf]=useState<PDFDocumentProxy|null>(null);
 const [drafts,setDrafts]=useState<QuestionDraft[]>([]),[selected,setSelected]=useState(0);
 const [mappingFile,setMappingFile]=useState(""),[confirmApproval,setConfirmApproval]=useState(false);
 const selectedDraft=drafts[selected];
 const update=(fn:(d:QuestionDraft)=>QuestionDraft)=>{
  setDrafts(current=>current.map((d,i)=>i===selected?fn({...d,approved:false}):d));setConfirmApproval(false);
 };
 const adjust=(kind:"question"|"mark",key:keyof Slice,value:number)=>{
  update(d=>({...d,[kind]:{...d[kind],[key]:value}}));
 };
 const process=async()=>{
  setBusy(true);setStatus("Downloading private PDFs…");setQuestionPdf(null);setSchemePdf(null);setDrafts([]);setSelected(0);
  try{
   const {data:{user}}=await supabase.auth.getUser();
   const {data:approved,error:authError}=await supabase.rpc("is_approved_owner");
   if(!user||authError||approved!==true)throw Error("Approved account access required.");
   const [qResponse,mResponse]=await Promise.all([
    supabase.storage.from(bucket).download(source.path+"/question-paper.pdf"),
    supabase.storage.from(bucket).download(source.path+"/mark-scheme.pdf")
   ]);
   if(qResponse.error||mResponse.error||!qResponse.data||!mResponse.data)throw Error("Question paper or mark scheme cannot be downloaded.");
   const [qPdf,mPdf]=await Promise.all([loadSourcePdf(qResponse.data),loadSourcePdf(mResponse.data)]);
   setQuestionPdf(qPdf);setSchemePdf(mPdf);
   setStatus("Finding the Enhanced Skills Mapping uploaded to your account…");
   const {data:allFiles,error:fileError}=await supabase.storage.from(bucket).list("enhanced-mapping-intake/"+user.id,{limit:200,sortBy:{column:"created_at",order:"desc"}});
   if(fileError)throw new Error(fileError.message);
   let matches:MappingRow[]=[];let sourceName="";
   const xlsx=(allFiles||[]).filter(x=>x.name.toLowerCase().endsWith(".xlsx"));
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
   setStatus("Reading PDF page text and proposing question and mark-scheme positions…");
   const [questionLines,markLines]=await Promise.all([readPdfLines(qPdf),readPdfLines(mPdf)]);
   const prepared=makeReviewDrafts(matches,questionLines,markLines);
   const {data:old}=await supabase.storage.from(bucket).download(source.path+"/extraction-review.json");
   if(old){
    try{
     const previous=JSON.parse(await old.text()) as SavedReview;
     if(previous.version===1&&previous.mappingFile===sourceName&&Array.isArray(previous.items)){
      for(const d of prepared){
       const prior=previous.items.find(x=>x.number===d.number);
       if(!prior)continue;
       d.question=safeSlice(prior.question,d.question,qPdf.numPages);
       d.mark=safeSlice(prior.mark,d.mark,mPdf.numPages);
       d.notes=typeof prior.notes==="string"?prior.notes.slice(0,1500):"";
       d.approved=prior.approved===true&&isReviewable(d,qPdf.numPages,mPdf.numPages);
      }
     }
    }catch{/* Invalid draft must never block extraction. */}
   }
   setDrafts(prepared);
   setStatus(`Prepared ${prepared.length} complete questions from ${matches.length} mapped parts (${totalMarks(prepared)} marks). Auto-detected ${prepared.filter(x=>x.questionDetected).length} question positions and ${prepared.filter(x=>x.markDetected).length} scheme positions. Every crop must be visually verified before approval.`);
  }catch(e){setStatus(e instanceof Error?e.message:"Preparation failed.");}
  finally{setBusy(false)}
 };
 const save=async()=>{
  if(!drafts.length)return;setBusy(true);
  try{
   const {data:{user}}=await supabase.auth.getUser();const {data:approved}=await supabase.rpc("is_approved_owner");
   if(!user||approved!==true)throw Error("Approved account required.");
   const payload:SavedReview={version:1,mappingFile,items:drafts.map(d=>({number:d.number,question:d.question,mark:d.mark,approved:d.approved,notes:d.notes}))};
   const {error}=await supabase.storage.from(bucket).upload(source.path+"/extraction-review.json",new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),{upsert:true,contentType:"application/json"});
   if(error)throw Error(error.message);
   setStatus(`Review progress saved privately: ${drafts.filter(d=>d.approved).length}/${drafts.length} complete questions approved. No live questions were changed.`);
  }catch(e){setStatus(e instanceof Error?e.message:"Could not save review progress.")}
  finally{setBusy(false)}
 };
 const select=(i:number)=>{setSelected(i);setConfirmApproval(false)};
 return <section className="panel" style={{marginTop:14,padding:18}}>
 <h3>Extract & match — {source.series} {source.code}</h3>
 <p className="hint">This works with complete question groups: multipart answers remain together. Auto-detected PDF crops are proposals only; check the images and scheme before approval.</p>
 <button className="primary" disabled={busy} onClick={()=>void process()}>{busy?"Preparing…":drafts.length?"Reload source and mapping":"Prepare question review"}</button>
 {status&&<p role="status">{status}</p>}
 {drafts.length>0&&questionPdf&&schemePdf&&<>
 <p><strong>{drafts.filter(x=>x.approved).length}/{drafts.length}</strong> complete questions approved · <strong>{drafts.flatMap(x=>x.parts).length}</strong> parts · <strong>{totalMarks(drafts)}</strong> marks · Mapping: {mappingFile}</p>
 <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
 {drafts.map((d,i)=><button key={d.number} className={i===selected?"primary small":"secondary small"} onClick={()=>select(i)} aria-pressed={i===selected}>{d.approved?"✓ ":""}Q{d.number}</button>)}
 </div>
 {selectedDraft&&<div>
 <h3>Q{selectedDraft.number} · {selectedDraft.parts.length} part(s) · {selectedDraft.parts.reduce((n,p)=>n+p.marks,0)} marks</h3>
 <p className="hint">Parts: {selectedDraft.parts.map(x=>x.question).join(", ")} · Topics: {[...new Set(selectedDraft.parts.flatMap(x=>x.strands.split(/[;,]/).map(y=>y.trim()).filter(Boolean)))].join(", ")}</p>
 <p className="hint">Question location: {selectedDraft.questionDetected?"Suggested by PDF text":"Not detected — choose page/crop manually"}. Mark scheme location: {selectedDraft.markDetected?"Suggested by PDF text":"Not detected — choose page/crop manually"}.</p>
 <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
 {(["question","mark"] as const).map(kind=><fieldset key={kind} style={{flex:"1 1 320px",minWidth:0}}>
 <legend>{kind==="question"?"Question paper crop":"Mark scheme crop"}</legend>
 <div className="library-toolbar" style={{flexWrap:"wrap"}}>
 <label>Page<input aria-label={kind+" page"} type="number" min="1" max={kind==="question"?questionPdf.numPages:schemePdf.numPages} value={selectedDraft[kind].page} onChange={e=>adjust(kind,"page",Number(e.target.value))}/></label>
 <label>Top %<input aria-label={kind+" top"} type="number" min="0" max="100" step=".5" value={Math.round(selectedDraft[kind].top*1000)/10} onChange={e=>adjust(kind,"top",Number(e.target.value)/100)}/></label>
 <label>Bottom %<input aria-label={kind+" bottom"} type="number" min="0" max="100" step=".5" value={Math.round(selectedDraft[kind].bottom*1000)/10} onChange={e=>adjust(kind,"bottom",Number(e.target.value)/100)}/></label>
 </div>
 {selectedDraft[kind].page>=1&&selectedDraft[kind].page<=(kind==="question"?questionPdf.numPages:schemePdf.numPages)&&selectedDraft[kind].bottom>selectedDraft[kind].top
 &&<CropPreview pdf={kind==="question"?questionPdf:schemePdf} slice={selectedDraft[kind]} title={kind==="question"?"Question image":"Mark-scheme image"}/>}
 </fieldset>)}
 </div>
 <label>Review notes<textarea value={selectedDraft.notes} onChange={e=>update(d=>({...d,notes:e.target.value}))} rows={2} placeholder="Record image, answer or tag corrections needed"/></label>
 <div style={{overflowX:"auto"}}><table><thead><tr><th>Part</th><th>Marks</th><th>AO</th><th>Primary topic</th><th>All topics</th><th>Grade 1–5 success (%)</th><th>Mapping review</th></tr></thead><tbody>{selectedDraft.parts.map(x=><tr key={x.id}><td>{x.question}</td><td>{x.marks}</td><td>{x.ao}</td><td>{x.topic}</td><td>{x.strands}</td><td>{[1,2,3,4,5].map(g=>x.gradePercent[g]??"–").join(" / ")}</td><td>{x.review}</td></tr>)}</tbody></table></div>
 <label><input type="checkbox" checked={confirmApproval} onChange={e=>setConfirmApproval(e.target.checked)}/> I have checked both crops, all parts, the mark scheme and any suggested topic tags.</label>
 <button className="secondary" disabled={!confirmApproval||!isReviewable(selectedDraft,questionPdf.numPages,schemePdf.numPages)} onClick={()=>{setDrafts(current=>current.map((x,i)=>i===selected?{...x,approved:true}:x));setConfirmApproval(false)}}>Approve Q{selectedDraft.number}</button>
 </div>}
 <div className="row" style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:16}}><button className="primary" disabled={busy} onClick={()=>void save()}>Save review progress to account</button></div>
 <p className="hint">Approvals are saved as private review drafts. They do not publish exam questions. Source files and existing assessments are unchanged.</p>
 </>}
 </section>;
}
