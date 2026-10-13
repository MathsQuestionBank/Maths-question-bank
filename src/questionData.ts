import { supabase } from "./supabase";
export type BankQuestion = { id:string; topic:string; skill:string; tier:"Foundation"|"Higher"; grade:number; marks:number; calculator:boolean; series:string; ao:string; challenge:string; prompt:string; answer:string; tags:string[] };
type Row = { id:string; topic:string|null; skill:string|null; assessment_objective:string|null; marks:number|null; metadata:Record<string,unknown>; exam_papers?:{series:string;tier:string|null}|null };
const str=(v:unknown, fallback="")=>typeof v==="string"?v:fallback;
export async function loadBankQuestions():Promise<BankQuestion[]> {
 const {data,error}=await supabase.from("questions").select("id,topic,skill,assessment_objective,marks,metadata,exam_papers(series,tier)").order("created_at",{ascending:false}).limit(1000);
 if(error)throw error;
 return ((data||[]) as unknown as Row[]).map(r=>{const m=r.metadata||{};return {id:r.id,topic:r.topic||"Unmapped",skill:r.skill||"Unmapped",tier:(r.exam_papers?.tier==="Foundation"||m.tier==="Foundation"?"Foundation":"Higher"),grade:Number(m.grade)||1,marks:r.marks||0,calculator:m.calculator===true,series:r.exam_papers?.series||str(m.series,"Unspecified"),ao:r.assessment_objective||str(m.ao,"Unmapped"),challenge:str(m.challenge,"Standard"),prompt:str(m.prompt,"Question image pending"),answer:str(m.answer,"Mark scheme pending"),tags:Array.isArray(m.tags)?m.tags.filter((t):t is string=>typeof t==="string"):[]}})});
}
