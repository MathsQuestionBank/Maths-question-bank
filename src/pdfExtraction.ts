import {detectPaperFrame} from "./paperFrame";
import {getDocument,GlobalWorkerOptions,type PDFDocumentProxy} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {validSlice,type TextLine,type Slice} from "./paperExtraction";
GlobalWorkerOptions.workerSrc=workerUrl;
export async function loadSourcePdf(blob:Blob):Promise<PDFDocumentProxy>{
 const data=new Uint8Array(await blob.arrayBuffer());
 if(data.byteLength<5||String.fromCharCode(...data.slice(0,5))!=="%PDF-")throw new Error("Source is not a valid PDF.");
 return await getDocument({data}).promise;
}
export async function readPdfLines(pdf:PDFDocumentProxy,onProgress?:(page:number,total:number)=>void,label="PDF"):Promise<TextLine[]>{
 const lines:TextLine[]=[];
 for(let p=1;p<=pdf.numPages;p++){
  let page:Awaited<ReturnType<PDFDocumentProxy["getPage"]>>;
  try{page=await pdf.getPage(p)}catch(error){throw new Error(`${label}: could not open page ${p}/${pdf.numPages}. ${error instanceof Error?error.message:String(error)}`)}
  const view=page.getViewport({scale:1});
  let content:Awaited<ReturnType<typeof page.getTextContent>>;
  try{content=await page.getTextContent()}catch(error){throw new Error(`${label}: could not extract text from page ${p}/${pdf.numPages}. ${error instanceof Error?error.message:String(error)}`)}
  const raw=content.items.filter((i):i is typeof i & {str:string;transform:number[]}=>"str" in i&&"transform" in i)
   .map(i=>{const [x,y]=view.convertToViewportPoint(i.transform[4],i.transform[5]);return {text:i.str.trim(),left:x/view.width,top:y/view.height}});
  const grouped:{top:number;left:number;parts:{x:number;text:string}[]}[]=[];
  for(const item of raw){
   if(!item.text)continue;
   let line=grouped.find(x=>Math.abs(x.top-item.top)<.0035);
   if(!line){line={top:item.top,left:item.left,parts:[]};grouped.push(line)}
   line.left=Math.min(line.left,item.left);line.parts.push({x:item.left,text:item.text});
  }
  for(const line of grouped){
   const text=line.parts.sort((a,b)=>a.x-b.x).map(x=>x.text).join(" ").replace(/\s+/g," ").trim();
   if(text)lines.push({page:p,top:line.top,left:line.left,text});
  }
  onProgress?.(p,pdf.numPages);
 }
 return lines;
}
export async function drawSlice(pdf:PDFDocumentProxy,selection:Slice,canvas:HTMLCanvasElement):Promise<void>{
 if(!validSlice(selection,pdf.numPages))throw Error("Invalid crop page range or boundaries.");
 const fragments:HTMLCanvasElement[]=[];
 for(let p=selection.page;p<=(selection.endPage??selection.page);p++){
  const page=await pdf.getPage(p);
  const viewport=page.getViewport({scale:1.4});
  const source=document.createElement("canvas");
  source.width=Math.round(viewport.width);source.height=Math.round(viewport.height);
  const context=source.getContext("2d");if(!context)throw Error("Canvas unavailable");
  await page.render({canvas:source,canvasContext:context,viewport}).promise;
  const frame=selection.trimBorder?detectPaperFrame(context.getImageData(0,0,source.width,source.height).data,source.width,source.height):null;
  if(frame){
   // Clip the small rounded frame corners as well as its straight edges.
   context.fillStyle="#fff";context.beginPath();context.rect(0,0,source.width,source.height);
   context.roundRect(frame.left*source.width,frame.top*source.height,
    (frame.right-frame.left)*source.width,(frame.bottom-frame.top)*source.height,Math.min(source.width,source.height)*.014);
   context.fill("evenodd");
  }
  const top=Math.max(p===selection.page?selection.top:.05,frame?.top??0);
  const bottom=Math.min(p===(selection.endPage??selection.page)?selection.bottom:.96,frame?.bottom??1);
  const left=Math.max(selection.left??0,frame?.left??0),right=Math.min(selection.right??1,frame?.right??1);
  if(right-left<.025||bottom-top<.025)throw Error("Crop lies outside the detected paper border. Adjust the crop or turn off border trimming.");
  const fragment=document.createElement("canvas");fragment.width=Math.max(1,Math.floor(source.width*(right-left)));fragment.height=Math.max(1,Math.floor(source.height*(bottom-top)));
  const output=fragment.getContext("2d");if(!output)throw Error("Canvas unavailable");
  output.drawImage(source,Math.floor(source.width*left),Math.floor(source.height*top),fragment.width,fragment.height,0,0,fragment.width,fragment.height);
  fragments.push(fragment);source.width=0;source.height=0;
 }
 canvas.width=Math.max(...fragments.map(f=>f.width));canvas.height=fragments.reduce((n,f)=>n+f.height,0);
 const output=canvas.getContext("2d");if(!output)throw Error("Canvas unavailable");
 output.fillStyle="#fff";output.fillRect(0,0,canvas.width,canvas.height);
 let y=0;for(const fragment of fragments){output.drawImage(fragment,0,y);y+=fragment.height;fragment.width=0;fragment.height=0}
}
