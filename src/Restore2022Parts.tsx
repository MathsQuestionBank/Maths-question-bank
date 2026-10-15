import {useState} from "react";
import JSZip from "jszip";
import {supabase} from "./supabase";

type Part={series:string;paper:string;qnum:number;question:string;marks:number;topic?:string;skill?:string;ao?:string;calculator?:string;topics?:string[];[key:string]:unknown};
type Existing={id:string;paper_id:string;question_number:string;topic:string|null;skill:string|null;assessment_objective:string|null;marks:number|null;metadata:Record<string,unknown>;question_storage_path:string|null;mark_scheme_storage_path:string|null};
type Task={original:Existing;parts:Part[];paper:string;number:number};
const code=(paper:string,q:string)=>"2022_"+paper+"_"+q;
export default function Restore2022Parts({onComplete}:{onComplete:()=>void}){
 const [tasks,setTasks]=useState<Task[]>([]);
 const [status,setStatus]=useState("");
 const [busy,setBusy]=useState(false);
 const prepare=async(file:File)=>{
  setBusy(true);setTasks([]);setStatus("Checking original V6.2 mapping against your question bank…");
  try{
   const zip=await JSZip.loadAsync(file);
   const asset=Object.values(zip.files).find(entry=>/(^|\/)mapping_2022\.json$/i.test(entry.name));
   if(!asset)throw Error("mapping_2022.json is missing from this V6.2 ZIP.");
   const mapped=JSON.parse(await asset.async("text")) as Part[];
   if(!Array.isArray(mapped)||mapped.length!==96)throw Error("Expected the original 96 November 2022 part mappings; found "+(Array.isArray(mapped)?mapped.length:"invalid JSON"));
   const {data,error}=await supabase.from("questions").select("id,paper_id,question_number,topic,skill,assessment_objective,marks,metadata,question_storage_path,mark_scheme_storage_path").limit(1000);
   if(error)throw Error(error.message);
   const rows=(data||[]) as Existing[];
   const bySource=new Map(rows.map(row=>[String(row.metadata?.id||""),row]));
   const plans:Task[]=[];
   for(const paper of ["1H","2H","3H"]){
    for(const number of [...new Set(mapped.filter(x=>x.paper===paper).map(x=>x.qnum))]){
     const parts=mapped.filter(x=>x.paper===paper&&x.qnum===number);
     if(parts.length<2)continue;
     if(!parts.every(x=>typeof x.question==="string"&&new RegExp("^Q\\d{2}[a-z][a-z0-9]*$","i").test(x.question)&&Number.isFinite(x.marks)))throw Error("Unsafe or invalid part IDs in "+paper+" Q"+number);
     const parentId=code(paper,"Q"+String(number).padStart(2,"0"));
     const original=bySource.get(parentId)||bySource.get(code(paper,parts[0].question));
     if(!original)throw Error("Cannot find existing paper question "+parentId);
     const existingParts=parts.filter(x=>bySource.has(code(paper,x.question)));
     if(existingParts.length===parts.length)continue;
     plans.push({original,parts,paper,number});
    }
   }
   setTasks(plans);
   setStatus(plans.length? "Ready to restore "+plans.reduce((sum,t)=>sum+t.parts.length,0)+" multipart records across "+plans.length+" complete questions. Existing images and approved crops will be reused; no question or mark-scheme files will be uploaded.":"All multipart records are already present; no repair needed.");
  }catch(err){setStatus(err instanceof Error?err.message:String(err))}
  finally{setBusy(false)}
 };
 const restore=async()=>{
  setBusy(true);let done=0;
  try{
   const {data:{user}}=await supabase.auth.getUser();
   const {data:owner,error:ownerError}=await supabase.rpc("is_approved_owner");
   if(!user||ownerError||owner!==true)throw Error("Only the approved owner may restore question mappings.");
   for(const task of tasks){
    // Refresh part identifiers each time, making interruption/retry safe.
    const {data:live,error:readError}=await supabase.from("questions").select("id,metadata").limit(1000);
    if(readError)throw readError;
    const known=new Set((live||[]).map(row=>String((row.metadata as Record<string,unknown>)?.id||"")));
    const base=task.original;
    for(const [index,part] of task.parts.entries()){
     const partId=code(task.paper,part.question);
     if(known.has(partId))continue;
     const meta={...base.metadata,...part,id:partId,question:part.question,qnum:task.number,series:"November 2022",tier:"Higher",calculator:task.paper!=="1H",part_of:code(task.paper,"Q"+String(task.number).padStart(2,"0"))};
     const values={question_number:part.question,topic:part.topic||base.topic,skill:part.skill||base.skill,assessment_objective:part.ao||base.assessment_objective,marks:part.marks,metadata:meta};
     if(index===0&&known.has(code(task.paper,"Q"+String(task.number).padStart(2,"0")))){
      const {error}=await supabase.from("questions").update(values).eq("id",base.id);
      if(error)throw Error(partId+": "+error.message);
     }else{
      const {error}=await supabase.from("questions").insert({id:crypto.randomUUID(),paper_id:base.paper_id,...values,question_storage_path:base.question_storage_path,mark_scheme_storage_path:base.mark_scheme_storage_path});
      if(error)throw Error(partId+": "+error.message);
     }
     known.add(partId);done++;setStatus("Restored "+done+" part records…");
    }
   }
   setTasks([]);setStatus("Completed: "+done+" individual part records restored. All other question records preserved. Refresh the question bank to see 2022 subparts.");onComplete();
  }catch(err){setStatus("Paused after "+done+" part records: "+(err instanceof Error?err.message:String(err))+". Select the ZIP again to inspect remaining work.")}
  finally{setBusy(false)}
 };
 return <section className="panel" style={{padding:22,marginTop:18}}>
  <h2>Restore November 2022 question parts</h2>
  <p>One-time repair using the original V6.2 mapping. November 2022 part records were collapsed into whole-question IDs. Restore separate records for parts (a), (b), (i), etc. Existing images and mark schemes are reused and your other exam series stay unchanged.</p>
  <label>Original V6.2 ZIP <input type="file" accept=".zip" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void prepare(f)}}/></label>
  {status&&<p role="status">{status}</p>}
  {tasks.length>0&&<><details><summary>Review {tasks.length} multipart questions</summary>{tasks.map(t=><p key={t.paper+t.number}>{t.paper} Q{t.number}: {t.parts.map(p=>p.question+" ("+p.marks+" marks)").join(", ")}</p>)}</details><button disabled={busy} onClick={()=>void restore()}>Restore multipart question records</button></>}
 </section>;
}
