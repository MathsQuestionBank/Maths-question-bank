import { validCrop, type Crop } from "./CropEditor";
import { supabase } from "./supabase";
export type BankQuestion = { id:string; topic:string; skill:string; tier:"Foundation"|"Higher"; examBoard?:string; paperCode?:string; grade:number; marks:number; calculator:boolean; series:string; ao:string; challenge:string; prompt:string; answer:string; tags:string[]; sourceId?:string; wholeKey?:string; wholeMarks?:number; meanPct?:number; gradePerformance:Record<number,number|null>; imagePending?:boolean; questionUrl?:string; markSchemeUrl?:string; imageCrops:{question:Crop;mark:Crop}; cropReview:{question:string;mark:string} };
type Row = { id:string; topic:string|null; skill:string|null; assessment_objective:string|null; marks:number|null; metadata:Record<string,unknown>; question_storage_path?:string|null; mark_scheme_storage_path?:string|null; exam_papers?:{exam_board:string;series:string;paper_code:string;tier:string|null}|null };
const str=(v:unknown, fallback="")=>typeof v==="string"?v:fallback;
export async function loadBankQuestions(onImageUrls?: (questions:BankQuestion[])=>void):Promise<BankQuestion[]> {
 const {data:{session},error:sessionError}=await supabase.auth.getSession();
 if(sessionError)throw new Error("Authentication unavailable: "+sessionError.message);
 if(!session)throw new Error("Your owner session is not ready. Please sign in again.");
 const rows:Row[]=[];
 for(let offset=0;;offset+=500){
  const {data,error}=await supabase.from("questions").select("id,topic,skill,assessment_objective,marks,metadata,question_storage_path,mark_scheme_storage_path,exam_papers(exam_board,series,paper_code,tier)").order("created_at",{ascending:false}).order("id").range(offset,offset+499);
  if(error)throw new Error(`Supabase question query failed: ${error.message} (${error.code})`);
  rows.push(...((data||[]) as unknown as Row[]));
  if(!data||data.length<500)break;
 }
 const mapRows=(signed:Map<string,string>):BankQuestion[]=>rows.map(r=>{const m=r.metadata||{};return {
 id:r.id,topic:r.topic||"Unmapped",skill:r.skill||"Unmapped",tier:(r.exam_papers?.tier==="Foundation"||m.tier==="Foundation"?"Foundation":"Higher"),examBoard:str(r.exam_papers?.exam_board,str(m.exam_board)),paperCode:str(r.exam_papers?.paper_code,str(m.paper)),grade:Number(m.grade)||0,marks:r.marks||0,calculator:m.calculator===true,series:str(r.exam_papers?.series,str(m.series,"Unspecified")),ao:r.assessment_objective||str(m.ao,"Unmapped"),challenge:str(m.challenge,"Standard"),prompt:str(m.prompt,"Question image not yet uploaded — metadata only"),answer:str(m.answer,"Mark scheme pending"),tags:Array.isArray(m.tags)?m.tags.filter((t):t is string=>typeof t==="string"):[],sourceId:str(m.id),wholeKey:str(m.whole_key)||undefined,wholeMarks:typeof m.whole_marks==="number"?m.whole_marks:undefined,meanPct:typeof m.mean_pct==="number"?m.mean_pct:undefined,gradePerformance:Object.fromEntries([1,2,3,4,5,6,7,8,9].map(n=>[n,typeof m["g"+n]==="number"?m["g"+n]:null])) as Record<number,number|null>,imagePending:!r.question_storage_path,questionUrl:r.question_storage_path?signed.get(r.question_storage_path):undefined,markSchemeUrl:r.mark_scheme_storage_path?signed.get(r.mark_scheme_storage_path):undefined,imageCrops:{question:validCrop((m.image_crops as Record<string,unknown>|undefined)?.question),mark:validCrop((m.image_crops as Record<string,unknown>|undefined)?.mark)},cropReview:{question:str((m.crop_review as Record<string,unknown>|undefined)?.question,"unreviewed"),mark:str((m.crop_review as Record<string,unknown>|undefined)?.mark,"unreviewed")}
 };});
 // Render metadata immediately. Image signing must not block the question bank results.
 const questions=mapRows(new Map());
 if(onImageUrls&&rows.length){
  const paths=[...new Set(rows.flatMap(r=>[r.question_storage_path,r.mark_scheme_storage_path].filter((p):p is string=>!!p)))];
  void (async()=>{
   const signed=new Map<string,string>();
   for(let i=0;i<paths.length;i+=100){
    const {data:urls,error:signError}=await supabase.storage.from("exam-materials-private").createSignedUrls(paths.slice(i,i+100),3600);
    if(signError){console.warn("Some private image links could not be refreshed",signError.message);continue;}
    for(const u of urls||[])if(u.signedUrl&&u.path)signed.set(u.path,u.signedUrl);
   }
   onImageUrls(mapRows(signed));
  })().catch(err=>console.warn("Image URLs unavailable; question metadata remains visible",err));
 }
 return questions;
}
