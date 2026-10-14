import RecoveryImporter from "./RecoveryImporter";
import { useState } from "react";
import JSZip from "jszip";
import { supabase } from "./supabase";

type RecordRow={id:string;metadata:Record<string,unknown>;question_storage_path:string|null;mark_scheme_storage_path:string|null};
type Asset={row:RecordRow;kind:"question"|"mark";file:JSZip.JSZipObject;path:string};
const bucket="exam-materials-private";
const questionName=(row:RecordRow)=>typeof row.metadata.id==="string"?row.metadata.id:"";
function findAsset(files:Map<string,JSZip.JSZipObject>,name:string,kind:"question"|"mark"){
 const match=/^(20\d{2})_(\dH)_(Q\d{2})$/.exec(name);
 if(!match)return null;
 const [,year,paper,q]=match;
 // V6.2 stores 2020 at the root and 2021 in a year folder.
 // 2022 is intentionally NOT guessed: no image exists in the source archive.
 const folder=kind==="question"?"questions":"markschemes";
 const suffix=year==="2020"?`assets/${folder}/${paper}_${q}.png`:`assets/${folder}/${year}/${paper}_${q}.png`;
 return files.get(suffix)||null;
}
export default function ZipImporter({onComplete}:{onComplete:()=>void}){
 const [assets,setAssets]=useState<Asset[]>([]);
 const [summary,setSummary]=useState("");
 const [progress,setProgress]=useState("");
 const [busy,setBusy]=useState(false);
 const [issues,setIssues]=useState<string[]>([]);
 const inspect=async(file:File)=>{
  setBusy(true);setAssets([]);setIssues([]);setProgress("Inspecting archive locally…");
  try{
   if(!file.name.toLowerCase().endsWith(".zip"))throw Error("Choose the original V6.2 ZIP archive.");
   if(file.size>150*1024*1024)throw Error("Archive exceeds the 150 MB limit.");
   const zip=await JSZip.loadAsync(file);
   const files=new Map<string,JSZip.JSZipObject>();
   for(const [name,entry] of Object.entries(zip.files)){
    if(entry.dir)continue;
    const match=name.match(/(?:^|\/)assets\/(questions|markschemes)\/(.*)$/);
    if(match&&/\.png$/i.test(name))files.set(`assets/${match[1]}/${match[2]}`,entry);
   }
   const {data,error}=await supabase.from("questions").select("id,metadata,question_storage_path,mark_scheme_storage_path").limit(1000);
   if(error)throw Error(error.message);
   const planned:Asset[]=[];const missing:string[]=[];
   for(const row of (data||[]) as RecordRow[]){
    const id=questionName(row);if(!id)continue;
    for(const kind of ["question","mark"] as const){
     const existing=kind==="question"?row.question_storage_path:row.mark_scheme_storage_path;
     if(existing)continue; // Protect all existing crops and approvals; repair flagged images separately.
     const entry=findAsset(files,id,kind);
     if(!entry){missing.push(`${id} — ${kind==="question"?"question":"mark scheme"}`);continue}
     const path=`v6.2/${id.slice(0,4)}/${id.slice(5,7)}/${id.slice(8)}/${kind}.png`;
     planned.push({row,kind,file:entry,path});
    }
   }
   setAssets(planned);setIssues(missing);
   setSummary(`Found ${planned.filter(x=>x.kind==="question").length} missing question images and ${planned.filter(x=>x.kind==="mark").length} missing mark schemes. Existing uploads are excluded; ${missing.length} unmatched missing items remain. Multipart questions reuse the source whole-question image and may need visual review.`);
   setProgress("");
  }catch(e){setSummary(e instanceof Error?e.message:String(e));setProgress("")}finally{setBusy(false)}
 };
 const upload=async()=>{
  setBusy(true);let success=0;
  try{
   const {data:{user}}=await supabase.auth.getUser();
   const {data:owner,error:ownerError}=await supabase.rpc("is_approved_owner");
   if(!user||ownerError||owner!==true)throw Error("An approved owner session is required.");
   for(const asset of assets){
    setProgress(`Uploading ${success+1} of ${assets.length}: ${questionName(asset.row)} ${asset.kind}`);
    const bytes=await asset.file.async("uint8array");
    if(bytes.byteLength>10*1024*1024)throw Error(`Image too large: ${asset.file.name}`);
    const {error:storageError}=await supabase.storage.from(bucket).upload(asset.path,new Blob([new Uint8Array(bytes)],{type:"image/png"}),{contentType:"image/png",upsert:false});
    if(storageError)throw Error(`Upload failed for ${asset.file.name}: ${storageError.message}`);
    const field=asset.kind==="question"?"question_storage_path":"mark_scheme_storage_path";
    const {error:updateError}=await supabase.from("questions").update({[field]:asset.path}).eq("id",asset.row.id);
    if(updateError)throw Error(`Link failed for ${asset.file.name}: ${updateError.message}`);
    success++;
   }
   setProgress(`Complete: ${success} assets uploaded and linked.`);
   setAssets([]);onComplete();
  }catch(e){setProgress(`Stopped after ${success} uploads. ${e instanceof Error?e.message:String(e)}. Re-select the ZIP to resume safely.`)}finally{setBusy(false)}
 };
 return <><div className="panel"><h2>Import existing V6.2 question images</h2><p>Choose your original V6.2 ZIP. The archive is inspected in your browser. Missing whole-question and multipart images can be linked to their original V6.2 crops. Existing question and mark-scheme images are never overwritten. No PDFs are uploaded.</p><label>V6.2 archive (.zip)<input type="file" accept=".zip,application/zip" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void inspect(f)}}/></label>{summary&&<p role="status">{summary}</p>}{issues.length>0&&<details><summary>Missing or unmatched images ({issues.length})</summary><p>These are not uploaded or fabricated. The source archive does not contain all 2022 crops.</p><div style={{maxHeight:220,overflow:"auto"}}>{issues.slice(0,120).map(x=><div key={x}>{x}</div>)}</div></details>}{assets.length>0&&<button className="primary" disabled={busy} onClick={()=>void upload()}>Upload and link {assets.length} matched images</button>}{progress&&<p role="status">{progress}</p>}</div><RecoveryImporter onComplete={onComplete}/></>
}
