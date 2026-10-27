import { supabase } from "./supabase";
async function accountId():Promise<string>{const {data:{user},error}=await supabase.auth.getUser();if(error||!user)throw new Error("Please sign in.");return user.id}
export async function loadAccountFolders():Promise<string[]>{
 const owner=await accountId();
 const {data,error}=await supabase.from("assessment_folders").select("name").eq("owner_id",owner).order("name");
 if(error)throw new Error(error.message);return (data||[]).map(x=>x.name as string);
}
export async function createAccountFolder(name:string):Promise<void>{
 const cleaned=name.trim();if(!cleaned||cleaned.length>100||["all","unfiled"].includes(cleaned.toLowerCase()))throw new Error("Choose a valid folder name.");
 const owner=await accountId();
 const {error}=await supabase.from("assessment_folders").insert({owner_id:owner,name:cleaned});
 if(error)throw new Error(error.message);
}
export async function changeAccountFolder(oldName:string,newName:string):Promise<number>{
 await accountId();
 const {data,error}=await supabase.rpc("change_owned_assessment_folder",{p_old_name:oldName,p_new_name:newName});
 if(error)throw new Error(error.message);
 return Number(data)||0;
}
