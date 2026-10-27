import { supabase } from "./supabase";
import { normaliseAssessments, type SavedAssessment } from "./worksheetLibrary";

// Cloud records are separate from browser records. Nothing here writes to localStorage.
// The existing database policies enforce auth.uid() = assessments.created_by.
async function currentUserId(): Promise<string> {
 const { data: { user }, error } = await supabase.auth.getUser();
 if (error || !user) throw new Error("Sign in before using cloud assessments.");
 return user.id;
}

type CloudRow = { id:string; title:string; configuration:unknown; created_at:string; revision?:number };
export type CloudAssessment = { cloudId:string; item:SavedAssessment; createdAt:string; revision?:number };

export async function getCloudAssessments():Promise<CloudAssessment[]> {
 const userId=await currentUserId();
 const {data,error}=await supabase.from("assessments").select("*").eq("created_by",userId).order("created_at",{ascending:false});
 if(error) throw new Error(`Cloud load failed: ${error.message}`);
 const rows=(data||[]) as CloudRow[];
 if(!rows.length)return [];
 const {data:links,error:linkError}=await supabase.from("assessment_questions").select("assessment_id,question_id,position").in("assessment_id",rows.map(r=>r.id)).order("position",{ascending:true});
 if(linkError)throw new Error(`Cloud questions could not be loaded: ${linkError.message}`);
 return rows.flatMap(row=>{
  const config=row.configuration && typeof row.configuration==="object" && !Array.isArray(row.configuration)?row.configuration as Record<string,unknown>:{};
  const ids=(links||[]).filter(link=>link.assessment_id===row.id).sort((a,b)=>a.position-b.position).map(link=>link.question_id as string);
  const saved=normaliseAssessments([{...config,id:`cloud-${row.id}`,name:row.title,ids}]);
  return saved.length?[{cloudId:row.id,item:saved[0],createdAt:row.created_at,revision:row.revision}]:[];
 });
}

export async function saveCloudAssessment(item:SavedAssessment):Promise<string> {
 const userId=await currentUserId();
 if(!item.ids.length)throw new Error("Add at least one question before saving to the cloud.");
 if(new Set(item.ids).size!==item.ids.length)throw new Error("An assessment cannot contain duplicate question references.");
 // Insert-only: never upsert or update an existing cloud assessment.
 // Retain local ID in configuration for traceability, not as a conflict target.
 const {data:created,error}=await supabase.from("assessments").insert({
  created_by:userId,title:item.name,configuration:{...item,originBrowserId:item.id}
 }).select("id").single();
 if(error||!created)throw new Error(`Cloud save failed: ${error?.message||"No assessment returned"}`);
 const cloudId=created.id as string;
 const {error:partsError}=await supabase.from("assessment_questions").insert(item.ids.map((question_id,position)=>({
  assessment_id:cloudId,question_id,position
 })));
 if(partsError){
  const {error:cleanupError}=await supabase.from("assessments").delete().eq("id",cloudId).eq("created_by",userId);
  throw new Error(`Could not save question references: ${partsError.message}.${cleanupError?" The incomplete assessment could not be cleaned up; contact support.": " No cloud assessment was retained."}`);
 }
 return cloudId;
}

// Deliberately no cloud update or delete. A later version can add explicit
// conflict handling and confirmations; browser storage is never modified here.
