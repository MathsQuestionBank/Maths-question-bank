import { useState } from "react";
import JSZip from "jszip";
import { supabase } from "./supabase";

type RecoveryRow={id:string;path:string;review_required:boolean;pages:number};
type Pending={row:RecoveryRow;image:JSZip.JSZipObject;databaseId:string;previousPath:string|null};
const bucket="exam-materials-private";
export default function RecoveryImporter({onComplete}:{onComplete:()=>void}){
 const [items,setItems]=useState<Pending[]>([]);
 const [ignored,setIgnored]=useState<string[]>([]);
 const [progress,setProgress]=useState("");
 const [busy,setBusy]=useState(false);
 const [filename,setFilename]=useState("");
 const inspect=async(file:File)=>{
  setBusy(true);setItems([]);setIgnored([]);setProgress("Inspecting recovery archive…");setFilename(file.name);
  try{
   if(!file.name.toLowerCase().endsWith(".zip")||file.size>100*1024*1024)throw Error("Choose a recovery ZIP under 100 MB.");
   const zip=await JSZip.loadAsync(file);
   const raw=zip.file("manifest.json");if(!raw)throw Error("Recovery manifest.json is missing.");
   const manifest=JSON.parse(await raw.async("text")) as {recovered?:RecoveryRow[]};
   if(!Array.isArray(manifest.recovered))throw Error("Recovery list is invalid.");
   const {data,error}=await supabase.from("questions").select("id,metadata,mark_scheme_storage_path").limit(1000);
   if(error)throw Error(error.message);
   const lookup=new Map((data||[]).map(row=>[String((row.metadata as Record<string,unknown>)?.id||""),row]));
   const planned:Pending[]=[],warnings:string[]=[];
   const seen=new Set<string>();
   for(const entry of manifest.recovered){
    if(!entry||typeof entry.id!=="string"||!/^20\d{2}_[123]H_Q\d{2}$/.test(entry.id)||seen.has(entry.id)){warnings.push("Invalid or duplicate recovery ID");continue}
    seen.add(entry.id);
    if(typeof entry.path!=="string"||!/^recovery\/20\d{2}\/[123]H\/Q\d{2}\/mark\.png$/.test(entry.path)){warnings.push(entry.id+": invalid image path");continue}
    const row=lookup.get(entry.id);
    if(!row){warnings.push(entry.id+": not in question bank");continue}
    const meta=row.metadata as Record<string,unknown>;
    const status=(meta.crop_review as Record<string,unknown>|undefined)?.mark;
    if(status!=="needs-fix"){warnings.push(entry.id+": not flagged for correction; skipped to protect reviewed data");continue}
    const image=zip.file(entry.path);
    if(!image){warnings.push(entry.id+": missing PNG");continue}
    planned.push({row:entry,image,databaseId:row.id,previousPath:row.mark_scheme_storage_path});
   }
   setItems(planned);setIgnored(warnings);
   setProgress(planned.length+" flagged mark schemes ready for owner-reviewed recovery. Existing images will be preserved.");
  }catch(e){setProgress(e instanceof Error?e.message:String(e))}
  finally{setBusy(false)}
 };
 const upload=async()=>{
  setBusy(true);let complete=0;
  try{
   const {data:{user}}=await supabase.auth.getUser();
   const {data:owner,error:ownerError}=await supabase.rpc("is_approved_owner");
   if(!user||ownerError||owner!==true)throw Error("Owner approval is required.");
   for(const item of items){
    const {data:current,error:readError}=await supabase.from("questions").select("metadata,mark_scheme_storage_path").eq("id",item.databaseId).single();
    if(readError)throw readError;
    const metadata=(current.metadata||{}) as Record<string,unknown>;
    if((metadata.crop_review as Record<string,unknown>|undefined)?.mark!=="needs-fix")throw Error(item.row.id+": review status has changed, please reselect ZIP");
    const bytes=await item.image.async("uint8array");
    if(bytes.length>10*1024*1024)throw Error(item.row.id+": PNG exceeds 10 MB");
    // New paths prevent overwriting previous mark schemes, including their original crop.
    const path="recovered/v62/"+item.row.id+"/"+crypto.randomUUID()+"/mark.png";
    const {error:uploadError}=await supabase.storage.from(bucket).upload(path,new Blob([new Uint8Array(bytes)],{type:"image/png"}),{contentType:"image/png",upsert:false});
    if(uploadError)throw Error(item.row.id+": "+uploadError.message);
    const review={...((metadata.crop_review&&typeof metadata.crop_review==="object")?metadata.crop_review:{}),mark:"unreviewed"};
    const history=Array.isArray(metadata.mark_recovery_history)?metadata.mark_recovery_history:[];
    const updated={...metadata,crop_review:review,mark_recovery_history:[...history,{previous_path:current.mark_scheme_storage_path,recovered_path:path,source:"V6.2 automated PDF extraction",created_at:new Date().toISOString()}],image_crops:{...((metadata.image_crops&&typeof metadata.image_crops==="object")?metadata.image_crops:{}),mark:{top:0,bottom:0,left:0,right:0}}};
    const {error:saveError}=await supabase.from("questions").update({mark_scheme_storage_path:path,metadata:updated}).eq("id",item.databaseId);
    if(saveError)throw Error(item.row.id+" uploaded but could not be linked: "+saveError.message);
    complete++;setProgress("Repaired "+complete+" / "+items.length+" images. Each still needs visual approval.");
   }
   setItems([]);setProgress("Recovery import complete: "+complete+" marks replaced with separately stored candidate images. Check them in Review image crops before approving.");onComplete();
  }catch(e){setProgress("Stopped after "+complete+" successful repairs: "+(e instanceof Error?e.message:String(e))+". Reinspect before retrying.")}
  finally{setBusy(false)}
 };
 return <div className="panel" style={{padding:22,marginTop:20}}>
 <h2>Restore flagged mark schemes from V6.2</h2>
 <p>Import a recovery ZIP generated from the original V6.2 PDF algorithm. Only questions already flagged <strong>Needs correction</strong> are eligible. Approved images are never changed, and previous PNGs remain stored privately.</p>
 <label>Recovery archive (.zip)<input type="file" accept=".zip,application/zip" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void inspect(f)}}/></label>
 {filename&&<p className="hint">Selected: {filename}</p>}
 {progress&&<p role="status">{progress}</p>}
 {items.length>0&&<><details><summary>Review {items.length} proposed replacements</summary><div style={{maxHeight:220,overflow:"auto"}}>{items.map(x=><div key={x.databaseId}>{x.row.id} — {x.row.pages} PDF page(s) — previously {x.previousPath||"missing"}</div>)}</div></details><p className="hint">Automatically extracted results are candidates, not verified answers. Inspect each new crop before approving.</p><button className="primary" disabled={busy} onClick={()=>void upload()}>Import {items.length} flagged replacements</button></>}
 {ignored.length>0&&<details><summary>{ignored.length} entries skipped for safety</summary>{ignored.map((x,i)=><div key={i}>{x}</div>)}</details>}
 </div>;
}
