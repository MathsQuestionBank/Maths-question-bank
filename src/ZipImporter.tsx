import StagedPaperReview from "./StagedPaperReview";
import EnhancedMappingImporter from "./EnhancedMappingImporter";
import NewExamPaperImporter from "./NewExamPaperImporter";
import Restore2022Parts from "./Restore2022Parts";
import RecoveryImporter from "./RecoveryImporter";
import { useState } from "react";
import JSZip from "jszip";
import { supabase } from "./supabase";

type RecordRow={id:string;metadata:Record<string,unknown>;question_storage_path:string|null;mark_scheme_storage_path:string|null};
type Asset={row:RecordRow;kind:"question"|"mark";file:JSZip.JSZipObject;path:string};
type OriginalAsset={file:JSZip.JSZipObject;path:string;contentType:"application/pdf"|"application/json"};
const bucket="exam-materials-private";
const questionName=(row:RecordRow)=>typeof row.metadata.id==="string"?row.metadata.id:"";
function findAsset(files:Map<string,JSZip.JSZipObject>,name:string,kind:"question"|"mark"){
 const match=/^(20\d{2})_(\dH)_(Q\d{2})(?:[a-z][a-z0-9]*)?$/i.exec(name);
 if(!match)return null;
 const [,year,paper,q]=match;
 const folder=kind==="question"?"questions":"markschemes";
 const suffix=year==="2020"?`assets/${folder}/${paper}_${q}.png`:`assets/${folder}/${year}/${paper}_${q}.png`;
 return files.get(suffix)||null;
}
function originalAssets(entries:Record<string,JSZip.JSZipObject>):OriginalAsset[]{
 const output:OriginalAsset[]=[];
 for(const [name,file] of Object.entries(entries)){
  if(file.dir)continue;
  const normalized=name.replace(/^.*?(?=assets\/)/,"");
  const m=/^assets\/([123]h)(nov2021|2020)(ms)?\.pdf$/i.exec(normalized);
  if(m){
   const year=m[2]==="2020"?"2020":"2021";
   const code=m[1].toUpperCase();
   output.push({file,path:`v6.2/source-pdfs/${year}/${code}/${m[3]?"mark-scheme":"question"}.pdf`,contentType:"application/pdf"});
   continue;
  }
  if(/(?:^|\/)data\.json$/i.test(name)){
   output.push({file,path:"v6.2/source-metadata/data.json",contentType:"application/json"});
  }else if(/(?:^|\/)mapping_2022\.json$/i.test(name)){
   output.push({file,path:"v6.2/source-metadata/mapping_2022.json",contentType:"application/json"});
  }
 }
 return output;
}
export default function ZipImporter({onComplete}:{onComplete:()=>void}){
 const [assets,setAssets]=useState<Asset[]>([]);
 const [originals,setOriginals]=useState<OriginalAsset[]>([]);
 const [summary,setSummary]=useState("");
 const [progress,setProgress]=useState("");
 const [busy,setBusy]=useState(false);
 const [issues,setIssues]=useState<string[]>([]);
 const inspect=async(file:File)=>{
  setBusy(true);setAssets([]);setOriginals([]);setIssues([]);setProgress("Inspecting the original V6.2 archive locally…");
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
     if(kind==="question"?row.question_storage_path:row.mark_scheme_storage_path)continue;
     const entry=findAsset(files,id,kind);
     if(!entry){missing.push(`${id} — ${kind==="question"?"question":"mark scheme"}`);continue;}
     const path=`v6.2/${id.slice(0,4)}/${id.slice(5,7)}/${id.slice(8)}/${kind}.png`;
     planned.push({row,kind,file:entry,path});
    }
   }
   const sourceFiles=originalAssets(zip.files);
   setAssets(planned);setOriginals(sourceFiles);setIssues(missing);
   setSummary(`Found ${planned.filter(x=>x.kind==="question").length} missing question attachments and ${planned.filter(x=>x.kind==="mark").length} missing mark-scheme attachments. Also found ${sourceFiles.filter(x=>x.contentType==="application/pdf").length} source PDFs and ${sourceFiles.filter(x=>x.contentType==="application/json").length} original metadata files. ${missing.length} images have no match in this archive (including November 2022). Previously uploaded crops will not be overwritten.`);
   setProgress("");
  }catch(e){setSummary(e instanceof Error?e.message:String(e));setProgress("");}
  finally{setBusy(false);}
 };
 const upload=async()=>{
  setBusy(true);let linked=0,archived=0,skipped=0;const errors:string[]=[];
  try{
   const {data:{user}}=await supabase.auth.getUser();
   const {data:owner,error:ownerError}=await supabase.rpc("is_approved_owner");
   if(!user||ownerError||owner!==true)throw Error("An approved owner session is required.");
   const total=assets.length+originals.length;
   for(const asset of assets){
    setProgress(`Linking original V6.2 crops ${linked+1}/${assets.length} (total ${total} files): ${questionName(asset.row)} ${asset.kind}`);
    const field=asset.kind==="question"?"question_storage_path":"mark_scheme_storage_path";
    // Double-check before writing in case this image has since been reviewed or imported elsewhere.
    const {data:current,error:readError}=await supabase.from("questions").select("question_storage_path,mark_scheme_storage_path").eq("id",asset.row.id).single();
    if(readError)throw readError;
    if(current?.[field]){skipped++;continue;}
    const bytes=await asset.file.async("uint8array");
    if(bytes.byteLength>10*1024*1024)throw Error(`Image too large: ${asset.file.name}`);
    const {error:storageError}=await supabase.storage.from(bucket).upload(asset.path,new Blob([new Uint8Array(bytes)],{type:"image/png"}),{contentType:"image/png",upsert:false});
    // An interrupted earlier import may have already uploaded the PNG but not linked it.
    if(storageError&&!(/already exists|duplicate|409/i.test(storageError.message)))throw Error(`Upload failed for ${asset.file.name}: ${storageError.message}`);
    const {error:updateError}=await supabase.from("questions").update({[field]:asset.path}).eq("id",asset.row.id).is(field,null);
    if(updateError)throw Error(`Link failed for ${asset.file.name}: ${updateError.message}`);
    linked++;
   }
   for(const asset of originals){
    setProgress(`Archiving original V6.2 PDF/metadata ${archived+skipped+1}/${originals.length}: ${asset.path}`);
    const bytes=await asset.file.async("uint8array");
    if(bytes.byteLength>30*1024*1024)throw Error(`Original file too large: ${asset.file.name}`);
    const {error}=await supabase.storage.from(bucket).upload(asset.path,new Blob([new Uint8Array(bytes)],{type:asset.contentType}),{contentType:asset.contentType,upsert:false});
    if(error){
     if(/already exists|duplicate|409/i.test(error.message)){skipped++;continue}
     errors.push(`${asset.path}: ${error.message}`);continue;
    }
    archived++;
   }
   setProgress(`Completed: ${linked} question/mark-scheme attachments linked, ${archived} original PDFs/metadata archived, ${skipped} existing assets skipped. ${errors.length?errors.length+" source files could not be archived: "+errors.join("; "):"All available archive files processed."} Existing crops were preserved.`);
   setAssets([]);setOriginals([]);onComplete();
  }catch(e){
   setProgress(`Paused after linking ${linked} images and archiving ${archived} sources. ${e instanceof Error?e.message:String(e)}. Re-select the ZIP to resume; existing images will be skipped.`);
  }finally{setBusy(false);}
 };
 return <><StagedPaperReview/><NewExamPaperImporter/><EnhancedMappingImporter/><details style={{marginTop:24}}><summary style={{cursor:"pointer",fontWeight:700}}>Archive Maintenance — V6.2 recovery tools</summary><div className="panel" style={{padding:22}}>
 <h2>Complete V6.2 archive import</h2>
 <p>Choose your original V6.2 ZIP to attach the missing question and mark-scheme images, including lettered parts such as Q11a. It will also preserve all 12 original 2020/2021 PDFs and original metadata in <strong>private storage</strong> for future extraction. Nothing already linked is overwritten.</p>
 <label>Original V6.2 archive (.zip)<input type="file" accept=".zip,application/zip" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void inspect(f)}}/></label>
 {summary&&<p role="status">{summary}</p>}
 {issues.length>0&&<details><summary>Unmatched images ({issues.length})</summary><p>2022 PDFs/crops were not present in V6.2. Multipart entries use their original whole-question PNG and should be reviewed where necessary.</p><div style={{maxHeight:220,overflow:"auto"}}>{issues.slice(0,150).map(x=><div key={x}>{x}</div>)}</div></details>}
 {(assets.length>0||originals.length>0)&&<button className="primary" disabled={busy} onClick={()=>void upload()}>Import all ${assets.length+originals.length} missing links and source files</button>}
 {progress&&<p role="status">{progress}</p>}
 </div><RecoveryImporter onComplete={onComplete}/><Restore2022Parts onComplete={onComplete}/></details></>;
}
