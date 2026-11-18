import {sha,type Bundle,type BundleFile} from "./shadowBundle";
export type Intake={id:string;original_paper_id:string;shadow_set:string;question_source_path:string;mark_scheme_source_path:string;intake_manifest_path:string;status:string;question_format:string;mark_scheme_format:string;uploaded_by:string};
export type Registration=Omit<Intake,"id">;
export interface StagingPort{
 owner():Promise<string>;
 validateOriginal(bundle:Bundle):Promise<void>;
 findIntake(paperId:string,set:string):Promise<Intake|null>;
 children(prefix:string):Promise<string[]>;
 read(path:string):Promise<Uint8Array|null>;
 put(path:string,bytes:Uint8Array,type:string):Promise<void>;
 register(row:Registration):Promise<Intake>;
}
const decode=new TextDecoder(),encode=new TextEncoder();
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
/** No questions-table writes. A shared create-only claim serialises competing uploads of a set. */
export async function stageShadowBundle(bundle:Bundle,port:StagingPort,progress:(s:string)=>void=()=>{}){
 const actor=await port.owner();if(!uuid.test(actor))throw Error("Owner identity unavailable.");
 const authorise=async()=>{if(await port.owner()!==actor)throw Error("Owner session changed. Retry with the same bundle after signing in.");};
 await port.validateOriginal(bundle);
 const prefix=`shadow-paper-intake/${bundle.paperId}/${bundle.set.toLowerCase().replace(/ /g,"-")}/`;
 let existing=await port.findIntake(bundle.paperId,bundle.set);
 let folder:string;
 // Existing legacy intakes are never silently converted or overwritten.
 if(existing?.status==="reviewed")throw Error("This set is already reviewed; no new staging was created.");
 if(existing){folder=existing.intake_manifest_path.slice(0,-"intake.json".length);if(!existing.intake_manifest_path.endsWith("/intake.json"))throw Error("Existing intake requires manual reconciliation.");}
 else{
  const claimPath=prefix+"upload-claim.json";let claim=await port.read(claimPath);
  if(!claim){
   if((await port.children(prefix)).length)throw Error("Prior staging files exist without a claim. Reconcile that intake before uploading.");
   const bytes=encode.encode(JSON.stringify({version:1,paperId:bundle.paperId,set:bundle.set,bundleHash:bundle.hash,owner:actor}));await authorise();
   try{await port.put(claimPath,bytes,"application/json");}catch{/* A concurrent/uncertain write is reconciled by reading the claim. */}
   claim=await port.read(claimPath);if(!claim)throw Error("Upload claim was not stored. Retry safely.");
  }
  let c;try{c=JSON.parse(decode.decode(claim));}catch{throw Error("Unreadable staging claim. Owner reconciliation required.");}
  if(c.version!==1||c.paperId!==bundle.paperId||c.set!==bundle.set||c.bundleHash!==bundle.hash||!uuid.test(c.owner))throw Error("This set has a conflicting upload. No files were overwritten.");
  folder=prefix+c.owner+"/bundles/"+bundle.hash+"/";
 }
 const sameRow=(row:Intake)=>row.status!=="reviewed"&&row.original_paper_id===bundle.paperId&&row.shadow_set.toLowerCase()===bundle.set.toLowerCase()&&row.intake_manifest_path===folder+"intake.json"&&row.question_source_path===folder+"question-paper.pdf"&&row.mark_scheme_source_path===folder+"mark-scheme.pdf"&&row.question_format==="pdf"&&row.mark_scheme_format==="pdf";
 if(existing&&!sameRow(existing))throw Error("Existing intake does not match this bundle. No files were overwritten.");
 const verify=async(f:BundleFile)=>{const bytes=await port.read(folder+f.path);if(!bytes)return false;if(await sha(bytes)!==f.hash)throw Error("Stored file conflicts with bundle. No overwrite attempted.");return true;};
 // Existing registered bundles are read back as well: availability is never inferred from an ID.
 for(let i=0;i<bundle.files.length;i++){
  await authorise();const f=bundle.files[i];progress(`Checking file ${i+1} of ${bundle.files.length}`);
  if(await verify(f))continue;
  if(existing)throw Error("Registered intake has a missing file. Owner reconciliation required.");
  progress(`Uploading file ${i+1} of ${bundle.files.length}`);
  try{await port.put(folder+f.path,f.bytes,f.contentType);}catch{/* Read-back handles a lost response or a concurrent identical create. */}
  if(!await verify(f))throw Error(`File ${i+1} was not verified. Retry the same ZIP to resume.`);
 }
 await authorise();existing=await port.findIntake(bundle.paperId,bundle.set);
 if(existing){if(!sameRow(existing))throw Error("Another intake was registered. Reconcile without overwriting it.");}
 else{
  progress("All files verified. Registering private intake…");
  const row:Registration={original_paper_id:bundle.paperId,shadow_set:bundle.set,question_source_path:folder+"question-paper.pdf",mark_scheme_source_path:folder+"mark-scheme.pdf",intake_manifest_path:folder+"intake.json",question_format:"pdf",mark_scheme_format:"pdf",status:"awaiting-review",uploaded_by:actor};
  try{await port.register(row);}catch{/* Registration might have committed despite a lost response. */}
  existing=await port.findIntake(bundle.paperId,bundle.set);
  if(!existing||!sameRow(existing))throw Error("Files are private, but intake registration is unconfirmed. Retry this same ZIP to reconcile.");
 }
 await authorise();
 // Final integrity pass closes the gap between upload, registration and the success message.
 for(const f of bundle.files)if(!await verify(f))throw Error("Final remote verification failed. Intake needs reconciliation.");
 return {intakeId:existing.id,status:existing.status,questions:bundle.questions,parts:bundle.parts,marks:bundle.marks,verifiedFiles:bundle.files.length,private:true,selectableQuestionRecordsCreated:0};
}
