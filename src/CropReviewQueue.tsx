import { useMemo, useState } from "react";
import { supabase } from "./supabase";
import CropEditor, { CroppedImage, type Crop } from "./CropEditor";

export type ReviewQuestion={id:string;sourceId?:string;topic:string;skill:string;series:string;questionUrl?:string;markSchemeUrl?:string;imageCrops:{question:Crop;mark:Crop};cropReview:{question:string;mark:string}};
type Kind="question"|"mark";
export default function CropReviewQueue({questions,onUpdate}:{questions:ReviewQuestion[];onUpdate:(id:string,patch:Partial<ReviewQuestion>)=>void}){
 const [kind,setKind]=useState<Kind>("mark");
 const [filter,setFilter]=useState("unreviewed");
 const [search,setSearch]=useState("");
 const [index,setIndex]=useState(0);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const available=useMemo(()=>questions.filter(q=>kind==="mark"?!!q.markSchemeUrl:!!q.questionUrl),[questions,kind]);
 const list=useMemo(()=>available.filter(q=>(filter==="all"||q.cropReview[kind]===filter)&&(!search||[q.sourceId,q.topic,q.skill,q.series].join(" ").toLowerCase().includes(search.toLowerCase()))),[available,filter,search,kind]);
 const current=list[Math.min(index,Math.max(0,list.length-1))];
 const count=(status:string)=>available.filter(q=>q.cropReview[kind]===status).length;
 const update=async(status:"approved"|"needs-fix")=>{
  if(!current)return;setBusy(true);setMessage("");
  try{
   const {data:{user}}=await supabase.auth.getUser();
   const {data:owner,error:ownerError}=await supabase.rpc("is_approved_owner");
   if(!user||ownerError||owner!==true)throw Error("Approved owner session required.");
   const {data,error}=await supabase.from("questions").select("metadata").eq("id",current.id).single();
   if(error)throw error;
   const metadata=(data.metadata||{}) as Record<string,unknown>;
   const existing=(metadata.crop_review&&typeof metadata.crop_review==="object"?metadata.crop_review:{}) as Record<string,unknown>;
   const {error:saveError}=await supabase.from("questions").update({metadata:{...metadata,crop_review:{...existing,[kind]:status}}}).eq("id",current.id);
   if(saveError)throw saveError;
   onUpdate(current.id,{cropReview:{...current.cropReview,[kind]:status}});
   setMessage(status==="approved"?"Marked as checked.":"Flagged for correction.");
  }catch(e){setMessage(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 };
 return <div className="panel"><h2>Image crop review queue</h2><p>Review the imported image against its question number. Approval is a manual check, not an automated guarantee. The original files are preserved.</p>
 <div className="filter-grid">
 <label>Review images<select value={kind} onChange={e=>{setKind(e.target.value as Kind);setIndex(0)}}><option value="mark">Mark schemes</option><option value="question">Question images</option></select></label>
 <label>Status<select value={filter} onChange={e=>{setFilter(e.target.value);setIndex(0)}}><option value="unreviewed">Not reviewed</option><option value="needs-fix">Needs correction</option><option value="approved">Checked</option><option value="all">All</option></select></label>
 <label>Find question<input value={search} placeholder="e.g. 2021_3H_Q18" onChange={e=>{setSearch(e.target.value);setIndex(0)}}/></label>
 </div>
 <p role="status">{available.length} images available · {count("approved")} checked · {count("needs-fix")} flagged · {count("unreviewed")} not reviewed</p>
 {!current?<p>No images match these filters.</p>:<div>
 <div className="question-top"><strong>{current.sourceId||current.id} · {current.topic} · {current.skill}</strong><span>{Math.min(index+1,list.length)} / {list.length}</span></div>
 <div style={{maxHeight:650,overflow:"auto",background:"white",border:"1px solid #e0e6eb",margin:"12px 0"}}><CroppedImage src={(kind==="mark"?current.markSchemeUrl:current.questionUrl)!} crop={current.imageCrops[kind]} alt={`${current.sourceId||current.id} ${kind} crop review`}/></div>
 <CropEditor id={current.id} sourceId={current.sourceId} kind={kind} src={(kind==="mark"?current.markSchemeUrl:current.questionUrl)!} initial={current.imageCrops[kind]} onSaved={crop=>onUpdate(current.id,{imageCrops:{...current.imageCrops,[kind]:crop},cropReview:{...current.cropReview,[kind]:"unreviewed"}})}/>
 <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:16}}>
 <button className="secondary small" disabled={index===0} onClick={()=>setIndex(i=>Math.max(0,i-1))}>← Previous</button>
 <button className="primary small" disabled={busy} onClick={()=>void update("approved")}>✓ Mark as checked</button>
 <button className="secondary small" disabled={busy} onClick={()=>void update("needs-fix")}>Flag incorrect crop</button>
 <button className="secondary small" disabled={index>=list.length-1} onClick={()=>setIndex(i=>Math.min(list.length-1,i+1))}>Next →</button>
 </div></div>}
 {message&&<p role="status">{message}</p>}</div>;
}
