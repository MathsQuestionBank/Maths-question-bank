import {beforeEach,describe,expect,it,vi} from "vitest";
import JSZip from "jszip";
const {getUser,rpc,from,storageFrom,download}=vi.hoisted(()=>({getUser:vi.fn(),rpc:vi.fn(),from:vi.fn(),storageFrom:vi.fn(),download:vi.fn()}));
vi.mock("./supabase",()=>({supabase:{auth:{getUser},rpc,from,storage:{from:storageFrom}}}));
import {auditMultipartGroups,createMultipartAuditZip,loadAuditPaper,loadAuditPapers,requireAuditOwner,type AuditPaper,type AuditPart} from "./multipartAuditExport";
const paper:AuditPaper={id:"paper-id",exam_board:"Edexcel",qualification:"GCSE Mathematics",series:"November 2022",paper_code:"3H",tier:"Higher"};
const part=(suffix:string,changes:Partial<AuditPart>={}):AuditPart=>({id:`record-${suffix}`,paper_id:paper.id,question_number:`Q014${suffix}`,marks:suffix==="a"?2:3,metadata:{id:`2022_3H_Q14${suffix}`,image_crops:{question:{top:1,right:2,bottom:3,left:4}},crop_review:{question:"approved",mark:"unreviewed"},unrelated_private_field:"must-not-export",questionUrl:"https://expired.example/?token=NEVER_EXPORT"},question_storage_path:"publisher-private/questions/14.png",mark_scheme_storage_path:"publisher-private/marks/14.png",...changes});
const png=new Uint8Array([137,80,78,71,13,10,26,10,1,2,3]);
let rows:AuditPart[],papers:AuditPaper[],queries:{table:string;filters:Record<string,unknown>;range?:number[]}[],bitmapClose:ReturnType<typeof vi.fn>;
function query(table:string) {
 const item={table,filters:{} as Record<string,unknown>,range:undefined as number[]|undefined};queries.push(item);
 const result=()=>({error:null,data:table==="exam_papers"?papers:rows.filter(p=>!item.filters.paper_id||p.paper_id===item.filters.paper_id).slice(item.range?.[0]??0,(item.range?.[1]??999999)+1)});
 const q={select:vi.fn(()=>q),eq:vi.fn((key:string,v:unknown)=>{item.filters[key]=v;return q}),in:vi.fn(()=>q),is:vi.fn(()=>q),order:vi.fn(()=>q),limit:vi.fn(()=>q),range:vi.fn((a:number,b:number)=>{item.range=[a,b];return q}),abortSignal:vi.fn(()=>q),single:vi.fn(async()=>({data:papers.find(p=>p.id===item.filters.id)??null,error:null})),then:(resolve:(value:unknown)=>unknown,reject?:(e:unknown)=>unknown)=>Promise.resolve(result()).then(resolve,reject)};
 return q;
}
beforeEach(()=>{
 vi.resetAllMocks();bitmapClose=vi.fn();vi.stubGlobal("createImageBitmap",vi.fn(async()=>({width:1200,height:1800,close:bitmapClose})));
 getUser.mockResolvedValue({data:{user:{id:"owner",user_metadata:{role:"owner"}}},error:null});rpc.mockResolvedValue({data:true,error:null});
 rows=[part("a"),part("b")];papers=[{...paper}];queries=[];from.mockImplementation(query);storageFrom.mockReturnValue({download});download.mockImplementation(async()=>({data:new Blob([png],{type:"image/png"}),error:null}));
});

describe("verified owner access",()=>{
 it.each([null,{id:"teacher",user_metadata:{role:"owner"}}])("denies missing/forged owner accounts without querying questions or storage",async user=>{
  getUser.mockResolvedValue({data:{user},error:null});rpc.mockResolvedValue({data:false,error:null});
  await expect(loadAuditPapers()).rejects.toThrow("approved owner");await expect(createMultipartAuditZip(paper.id,[14])).rejects.toThrow("approved owner");expect(from).not.toHaveBeenCalled();expect(storageFrom).not.toHaveBeenCalled();
 });
 it("fails closed on auth or owner RPC errors",async()=>{
  getUser.mockResolvedValueOnce({data:{user:{id:"owner"}},error:new Error("offline")});await expect(requireAuditOwner()).rejects.toThrow("approved owner");
  rpc.mockResolvedValueOnce({data:true,error:{message:"failed"}});await expect(requireAuditOwner()).rejects.toThrow("approved owner");expect(from).not.toHaveBeenCalled();
 });
 it("requires an exact boolean approval and the same verified user",async()=>{
  rpc.mockResolvedValueOnce({data:"true",error:null});await expect(requireAuditOwner()).rejects.toThrow("approved owner");await expect(requireAuditOwner("another-owner")).rejects.toThrow("approved owner");
 });
 it("stops after revocation between image downloads",async()=>{
  download.mockImplementationOnce(async()=>{rpc.mockResolvedValue({data:false,error:null});return {data:new Blob([png]),error:null}});
  await expect(createMultipartAuditZip(paper.id,[14])).rejects.toThrow("approved owner");expect(download).toHaveBeenCalledTimes(1);
 });
 it("checks permissions again after the last image, before releasing the ZIP",async()=>{
  download.mockImplementation(async(path:string)=>{if(path.includes("marks"))rpc.mockResolvedValue({data:false,error:null});return {data:new Blob([png]),error:null}});
  await expect(createMultipartAuditZip(paper.id,[14])).rejects.toThrow("approved owner");expect(download).toHaveBeenCalledTimes(2);
 });
 it("stops when another account replaces the session",async()=>{
  download.mockImplementationOnce(async()=>{getUser.mockResolvedValue({data:{user:{id:"another-owner"}},error:null});return {data:new Blob([png]),error:null}});
  await expect(createMultipartAuditZip(paper.id,[14])).rejects.toThrow("approved owner");expect(download).toHaveBeenCalledTimes(1);
 });
});

describe("multipart inventory and complete original-byte ZIP",()=>{
 it("groups by original paper/number, retaining raw nested part labels and missing marks",()=>{
  const groups=auditMultipartGroups([part("ai"),part("aii",{marks:null}),part("b"),part("single",{question_number:"Q15"})]);expect(groups).toHaveLength(1);expect(groups[0].number).toBe(14);expect(groups[0].parts.map(p=>p.question_number)).toEqual(["Q014ai","Q014aii","Q014b"]);expect(groups[0].marks).toBeNull();
 });
 it("rejects ambiguous grouping rather than dropping unknown or duplicate parts",()=>{
  expect(()=>auditMultipartGroups([part("a"),part("a")])).toThrow("Duplicate part record");expect(()=>auditMultipartGroups([part("a"),part("b",{question_number:"14a"})])).toThrow("Duplicate printed part");expect(()=>auditMultipartGroups([part("a",{question_number:"Unknown"})])).toThrow("cannot be grouped safely");
 });
 it("loads only supported paper identities and paginates all records for a paper",async()=>{
  papers.push({...paper,id:"other",exam_board:"AQA"});expect(await loadAuditPapers()).toEqual([paper]);
  rows=Array.from({length:1001},(_,i)=>part(String(i),{id:String(i),question_number:`Q${i+1}`}));rows.push(part("b",{question_number:"Q1b"}));const result=await loadAuditPaper(paper.id);expect(result.groups).toHaveLength(1);expect(result.groups[0].parts).toHaveLength(2);expect(queries.filter(q=>q.table==="questions").map(q=>q.range)).toEqual([[0,999],[1000,1999]]);expect(storageFrom).not.toHaveBeenCalled();
 });
 it("writes a complete ZIP mapping all question/mark assets to exact audit record IDs and path fingerprints",async()=>{
  const before=JSON.stringify(rows),result=await createMultipartAuditZip(paper.id,[14]);const zip=await JSZip.loadAsync(result.bytes);const manifest=JSON.parse(await zip.file("manifest.json")!.async("string"));
  expect(manifest).toEqual(result.manifest);expect(manifest.complete).toBe(true);expect(manifest.paper).toMatchObject({paper_id:paper.id,series:"November 2022",paper_code:"3H"});expect(manifest).toMatchObject({part_count:2,asset_count:2,review_status:"unreviewed_not_teacher_approved"});
  expect(manifest.groups[0]).toMatchObject({audit_family_key:"paper-id:Q14",original_question_number:14,marks:5});
  expect(manifest.groups[0].parts.map((p:any)=>[p.database_record_id,p.source_question_id,p.question_part,p.marks,p.question_asset,p.mark_scheme_asset])).toEqual([["record-a","2022_3H_Q14a","a",2,"asset-001","asset-002"],["record-b","2022_3H_Q14b","b",3,"asset-001","asset-002"]]);
  expect(manifest.groups[0].parts[0].existing_image_crops).toEqual(rows[0].metadata.image_crops);expect(manifest.groups[0].parts[0].existing_whole_image_crop_review).toEqual(rows[0].metadata.crop_review);
  expect(manifest.assets[0]).toMatchObject({width:1200,height:1800,sha256:"7f47b756761a46e6d4a4d96f0d8a4448f8449235009d1f3ad1493f5c773c19e8",source_path_sha256:"17ebe15765674472b164208073d72ebc2d21d26a3ad92d5cf4e687bc8f1af7de"});
  for(const asset of manifest.assets)expect(await zip.file(asset.file)!.async("uint8array")).toEqual(png);
  expect(download).toHaveBeenCalledTimes(2);expect(storageFrom).toHaveBeenCalledWith("exam-materials-private");expect(download.mock.calls[0][1]).toEqual({});expect(download.mock.calls[0][2]).toMatchObject({cache:"no-store",signal:expect.any(AbortSignal)});expect(bitmapClose).toHaveBeenCalledTimes(2);expect(JSON.stringify(rows)).toBe(before);
  const text=await zip.file("manifest.json")!.async("string");for(const secret of ["publisher-private","NEVER_EXPORT","expired.example","must-not-export","unrelated_private_field"])expect(text).not.toContain(secret);expect(Object.keys(zip.files).sort()).toEqual(["READ-ME.txt","assets/","assets/asset-001.png","assets/asset-002.png","manifest.json"]);
 });
 it("retains distinct sibling assets and their correct mark association",async()=>{
  rows[1].question_storage_path="questions/14b.png";rows[1].mark_scheme_storage_path="marks/14b.png";
  const {manifest}=await createMultipartAuditZip(paper.id,[14]);expect(manifest.asset_count).toBe(4);expect(manifest.groups[0].parts[1]).toMatchObject({question_asset:"asset-003",mark_scheme_asset:"asset-004"});
 });
 it("takes a fresh snapshot at export, not the earlier list or expired preview URLs",async()=>{
  await loadAuditPaper(paper.id);rows[1].marks=4;const {manifest}=await createMultipartAuditZip(paper.id,[14]);expect(manifest.groups[0].marks).toBe(6);expect(download.mock.calls.every(([path])=>!path.includes("http"))).toBe(true);
 });
 it.each([[],[14,14],Array.from({length:11},(_,i)=>i+1),[1.5]].map(numbers=>({numbers})))("rejects invalid or oversized batch $numbers",async ({numbers})=>{
  await expect(createMultipartAuditZip(paper.id,numbers)).rejects.toThrow("Choose between");expect(download).not.toHaveBeenCalled();
 });
 it("does not quietly omit disappeared groups, missing assets, or foreign records",async()=>{
  await expect(createMultipartAuditZip(paper.id,[15])).rejects.toThrow("unavailable");rows[1].mark_scheme_storage_path=null;await expect(createMultipartAuditZip(paper.id,[14])).rejects.toThrow("missing");expect(download).not.toHaveBeenCalled();
 });
 it("does not export original practice or unsupported papers",async()=>{
  rows[1].metadata.content_rights="original";await expect(createMultipartAuditZip(paper.id,[14])).rejects.toThrow("unavailable");papers[0].qualification="Statistics";await expect(createMultipartAuditZip(paper.id,[14])).rejects.toThrow("unavailable");expect(download).not.toHaveBeenCalled();
 });
 it("keeps unknown source IDs, marks and crops null rather than inventing them",async()=>{
  rows[0].metadata={};rows[0].marks=null;const {manifest}=await createMultipartAuditZip(paper.id,[14]);expect(manifest.groups[0].marks).toBeNull();expect(manifest.groups[0].parts[0]).toMatchObject({source_question_id:null,marks:null,existing_image_crops:null,existing_whole_image_crop_review:null});
 });
});

describe("download failure, privacy and cancellation",()=>{
 it("retries once using a fresh verified session and never signs or transforms URLs",async()=>{
  download.mockResolvedValueOnce({data:null,error:{message:"expired session"}});const {manifest}=await createMultipartAuditZip(paper.id,[14]);expect(manifest.complete).toBe(true);expect(download).toHaveBeenCalledTimes(3);expect(rpc).toHaveBeenCalledWith("is_approved_owner");
 });
 it("times out stalled authenticated reads and stops after one retry",async()=>{
  vi.useFakeTimers();
  try {
   download.mockImplementation((_p,_o,{signal})=>new Promise(resolve=>signal.addEventListener("abort",()=>resolve({data:null,error:{message:"aborted"}}),{once:true})));
   const failed=expect(createMultipartAuditZip(paper.id,[14])).rejects.toThrow("No ZIP was created");
   await vi.advanceTimersByTimeAsync(90001);await failed;expect(download).toHaveBeenCalledTimes(2);
  }finally {vi.useRealTimers();}
 });
 it("returns no partial archive and hides raw storage errors after a failed retry",async()=>{
  download.mockResolvedValue({data:null,error:{message:"private-path?token=SECRET"}});await expect(createMultipartAuditZip(paper.id,[14])).rejects.toThrow("No ZIP was created");expect(download).toHaveBeenCalledTimes(2);
 });
 it("cancels in-flight reads and never retries cancellation",async()=>{
  const controller=new AbortController();download.mockImplementationOnce(async(_p,_o,{signal})=>{controller.abort();expect(signal.aborted).toBe(true);return {data:new Blob([png]),error:null}});await expect(createMultipartAuditZip(paper.id,[14],{signal:controller.signal})).rejects.toThrow("cancelled");expect(download).toHaveBeenCalledTimes(1);
 });
 it("rejects URLs, path traversal and malformed crop metadata before any download",async()=>{
  rows[0].question_storage_path="https://signed.example/?token=secret";await expect(createMultipartAuditZip(paper.id,[14])).rejects.toThrow("Invalid private asset");rows[0].question_storage_path="../../escape";await expect(createMultipartAuditZip(paper.id,[14])).rejects.toThrow("Invalid private asset");rows[0].question_storage_path="safe.png";rows[0].metadata.image_crops={question:{url:"credentials"}};await expect(createMultipartAuditZip(paper.id,[14])).rejects.toThrow("Crop metadata");expect(download).not.toHaveBeenCalled();
 });
 it("rejects empty/oversized, non-image and undecodable responses",async()=>{
  download.mockResolvedValueOnce({data:new Blob(),error:null});await expect(createMultipartAuditZip(paper.id,[14])).rejects.toThrow("size limit");download.mockResolvedValueOnce({data:new Blob([new Uint8Array(20*1024*1024+1)]),error:null});await expect(createMultipartAuditZip(paper.id,[14])).rejects.toThrow("size limit");download.mockResolvedValueOnce({data:new Blob(["<html>Error</html>"]),error:null});await expect(createMultipartAuditZip(paper.id,[14])).rejects.toThrow("not a supported raster");vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error("invalid PNG"));await expect(createMultipartAuditZip(paper.id,[14])).rejects.toThrow("could not be decoded");
 });
});
