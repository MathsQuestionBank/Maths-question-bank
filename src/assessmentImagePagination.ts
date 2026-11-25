import type {Crop} from "./CropEditor";

// A4 with the existing repeated 15 mm margins. Reserve space for headings,
// including a continuation heading; never derive print scale from screen size.
export const assessmentPrintWidthMm=180;
export const assessmentImagePageMm=255;
const firstPageMm=215;
export type ImageSlice={top:number;bottom:number;inlineWithPrevious?:boolean};
export type ImagePagination={width:number;height:number;slices:ImageSlice[];warning?:string};
export type BlankBand={top:number;bottom:number};
export function croppedImageSize(width:number,height:number,crop:Crop){
 return {width:width*(100-crop.left-crop.right)/100,height:height*(100-crop.top-crop.bottom)/100};
}

/** Only whitespace is a preferred seam. Vertical grid lines keep an entire
 * graph/table occupied, even between its horizontal rules. This does not OCR,
 * remove whitespace, change crops, or resample the image used in the PDF. */
export function imageBlankBands(pixels:Uint8ClampedArray,width:number,height:number):BlankBand[]{
 if(width<1||height<1||pixels.length!==width*height*4)throw Error("Invalid page analysis dimensions");
 const dark=(offset:number)=>pixels[offset+3]>20&&Math.min(pixels[offset],pixels[offset+1],pixels[offset+2])<252;
 // Ignore only near-continuous rules at the very outer edge of a scan. Interior
 // graph/table rules and short edge labels must continue to prevent a seam.
 const edge=Math.max(1,Math.floor(width*.01)),ignored=new Set<number>();
 for(let x=0;x<width;x++)if(x<edge||x>=width-edge){
  let ink=0;for(let y=0;y<height;y++)if(dark((y*width+x)*4))ink++;
  if(ink/height>.98)ignored.add(x);
 }
 const bands:BlankBand[]=[];let start:number|null=null;
 for(let y=0;y<height;y++){
  let occupied=false;
  for(let x=0;x<width;x++)if(!ignored.has(x)&&dark((y*width+x)*4)){occupied=true;break;}
  if(!occupied&&start===null)start=y;
  if(occupied&&start!==null){bands.push({top:start,bottom:y});start=null;}
 }
 if(start!==null)bands.push({top:start,bottom:height});
 return bands;
}

export function paginateAssessmentImage(width:number,height:number,bands:BlankBand[],analysisAvailable=true,firstHeightMm=firstPageMm):ImagePagination{
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error("Invalid source image dimensions");
 const capacity=width*assessmentImagePageMm/assessmentPrintWidthMm;
 if(!Number.isFinite(firstHeightMm)||firstHeightMm<=0||firstHeightMm>assessmentImagePageMm)throw Error("Invalid first-page allowance");
 const firstCapacity=width*firstHeightMm/assessmentPrintWidthMm;
 if(height<=firstCapacity)return {width,height,slices:[{top:0,bottom:height}]};
 const slices:ImageSlice[]=[];let top=0,forced=false;
 const minimumGap=width/assessmentPrintWidthMm; // 1 mm of actual blank scan, not a low-ink text/graph row
 while(top<height){
  const max=top+width*(slices.length?assessmentImagePageMm:firstHeightMm)/assessmentPrintWidthMm;
  if(height<=max){slices.push({top,bottom:height});break;}
  let bottom=0;
  for(const band of bands){
   if(band.bottom-band.top<minimumGap||band.bottom<=top||band.top>=max)continue;
   // Leave a small clear margin on either side; choosing inside a blank band
   // retains every source row, including the original working space.
   const candidate=Math.min(max,band.bottom-minimumGap/2);
   if(candidate>=band.top+minimumGap/2&&candidate>top+minimumGap)bottom=Math.max(bottom,candidate);
  }
  // If an unbroken graphic fits a fresh page, let Chrome move it intact
  // instead of cutting it solely to fill the space beneath a title/heading.
  if(!bottom&&height-top<=capacity){slices.push({top,bottom:height});break;}
  if(!bottom){bottom=Math.min(max,height);forced=true;}
  slices.push({top,bottom});top=bottom;
 }
 return {width,height,slices,...(forced||!analysisAvailable?{warning:analysisAvailable?"A continuous image region is taller than the available A4 space and crosses a page boundary. Check the page preview for a diagram or table crossing that boundary; the image has not been reduced or trimmed.":"Whitespace could not be checked for this image. It is printed at full width across pages; check the page preview for a diagram or table crossing a boundary."}:{})};
}

/** Reduce only a verified blank tail in the *print viewport*, not the stored crop.
 * Retain 32 mm of clear working room, and never compact short gaps, blank scans
 * with no preceding ink, or images whose pixels could not be inspected. */
export function compactTrailingPrintHeight(width:number,height:number,bands:BlankBand[],analysisAvailable=true):number{
 if(!analysisAvailable||!Number.isFinite(width)||width<=0||!Number.isFinite(height)||height<=0)return height;
 const tail=bands.find(b=>b.top>0&&b.bottom>=height-1e-6);
 if(!tail||height-tail.top<width*55/assessmentPrintWidthMm)return height;
 return Math.min(height,tail.top+width*32/assessmentPrintWidthMm);
}

/** Print-only compaction of a verified blank band between question body/working
 * and a small final answer/total region. All non-blank rows remain untouched.
 * We retain 38 mm of working below the preceding ink and a 2 mm clear edge
 * before the following ink. The source image/crop and overlay positions are
 * unchanged; only an entirely blank interior interval is omitted from print. */
export function paginateAssessmentPrintImage(width:number,height:number,bands:BlankBand[],analysisAvailable=true,firstHeightMm=firstPageMm):ImagePagination{
 const visibleHeight=compactTrailingPrintHeight(width,height,bands,analysisAvailable);
 if(analysisAvailable&&Number.isFinite(width)&&width>0&&Number.isFinite(visibleHeight)&&visibleHeight>0){
  const mm=(pixels:number)=>pixels*assessmentPrintWidthMm/width;
  const eligible=bands.filter(band=>band.top>0&&band.bottom<visibleHeight&&mm(band.bottom-band.top)>=70&&mm(visibleHeight-band.bottom)<=65&&mm(band.top)>=12);
  // Prefer the largest verified uninterrupted empty interval, not a gap in a graph.
  const band=eligible.sort((x,y)=>(y.bottom-y.top)-(x.bottom-x.top))[0];
  if(band){
   const headEnd=band.top+width*38/assessmentPrintWidthMm;
   const tailStart=band.bottom-width*2/assessmentPrintWidthMm;
   // Do not insert a second viewport unless at least 30 mm of truly blank
   // source can be omitted and the complete result fits with its heading.
   if(tailStart>headEnd&&mm(tailStart-headEnd)>=30&&mm(headEnd+visibleHeight-tailStart)<=Math.min(firstHeightMm-5,assessmentImagePageMm-5)){
    return {width,height,slices:[{top:0,bottom:headEnd},{top:tailStart,bottom:visibleHeight,inlineWithPrevious:true}]};
   }
  }
 }
 const standard=paginateAssessmentImage(width,visibleHeight,bands,analysisAvailable,firstHeightMm);
 return {...standard,height};
}

const plans=new Map<string,Promise<ImagePagination>>();
/** In-memory only, bounded cache. Private source URLs and pixels are never
 * persisted or sent to another service. Short images need no canvas or fetch. */
export function prepareImagePagination(image:HTMLImageElement,crop:Crop,firstHeightMm=firstPageMm):Promise<ImagePagination>{
 const {width,height}=croppedImageSize(image.naturalWidth,image.naturalHeight,crop);
 if(height/width<=70/assessmentPrintWidthMm)return Promise.resolve(paginateAssessmentImage(width,height,[],true,firstHeightMm));
 const key=JSON.stringify([image.src,image.naturalWidth,image.naturalHeight,crop,firstHeightMm]);
 const cached=plans.get(key);if(cached)return cached;
 const promise=(async()=>{
  const scale=Math.min(1,800/width,10000/height);
  const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  const context=canvas.getContext("2d",{willReadFrequently:true});
  if(!context)return paginateAssessmentImage(width,height,[],false,firstHeightMm);
  let bitmap:ImageBitmap|undefined,url:string|undefined;
  try{
   let source:CanvasImageSource=image;
   // A normal cross-origin <img> may display successfully but taint a canvas.
   // Fetch via the SAME authorised signed URL only if necessary, as numbering
   // already does; no new public URLs or access grants are created.
   const read=()=>{context.fillStyle="#fff";context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(source,image.naturalWidth*crop.left/100,image.naturalHeight*crop.top/100,width,height,0,0,canvas.width,canvas.height);return context.getImageData(0,0,canvas.width,canvas.height).data;};
   let data:Uint8ClampedArray;
   try{data=read();}catch{
    const response=await fetch(image.src,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error("Image analysis unavailable");
    const blob=await response.blob();
    try{bitmap=await createImageBitmap(blob);source=bitmap;}catch{url=URL.createObjectURL(blob);const decoded=new Image();decoded.src=url;await decoded.decode();source=decoded;}
    // Changing canvas dimensions clears its tainted origin state.
    canvas.width=canvas.width;data=read();
   }
   const bands=imageBlankBands(data,canvas.width,canvas.height).map(band=>({top:band.top*height/canvas.height,bottom:band.bottom*height/canvas.height}));
   const visibleHeight=compactTrailingPrintHeight(width,height,bands);
   return paginateAssessmentPrintImage(width,height,bands,true,firstHeightMm);
  }catch{return paginateAssessmentImage(width,height,[],false,firstHeightMm);}
  finally{bitmap?.close();if(url)URL.revokeObjectURL(url);canvas.width=0;canvas.height=0;}
 })();
 plans.set(key,promise);if(plans.size>40)plans.delete(plans.keys().next().value!);
 return promise;
}
