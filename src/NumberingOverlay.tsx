import type { Crop } from "./CropEditor";
import type { AutomaticNumberingLayout, NormalizedRect } from "./automaticNumbering";

type Props={layout:AutomaticNumberingLayout;crop:Crop;number:string;marks?:number;replaceTotals?:boolean;maskOnlyTotalIndices?:number[]};
const fontFamily="'Times New Roman', Times, serif";
let measurementDocument:Document|undefined;
let measurementContext:CanvasRenderingContext2D|null=null;
function measuredText(text:string,size:number){
 if(typeof document==="undefined")return null;
 if(measurementDocument!==document){
  measurementDocument=document;
  measurementContext=document.createElement("canvas").getContext("2d");
 }
 if(!measurementContext)return null;
 measurementContext.font=`700 ${size}px ${fontFamily}`;
 return measurementContext.measureText(text);
}

/** The SVG uses the source image's pixel coordinates. Its viewBox is the same
 * crop as the underlying image, so neither screen width nor print scaling can
 * move a cover relative to the ink it replaces. */
export default function NumberingOverlay({layout,crop,number,marks,replaceTotals=true,maskOnlyTotalIndices=[]}:Props){
 const width=layout.imageWidth,height=layout.imageHeight;
 const view={left:width*crop.left/100,top:height*crop.top/100,width:width*(100-crop.left-crop.right)/100,height:height*(100-crop.top-crop.bottom)/100};
 if(!(width>0&&height>0&&view.width>0&&view.height>0))return null;
 const box=(rect:NormalizedRect)=>({left:rect.left*width,top:rect.top*height,width:rect.width*width,height:rect.height*height});
 const visible=(rect:NormalizedRect)=>{
  const r=box(rect);
  return r.left+r.width>view.left&&r.left<view.left+view.width&&r.top+r.height>view.top&&r.top<view.top+view.height;
 };
 const fontMetrics=(rect:NormalizedRect,text:string)=>{
  const r=box(rect);
  // PDF font bounds include ascenders/descenders and leading; OCR bounds wrap
  // the visible glyph ink. Keep each replacement inside that detected region.
  const ocr=layout.method==="ocr";
  let size=r.height*(ocr?1.3:.8);
  let metrics=measuredText(text,size);
  if(metrics&&metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent>r.height){
   size*=r.height/(metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent);
   metrics=measuredText(text,size);
  }
  const ascent=metrics?.actualBoundingBoxAscent??size*.75,descent=metrics?.actualBoundingBoxDescent??size*.2;
  const baseline=Math.min(Math.max(r.top+r.height*(ocr?.98:.8),r.top+ascent),r.top+r.height-descent);
  const naturalWidth=metrics?Math.max(metrics.width,metrics.actualBoundingBoxLeft+metrics.actualBoundingBoxRight):size*(/\s/.test(text)?.45:.6)*text.length;
  return {size,baseline,fit:naturalWidth>r.width?r.width:undefined};
 };
 const mask=(rect:NormalizedRect,className:string)=>{
  const r=box(rect);
  // Source PDF-text boxes can describe the text baseline rather than all of its
  // visible ink. In cropped/paginated print previews this previously left the
  // *upper half* of original "Total for Question" statements visible above the
  // white cover. Only totals get an extra upper safety margin; do not extend
  // across the nearby answer line or alter question number boxes.
  const total=className==="mqb-auto-total-mask";
  const fringe=total?1.5:.5;
  if(!total)return <rect className={className} x={r.left-fringe} y={r.top-fringe} width={r.width+fringe*2} height={r.height+fringe*2} fill="#fff"/>;
  const upper=total?Math.min(r.height*2.8,view.width*.055):0;
  const top=Math.max(view.top,r.top-upper);
  const bottom=Math.min(view.top+view.height,r.top+r.height+fringe);
  const start=Math.max(view.top,top-fringe),finish=Math.min(view.top+view.height,bottom+fringe);
  return <rect className={className} x={r.left-fringe} y={start} width={r.width+fringe*2} height={Math.max(0,finish-start)} fill="#fff"/>;
 };
 return <svg className="mqb-automatic-numbering" aria-hidden="true" focusable="false" viewBox={`${view.left} ${view.top} ${view.width} ${view.height}`} preserveAspectRatio="xMinYMin meet" style={{position:"absolute",inset:0,width:"100%",height:"100%",overflow:"hidden",pointerEvents:"none",zIndex:3}}>
  {layout.numberRects.filter(visible).map((rect,index)=>{
   const r=box(rect),font=fontMetrics(rect,number);
   return <g key={`number-${index}`}>{mask(rect,"mqb-auto-number-mask")}<svg x={r.left} y={r.top} width={r.width} height={r.height} viewBox={`${r.left} ${r.top} ${r.width} ${r.height}`} overflow="hidden"><text className="mqb-auto-number-text" x={r.left} y={font.baseline} fontSize={font.size} fontFamily={fontFamily} fontWeight="700" fill="#111" textLength={font.fit} lengthAdjust={font.fit?"spacingAndGlyphs":undefined}>{number}</text></svg></g>;
  })}
  {replaceTotals&&layout.totalRects.filter(item=>visible(item.rect)).map(({rect,marks:sourceMarks},index)=>{
   const r=box(rect),total=Number.isFinite(marks)?marks!:sourceMarks;
   const statement=`(Total for Question ${number} is ${total} ${total===1?"mark":"marks"})`;
   const font=fontMetrics(rect,statement);
   return <g key={`total-${index}`}>{mask(rect,"mqb-auto-total-mask")}{!maskOnlyTotalIndices.includes(index)&&<svg x={r.left} y={r.top} width={r.width} height={r.height} viewBox={`${r.left} ${r.top} ${r.width} ${r.height}`} overflow="hidden"><text className="mqb-auto-total-text" x={r.left+r.width} y={font.baseline} textAnchor="end" fontSize={font.size} fontFamily={fontFamily} fontWeight="700" fill="#111" textLength={font.fit} lengthAdjust={font.fit?"spacingAndGlyphs":undefined}>{statement}</text></svg>}</g>;
  })}
 </svg>;
}
