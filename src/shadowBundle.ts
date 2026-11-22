import JSZip from "jszip";
export const BUCKET="exam-materials-private";
export type Original={id:string;exam_board:string;qualification:string;series:string;tier:string|null;paper_code:string};
export type BundleFile={path:string;bytes:Uint8Array;hash:string;contentType:string};
export type Bundle={paperId:string;set:string;hash:string;files:BundleFile[];questions:number;parts:number;marks:number;manifest:Record<string,unknown>};
const MAX_ZIP=60*1024*1024,MAX_TOTAL=150*1024*1024;
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const digest=/^[a-f0-9]{64}$/;
// JSZip exposes internalStream at runtime, but its 3.10 typings omit it.
// Keep this narrow adapter covered by the actual ZIP and browser tests.
type ZipStream={
 on(event:"data",callback:(chunk:Uint8Array)=>void):ZipStream;
 on(event:"error",callback:(error:Error)=>void):ZipStream;
 on(event:"end",callback:()=>void):ZipStream;
 pause():ZipStream;resume():ZipStream;
};
export const canonicalSet=(value:string)=>{if(!/^Set [A-Za-z0-9-]{1,12}$/i.test(value.trim()))throw Error("Invalid shadow set.");return "Set "+value.trim().slice(4).toUpperCase();};
export async function sha(bytes:Uint8Array){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new Uint8Array(bytes).buffer))).map(b=>b.toString(16).padStart(2,"0")).join("");}
const safe=(s:string)=>!!s&&!s.startsWith("/")&&!s.includes("\\")&&!s.includes(":")&&!s.split("/").some(x=>!x||x==="."||x==="..")&&!/[\x00-\x1f\x7f]/.test(s);
/** Bound expansion and reject duplicates before JSZip can sanitise/collapse entry names. ZIP64/encryption are not supported. */
function inspectDirectory(bytes:Uint8Array){
 const entries=new Map<string,{size:number;crc:number}>();
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50&&i+22+v.getUint16(i+20,true)===bytes.length){end=i;break;}
 if(end<0||v.getUint16(end+4,true)||v.getUint16(end+6,true))throw Error("Invalid or multi-disk ZIP.");
 const count=v.getUint16(end+10,true),size=v.getUint32(end+12,true);let pos=v.getUint32(end+16,true),total=0;const stop=pos+size,names=new Set<string>();
 if(!count||count>1000||pos===0xffffffff||stop>end||v.getUint16(end+8,true)!==count)throw Error("Unsupported ZIP directory.");
 for(let i=0;i<count;i++){
  if(pos+46>stop||v.getUint32(pos,true)!==0x02014b50)throw Error("Invalid ZIP entry.");
  const length=v.getUint32(pos+24,true),n=v.getUint16(pos+28,true),extra=v.getUint16(pos+30,true),comment=v.getUint16(pos+32,true),flags=v.getUint16(pos+8,true),method=v.getUint16(pos+10,true);
  if(pos+46+n+extra+comment>stop||(flags&1)||![0,8].includes(method)||length===0xffffffff||length>30*1024*1024)throw Error("Unsupported or oversized ZIP entry.");
  const name=new TextDecoder("utf-8",{fatal:true}).decode(bytes.subarray(pos+46,pos+46+n));const clean=name.endsWith("/")?name.slice(0,-1):name;
  if(!safe(clean)||names.has(clean.toLowerCase())||((v.getUint32(pos+38,true)>>>16)&0xf000)===0xa000)throw Error("Unsafe or duplicate ZIP path.");names.add(clean.toLowerCase());entries.set(name,{size:length,crc:v.getUint32(pos+16,true)});total+=length;if(total>MAX_TOTAL)throw Error("Expanded ZIP exceeds 150 MB.");
  pos+=46+n+extra+comment;
 }if(pos!==stop)throw Error("Invalid ZIP directory size.");return entries;
}
const object=(x:unknown):Record<string,any>=>{if(!x||typeof x!=="object"||Array.isArray(x))throw Error("Invalid manifest structure.");return x as Record<string,any>;};
const equal=(a:unknown,b:unknown,message:string)=>{if(a!==b)throw Error(message);};
export async function inspectShadowBundle(bytes:Uint8Array,original:Original):Promise<Bundle>{
 if(!bytes.length||bytes.length>MAX_ZIP)throw Error("Choose a ZIP up to 60 MB.");const directory=inspectDirectory(bytes);
 const zip=await JSZip.loadAsync(bytes);
 // Stop streaming before accepting bytes beyond declared/allowed sizes. Header
 // bounds alone cannot stop an archive that understates its expanded length.
 const readEntry=(path:string,limit:number)=>new Promise<Uint8Array>((resolve,reject)=>{
  const entry=zip.file(path),header=directory.get(path);
  if(!entry||!header||header.size>limit){reject(Error("Missing or oversized ZIP entry."));return;}
  const stream=(entry as unknown as {internalStream(type:"uint8array"):ZipStream}).internalStream("uint8array"),chunks:Uint8Array[]=[];let length=0,crc=0xffffffff,failed=false;
  stream.on("data",(chunk:Uint8Array)=>{
   if(failed)return;
   if(length+chunk.length>Math.min(header.size,limit)){failed=true;stream.pause();reject(Error("ZIP entry exceeds its declared or permitted expanded size."));return;}
   length+=chunk.length;chunks.push(chunk);
   for(const byte of chunk){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  }).on("error",reject).on("end",()=>{
   if(failed)return;
   if(length!==header.size||((crc^0xffffffff)>>>0)!==header.crc){reject(Error("ZIP entry size or CRC mismatch."));return;}
   const result=new Uint8Array(length);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}resolve(result);
  }).resume();
 });
 const raw=await readEntry("intake.json",2*1024*1024);if(raw.length>2*1024*1024)throw Error("Manifest exceeds 2 MB.");let m:Record<string,any>;try{m=object(JSON.parse(new TextDecoder().decode(raw)));}catch{throw Error("Invalid intake.json.");}
 if(m.version!==1||m.kind!=="official-shadow"||m.status!=="awaiting-review"||!uuid.test(m.original_paper_id))throw Error("Expected an unapproved official-shadow staging manifest.");
 equal(m.original_paper_id,original.id,"Selected original paper differs from manifest.");const set=canonicalSet(m.shadow_set);
 const meta=object(m.metadata);equal(meta.series,original.series,"Series mismatch.");equal(meta.tier,original.tier,"Tier mismatch.");equal(String(meta.paper_code).replace(/^1MA1\//,""),original.paper_code,"Paper mismatch.");
 if(original.exam_board.toLowerCase()!=="edexcel"||meta.exam_board!=="Pearson Edexcel"||meta.qualification!=="GCSE Mathematics (1MA1)"||!original.qualification.toLowerCase().includes("gcse"))throw Error("Unsupported qualification/board.");
 equal(meta.calculator,original.paper_code[0]!=="1","Calculator metadata mismatch.");
 if(!Array.isArray(m.parts)||!m.parts.length||m.parts.length>300||!Array.isArray(m.assets)||m.assets.length>100)throw Error("Invalid parts/assets.");
 const groups=new Map<number,number>(),refs=new Set<string>(),ids=new Set<string>();let marks=0;
 for(const p of m.parts){object(p);const match=typeof p.question==="string"&&p.question.match(/^Q(\d{2})([a-z]*)$/i);if(!match||+match[1]<1||+match[1]>50||refs.has(p.question.toLowerCase())||!Number.isInteger(p.marks)||p.marks<1||p.marks>20||!p.topic?.trim()||!p.skill?.trim())throw Error("Invalid or repeated assessed part.");
  refs.add(p.question.toLowerCase());groups.set(+match[1],(groups.get(+match[1])||0)+p.marks);marks+=p.marks;
  const id=p.proposed_original_question_id;if(!uuid.test(id)||ids.has(id)||p.candidate_original_record_id!==id||p.original_link_verification!=="unverified"||p.shadow_of_question_id!==null||p.approved!==false||p.ao!==null||p.spec!==null||p.ao_spec_status!=="provisional")throw Error("Parts must preserve unverified proposed links and provisional mappings.");ids.add(id);
 }
 if(marks!==80||groups.size>50)throw Error("A complete GCSE paper must account for 80 marks.");
 const c=object(m.counts);for(const [key,n] of Object.entries({questions:groups.size,parts:m.parts.length,marks,question_images:groups.size,mark_scheme_images:groups.size}))equal(c[key],n,"Manifest counts do not reconcile.");
 equal(meta.total_marks,marks,"Paper total differs.");equal(m.original_stored_image_verification,"outstanding","Stored-original image verification must remain outstanding.");
 if(m.publication?.selectable!==false||m.publication?.teacher_approved!==false||m.publication?.question_records_created!==false||!m.teacher_review||typeof m.teacher_review!=="object"||Array.isArray(m.teacher_review)||!Object.keys(m.teacher_review).length)throw Error("Missing provisional status or teacher-review flags.");
 const expected=new Map<string,{hash:string;type:string}>();const add=(path:unknown,hash:unknown,type:string)=>{if(typeof path!=="string"||!safe(path)||path==="intake.json"||expected.has(path)||typeof hash!=="string"||!digest.test(hash))throw Error("Invalid or repeated asset identity.");expected.set(path,{hash,type});};
 equal(m.question_source_relative_path,"question-paper.pdf","Unsupported question source path.");equal(m.mark_scheme_source_relative_path,"mark-scheme.pdf","Unsupported marking source path.");
 add(m.question_source_relative_path,m.source_files?.question?.sha256,"application/pdf");add(m.mark_scheme_source_relative_path,m.source_files?.mark?.sha256,"application/pdf");
 const assetKeys=new Set<string>();for(const a of m.assets){object(a);if(!groups.has(a.number)||!["question","mark"].includes(a.kind)||a.approved!==false||a.crop_review!=="unreviewed"||!Array.isArray(a.source_pages)||!a.source_pages.length)throw Error("Invalid unapproved crop metadata.");const key=a.number+":"+a.kind;if(assetKeys.has(key))throw Error("Repeated question/mark image.");assetKeys.add(key);if(!a.relative_storage_path.endsWith(`-${a.sha256}.png`)||!/^drafts\/Q\d{2}\/(question|mark)-[a-f0-9]{64}\.png$/.test(a.relative_storage_path)||!a.relative_storage_path.startsWith(`drafts/Q${String(a.number).padStart(2,"0")}/${a.kind}-`))throw Error("Invalid draft image path.");add(a.relative_storage_path,a.sha256,"image/png");}
 if(assetKeys.size!==groups.size*2)throw Error("Each whole question needs both images.");
 for(const [name,f] of Object.entries(zip.files)){if(!f.dir&&(f as unknown as {unsafeOriginalName?:string}).unsafeOriginalName&&(f as unknown as {unsafeOriginalName?:string}).unsafeOriginalName!==name)throw Error("Unsafe normalised ZIP path.");if(!f.dir&&name!=="intake.json"&&!expected.has(name))throw Error("ZIP contains an unreferenced file.");}
 const files:BundleFile[]=[];
 for(const [path,info] of expected){const f=zip.file(path);if(!f)throw Error("A required source or image is missing.");const b=await readEntry(path,info.type==="application/pdf"?30*1024*1024:10*1024*1024);if(await sha(b)!==info.hash)throw Error("File checksum mismatch.");
  if(info.type==="application/pdf"){if(new TextDecoder().decode(b.slice(0,5))!=="%PDF-"||!new TextDecoder().decode(b.slice(-2048)).includes("%%EOF"))throw Error("Invalid PDF source.");}
  else{const v=new DataView(b.buffer,b.byteOffset,b.byteLength);if(b.length<33||Array.from(b.slice(0,8)).join()!=="137,80,78,71,13,10,26,10"||new TextDecoder().decode(b.slice(12,16))!=="IHDR"||!v.getUint32(16)||!v.getUint32(20)||v.getUint32(16)*v.getUint32(20)>100000000)throw Error("Invalid or oversized PNG image.");}
  files.push({path,bytes:b,hash:info.hash,contentType:info.type});
 }
 files.push({path:"intake.json",bytes:raw,hash:await sha(raw),contentType:"application/json"});files.sort((a,b)=>a.path.localeCompare(b.path));
 return {paperId:original.id,set,hash:await sha(new TextEncoder().encode(JSON.stringify(files.map(f=>[f.path,f.hash])))),files,questions:groups.size,parts:m.parts.length,marks,manifest:m};
}
