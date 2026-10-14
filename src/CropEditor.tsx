import { useEffect, useRef, useState, type CSSProperties } from "react";
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
 const [error,setError]=useState(false);
 const [attempt,setAttempt]=useState(0);
 const horizontal=100-crop.left-crop.right,vertical=100-crop.top-crop.bottom;
 const style:CSSProperties=dimensions?{position:"relative",width:"100%",aspectRatio:String((dimensions.w*horizontal)/(dimensions.h*vertical)),overflow:"hidden"}:{width:"100%"};
 // A new question must not inherit the previous image's dimensions or load state.
 useEffect(()=>{setDimensions(null);setError(false);setAttempt(0)},[src]);
 if(error)return <div role="alert" style={{padding:20,border:"1px solid #cc8c8c"}}><p>Image failed to load. The original file may still exist in private storage.</p><button className="secondary small" onClick={()=>{setError(false);setDimensions(null);setAttempt(x=>x+1)}}>Retry image</button></div>;
 return <div style={style}>
 {!dimensions&&<p role="status" style={{padding:16}}>Loading image…</p>}
 <img key={src+"-"+attempt} src={src} alt={alt} onLoad={e=>{const {naturalWidth:w,naturalHeight:h}=e.currentTarget;if(w>0&&h>0)setDimensions({w,h});else setError(true)}} onError={()=>setError(true)} style={dimensions?{position:"absolute",maxWidth:"none",width:`${10000/horizontal}%`,height:"auto",left:`-${crop.left/horizontal*100}%`,top:`-${crop.top/vertical*100}%`}:{width:"100%",height:"auto",display:"none"}}/>
 </div>;
}
function VisualSelection({src,crop,onChange}:{src:string;crop:Crop;onChange:(c:Crop)=>void}){
 const frame=useRef<HTMLDivElement>(null);
 const drag=useRef<{x:number;y:number;crop:Crop;mode:"move"|"top"|"bottom"|"left"|"right"}|null>(null);
 const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));
 const begin=(e:React.PointerEvent,mode:"move"|"top"|"bottom"|"left"|"right")=>{
  const rect=frame.current?.getBoundingClientRect();if(!rect)return;
  drag.current={x:(e.clientX-rect.left)/rect.width*100,y:(e.clientY-rect.top)/rect.height*100,crop,mode};
  e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();
 };
 const move=(e:React.PointerEvent)=>{
  if(!drag.current||!frame.current)return;
  const rect=frame.current.getBoundingClientRect();const d=drag.current;
  const dx=(e.clientX-rect.left)/rect.width*100-d.x,dy=(e.clientY-rect.top)/rect.height*100-d.y;
  let next={...d.crop};
  if(d.mode==="move"){
   const x=clamp(dx,-d.crop.left,d.crop.right),y=clamp(dy,-d.crop.top,d.crop.bottom);
   next={left:d.crop.left+x,right:d.crop.right-x,top:d.crop.top+y,bottom:d.crop.bottom-y};
  }else if(d.mode==="top")next.top=clamp(d.crop.top+dy,0,94-d.crop.bottom);
  else if(d.mode==="bottom")next.bottom=clamp(d.crop.bottom-dy,0,94-d.crop.top);
  else if(d.mode==="left")next.left=clamp(d.crop.left+dx,0,94-d.crop.right);
  else next.right=clamp(d.crop.right-dx,0,94-d.crop.left);
  onChange(Object.fromEntries(Object.entries(next).map(([k,v])=>[k,Math.round(v*10)/10])) as Crop);
 };
 const edge=(name:"top"|"bottom"|"left"|"right",style:CSSProperties)=><div role="slider" aria-label={`Drag ${name} crop boundary`} aria-valuemin={0} aria-valuemax={94} aria-valuenow={crop[name]} tabIndex={0} onPointerDown={e=>begin(e,name)} onPointerMove={move} onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null} style={{position:"absolute",background:"#087b91",touchAction:"none",...style}}/>;
 return <div ref={frame} style={{position:"relative",width:"100%",maxWidth:1000,margin:"0 auto",background:"#fff",userSelect:"none"}}>
 <img src={src} alt="Original image; drag the blue crop boundary to select the required area" draggable={false} style={{display:"block",width:"100%",height:"auto"}}/>
 <div style={{position:"absolute",inset:0,pointerEvents:"none",background:`linear-gradient(to bottom,rgba(0,0,0,.35) ${crop.top}%,transparent ${crop.top}%,transparent ${100-crop.bottom}%,rgba(0,0,0,.35) ${100-crop.bottom}%)`}}/>
 <div style={{position:"absolute",top:`${crop.top}%`,bottom:`${crop.bottom}%`,left:`${crop.left}%`,right:`${crop.right}%`,border:"2px solid #087b91",boxSizing:"border-box",touchAction:"none",cursor:"move"}} onPointerDown={e=>begin(e,"move")} onPointerMove={move} onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null}>
 {edge("top",{top:-5,left:"15%",width:"70%",height:10,cursor:"ns-resize"})}
 {edge("bottom",{bottom:-5,left:"15%",width:"70%",height:10,cursor:"ns-resize"})}
 {edge("left",{left:-5,top:"15%",height:"70%",width:10,cursor:"ew-resize"})}
 {edge("right",{right:-5,top:"15%",height:"70%",width:10,cursor:"ew-resize"})}
 </div></div>;
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
 <p className="hint">Drag the blue edges to resize the selection, or drag inside the rectangle to move it. The original image stays fixed.</p>
 <div style={{maxHeight:550,overflow:"auto",border:"1px solid #ccd4dc",padding:8}}><VisualSelection src={src} crop={crop} onChange={setCrop}/></div>
 <p className="hint">Selected: top {crop.top}%, bottom {crop.bottom}%, left {crop.left}%, right {crop.right}%.</p>
 <button className="secondary small" onClick={()=>setCrop({...empty})} disabled={saving}>Reset crop</button>{" "}<button className="primary small" onClick={()=>void save()} disabled={saving}>{saving?"Saving…":"Save crop"}</button>
 </div>}{message&&<p role="status" className="hint">{message}</p>}</div>;
}
