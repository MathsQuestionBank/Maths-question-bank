import type { PDFDocumentProxy } from "pdfjs-dist";
import { detectAutomaticNumbering, type AutomaticNumberingLayout, type NumberingWord } from "./automaticNumbering";
import type { CropKind } from "./CropEditor";
import type { Slice } from "./paperExtraction";

/** PDF.js text items retain exact span boundaries. Do not split a span using
 * guessed character widths: a numeral combined with mathematics is ambiguous. */
export type NumberingPdfTextItem={str:string;width:number;transform:number[];fontName:string;dir?:string};
export type NumberingPdfTextStyle={ascent?:number;descent?:number;vertical?:boolean};
export type NumberingPdfViewport={width:number;height:number;scale:number;transform:number[]};
type PixelBox={left:number;top:number;width:number;height:number};
type SourceWord=NumberingWord & {sourceBox:PixelBox};
export type PdfSliceNumberingWords={width:number;height:number;words:NumberingWord[];sourceWords:SourceWord[];start:number};

function multiply(a:number[],b:number[]):number[]{
 return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
}
function itemBox(item:NumberingPdfTextItem,style:NumberingPdfTextStyle|undefined,view:NumberingPdfViewport):PixelBox|undefined{
 if(!style||style.vertical||item.dir==="ttb"||typeof style.ascent!=="number"||!Number.isFinite(style.ascent)||style.ascent<=0||style.ascent>2||typeof style.descent!=="number"||!Number.isFinite(style.descent)||style.descent>0||style.descent< -1)return;
 if(item.transform.length!==6||view.transform.length!==6||![...item.transform,...view.transform,item.width,view.scale].every(Number.isFinite))return;
 const transform=multiply(view.transform,item.transform);
 const fontHeight=Math.hypot(transform[2],transform[3]);
 const width=Math.abs(item.width*view.scale),ascent=fontHeight*style.ascent!,descent=-fontHeight*style.descent!;
 if(fontHeight<=0||width<=0||ascent<=0||descent<0)return;
 const angle=Math.atan2(transform[1],transform[0]);
 // The PDF page viewport includes page rotation and its top-left origin.
 const along={x:Math.cos(angle),y:Math.sin(angle)},up={x:Math.sin(angle),y:-Math.cos(angle)};
 const corners=[
  {x:transform[4]+up.x*ascent,y:transform[5]+up.y*ascent},
  {x:transform[4]+along.x*width+up.x*ascent,y:transform[5]+along.y*width+up.y*ascent},
  {x:transform[4]-up.x*descent,y:transform[5]-up.y*descent},
  {x:transform[4]+along.x*width-up.x*descent,y:transform[5]+along.y*width-up.y*descent}
 ];
 const left=Math.min(...corners.map(c=>c.x)),top=Math.min(...corners.map(c=>c.y));
 return {left,top,width:Math.max(...corners.map(c=>c.x))-left,height:Math.max(...corners.map(c=>c.y))-top};
}

/** Map PDF text through precisely the same integer raster slice as drawSlice.
 * The resulting boxes are pixels in the untrimmed stored PNG, before a later
 * question.imageCrops adjustment. No question/footer offset is estimated. */
export function pdfWordsForSlice(items:NumberingPdfTextItem[],styles:Record<string,NumberingPdfTextStyle>,view:NumberingPdfViewport,slice:Slice):PdfSliceNumberingWords|undefined{
 if(!Number.isInteger(slice.page)||slice.page<1||!Number.isFinite(slice.top)||!Number.isFinite(slice.bottom)||slice.top<0||slice.bottom>1||slice.bottom<=slice.top||!Number.isFinite(view.width)||!Number.isFinite(view.height)||view.width<=0||view.height<=0)return;
 const width=Math.round(view.width),pageHeight=Math.round(view.height);
 const start=Math.max(0,Math.floor(pageHeight*slice.top));
 const height=Math.max(1,Math.floor(pageHeight*(slice.bottom-slice.top)));
 const words:NumberingWord[]=[],sourceWords:SourceWord[]=[];
 for(const item of items){
  if(!item.str.trim())continue;
  const sourceBox=itemBox(item,styles[item.fontName],view);
  // Missing glyph metrics cannot safely establish whether a nearby expression
  // would overlap a cover. Leave this source unsupported rather than guessing.
  if(!sourceBox)return;
  const relative={...sourceBox,top:sourceBox.top-start};
  sourceWords.push({text:item.str.trim(),confidence:100,box:relative,sourceBox});
  const left=Math.max(0,relative.left),top=Math.max(0,relative.top);
  const right=Math.min(width,relative.left+relative.width),bottom=Math.min(height,relative.top+relative.height);
  if(right<=left||bottom<=top)continue;
  words.push({text:item.str.trim(),confidence:100,box:{left,top,width:right-left,height:bottom-top}});
 }
 return {width,height,words,sourceWords,start};
}

/** Owner extraction can preserve these source-derived positions in its review
 * JSON. Teachers do not fetch owner-only PDF sources while building a paper. */
export async function readNumberingLayout(pdf:PDFDocumentProxy,slice:Slice,originalNumber:number,marks:number,kind:CropKind):Promise<AutomaticNumberingLayout|undefined>{
 if(slice.page<1||slice.page>pdf.numPages)return;
 try{
  const page=await pdf.getPage(slice.page);
  const viewport=page.getViewport({scale:1.4});
  const text=await page.getTextContent();
  const items=text.items.filter((item):item is typeof item & NumberingPdfTextItem=>"str" in item&&"transform" in item);
  const mapped=pdfWordsForSlice(items,text.styles,viewport,slice);
  if(!mapped)return;
  const parentPattern=new RegExp(`^0*${originalNumber}[.)]?$`);
  // A source numeral immediately above the approved slice establishes that it
  // was already trimmed out. OCR absence by itself does not establish this.
  const preceding=mapped.sourceWords.filter(word=>parentPattern.test(word.text)&&word.sourceBox.left<viewport.width*.28&&word.sourceBox.top+word.sourceBox.height<=mapped.start&&word.sourceBox.top+word.sourceBox.height>=mapped.start-word.sourceBox.height*2);
  const visibleParent=mapped.words.some(word=>parentPattern.test(word.text));
  const result=detectAutomaticNumbering(mapped.words,{width:mapped.width,height:mapped.height,originalNumber,marks,kind,method:"pdf-text",numberAbsent:!visibleParent&&preceding.length===1});
  return result.status==="ready"?result.layout:undefined;
 }catch{
  // Source extraction remains optional; an unavailable text layer must not
  // prevent the existing owner review workflow from saving its crop decisions.
  return;
 }
}
