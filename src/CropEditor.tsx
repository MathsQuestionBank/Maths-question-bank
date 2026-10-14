import { useState, type CSSProperties } from "react";
import { supabase } from "./supabase";

export type Crop = { top:number; right:number; bottom:number; left:number };
export type CropKind = "question" | "mark";
const empty:Crop={top:0,right:0,bottom:0,left:0};
export function validCrop(value:unknown):Crop {
 const v=value as Partial<Crop>|null;
 if(!v||typeof v!=="object")return {...empty};
 const c={top:Number(v.top),right:Number(v.right),bottom:Number(v.bottom),left:Number(v.left)};
 if(Object.values(c).some(n=>!Number.isFinite(n)||n<0||n>95)||c.top+c.bottom>=95||c.left+c.right>=95)return {...empty};
 return c;
}
export function CroppedImage({src,crop,alt}:{src:string;crop:Crop;alt:string}){
 const [dimensions,setDimensions]=useState<{w:number;h:number}|null>(null);
 const horizontal=100-crop.left-crop.right,vertical=100-crop.top-crop.bottom;
 const style:CSSProperties=dimensions?{position:"relative",width:"100%",aspectRatio:String((dimensions.w*horizontal)/(dimensions.h*vertical)),overflow:"hidden"}:{width:"100%"};
 return <div style={style}><img src={src} alt={alt} onLoad={e=>setDimensions({w:e.currentTarget.naturalWidth,h:e.currentTarget.naturalHeight})} style={dimensions?{position:"absolute",maxWidth:"none",width:`${10000/horizontal}%`,height:"auto",left:`-${crop.left/horizontal*100}%`,top:`-${crop.top/vertical*100}%`}:{width:"100%",height:"auto"}}/></div>;
}
export default function CropEditor({id,sourceId,kind,src,initial,onSaved}:{id:string;sourceId?:string;kind:CropKind;src:string;initial:Crop;onSaved:(crop:Crop)=>void}){
 const [open,setOpen]=useState(false);
 const [crop,setCrop]=useState<Crop>(initial);
 const [saving,setSaving]=useState(false);
 const [message,setMessage]=useState("");
 const save=async()=>{
  setSaving(true);setMessage("");
  try{
   const {data:{user}}=await supabase.auth.getUser();
   const {data:owner,error:ownerError}=await supabase.rpc("is_approved_owner");
   if(!user||ownerError||owner!==true)throw Error("Approved owner access required.");
   const {data:row,error:readError}=await supabase.from("questions").select("metadata").eq("id",id).single();
   if(readError)throw readError;
   const metadata=(row.metadata||{}) as Record<string,unknown>;
   const current=(metadata.image_crops&&typeof metadata.image_crops==="object"?metadata.image_crops:{}) as Record<string,unknown>;
   const next={...metadata,image_crops:{...current,[kind]:crop}};
   const {error:updateError}=await supabase.from("questions").update({metadata:next}).eq("id",id);
   if(updateError)throw updateError;
   onSaved(crop);setMessage("Crop saved. Original image preserved.");setOpen(false);
  }catch(e){setMessage(e instanceof Error?e.message:String(e))}finally{setSaving(false)}
 };
 return <div className="crop-tool"><button className="secondary small" onClick={()=>{setCrop(initial);setOpen(x=>!x)}} aria-expanded={open}>{open?"Close crop editor":`Adjust ${kind==="mark"?"mark scheme":"question"} crop`}</button>
 {open&&<div className="panel" style={{marginTop:12}}><h3>Crop {sourceId||id} — {kind==="mark"?"mark scheme":"question"}</h3><p className="hint">Trim from each edge. Check all marking guidance is visible before saving. The original image is never overwritten.</p>
 <div style={{maxHeight:480,overflow:"auto",border:"1px solid #ccd4dc",background:"white"}}><CroppedImage src={src} crop={crop} alt="Live crop preview"/></div>
 <div className="filter-grid">{(["top","right","bottom","left"] as const).map(edge=><label key={edge}>{edge[0].toUpperCase()+edge.slice(1)}: {crop[edge]}%<input type="range" min="0" max="80" step="0.5" value={crop[edge]} onChange={e=>{const next={...crop,[edge]:Number(e.target.value)};if(next.top+next.bottom<95&&next.left+next.right<95)setCrop(next)}}/></label>)}</div>
 <button className="secondary small" onClick={()=>setCrop({...empty})} disabled={saving}>Reset crop</button>{" "}<button className="primary small" onClick={()=>void save()} disabled={saving}>{saving?"Saving…":"Save crop"}</button>
 </div>}{message&&<p role="status" className="hint">{message}</p>}</div>;
}
