import {supabase} from "./supabase";
import {BUCKET,type Bundle} from "./shadowBundle";
import type {Intake,StagingPort} from "./stageShadowBundle";
const columns="id,original_paper_id,shadow_set,question_source_path,mark_scheme_source_path,intake_manifest_path,status,question_format,mark_scheme_format,uploaded_by";
export const shadowStagingPort:StagingPort={
 async owner(){const {data:{user},error}=await supabase.auth.getUser();const {data,error:roleError}=await supabase.rpc("is_approved_owner");if(error||!user||roleError||data!==true)throw Error("An approved owner session is required.");return user.id;},
 async validateOriginal(b:Bundle){
  const {data,error}=await supabase.from("exam_papers").select("id,exam_board,qualification,series,tier,paper_code").eq("id",b.paperId).single();if(error||!data)throw Error("Original paper unavailable.");
  const m=b.manifest.metadata as Record<string,unknown>;
  if(data.exam_board.toLowerCase()!=="edexcel"||data.series!==m.series||data.tier!==m.tier||data.paper_code!==String(m.paper_code).replace(/^1MA1\//,""))throw Error("Original paper changed; validate the ZIP again.");
  const parts=b.manifest.parts as {proposed_original_question_id:string;question:string;marks:number}[];
  const {data:rows,error:e}=await supabase.from("questions").select("id,paper_id,question_number,marks,shadow_paper_id").in("id",parts.map(p=>p.proposed_original_question_id));
  if(e||!rows||rows.length!==parts.length||parts.some(p=>{const r=rows.find(x=>x.id===p.proposed_original_question_id);return !r||r.paper_id!==b.paperId||r.shadow_paper_id||r.question_number.toLowerCase()!==p.question.toLowerCase()||r.marks!==p.marks;}))throw Error("Proposed original-part references or marks differ. Resolve before staging.");
  const skills=new Set<string>();
  for(let offset=0;;offset+=1000){
   const {data:labels,error:labelError}=await supabase.from("questions").select("skill").order("id").range(offset,offset+999);
   if(labelError)throw Error("Live taxonomy check unavailable.");
   for(const row of labels||[])for(const label of (row.skill||"").split(";"))if(label.trim())skills.add(label.trim());
   if((labels?.length||0)<1000)break;
  }
  if((b.manifest.parts as {skill:string}[]).some(p=>p.skill.split(";").some(label=>!skills.has(label.trim()))))throw Error("A proposed label is absent from the live taxonomy. Reconcile without reclassifying it automatically.");
 },
 async findIntake(paperId,set){const {data,error}=await supabase.from("shadow_papers").select(columns).eq("original_paper_id",paperId).ilike("shadow_set",set);if(error)throw Error("Intake lookup failed.");if((data?.length||0)>1)throw Error("Multiple set registrations need reconciliation.");return data?.[0] as Intake||null;},
 async children(prefix){const {data,error}=await supabase.storage.from(BUCKET).list(prefix.replace(/\/$/,""),{limit:2});if(error)throw Error("Private folder lookup failed.");return (data||[]).map(x=>x.name);},
 async read(path){const cut=path.lastIndexOf("/"),parent=path.slice(0,cut),name=path.slice(cut+1);const {data,error}=await supabase.storage.from(BUCKET).list(parent,{search:name,limit:100});if(error)throw Error("Cannot reconcile private storage.");if(!data?.some(x=>x.name===name&&x.id))return null;const result=await supabase.storage.from(BUCKET).download(path,{}, {cache:"no-store"});if(result.error||!result.data)throw Error("Cannot read back a private staging file.");return new Uint8Array(await result.data.arrayBuffer());},
 async put(path,bytes,contentType){const {error}=await supabase.storage.from(BUCKET).upload(path,new Uint8Array(bytes).buffer,{contentType,upsert:false});if(error)throw Error("Private upload was interrupted or conflicted.");},
 async register(row){const {data,error}=await supabase.from("shadow_papers").insert(row).select(columns).single();if(error||!data)throw Error("Intake registration did not return a row.");return data as Intake;}
};
