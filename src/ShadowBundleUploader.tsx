import {useEffect,useRef,useState} from "react";
import {inspectShadowBundle,type Bundle,type Original} from "./shadowBundle";
import {stageShadowBundle} from "./stageShadowBundle";
import {shadowStagingPort} from "./shadowStagingPort";
export default function ShadowBundleUploader({original,set,disabled=false,onBusy,onStaged}:{original?:Original;set:string;disabled?:boolean;onBusy:(busy:boolean)=>void;onStaged:()=>Promise<void>}){
 const [bundle,setBundle]=useState<Bundle|null>(null),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);const generation=useRef(0);
 useEffect(()=>{generation.current++;setBundle(null);setMessage("");},[original?.id,set]);
 useEffect(()=>()=>{generation.current++;},[]);
 async function check(file:File){const g=++generation.current;setBundle(null);setBusy(true);onBusy(true);setMessage("Validating the complete ZIP locally…");try{
  await shadowStagingPort.owner();if(!original)throw Error("Select the original paper first.");
  if(file.size>60*1024*1024||!file.name.toLowerCase().endsWith(".zip"))throw Error("Choose a ZIP up to 60 MB.");
  const b=await inspectShadowBundle(new Uint8Array(await file.arrayBuffer()),original);
  if(b.set.toLowerCase()!==set.trim().toLowerCase())throw Error("Selected shadow set differs from manifest.");
  if(g===generation.current){setBundle(b);setMessage(`Validated ${b.questions} questions, ${b.parts} parts, ${b.marks} marks and ${b.files.length} files. Ready for private staging.`);}
 }catch(e){if(g===generation.current)setMessage(e instanceof Error?e.message:"ZIP validation failed.");}finally{if(g===generation.current)setBusy(false);onBusy(false);}}
 async function upload(){if(!bundle||busy||disabled)return;const g=generation.current;setBusy(true);onBusy(true);try{
  const result=await stageShadowBundle(bundle,shadowStagingPort,s=>{if(g===generation.current)setMessage(s);});
  if(g===generation.current)setMessage(`Remote staging verified: ${result.questions} questions, ${result.parts} parts, ${result.marks} marks; ${result.verifiedFiles} files read back successfully. Intake status: ${result.status}. No selectable question records created.`);
  try{await onStaged();}catch{if(g===generation.current)setMessage(prev=>prev+" The archive list could not refresh; the remote verification result above remains valid.");}
 }catch(e){if(g===generation.current)setMessage((e instanceof Error?e.message:"Staging did not complete.")+" Re-select this same ZIP after interruption to reconcile and resume. Existing files are never overwritten.");}finally{if(g===generation.current)setBusy(false);onBusy(false);}}
 return <section aria-label="Complete shadow ZIP staging" style={{margin:"20px 0",padding:16,border:"1px solid #aaa",borderRadius:8,minWidth:0}}><h3>Stage a complete shadow paper ZIP</h3><p>Upload sources, draft question images, mark schemes and classifications privately. Teacher approval and original-image verification remain outstanding.</p><label>Prepared shadow paper ZIP<input aria-label="Prepared shadow paper ZIP" type="file" accept=".zip,application/zip" disabled={busy||disabled||!original} style={{maxWidth:"100%"}} onChange={e=>{const f=e.target.files?.[0];if(f)void check(f);e.target.value="";}}/></label><p role="status" aria-live="polite">{message}</p><button type="button" className="primary" disabled={busy||disabled||!bundle} onClick={()=>void upload()}>{busy?"Working…":"Stage or resume ZIP privately"}</button><p className="hint">Keep the ZIP on your device until remote verification succeeds. After a failed connection, choose the same ZIP and retry. No image content or credentials are stored in browser local storage by this uploader.</p></section>;
}
