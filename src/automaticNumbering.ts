import type { Crop } from "./CropEditor";

export type NormalizedRect={left:number;top:number;width:number;height:number};
export type PixelBox=NormalizedRect;
export type NumberingWord={text:string;confidence:number;box:PixelBox;line?:string;isolatedParent?:boolean;symbols?:{text:string;box:PixelBox}[]};
export type AutomaticNumberingLayout={version:1;originalNumber:number;imageWidth:number;imageHeight:number;numberRects:NormalizedRect[];totalRects:{rect:NormalizedRect;marks:number}[];method:"ocr"|"pdf-text"|"manual";numberAbsent?:boolean};
export type NumberingDetectionOptions={width:number;height:number;originalNumber:number;marks:number;kind:"question"|"mark";method?:"ocr"|"pdf-text";numberAbsent?:boolean};
export type NumberingDetectionResult={status:"ready";layout:AutomaticNumberingLayout}|{status:"unsupported";reason:string};
type Row={words:NumberingWord[];top:number;bottom:number};
const right=(b:PixelBox)=>b.left+b.width;
const bottom=(b:PixelBox)=>b.top+b.height;
const clean=(text:string)=>text.replace(/[\u00a0\u2000-\u200b]/g," ").trim();
const ignored=(text:string)=>{const value=clean(text);return value===value.toUpperCase()&&/^(?:PMT|DO|NOT|WRITE|IN|THIS|AREA[’']?|TURN|OVER|[]+)$/.test(value)};
const validBox=(b:PixelBox)=>!!b&&Object.values(b).every(Number.isFinite)&&b.left>=0&&b.top>=0&&b.width>0&&b.height>0;
const union=(words:Pick<NumberingWord,"box">[]):PixelBox=>{const left=Math.min(...words.map(w=>w.box.left)),top=Math.min(...words.map(w=>w.box.top));return{left,top,width:Math.max(...words.map(w=>right(w.box)))-left,height:Math.max(...words.map(w=>bottom(w.box)))-top}};
const median=(values:number[])=>{const sorted=values.slice().sort((a,b)=>a-b);return sorted.length?sorted[Math.floor(sorted.length/2)]:0};
function rowsOf(words:NumberingWord[]):Row[]{
 const rows:Row[]=[];
 for(const word of [...words].sort((a,b)=>a.box.top-b.box.top||a.box.left-b.box.left)){
  const row=rows.find(row=>{
   const overlap=Math.min(row.bottom,bottom(word.box))-Math.max(row.top,word.box.top);
   return overlap>=.55*Math.min(row.bottom-row.top,word.box.height);
  });
  if(row){row.words.push(word);row.top=Math.min(row.top,word.box.top);row.bottom=Math.max(row.bottom,bottom(word.box));}
  else rows.push({words:[word],top:word.box.top,bottom:bottom(word.box)});
 }
 for(const row of rows)row.words.sort((a,b)=>a.box.left-b.box.left);
 return rows;
}
function normalized(box:PixelBox,options:NumberingDetectionOptions,pad=1):NormalizedRect{
 const left=Math.max(0,box.left-pad),top=Math.max(0,box.top-pad);
 const endX=Math.min(options.width,right(box)+pad),endY=Math.min(options.height,bottom(box)+pad);
 return{left:left/options.width,top:top/options.height,width:(endX-left)/options.width,height:(endY-top)/options.height};
}
function numeral(word:NumberingWord,number:number):PixelBox|null{
 const text=clean(word.text);
 if(new RegExp(`^0*${number}[.)]?$`).test(text))return word.box;
 // Keep subpart labels intact when OCR/PDF supplies a combined number+part token.
 const match=text.match(/^(\d+)(?=\([a-z](?:[ivx]+)?\))/i);
 if(!match||Number(match[1])!==number||!word.symbols)return null;
 const selected=[] as {box:PixelBox}[];
 let digits="";
 for(const symbol of word.symbols){if(!/^\d$/.test(symbol.text))break;digits+=symbol.text;selected.push(symbol);}
 return digits===match[1]&&selected.length?union(selected):null;
}
function footerWords(row:Row):{words:NumberingWord[];number:number;marks:number}[]{
 let text="";const ranges:{start:number;end:number;word:NumberingWord}[]=[];
 for(const word of row.words){if(text)text+=" ";const start=text.length;text+=clean(word.text);ranges.push({start,end:text.length,word});}
 const matches=[] as {words:NumberingWord[];number:number;marks:number}[];
 const pattern=/\(?\s*Total\s+for\s+Question\s+(\d{1,3})\s+is\s+(\d{1,3})\s+marks?\s*\)?/gi;
 for(const match of text.matchAll(pattern)){
  const start=match.index!,end=start+match[0].length;
  const parts=ranges.filter(range=>range.end>start&&range.start<end);
  if(!parts.length)continue;
  // An item containing unrelated mathematical content cannot be erased by a
  // guessed substring width. Require boxes that contain only the printed label.
  if(text.slice(parts[0].start,start).trim()||text.slice(end,parts[parts.length-1].end).trim())continue;
  matches.push({words:parts.map(part=>part.word),number:Number(match[1]),marks:Number(match[2])});
 }
 return matches;
}

/** Recognise complete semantic source labels. No assessment number is inferred
 * from mathematical text, diagram digits or an arbitrary image edge. */
export function detectAutomaticNumbering(input:NumberingWord[],options:NumberingDetectionOptions):NumberingDetectionResult{
 const reject=(reason:string):NumberingDetectionResult=>({status:"unsupported",reason});
 const {width,height,originalNumber,marks}=options;const method=options.method??"ocr";
 if(![width,height,originalNumber,marks].every(Number.isFinite)||width<=0||height<=0||!Number.isInteger(originalNumber)||originalNumber<1||!Number.isInteger(marks)||marks<0)return reject("The source dimensions, original number or marks are unavailable.");
 const words=input.filter(word=>typeof word.text==="string"&&clean(word.text)&&Number.isFinite(word.confidence)&&validBox(word.box)&&right(word.box)<=width+1&&bottom(word.box)<=height+1);
 const rows=rowsOf(words);
 const footers=rows.flatMap(footerWords);
 if(footers.some(footer=>footer.number!==originalNumber))return reject("The image contains a total for a different original question.");
 if(footers.some(footer=>footer.marks!==marks))return reject("The printed total does not match the assessment's stored marks.");
 if(footers.length>1)return reject("Several printed totals make this source image ambiguous.");
 const footer=footers[0];
 if(!footer&&words.some(word=>/\btotal\s+for\s+question\b/i.test(clean(word.text))))return reject("A printed total shares a text box with other content and cannot be removed safely.");
 if(footer&&method==="ocr"&&(Math.min(...footer.words.map(word=>word.confidence))<70||footer.words.reduce((sum,word)=>sum+word.confidence,0)/footer.words.length<85))return reject("The printed total could not be read confidently.");
 if(!footer&&options.kind==="question"&&method==="ocr")return reject("The complete original total statement could not be identified safely.");
 const footerSet=new Set(footer?.words??[]);
 const typicalHeight=median(words.filter(word=>word.confidence>=70).map(word=>word.box.height));
 const body=words.filter(word=>word.box.top>.5&&!footerSet.has(word)&&!ignored(word.text)&&(word.box.height<=word.box.width*2.0||/^\d+[.)]?$/.test(clean(word.text)))&&word.box.height<=typicalHeight*1.8&&(!footer||bottom(word.box)<=union(footer.words).top));
 const bodyRows=rowsOf(body);
 const prose=body.filter(word=>(clean(word.text).match(/[a-z]/gi)?.length??0)>=3&&word.confidence>=60);
 const firstProse=prose.slice().sort((a,b)=>a.box.top-b.box.top||a.box.left-b.box.left)[0];
 const candidates=body.flatMap(word=>{const box=numeral(word,originalNumber);return box?[{word,box}]:[];}).filter(candidate=>candidate.word.confidence>=(method==="pdf-text"?90:30));
 const accepted=candidates.filter(({word,box})=>{
  const row=bodyRows.find(row=>row.words.includes(word));if(!row)return false;
  const others=row.words.filter(item=>item!==word&&item.box.left>=right(box));
  if(row.words.some(item=>item!==word&&right(item.box)<box.left&&!ignored(item.text)))return false;
  if(!others.length){
   if(!word.isolatedParent||!firstProse||options.kind!=="question"||!footer)return false;
   const proseLeft=Math.min(...prose.map(item=>item.box.left));
   return box.top<firstProse.box.top&&proseLeft-right(box)>=box.height*.5;
  }
  const next=others[0];const gap=next.box.left-right(box);
  if(gap<Math.max(1,box.height*.25))return false;
  if(options.kind==="mark"){
   const hasTableHeader=words.some(item=>/^question(?:\s+number)?$/i.test(clean(item.text)))&&words.some(item=>/^answer$/i.test(clean(item.text)));
   const combinedPart=/^\d+\([a-z]/i.test(clean(word.text));
   return (hasTableHeader||combinedPart)&&box.left<width*.3&&gap>=box.height*.6;
  }
  if(!firstProse)return false;
  const center=box.top+box.height/2,proseCenter=firstProse.box.top+firstProse.box.height/2;
  if(center>proseCenter+Math.max(box.height,firstProse.box.height)*.75)return false;
  const proseLeft=Math.min(...prose.map(item=>item.box.left));
  if(proseLeft-right(box)<Math.max(1,box.height*.25))return false;
  if(!/^(?:\([a-z](?:[ivx]+)?\)|[A-Za-z]{2,})/i.test(clean(next.text))&&proseLeft-right(box)<box.height*.6)return false;
  const gaps=others.slice(1).map((item,index)=>item.box.left-right(others[index].box)).filter(value=>value>0);
  if(gaps.length>=3&&gap<median(gaps)*1.25)return false;
  // A source number occupies its own leading gutter. A leading quantity in
  // body prose usually shares a left edge with another line of body text.
  const alignedOther=prose.some(item=>item!==next&&Math.abs(item.box.left-box.left)<box.height*.35&&Math.abs(item.box.top-box.top)>box.height);
  if(alignedOther)return false;
  return true;
 });
 if(accepted.length>1)return reject("Several possible parent numbers were found; no mathematical content has been covered.");
 const absent=options.numberAbsent===true&&method==="pdf-text";
 if(!accepted.length&&!absent)return reject("The original parent number could not be distinguished safely from question content.");
 if(accepted.length&&footer&&bottom(accepted[0].box)>=union(footer.words).top)return reject("The source number and total overlap.");
 return{status:"ready",layout:{version:1,originalNumber,imageWidth:width,imageHeight:height,numberRects:accepted.map(candidate=>normalized(candidate.box,options,method==="pdf-text"?.5:1)),totalRects:footer?[{rect:normalized(union(footer.words),options,method==="pdf-text"?.5:1),marks}]:[],method,...(!accepted.length?{numberAbsent:true}:{})}};
}

/** Project source-image coordinates through the actual crop. Both preview and
 * PDF use this same transform, independent of display size or image aspect. */
export function projectNumberingRect(rect:NormalizedRect,crop:Crop):NormalizedRect|null{
 if(!validBox(rect))return null;
 const left=crop.left/100,top=crop.top/100,rightEdge=1-crop.right/100,bottomEdge=1-crop.bottom/100;
 const width=rightEdge-left,height=bottomEdge-top;
 if(![left,top,rightEdge,bottomEdge].every(Number.isFinite)||width<=0||height<=0)return null;
 const startX=Math.max(rect.left,left),startY=Math.max(rect.top,top),endX=Math.min(right(rect),rightEdge),endY=Math.min(bottom(rect),bottomEdge);
 if(endX<=startX||endY<=startY)return null;
 return{left:(startX-left)/width,top:(startY-top)/height,width:(endX-startX)/width,height:(endY-startY)/height};
}
