import {getDocument,GlobalWorkerOptions,type PDFDocumentProxy} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type {TextLine,Slice} from "./paperExtraction";
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
   .map(i=>({text:i.str.trim(),left:i.transform[4]/view.width,top:1-i.transform[5]/view.height}));
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
 const page=await pdf.getPage(selection.page);
 const viewport=page.getViewport({scale:1.4});
 const source=document.createElement("canvas");
 source.width=Math.round(viewport.width);source.height=Math.round(viewport.height);
 const context=source.getContext("2d");if(!context)throw Error("Canvas unavailable");
 await page.render({canvas:source,canvasContext:context,viewport}).promise;
 const start=Math.max(0,Math.floor(source.height*selection.top));
 const height=Math.max(1,Math.floor(source.height*(selection.bottom-selection.top)));
 canvas.width=source.width;canvas.height=height;
 const output=canvas.getContext("2d");if(!output)throw Error("Canvas unavailable");
 output.fillStyle="#fff";output.fillRect(0,0,canvas.width,canvas.height);
 output.drawImage(source,0,start,source.width,Math.min(height,source.height-start),0,0,source.width,height);
}
