import {useEffect,useState} from "react";
import {supabase} from "./supabase";

const BUCKET="exam-materials-private";
const MAX_BYTES=30*1024*1024;
type OriginalPaper={id:string;exam_board:string;qualification:string;series:string;tier:string|null;paper_code:string};
type ShadowIntake={id:string;original_paper_id:string;shadow_set:string;question_source_path:string;mark_scheme_source_path:string;question_format:string;mark_scheme_format:string;status:string};
type Format="pdf"|"docx"|"doc";
const slug=(s:string)=>s.trim().toLowerCase().replace(/[^a-z0-9-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,60);
const format=(file:File|null):Format|null=>{
 if(!file)return null;
 const ext=file.name.split(".").pop()?.toLowerCase();
 return ext==="pdf"||ext==="docx"||ext==="doc"?ext:null;
};
async function validSource(file:File|null):Promise<boolean>{
 if(!file||file.size<8||file.size>MAX_BYTES)return false;
 const ext=format(file);
 if(!ext)return false;
 const header=new Uint8Array(await file.slice(0,8).arrayBuffer());
 if(ext==="pdf")return String.fromCharCode(...header.slice(0,5))==="%PDF-";
 if(ext==="docx")return header[0]===0x50&&header[1]===0x4b&&header[2]===3&&header[3]===4;
 return [0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1].every((n,i)=>header[i]===n);
}
export default function ShadowPaperImporter(){
 const [originals,setOriginals]=useState<OriginalPaper[]>([]);
 const [existing,setExisting]=useState<ShadowIntake[]>([]);
 const [originalId,setOriginalId]=useState("");
 const [shadowSet,setShadowSet]=useState("Set 1");
 const [questionFile,setQuestionFile]=useState<File|null>(null);
 const [markFile,setMarkFile]=useState<File|null>(null);
 const [busy,setBusy]=useState(false);
 const [ready,setReady]=useState(false);
 const [message,setMessage]=useState("");
 const refresh=async()=>{
  const {data:{user},error:authError}=await supabase.auth.getUser();
  const {data:owner,error:ownerError}=await supabase.rpc("is_approved_owner");
  if(authError||!user||ownerError||owner!==true)throw Error("Only an approved owner can stage shadow resources.");
  const [papers,intakes]=await Promise.all([
   supabase.from("exam_papers").select("id,exam_board,qualification,series,tier,paper_code").order("series",{ascending:false}).order("paper_code"),
   supabase.from("shadow_papers").select("id,original_paper_id,shadow_set,question_source_path,mark_scheme_source_path,question_format,mark_scheme_format,status").order("created_at",{ascending:false})
  ]);
  if(papers.error||intakes.error)throw Error(papers.error?.message||intakes.error?.message);
  const available=(papers.data||[]) as OriginalPaper[];
  setOriginals(available);
  setOriginalId(current=>current||available[0]?.id||"");
  setExisting((intakes.data||[]) as ShadowIntake[]);
 };
 useEffect(()=>{void refresh().catch(e=>setMessage(e instanceof Error?e.message:String(e)))},[]);
 const selected=originals.find(p=>p.id===originalId);
 const label=(p:OriginalPaper)=>[p.exam_board,p.series,p.tier||"Unspecified",p.paper_code].join(" · ");
 const check=async()=>{
  setBusy(true);setReady(false);setMessage("");
  try{
   if(!selected)throw Error("Select an existing original exam paper.");
   if(!/^Set [A-Za-z0-9-]{1,12}$/i.test(shadowSet.trim()))throw Error('Use a set name such as "Set 1" or "Set A".');
   if(!await validSource(questionFile)||!await validSource(markFile))
    throw Error("Choose original PDF, DOCX or DOC question and mark-scheme files (30 MB maximum each).");
   const {data,error}=await supabase.from("shadow_papers").select("id").eq("original_paper_id",selected.id).ilike("shadow_set",shadowSet.trim()).limit(1);
   if(error)throw Error(error.message);
   if(data?.length)throw Error("That shadow set is already archived. Do not upload a duplicate.");
   setReady(true);
   setMessage("Ready to archive. Source files remain private; no shadow questions will be published.");
  }catch(e){setMessage(e instanceof Error?e.message:String(e))}
  finally{setBusy(false)}
 };
 const archive=async()=>{
  if(!ready||!selected||!questionFile||!markFile)return;
  setBusy(true);setReady(false);
  try{
   if(!await validSource(questionFile)||!await validSource(markFile))throw Error("Files changed or failed validation.");
   const {data:{user},error:authError}=await supabase.auth.getUser();
   const {data:owner,error:ownerError}=await supabase.rpc("is_approved_owner");
   if(authError||!user||ownerError||owner!==true)throw Error("An approved owner session is required.");
   const set=shadowSet.trim();
   const {data:duplicate,error:dupeError}=await supabase.from("shadow_papers").select("id").eq("original_paper_id",selected.id).ilike("shadow_set",set).limit(1);
   if(dupeError||duplicate?.length)throw Error(dupeError?.message||"Shadow set already registered.");
   const folder="shadow-paper-intake/"+selected.id+"/"+slug(set)+"/"+user.id+"/";
   const qp=folder+"question-paper."+format(questionFile);
   const ms=folder+"mark-scheme."+format(markFile);
   const manifestPath=folder+"intake.json";
   for(const [path,file] of [[qp,questionFile],[ms,markFile]] as const){
    setMessage("Archiving "+file.name+"…");
    const ext=format(file);
    const contentType=ext==="pdf"?"application/pdf":ext==="docx"?"application/vnd.openxmlformats-officedocument.wordprocessingml.document":"application/msword";
    const {error}=await supabase.storage.from(BUCKET).upload(path,file,{contentType,upsert:false});
    if(error)throw Error("Could not archive "+file.name+": "+error.message+". Previously uploaded sources were not overwritten.");
   }
   const conversionRequired=format(questionFile)!=="pdf"||format(markFile)!=="pdf";
   const status=conversionRequired?"awaiting-conversion":"awaiting-review";
   const manifest={kind:"official-shadow",original_paper_id:selected.id,exam_board:selected.exam_board,qualification:selected.qualification,series:selected.series,tier:selected.tier,paper_code:selected.paper_code,shadow_set:set,question_source_path:qp,mark_scheme_source_path:ms,question_format:format(questionFile),mark_scheme_format:format(markFile),status,uploaded_at:new Date().toISOString()};
   const {error:manifestError}=await supabase.storage.from(BUCKET).upload(manifestPath,new Blob([JSON.stringify(manifest,null,2)],{type:"application/json"}),{contentType:"application/json",upsert:false});
   if(manifestError)throw Error("Source files archived but manifest could not be saved: "+manifestError.message);
   const {error:insertError}=await supabase.from("shadow_papers").insert({original_paper_id:selected.id,shadow_set:set,question_source_path:qp,mark_scheme_source_path:ms,question_format:format(questionFile),mark_scheme_format:format(markFile),intake_manifest_path:manifestPath,status,uploaded_by:user.id});
   if(insertError)throw Error("Source files archived, but registration failed: "+insertError.message+". Reconcile the existing intake; do not overwrite sources.");
   setMessage(conversionRequired?"Archived privately. One or more Word sources need conversion and visual checking before cropping.":"Archived privately. Ready for Codex extraction, crop review and original-question matching.");
   setQuestionFile(null);setMarkFile(null);
   await refresh();
  }catch(e){setMessage(e instanceof Error?e.message:String(e))}
  finally{setBusy(false)}
 };
 const view=async(path:string)=>{
  try{
   const {data,error}=await supabase.storage.from(BUCKET).createSignedUrl(path,120);
   if(error||!data?.signedUrl)throw Error(error?.message||"Could not open private file.");
   window.open(data.signedUrl,"_blank","noopener,noreferrer");
  }catch(e){setMessage(e instanceof Error?e.message:String(e))}
 };
 return <section className="panel" style={{padding:22}}>
  <h2>Import Official Shadow Papers</h2>
  <p className="hint">Upload Pearson shadow source files against a published original paper. PDF, DOCX and DOC files can be mixed. Word sources are archived for subsequent conversion to PDF by Codex; no browser-based Word rendering or automatic publication is attempted.</p>
  <div className="library-toolbar">
   <label>Original exam paper<select aria-label="Original exam paper for shadow" value={originalId} disabled={busy} onChange={e=>{setOriginalId(e.target.value);setReady(false)}}>{originals.map(p=><option key={p.id} value={p.id}>{label(p)}</option>)}</select></label>
   <label>Shadow set<input aria-label="Shadow set name" value={shadowSet} disabled={busy} onChange={e=>{setShadowSet(e.target.value);setReady(false)}} placeholder="Set 1"/></label>
  </div>
  <div className="library-toolbar">
   <label>Shadow question paper<input aria-label="Shadow question paper file" type="file" accept=".pdf,.docx,.doc" disabled={busy} onChange={e=>{setQuestionFile(e.target.files?.[0]||null);setReady(false)}}/></label>
   <label>Shadow mark scheme<input aria-label="Shadow mark scheme file" type="file" accept=".pdf,.docx,.doc" disabled={busy} onChange={e=>{setMarkFile(e.target.files?.[0]||null);setReady(false)}}/></label>
  </div>
  <div className="row" style={{display:"flex",gap:12,flexWrap:"wrap"}}>
   <button className="secondary" disabled={busy||!questionFile||!markFile} onClick={()=>void check()}>Check shadow files</button>
   <button className="primary" disabled={busy||!ready} onClick={()=>void archive()}>{busy?"Working…":"Archive shadow sources"}</button>
  </div>
  {message&&<p role="status">{message}</p>}
  <h3 style={{marginTop:22}}>Archived shadow sets</h3>
  {existing.length===0?<p className="hint">No shadow sets archived yet.</p>:existing.map(item=>{
   const paper=originals.find(p=>p.id===item.original_paper_id);
   return <div className="saved-item" key={item.id}>
    <div><strong>{paper?label(paper):"Original paper"} · {item.shadow_set}</strong>
     <p>{item.status.replace(/-/g," ")} · Questions: {item.question_format.toUpperCase()} · Mark scheme: {item.mark_scheme_format.toUpperCase()}</p>
    </div>
    <div className="library-actions">
     <button className="secondary small" onClick={()=>void view(item.question_source_path)}>View source QP</button>
     <button className="secondary small" onClick={()=>void view(item.mark_scheme_source_path)}>View source MS</button>
    </div>
   </div>
  })}
 </section>;
}
