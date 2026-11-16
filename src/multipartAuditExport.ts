import JSZip from "jszip";
import { supabase } from "./supabase";

export const AUDIT_BATCH_LIMIT = 10;
const MAX_ASSETS = 80, MAX_BYTES = 100 * 1024 * 1024, MAX_FILE_BYTES = 20 * 1024 * 1024;
const bucket = "exam-materials-private";
export type AuditPaper = {id:string;exam_board:string;qualification:string;series:string;paper_code:string;tier:string};
export type AuditPart = {id:string;paper_id:string;question_number:string;marks:number|null;metadata:Record<string,unknown>;question_storage_path:string|null;mark_scheme_storage_path:string|null};
export type AuditGroup = {number:number;parts:AuditPart[];marks:number|null;available:boolean};
const paperFields = "id,exam_board,qualification,series,paper_code,tier";
const partFields = "id,paper_id,question_number,marks,metadata,question_storage_path,mark_scheme_storage_path";
const accessMessage = "An approved owner session is required. Sign in again or check your account permissions.";
function active(signal?:AbortSignal) { if(signal?.aborted)throw new Error("Export cancelled. No ZIP was downloaded."); }

/** Verify the user with Auth and the live database role, never user_metadata or a UI flag. */
export async function requireAuditOwner(expectedId?:string, signal?:AbortSignal):Promise<string> {
 active(signal);
 const {data:{user},error} = await supabase.auth.getUser();
 if(error || !user || (expectedId && user.id!==expectedId))throw new Error(accessMessage);
 const {data:owner,error:roleError} = await supabase.rpc("is_approved_owner");
 active(signal);
 if(roleError || owner!==true)throw new Error(accessMessage);
 return user.id;
}
function supportedPaper(p:AuditPaper) {return p.exam_board==="Edexcel" && p.qualification==="GCSE Mathematics" && ["Foundation","Higher"].includes(p.tier);}
export async function loadAuditPapers(signal?:AbortSignal):Promise<AuditPaper[]> {
 const owner=await requireAuditOwner(undefined,signal);
 const {data,error}=await supabase.from("exam_papers").select(paperFields).eq("exam_board","Edexcel").eq("qualification","GCSE Mathematics").in("tier",["Foundation","Higher"]).order("series").order("paper_code").limit(1000).abortSignal(signal??new AbortController().signal);
 if(error)throw new Error("Could not load examination papers. Please retry.");
 await requireAuditOwner(owner,signal);
 return ((data??[]) as AuditPaper[]).filter(supportedPaper);
}
export function auditMultipartGroups(rows:AuditPart[]):AuditGroup[] {
 const groups=new Map<number,AuditPart[]>(),seen=new Set<string>();
 for(const row of rows) {
  if(seen.has(row.id))throw new Error("Duplicate part record returned. Reload this paper before exporting.");
  seen.add(row.id);
  const ref=/^Q?0*(\d+)([a-z]*)$/i.exec(row.question_number);
  if(!ref)throw new Error("A stored question reference cannot be grouped safely. This paper needs review.");
  const number=Number(ref[1]);
  const parts=groups.get(number)??[];parts.push(row);groups.set(number,parts);
 }
 return [...groups].filter(([,parts])=>parts.length>1).sort(([a],[b])=>a-b).map(([number,parts])=>{
  parts.sort((a,b)=>a.question_number.localeCompare(b.question_number,undefined,{numeric:true}));
  if(new Set(parts.map(p=>p.question_number.replace(/^Q?0*/i,"").toLowerCase())).size!==parts.length)throw new Error("Duplicate printed part labels need review before export.");
  return {number,parts,marks:parts.every(p=>typeof p.marks==="number"&&Number.isFinite(p.marks)&&p.marks>=0)?parts.reduce((n,p)=>n+p.marks!,0):null,available:parts.every(p=>!!p.question_storage_path&&!!p.mark_scheme_storage_path)};
 });
}
async function readPaper(paperId:string,owner:string,signal?:AbortSignal):Promise<{paper:AuditPaper;groups:AuditGroup[]}> {
 await requireAuditOwner(owner,signal);
 const {data:paper,error}=await supabase.from("exam_papers").select(paperFields).eq("id",paperId).single();
 if(error||!paper||!supportedPaper(paper as AuditPaper))throw new Error("This Edexcel GCSE paper is unavailable for audit export.");
 const rows:AuditPart[]=[];
 for(let offset=0;;offset+=1000) {
  active(signal);
  const {data,error}=await supabase.from("questions").select(partFields).eq("paper_id",paperId).is("shadow_paper_id",null).is("shadow_of_question_id",null).order("id").range(offset,offset+999).abortSignal(signal??new AbortController().signal);
  if(error)throw new Error("Could not load all question parts. No export was created. Please retry.");
  const page=(data??[]) as AuditPart[];
  if(page.some(p=>p.paper_id!==paperId))throw new Error("Paper identity mismatch. No export was created.");
  rows.push(...page.filter(p=>p.metadata?.content_rights!=="original"));
  if(page.length<1000)break;
 }
 await requireAuditOwner(owner,signal);
 return {paper:paper as AuditPaper,groups:auditMultipartGroups(rows)};
}
export async function loadAuditPaper(paperId:string,signal?:AbortSignal) {
 return readPaper(paperId,await requireAuditOwner(undefined,signal),signal);
}
async function sha256(bytes:Uint8Array) {
 return [...new Uint8Array(await crypto.subtle.digest("SHA-256",new Uint8Array(bytes)))].map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function downloadOriginal(path:string,signal?:AbortSignal) {
 const controller=new AbortController(),abort=()=>controller.abort();
 signal?.addEventListener("abort",abort,{once:true});
 const timer=setTimeout(abort,45000);
 try {
  active(signal);
  return await supabase.storage.from(bucket).download(path,{}, {signal:controller.signal,cache:"no-store"});
 }catch {
  return {data:null,error:true};
 }finally {clearTimeout(timer);signal?.removeEventListener("abort",abort);}
}
function storedPath(path:string) {
 // Object keys only: never fetch a metadata URL, public URL, or signed URL.
 if(!path||path.startsWith("/")||path.includes("\\")||/[?#\u0000-\u001f]/.test(path)||path.includes(":")||path.split("/").some(s=>s===".."||s==="."))throw new Error("Invalid private asset reference. This question needs review.");
 return path;
}
function cropSnapshot(value:unknown,review=false):unknown {
 if(value==null)return null;
 if(typeof value!=="object"||Array.isArray(value))throw new Error("Crop metadata needs review before export.");
 const result:Record<string,unknown>={};
 for(const [kind,crop] of Object.entries(value)) {
  if(!["question","mark"].includes(kind))throw new Error("Unrecognised crop metadata. No export was created.");
  if(review) {
   if(typeof crop!=="string"||! /^[a-z_-]{1,40}$/i.test(crop))throw new Error("Crop review metadata needs review before export.");
   result[kind]=crop;
  } else {
   if(!crop||typeof crop!=="object"||Array.isArray(crop))throw new Error("Crop metadata needs review before export.");
   const edges=Object.entries(crop);
   if(edges.some(([key,n])=>!["top","right","bottom","left"].includes(key)||typeof n!=="number"||!Number.isFinite(n)))throw new Error("Crop metadata needs review before export.");
   result[kind]=Object.fromEntries(edges);
  }
 }
 return result;
}
function imageExtension(bytes:Uint8Array):string {
 if([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return "png";
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return "jpg";
 const text=new TextDecoder().decode(bytes.slice(0,12));
 if(text.startsWith("GIF87a")||text.startsWith("GIF89a"))return "gif";
 if(text.startsWith("RIFF")&&text.slice(8)==="WEBP")return "webp";
 throw new Error("An asset is not a supported raster image. No ZIP was created.");
}
const archiveReadme = `PRIVATE EXAMINATION MATERIAL — LOCAL AUDIT ONLY
This ZIP contains original stored image bytes, not new crops or approved standalone parts.
manifest.json maps every selected record to question and marking files. Shared assets occur once.
Path fingerprints match the PR #93 audit; content SHA-256 values verify the downloaded bytes.
Crop coordinates are existing percentages relative to the original image; they have not been applied.
Unknown marks/metadata stay null. A complete export is not proof that all printed subparts or marking supplements were imported.
Keep outside Git repositories and public/cloud-synced folders. Do not commit or publicly redistribute this archive, images or manifest.
Use only within your examination-material permissions; verify Pearson/Edexcel and school licensing terms.
Share with Codex only in an authorised private environment after checking your provider's retention and training controls.
Do not include pupil data, credentials, access tokens or signed URLs. No classifications are teacher-approved by this export.
Delete local copies and session attachments when review/retention requirements permit.
`;

/** All-or-nothing export. Fresh database snapshot, authenticated reads, original bytes, no signed URLs. */
export async function createMultipartAuditZip(paperId:string,numbers:number[],options:{signal?:AbortSignal;onProgress?:(message:string)=>void}={}) {
 const {signal,onProgress}=options,owner=await requireAuditOwner(undefined,signal);
 if(!numbers.length||numbers.length>AUDIT_BATCH_LIMIT||new Set(numbers).size!==numbers.length||numbers.some(n=>!Number.isSafeInteger(n)||n<1))throw new Error(`Choose between 1 and ${AUDIT_BATCH_LIMIT} different multipart questions.`);
 onProgress?.("Checking all selected parts and image references…");
 const {paper,groups}=await readPaper(paperId,owner,signal);
 const selected=numbers.map(number=>groups.find(g=>g.number===number));
 if(selected.some(g=>!g))throw new Error("A selected multipart question has changed or is unavailable. Reload the paper.");
 const chosen=selected as AuditGroup[];
 if(chosen.some(g=>!g.available))throw new Error("A selected question is missing a question or mark scheme asset. No ZIP was created.");
 const paths=[...new Set(chosen.flatMap(g=>g.parts.flatMap(p=>[storedPath(p.question_storage_path!),storedPath(p.mark_scheme_storage_path!)])))];
 if(paths.length>MAX_ASSETS)throw new Error("This batch has too many images. Select fewer questions.");
 // Prepare allowlisted metadata before downloading. Never serialize the raw metadata or Storage keys.
 const snapshots=new Map(chosen.flatMap(g=>g.parts.map(p=>[p.id,{existing_image_crops:cropSnapshot(p.metadata?.image_crops),existing_whole_image_crop_review:cropSnapshot(p.metadata?.crop_review,true)}] as const)));
 const zip=new JSZip();
 const assets=[] as {id:string;file:string;source_path_sha256:string;sha256:string;byte_length:number;width:number;height:number}[];
 const byPath=new Map<string,string>();let bytesTotal=0;
 for(const [i,path] of paths.entries()) {
  await requireAuditOwner(owner,signal);
  onProgress?.(`Downloading original image ${i+1} of ${paths.length}…`);
  let blob:Blob|null=null;
  // One authenticated retry after a fresh owner/session check; never fall back to public URLs.
  for(let attempt=0;attempt<2;attempt++) {
   active(signal);
   const {data,error}=await downloadOriginal(path,signal);
   active(signal);
   if(!error&&data){blob=data;break;}
   if(attempt===0)await requireAuditOwner(owner,signal);
  }
  if(!blob)throw new Error(`Image ${i+1} of ${paths.length} could not be downloaded. No ZIP was created. Retry, or choose a smaller batch.`);
  if(!blob.size||blob.size>MAX_FILE_BYTES||(bytesTotal+=blob.size)>MAX_BYTES)throw new Error("Image size limit exceeded. No ZIP was created. Select fewer questions (100 MB per batch, 20 MB per image).");
  const bytes=new Uint8Array(await blob.arrayBuffer()),ext=imageExtension(bytes);
  let bitmap:ImageBitmap;
  try {bitmap=await createImageBitmap(blob);}catch {throw new Error(`Image ${i+1} could not be decoded. No ZIP was created.`);}
  const {width,height}=bitmap;bitmap.close();
  if(!width||!height)throw new Error("An image has invalid dimensions. No ZIP was created.");
  const id=`asset-${String(i+1).padStart(3,"0")}`,file=`assets/${id}.${ext}`;
  zip.file(file,bytes,{compression:"STORE"});byPath.set(path,id);
  assets.push({id,file,source_path_sha256:await sha256(new TextEncoder().encode(path)),sha256:await sha256(bytes),byte_length:bytes.length,width,height});
 }
 const manifest={
  format:"mathsquestionbank.multipart-audit-export",schema_version:1,
  created_at_utc:new Date().toISOString(),complete:true,
  review_status:"unreviewed_not_teacher_approved",audit_reference:"MathsQuestionBank/Maths-question-bank#93",
  paper:{paper_id:paper.id,exam_board:paper.exam_board,qualification:paper.qualification,series:paper.series,paper_code:paper.paper_code,tier:paper.tier},
  question_count:chosen.length,part_count:chosen.reduce((n,g)=>n+g.parts.length,0),
  asset_count:assets.length,original_bytes_total:bytesTotal,
  groups:chosen.map(g=>({
   audit_family_key:`${paper.id}:Q${g.number}`,original_question_number:g.number,marks:g.marks,
   parts:g.parts.map(p=>({
    database_record_id:p.id,
    source_question_id:typeof p.metadata?.id==="string"?p.metadata.id:null,
    stored_question_reference:p.question_number,
    question_part:/^Q?0*\d+([a-z]*)$/i.exec(p.question_number)![1].toLowerCase(),
    marks:p.marks??null,...snapshots.get(p.id),
    question_asset:byPath.get(p.question_storage_path!),
    mark_scheme_asset:byPath.get(p.mark_scheme_storage_path!)
   }))
  })),assets
 };
 zip.file("manifest.json",JSON.stringify(manifest,null,2)+"\n");zip.file("READ-ME.txt",archiveReadme);
 onProgress?.("Preparing complete ZIP…");active(signal);
 const bytes=await zip.generateAsync({type:"uint8array",compression:"STORE"},()=>active(signal));
 await requireAuditOwner(owner,signal);
 return {bytes,manifest,filename:`multipart-audit-${paper.series.replace(/[^a-z0-9]/gi,"-")}-${paper.paper_code.replace(/[^a-z0-9]/gi,"")}-q${chosen.map(g=>g.number).join("-")}-${new Date().toISOString().slice(0,10)}.zip`,ownerId:owner};
}
