import { supabase } from "./supabase";
import type { SavedAssessment } from "./worksheetLibrary";

/** All writes are atomic on the database. Requires reviewed V1.4 SQL migration. */
export type VersionedAssessment = { cloudId:string; revision:number; item:SavedAssessment };
export type SaveResult = { cloudId:string; revision:number };

export async function saveVersionedAssessment(item:SavedAssessment, prior?:{cloudId:string;revision:number}):Promise<SaveResult>{
 if(!item.ids.length||new Set(item.ids).size!==item.ids.length)throw new Error("Select distinct questions before saving.");
 const {data:{user},error:authError}=await supabase.auth.getUser();
 if(authError||!user)throw new Error("Please sign in to save your assessment.");
 const {data,error}=await supabase.rpc("save_owned_assessment",{
  p_id:prior?.cloudId??null,
  p_expected_revision:prior?.revision??null,
  p_title:item.name,
  p_configuration:{...item,originBrowserId:item.id},
  p_question_ids:item.ids
 });
 if(error){
  if(error.code==="40001")throw new Error("This assessment changed on another device. Reload and choose which version to keep. Your edits have not been discarded.");
  throw new Error(`Could not save to your account: ${error.message}`);
 }
 const result=Array.isArray(data)?data[0]:data;
 if(!result?.saved_id||!Number.isInteger(Number(result.saved_revision)))throw new Error("Save response was incomplete; check your library before retrying.");
 return {cloudId:result.saved_id,revision:Number(result.saved_revision)};
}

export async function deleteVersionedAssessment(cloudId:string,expectedRevision:number):Promise<void>{
 const {data:{user},error:authError}=await supabase.auth.getUser();
 if(authError||!user)throw new Error("Please sign in before deleting.");
 const {data,error}=await supabase.rpc("delete_owned_assessment",{p_id:cloudId,p_expected_revision:expectedRevision});
 if(error?.code==="40001")throw new Error("This assessment changed on another device. Reload before deleting.");
 if(error||data!==true)throw new Error(`Cloud deletion was not confirmed: ${error?.message??"Unknown error"}`);
}
