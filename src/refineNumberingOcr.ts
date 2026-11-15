import type { Worker } from "tesseract.js";
import type { NumberingWord,PixelBox } from "./automaticNumbering";

const middle=(values:number[])=>{const sorted=values.slice().sort((a,b)=>a-b);return sorted.length?sorted[Math.floor(sorted.length/2)]:0};
const endX=(box:PixelBox)=>box.left+box.width;

/** Recover a number that sparse-page OCR skipped. Candidates come from actual
 * ink in the empty leading gutter, not a default image-coordinate rectangle.
 * The full exact total marker and prose column remain mandatory evidence. */
export async function refineNumberingOcr(worker:Worker,canvas:HTMLCanvasElement,words:NumberingWord[],expectedNumber:number):Promise<NumberingWord[]>{
 const fullText=words.map(word=>word.text).join(" ");
 if(!new RegExp(`\\bTotal\\s+for\\s+Question\\s+0*${expectedNumber}\\s+is\\s+\\d+\\s+marks?\\b`,"i").test(fullText))return words;
 const height=middle(words.filter(word=>word.confidence>=70&&word.box.height>3&&word.box.height<canvas.height*.1).map(word=>word.box.height));
 if(!height)return words;
 const prose=words.filter(word=>word.confidence>=60&&word.box.top>.5&&word.box.height<height*1.8&&word.box.width>word.box.height*.5&&(word.text.match(/[a-z]/gi)?.length??0)>=3&&!/^(?:DO|NOT|WRITE|IN|THIS|AREA|PMT|TOTAL|FOR|QUESTION|IS|MARKS?)$/.test(word.text)&&!/^\(?Total|^Question$|^marks?\)?$/i.test(word.text));
 if(!prose.length)return words;
 const bodyLeft=Math.min(...prose.map(word=>word.box.left));
 const firstTop=Math.min(...prose.map(word=>word.box.top));
 const scanWidth=Math.floor(bodyLeft-height*.25),scanHeight=Math.min(canvas.height,Math.ceil(firstTop+height*1.25));
 if(scanWidth<height||scanHeight<height||scanWidth>canvas.width*.4)return words;
 const context=canvas.getContext("2d",{willReadFrequently:true});if(!context)return words;
 const pixels=context.getImageData(0,0,scanWidth,scanHeight).data;
 const occupied=new Uint8Array(scanWidth*scanHeight),visited=new Uint8Array(occupied.length);
 for(let index=0;index<occupied.length;index++){const offset=index*4;occupied[index]=(pixels[offset]*.299+pixels[offset+1]*.587+pixels[offset+2]*.114)<160?1:0}
 // Page frames and vertical "DO NOT WRITE" bands are source content, not
 // numeral candidates. Derive their inner boundary from actual image ink.
 let gutterStart=0;
 for(let x=0;x<scanWidth;x++){
  let count=0;for(let y=0;y<scanHeight;y++)count+=occupied[y*scanWidth+x];
  if(count/scanHeight>.7)gutterStart=x+1;
 }
 for(const word of words)if(word.box.height>word.box.width*2.5&&endX(word.box)<scanWidth)gutterStart=Math.max(gutterStart,endX(word.box));
 const components:PixelBox[]=[];
 for(let at=0;at<occupied.length;at++){
  if(!occupied[at]||visited[at])continue;
  const stack=[at];visited[at]=1;let minX=scanWidth,maxX=0,minY=scanHeight,maxY=0,count=0;
  while(stack.length){const current=stack.pop()!,x=current%scanWidth,y=Math.floor(current/scanWidth);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);count++;
   for(const dy of [-1,0,1])for(const dx of [-1,0,1]){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=scanWidth||ny>=scanHeight)continue;const next=ny*scanWidth+nx;if(occupied[next]&&!visited[next]){visited[next]=1;stack.push(next)}}
  }
  const w=maxX-minX+1,h=maxY-minY+1;
  if(minX>gutterStart+height*.1&&h>=height*.55&&h<=height*1.5&&w>=height*.12&&w<=height*2.5&&count/(w*h)>.12&&minY>1&&maxY<scanHeight-1)components.push({left:minX,top:minY,width:w,height:h});
 }
 const groups:PixelBox[][]=[];
 for(const component of components.sort((a,b)=>a.top-b.top||a.left-b.left)){
  const group=groups.find(group=>Math.abs(group[0].top-component.top)<=height*.3&&component.left-endX(group[group.length-1])<=height*.65);
  if(group)group.push(component);else groups.push([component]);
 }
 const candidates=groups.filter(group=>group.length===String(expectedNumber).length).map(group=>{const left=Math.min(...group.map(box=>box.left)),top=Math.min(...group.map(box=>box.top));return{left,top,width:Math.max(...group.map(endX))-left,height:Math.max(...group.map(box=>box.top+box.height))-top}}).filter(box=>bodyLeft-endX(box)>=height*.3&&box.top<=firstTop);
 // More than one plausible glyph cluster in the gutter cannot be certified.
 if(candidates.length!==1)return words;
 const candidate=candidates[0];
 // A diagram label beside a rule or shape is not a standalone source heading.
 // Check actual neighboring ink as well as OCR boxes before recognising it.
 const guardLeft=Math.max(Math.ceil(gutterStart),Math.floor(candidate.left-height*.5));
 const guardTop=Math.max(0,Math.floor(candidate.top-height*.5));
 const guardRight=Math.min(canvas.width,Math.ceil(bodyLeft+height*2));
 const guardBottom=Math.min(canvas.height,Math.ceil(candidate.top+candidate.height+height*.5));
 const guard=context.getImageData(guardLeft,guardTop,guardRight-guardLeft,guardBottom-guardTop).data;
 for(let y=guardTop;y<guardBottom;y++)for(let x=guardLeft;x<guardRight;x++){
  if(x>=candidate.left-1&&x<=endX(candidate)+1&&y>=candidate.top-1&&y<=candidate.top+candidate.height+1)continue;
  const offset=((y-guardTop)*(guardRight-guardLeft)+(x-guardLeft))*4;
  if(guard[offset]*.299+guard[offset+1]*.587+guard[offset+2]*.114<160)return words;
 }
 const pad=Math.max(3,Math.ceil(height*.5));
 const patch=document.createElement("canvas");patch.width=(candidate.width+pad*2)*4;patch.height=(candidate.height+pad*2)*4;
 const output=patch.getContext("2d");if(!output)return words;
 output.fillStyle="#fff";output.fillRect(0,0,patch.width,patch.height);output.drawImage(canvas,candidate.left,candidate.top,candidate.width,candidate.height,pad*4,pad*4,candidate.width*4,candidate.height*4);
 try{
  await worker.setParameters({tessedit_pageseg_mode:"8" as any,tessedit_char_whitelist:"0123456789"});
  const response=await worker.recognize(patch,{}, {blocks:true,text:true});
  const result=response.data.text.trim();
  const confidence=response.data.confidence;
  if(result!==String(expectedNumber)||confidence<70)return words;
  return [...words,{text:result,confidence,box:candidate,line:"mqb-isolated-parent",isolatedParent:true} as NumberingWord];
 }finally{await worker.setParameters({tessedit_pageseg_mode:"3" as any,tessedit_char_whitelist:""})}
}
