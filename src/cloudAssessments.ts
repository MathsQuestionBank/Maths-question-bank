import { supabase } from "./supabase";
import type { SavedAssessment } from "./worksheetLibrary";

// Storage adapter: never uses a secret/service-role key. Database RLS enforces ownership.
export async function getCloudAssessments():Promise<SavedAssessment[]> {
 const {data:{user},error:authError}=await supabase.auth.getUser();
 if(authError||!user)throw new Error("Sign in to load cloud assessments.");
 const {data,error}=await supabase.from("saved_assessments").select("assessment").eq("user_id",user.id).order("updated_at",{ascending:false});
 if(error)throw new Error(`Cloud load failed: ${error.message}`);
 return (data||[]).map(row=>row.assessment as SavedAssessment);
}
export async function saveCloudAssessment(item:SavedAssessment):Promise<void>{
 const {data:{user},error:authError}=await supabase.auth.getUser();
 if(authError||!user)throw new Error("Sign in to save assessments to the cloud.");
 const {error}=await supabase.from("saved_assessments").upsert({
  user_id:user.id,client_id:item.id,name:item.name,folder:item.folder,assessment:item,updated_at:new Date().toISOString()
 },{onConflict:"user_id,client_id"});
 if(error)throw new Error(`Cloud save failed: ${error.message}`);
}
export async function deleteCloudAssessment(id:string):Promise<void>{
 const {data:{user},error:authError}=await supabase.auth.getUser();
 if(authError||!user)throw new Error("Sign in to delete cloud assessments.");
 const {error}=await supabase.from("saved_assessments").delete().eq("user_id",user.id).eq("client_id",id);
 if(error)throw new Error(`Cloud delete failed: ${error.message}`);
}
