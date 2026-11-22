import { useState } from "react";
import JSZip from "jszip";
import { useAccountRole } from "./AuthGate";
import { supabase } from "./supabase";
import inventory from "./ks3/curriculum/year7-resource-inventory.json";

type Kind = "exemplar" | "lower-guidance" | "higher-guidance";
type Resource = {path:string; filename:string; unit:string; kind:Kind; bytes:number; entry:JSZip.JSZipObject};
type StoredResource = {id:string; unit_code:string; resource_type:Kind; original_filename:string; storage_path:string; bytes:number};
const bucket = "ks3-source-private";
const mime:Record<string,string> = {
  pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf:"application/pdf",
};
function classify(path:string):{unit:string;kind:Kind}|null {
  const parts=path.split("/");
  if (parts.length !== 3 || parts[0].toLowerCase()!=="year 7") return null;
  const match=/^(\d{1,2})\s/.exec(parts[1]);
  if (!match || Number(match[1])<1 || Number(match[1])>15) return null;
  const ext=parts[2].split(".").pop()?.toLowerCase();
  if(ext==="pptx") return {unit:`7.${Number(match[1])}`,kind:"exemplar"};
  if(ext!=="pdf") return null;
  const name=parts[2].toLowerCase();
  if(/(?:^|[^a-z])la(?:[^a-z]|$)|lower[ -]?attain/.test(name)) return {unit:`7.${Number(match[1])}`,kind:"lower-guidance"};
  if(/(?:^|[^a-z])ha(?:[^a-z]|$)|higher[ -]?attain/.test(name)) return {unit:`7.${Number(match[1])}`,kind:"higher-guidance"};
  return null;
}
export async function inspectYear7Zip(file:File):Promise<Resource[]> {
  if(file.size>120*1024*1024)throw new Error("ZIP is larger than the 120 MB limit.");
  if(!/\.zip$/i.test(file.name))throw new Error("Select the Year 7 ZIP file.");
  const zip=await JSZip.loadAsync(file);
  const resources:Resource[]=[];
  let uncompressed=0;
  for(const [path,entry] of Object.entries(zip.files)){
    if(entry.dir)continue;
    if(path.includes("..") || path.startsWith("/") || path.includes("\\"))throw new Error("Unsafe archive path.");
    const type=classify(path);
    if(!type)throw new Error(`Cannot classify file: ${path}`);
    const ext=path.endsWith(".pptx")?"pptx":"pdf";
    const size=(entry as JSZip.JSZipObject & {_data?:{uncompressedSize?:number}})._data?.uncompressedSize;
    if(!size || size>20*1024*1024)throw new Error(`File size not supported: ${path}`);
    uncompressed+=size;
    if(uncompressed>180*1024*1024)throw new Error("Uncompressed ZIP exceeds 180 MB.");
    resources.push({path,entry,filename:path.split("/")[path.split("/").length-1],unit:type.unit,kind:type.kind,bytes:size});
  }
  const expected=inventory.summary.powerpoints+inventory.summary.guidancePdfs;
  if(resources.length!==expected)throw new Error(`Expected ${expected} files; found ${resources.length}. Verify this is the complete Year 7 ZIP.`);
  const keys=new Set(resources.map(x=>`${x.unit}/${x.kind}`));
  if(keys.size!==45)throw new Error("Expected one exemplar, one LA guide and one HA guide in each of 15 topics.");
  return resources.sort((a,b)=>Number(a.unit.split(".")[1])-Number(b.unit.split(".")[1])||a.kind.localeCompare(b.kind));
}
export default function KS3BulkSources(){
  const owner=useAccountRole()==="owner";
  const [resources,setResources]=useState<Resource[]>([]);
  const [stored,setStored]=useState<StoredResource[]>([]);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [rights,setRights]=useState(false);
  const [count,setCount]=useState(0);
  const inspect=async(file:File)=>{
    setBusy(true);setError("");setNotice("");setResources([]);setRights(false);
    try{const entries=await inspectYear7Zip(file);setResources(entries);setNotice("All 15 Year 7 topics are recognised; files remain local until you choose Upload.");}
    catch(e){setError(e instanceof Error?e.message:String(e))}
    finally{setBusy(false)}
  };
  const refresh=async()=>{
    setError("");
    const {data,error:e}=await supabase.from("ks3_source_resources")
      .select("id,unit_code,resource_type,original_filename,storage_path,bytes")
      .eq("year_group",7).order("unit_code");
    if(e){setError(e.message);return}
    setStored((data||[]) as StoredResource[]);
  };
  const open=async(path:string)=>{
    const {data,error:e}=await supabase.storage.from(bucket).createSignedUrl(path,120);
    if(e||!data){setError(e?.message||"Unable to open private resource");return}
    window.open(data.signedUrl,"_blank","noopener,noreferrer");
  };
  const upload=async()=>{
    if(!rights||resources.length!==45||busy)return;
    setBusy(true);setError("");setCount(0);
    let uploaded=0;
    try{
      const {data:{user},error:authError}=await supabase.auth.getUser();
      const {data:allowed,error:roleError}=await supabase.rpc("is_approved_owner");
      if(!user||authError||roleError||allowed!==true)throw new Error("You must be signed in as an approved owner.");
      const batch=crypto.randomUUID();
      for(const resource of resources){
        const bytes=await resource.entry.async("uint8array");
        if(bytes.byteLength!==resource.bytes)throw new Error(`ZIP extraction size mismatch: ${resource.filename}`);
        const ext=resource.filename.toLowerCase().endsWith(".pptx")?"pptx":"pdf";
        const key=`${user.id}/${batch}/${resource.unit}/${resource.kind}.${ext}`;
        const uploadResult=await supabase.storage.from(bucket).upload(key,bytes,{
          upsert:false,contentType:mime[ext],cacheControl:"0"
        });
        if(uploadResult.error)throw new Error(`Upload failed for ${resource.filename}: ${uploadResult.error.message}`);
        const {error:recordError}=await supabase.from("ks3_source_resources").insert({
          owner_id:user.id,batch_id:batch,year_group:7,unit_code:resource.unit,
          resource_type:resource.kind,original_filename:resource.filename,storage_path:key,
          bytes:resource.bytes,source_publisher:"White Rose Maths",rights_status:"restricted-review"
        });
        if(recordError)throw new Error(`Metadata save failed for ${resource.filename}: ${recordError.message}`);
        uploaded++;setCount(uploaded);
      }
      setNotice(`All ${uploaded} files uploaded to private Year 7 source staging. Not yet converted into usable questions or published.`);
      setResources([]);setRights(false);await refresh();
    }catch(e){setError(`Stopped after ${uploaded} files. ${e instanceof Error?e.message:String(e)}. Files already staged are retained; check saved resources before retrying.`)}
    finally{setBusy(false)}
  };
  if(!owner)return null;
  return <section className="panel ks3-importer print-hide">
    <h2>Bulk Year 7 resource upload</h2>
    <p>Upload the complete Year 7 ZIP once. All 15 exemplar PowerPoints and 30 guidance PDFs will be stored privately for subsequent question extraction and teacher review. This does not publish any White Rose question to the bank.</p>
    <label>Year 7 resource ZIP <input type="file" accept=".zip,application/zip" disabled={busy} onChange={e=>{const file=e.currentTarget.files?.[0];if(file)void inspect(file)}}/></label>
    {!!resources.length&&<>
      <p role="status"><strong>{resources.length} files checked</strong> across 15 units. Estimated unpacked size {Math.round(resources.reduce((sum,r)=>sum+r.bytes,0)/1048576)} MB.</p>
      <details><summary>Inspect recognised files by topic</summary>
        <ul>{resources.map(r=><li key={r.path}>{r.unit} · {r.kind} · {r.filename}</li>)}</ul>
      </details>
      <label style={{display:"block",margin:"14px 0"}}><input type="checkbox" checked={rights} onChange={e=>setRights(e.target.checked)} disabled={busy}/> I confirm the school is authorised to store the White Rose source materials in this restricted departmental system.</label>
      <button type="button" disabled={!rights||busy} onClick={()=>void upload()}>{busy?`Uploading ${count}/${resources.length}…`:"Upload 45 resources to private staging"}</button>
    </>}
    <div style={{marginTop:16}}><button type="button" className="secondary small" onClick={()=>void refresh()} disabled={busy}>Show stored Year 7 files</button>
      {!!stored.length&&<p><strong>{stored.length} stored resources</strong> (may include multiple uploads of a topic).</p>}
      {!!stored.length&&<details><summary>View stored private resources</summary><ul>{stored.map(r=><li key={r.id}>{r.unit_code} · {r.resource_type} · <button type="button" className="secondary small" onClick={()=>void open(r.storage_path)}>{r.original_filename}</button></li>)}</ul></details>}
    </div>
    {notice&&<p role="status">{notice}</p>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}
