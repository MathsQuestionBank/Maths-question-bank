import {useEffect,useRef,useState} from "react";
import {useAccountRole} from "./AuthGate";
import {supabase} from "./supabase";
import {AUDIT_BATCH_LIMIT,createMultipartAuditZip,loadAuditPaper,loadAuditPapers,requireAuditOwner,type AuditGroup,type AuditPaper} from "./multipartAuditExport";

export default function MultipartAuditExporter() {
 return useAccountRole()==="owner"?<OwnerAuditExporter/>:null;
}
function OwnerAuditExporter() {
 const [papers,setPapers]=useState<AuditPaper[]>([]),[paperId,setPaperId]=useState("");
 const [groups,setGroups]=useState<AuditGroup[]>([]),[selected,setSelected]=useState<number[]>([]);
 const [papersLoading,setPapersLoading]=useState(true),[groupsLoading,setGroupsLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const loading=papersLoading||groupsLoading;
 const [status,setStatus]=useState(""),[retry,setRetry]=useState(0);
 const exporting=useRef<AbortController|null>(null);
 useEffect(()=>{
  const controller=new AbortController();setPapersLoading(true);setError("");
  void loadAuditPapers(controller.signal).then(data=>{if(!controller.signal.aborted)setPapers(data)}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Could not load papers.")}).finally(()=>{if(!controller.signal.aborted)setPapersLoading(false)});
  return()=>controller.abort();
 },[retry]);
 useEffect(()=>{
  const controller=new AbortController();setGroups([]);setSelected([]);setStatus("");setError("");
  setGroupsLoading(!!paperId);
  if(paperId){void loadAuditPaper(paperId,controller.signal).then(({groups})=>{if(!controller.signal.aborted)setGroups(groups)}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Could not load question parts.")}).finally(()=>{if(!controller.signal.aborted)setGroupsLoading(false)})}
  return()=>controller.abort();
 },[paperId,retry]);
 useEffect(()=>{
  const {data:{subscription}}=supabase.auth.onAuthStateChange((event)=>{if(event==="SIGNED_OUT")exporting.current?.abort()});
  return()=>{exporting.current?.abort();subscription.unsubscribe()};
 },[]);
 const download=async()=>{
  const controller=new AbortController();exporting.current=controller;setBusy(true);setError("");setStatus("");
  try {
   const result=await createMultipartAuditZip(paperId,selected,{signal:controller.signal,onProgress:message=>{if(!controller.signal.aborted)setStatus(message)}});
   await requireAuditOwner(result.ownerId,controller.signal);
   const url=URL.createObjectURL(new Blob([new Uint8Array(result.bytes)],{type:"application/zip"}));
   const a=document.createElement("a");a.href=url;a.download=result.filename;document.body.appendChild(a);a.click();a.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),1000);
   setStatus(`ZIP ready: ${result.manifest.question_count} questions, ${result.manifest.part_count} parts and ${result.manifest.asset_count} original images. No classifications have been approved.`);
  }catch(e){setStatus("");setError(controller.signal.aborted?"Export cancelled. No ZIP was downloaded.":e instanceof Error?e.message:"Export failed. No ZIP was downloaded. Please retry.")}
  finally{exporting.current=null;setBusy(false)}
 };
 const marks=groups.filter(g=>selected.includes(g.number));
 return <section className="panel multipart-audit-export" aria-labelledby="audit-export-title" aria-busy={loading||busy}>
  <h2 id="audit-export-title">Export images for multipart review</h2>
  <p>Choose a paper and up to {AUDIT_BATCH_LIMIT} complete multipart questions. Download their original question images, mark schemes and a record manifest for local dependency analysis.</p>
  <p className="hint">Private examination material: use only within your permissions. Keep the ZIP outside GitHub and public folders. This export does not approve parts for separate use.</p>
  <label className="audit-paper-picker">Examination paper<select value={paperId} disabled={busy||!papers.length} onChange={e=>setPaperId(e.target.value)}>
   <option value="">Choose a paper…</option>{papers.map(p=><option key={p.id} value={p.id}>{p.exam_board} · {p.series} · {p.tier} · {p.paper_code}</option>)}
  </select></label>
  {loading&&<p role="status">Loading private audit records…</p>}
  {!loading&&!papers.length&&!error&&<p>No Edexcel GCSE papers are available.</p>}
  {!loading&&paperId&&!groups.length&&!error&&<p>No mapped multipart question families were found in this paper.</p>}
  {!!groups.length&&<>
   <p className="hint">Every selected question includes all its mapped parts and associated images. Check for missing context or mark scheme supplements before making parts available separately.</p>
   <div className="audit-batch-actions"><button className="secondary small" disabled={busy||loading} onClick={()=>setSelected(groups.filter(g=>g.available).slice(0,AUDIT_BATCH_LIMIT).map(g=>g.number))}>Select first {AUDIT_BATCH_LIMIT} available</button><button className="secondary small" disabled={busy||!selected.length} onClick={()=>setSelected([])}>Clear selection</button></div>
   <fieldset disabled={busy||loading} className="audit-question-list"><legend>Multipart questions</legend>{groups.map(g=><label className="audit-question-row" key={g.number}>
    <input type="checkbox" checked={selected.includes(g.number)} disabled={!g.available||(!selected.includes(g.number)&&selected.length>=AUDIT_BATCH_LIMIT)} onChange={e=>setSelected(old=>e.target.checked?[...old,g.number]:old.filter(n=>n!==g.number))}/>
    <span><strong>Original Q{g.number}</strong> · {g.parts.length} mapped parts · {g.marks===null?"Marks incomplete":`${g.marks} marks`}<span className="hint audit-part-ids">{g.parts.map(p=>typeof p.metadata?.id==="string"?p.metadata.id:p.question_number).join(", ")}</span>{!g.available&&<span className="audit-unavailable">Missing question or mark scheme reference — unavailable for a complete export.</span>}</span>
   </label>)}</fieldset>
   <p>{selected.length} / {AUDIT_BATCH_LIMIT} questions selected · {marks.some(g=>g.marks===null)?"Marks incomplete":`${marks.reduce((n,g)=>n+(g.marks??0),0)} marks`} · {marks.reduce((n,g)=>n+g.parts.length,0)} parts</p>
   <p className="hint">Original bytes and existing crop metadata are preserved. Shared images appear once in the ZIP. Limits: 100 MB per batch, 20 MB per image.</p>
  </>}
  <div className="audit-batch-actions"><button className="primary" disabled={busy||loading||!selected.length} onClick={()=>void download()}>{busy?"Preparing ZIP…":"Download audit ZIP"}</button>{busy&&<button className="secondary" onClick={()=>exporting.current?.abort()}>Cancel export</button>}</div>
  {status&&<p role="status">{status}</p>}{error&&<div role="alert"><p>{error}</p>{!busy&&<button className="secondary small" onClick={()=>setRetry(n=>n+1)}>Reload audit records</button>}</div>}
 </section>;
}
