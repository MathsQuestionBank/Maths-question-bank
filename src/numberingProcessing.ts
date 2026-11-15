import { refineNumberingOcr } from "./refineNumberingOcr";
import { readEmbeddedNumberingLayout } from "./pngNumberingMetadata";
import { stableImageUrl } from "./imageIdentity";
import { detectAutomaticNumbering, projectNumberingRect, type AutomaticNumberingLayout, type NumberingWord } from "./automaticNumbering";
import { defaultNumberingMask, isNumberingMaskReviewed, numberingMaskReviewKey, reviewNumberingMask, type NumberingMask } from "./numberingMasks";
import type { AssessmentPrintAsset } from "./assessmentExport";
import type { Worker, Word } from "tesseract.js";

export type NumberingResult=
 |{status:"ready";layout:AutomaticNumberingLayout;reused:boolean}
 |{status:"manual";mask:NumberingMask;reused:boolean}
 |{status:"unsupported";reason:string}
 |{status:"processing"};
const POSITIONS_KEY="mqb-numbering-layouts-v1";
const CORRECTIONS_KEY="mqb-numbering-corrections-v1";
const VERSION="source-numbering-1";
function readCache<T>(key:string):Record<string,T>{try{const value=JSON.parse(localStorage.getItem(key)||"{}");return value&&typeof value==="object"&&!Array.isArray(value)?value:{}}catch{return {}}}
function saveCache<T>(key:string,entry:string,value:T){try{const cache=readCache<T>(key);cache[entry]=value;const entries=Object.entries(cache).slice(-300);localStorage.setItem(key,JSON.stringify(Object.fromEntries(entries)))}catch{/* Quota/privacy settings must not prevent this export. */}}
async function hashBytes(bytes:Uint8Array){const digest=await crypto.subtle.digest("SHA-256",bytes.buffer as ArrayBuffer);return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,"0")).join("")}
function timed<T>(promise:Promise<T>,milliseconds:number,message:string):Promise<T>{
 let timer:ReturnType<typeof setTimeout>;
 return Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),milliseconds)})]).finally(()=>clearTimeout(timer));
}
const imageHashes=new Map<string,string>();
const pending=new Map<string,Promise<NumberingResult>>();
let workerPromise:Promise<Worker>|undefined;
let queue:Promise<unknown>=Promise.resolve();
async function getWorker():Promise<Worker>{
 if(!workerPromise)workerPromise=(async()=>{
  const {createWorker}=await import("tesseract.js");
  const base=new URL(`${import.meta.env.BASE_URL}ocr/`,location.origin).href;
  const worker=await timed(createWorker("eng",1,{workerPath:base+"worker.min.js",corePath:base,langPath:base,workerBlobURL:false,gzip:true}),40000,"The local numbering engine could not be loaded. Refresh and retry, or use original numbering.");
  await worker.setParameters({tessedit_pageseg_mode:"3" as any,user_defined_dpi:"180",preserve_interword_spaces:"1"});
  return worker;
 })().catch(error=>{workerPromise=undefined;throw error});
 return workerPromise;
}
const box=(value:{x0:number;y0:number;x1:number;y1:number})=>({left:value.x0,top:value.y0,width:value.x1-value.x0,height:value.y1-value.y0});
function wordData(word:Word,line:string):NumberingWord{return {text:word.text,confidence:word.confidence,box:box(word.bbox),line,symbols:word.symbols?.map(symbol=>({text:symbol.text,box:box(symbol.bbox)}))}}
async function imageData(asset:AssessmentPrintAsset){
 const response=await fetch(asset.src,{signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error("The source image could not be read for numbering.");
 const blob=await response.blob();
 const bytes=new Uint8Array(await blob.arrayBuffer());
 const canvas=document.createElement("canvas");
 let bitmap:ImageBitmap|undefined;
 let url:string|undefined;
 try{
  let source:CanvasImageSource;
  try{bitmap=await createImageBitmap(blob);source=bitmap;canvas.width=bitmap.width;canvas.height=bitmap.height}
  catch{
   // SVG source crops are supported by the existing image viewer, but browser
   // createImageBitmap support differs. Decode through an image without ever
   // uploading it or changing its pixels.
   url=URL.createObjectURL(blob);const image=new Image();image.src=url;await image.decode();
   source=image;canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  }
  if(!canvas.width||!canvas.height)throw Error("The source image is empty.");
  const context=canvas.getContext("2d",{willReadFrequently:true});if(!context)throw Error("Image processing is unavailable in this browser.");
  context.fillStyle="#fff";context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(source,0,0);
 }finally{bitmap?.close();if(url)URL.revokeObjectURL(url)}
 const hash=await hashBytes(bytes);imageHashes.set(asset.src,hash);
 return {canvas,hash,bytes};
}
export function validAutomaticLayout(value:unknown,originalNumber:number,marks:number,width?:number,height?:number):value is AutomaticNumberingLayout{
 if(!value||typeof value!=="object")return false;
 const a=value as AutomaticNumberingLayout;
 const rect=(r:unknown)=>{if(!r||typeof r!=="object")return false;const v=r as {left:number;top:number;width:number;height:number};return [v.left,v.top,v.width,v.height].every(Number.isFinite)&&v.left>=0&&v.top>=0&&v.width>0&&v.height>0&&v.left+v.width<=1.001&&v.top+v.height<=1.001};
 return a.version===1&&a.originalNumber===originalNumber&&Number.isFinite(a.imageWidth)&&a.imageWidth>0&&Number.isFinite(a.imageHeight)&&a.imageHeight>0&&(!width||a.imageWidth===width)&&(!height||a.imageHeight===height)&&["ocr","pdf-text","manual"].includes(a.method)&&Array.isArray(a.numberRects)&&a.numberRects.length<=30&&a.numberRects.every(rect)&&Array.isArray(a.totalRects)&&a.totalRects.length<=5&&a.totalRects.every(t=>rect(t.rect)&&t.marks===marks)&&(a.numberRects.length>0||a.numberAbsent===true);
}
/** Seed the optional advanced editor from detected source regions, so even
 * manual refinements start in the image's real coordinate system. */
export function numberingMaskProposal(asset:AssessmentPrintAsset,result:NumberingResult|undefined,previous?:NumberingMask):NumberingMask{
 if(result?.status==="manual")return result.mask;
 if(result?.status!=="ready")return previous||defaultNumberingMask;
 const layout=result.layout,number=layout.numberRects.map(rect=>projectNumberingRect(rect,asset.crop)).find(Boolean);
 const total=layout.totalRects.map(item=>projectNumberingRect(item.rect,asset.crop)).find(Boolean);
 const ratio=layout.imageHeight*(100-asset.crop.top-asset.crop.bottom)/(layout.imageWidth*(100-asset.crop.left-asset.crop.right));
 const rounded=(n:number)=>Math.round(n*100)/100;
 return {...defaultNumberingMask,numberEnabled:!!number,footerEnabled:!!total,
  ...(number?{numberWidth:rounded(number.width*100),numberHeight:rounded(number.height*ratio*100),numberLeft:rounded(number.left*100),numberTop:rounded(number.top*ratio*100)}:{}),
  ...(total?{footerWidth:rounded(total.width*100),footerHeight:rounded(total.height*ratio*100),footerLeft:rounded(total.left*100),footerBottom:rounded((1-total.top-total.height)*ratio*100)}:{})};
}
const correctionId=(asset:AssessmentPrintAsset,hash:string,footer:boolean)=>JSON.stringify([VERSION,hash,asset.kind,asset.originalNumber,asset.marks,asset.crop,footer]);
/** Legacy URL-only approvals are proposals until a current content hash exists. */
export function bindManualNumbering(asset:AssessmentPrintAsset,mask:NumberingMask):NumberingMask{
 const hash=imageHashes.get(asset.src);return hash?{...mask,imageHash:hash}:mask;
}
function reusableMask(mask:unknown,asset:AssessmentPrintAsset,footer:boolean):mask is NumberingMask{
 try{
  if(!mask||typeof mask!=="object"||typeof (mask as NumberingMask).reviewedFor!=="string")return false;
  const value=mask as NumberingMask,prefix="mqb-mask-v1:";
  if(!value.reviewedFor!.startsWith(prefix))return false;
  const prior=JSON.parse(value.reviewedFor!.slice(prefix.length));
  const current=JSON.parse(numberingMaskReviewKey(value,asset.src,asset.crop,footer).slice(prefix.length));
  return Array.isArray(prior)&&JSON.stringify(prior.slice(1))===JSON.stringify(current.slice(1));
 }catch{return false}
}
export async function rememberManualNumbering(asset:AssessmentPrintAsset,mask:NumberingMask,footer:boolean){
 if(!isNumberingMaskReviewed(mask,asset.src,asset.crop,footer))return;
 const {hash}=await imageData(asset);
 saveCache(CORRECTIONS_KEY,correctionId(asset,hash,footer),{...mask,imageHash:hash});
}
export function numberingProcessingIdentity(asset:AssessmentPrintAsset):string{return JSON.stringify([asset.maskKey,stableImageUrl(asset.src),asset.originalNumber,asset.marks,asset.crop,asset.question.numberingPositions?.[asset.kind]])}

/** Detect only original print, in the original image coordinate system. Results
 * contain geometry and verified marks, never rewritten question pixels or text. */
export function processNumbering(asset:AssessmentPrintAsset,footer:boolean,savedMask?:NumberingMask,isNeeded:()=>boolean=()=>true):Promise<NumberingResult>{
 const id=JSON.stringify([numberingProcessingIdentity(asset),asset.src,footer,savedMask?.imageHash,savedMask?.reviewedFor]);
 const current=pending.get(id);if(current)return current;
 const task=(async():Promise<NumberingResult>=>{
  const {canvas,hash,bytes}=await imageData(asset);
  const corrected=readCache<NumberingMask>(CORRECTIONS_KEY)[correctionId(asset,hash,footer)];
  if(reusableMask(corrected,asset,footer))return {status:"manual",mask:reviewNumberingMask({...corrected,imageHash:hash},asset.src,asset.crop,footer),reused:true};
  if(savedMask?.imageHash===hash&&reusableMask(savedMask,asset,footer))return {status:"manual",mask:reviewNumberingMask(savedMask,asset.src,asset.crop,footer),reused:true};
  if(!asset.originalNumber)return {status:"unsupported",reason:"The original question reference is missing; automatic replacement cannot safely identify its print."};
  const embedded=readEmbeddedNumberingLayout(bytes);
  if(validAutomaticLayout(embedded,asset.originalNumber,asset.marks,canvas.width,canvas.height))return {status:"ready",layout:embedded,reused:true};
  const source=asset.question.numberingPositions?.[asset.kind];
  if(validAutomaticLayout(source,asset.originalNumber,asset.marks,canvas.width,canvas.height))return {status:"ready",layout:source,reused:true};
  const cacheKey=JSON.stringify([VERSION,hash,asset.originalNumber,asset.marks,asset.kind]);
  const cached=readCache<AutomaticNumberingLayout>(POSITIONS_KEY)[cacheKey];
  if(validAutomaticLayout(cached,asset.originalNumber,asset.marks,canvas.width,canvas.height))return {status:"ready",layout:cached,reused:true};
  const run=async():Promise<NumberingResult>=>{
   if(!isNeeded())return {status:"unsupported",reason:"This question is no longer selected."};
   const worker=await getWorker();
   const scale=Math.max(1,Math.min(2,1600/canvas.width));
   const scan=document.createElement("canvas");scan.width=Math.round(canvas.width*scale);scan.height=Math.round(canvas.height*scale);
   scan.getContext("2d")!.drawImage(canvas,0,0,scan.width,scan.height);
   const response=await timed(worker.recognize(scan,{}, {blocks:true,text:true}),30000,"This image could not be read safely in time. Use original numbering or the optional advanced adjustment.");
   const words:NumberingWord[]=[];
   const resize=(r:{left:number;top:number;width:number;height:number})=>({left:r.left/scale,top:r.top/scale,width:r.width/scale,height:r.height/scale});
   response.data.blocks?.forEach((block,b)=>block.paragraphs.forEach((paragraph,p)=>paragraph.lines.forEach((line,l)=>line.words.forEach(word=>{const value=wordData(word,`${b}:${p}:${l}`);words.push({...value,box:resize(value.box),symbols:value.symbols?.map(symbol=>({...symbol,box:resize(symbol.box)}))})}))));
   let result=detectAutomaticNumbering(words,{width:canvas.width,height:canvas.height,originalNumber:asset.originalNumber!,marks:asset.marks,kind:asset.kind,method:"ocr"});
   if(result.status==="unsupported"&&result.reason.includes("parent number")){
    const refined=await timed(refineNumberingOcr(worker,canvas,words,asset.originalNumber!),10000,"The isolated source number could not be verified safely.");
    if(refined!==words)result=detectAutomaticNumbering(refined,{width:canvas.width,height:canvas.height,originalNumber:asset.originalNumber!,marks:asset.marks,kind:asset.kind,method:"ocr"});
   }
   if(result.status==="ready"){saveCache(POSITIONS_KEY,cacheKey,result.layout);return {...result,reused:false}}
   return result;
  };
  const job=queue.then(run,run);queue=job.then(()=>undefined,()=>undefined);
  return await job;
 })().catch((error):NumberingResult=>({status:"unsupported",reason:error instanceof Error?error.message:"Automatic numbering could not read this image."}));
 pending.set(id,task);
 void task.finally(()=>{if(pending.get(id)===task)pending.delete(id)});
 return task;
}
