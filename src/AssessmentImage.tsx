import {useCallback,useEffect,useState,type CSSProperties} from "react";
import {CroppedImage,type CroppedImageProps} from "./CropEditor";
import {prepareImagePagination,type ImagePagination} from "./assessmentImagePagination";

type Props=CroppedImageProps&{continuationLabel:string;firstPageHeightMm?:number};
/** The same unchanged source/crop/overlays are clipped into contiguous viewports.
 * Translation, masks and SVG numbering all retain the original full-width
 * coordinate system; no source pixels or stored crop records are changed. */
export default function AssessmentImage({continuationLabel,firstPageHeightMm=215,...props}:Props){
 const [image,setImage]=useState<HTMLImageElement|null>(null);
 const [result,setResult]=useState<{identity:string;plan:ImagePagination}|null>(null);
 const identity=JSON.stringify([props.src,props.crop,firstPageHeightMm]);
 const plan=result?.identity===identity?result.plan:null;
 const onImageReady=useCallback((loaded:HTMLImageElement)=>setImage(loaded),[]);
 useEffect(()=>{
  if(!image||image.getAttribute("src")!==props.src)return;
  let cancelled=false;
  void prepareImagePagination(image,props.crop,firstPageHeightMm).then(next=>{if(!cancelled)setResult({identity,plan:next});});
  return()=>{cancelled=true;};
 },[image,identity,firstPageHeightMm,props.src,props.crop.top,props.crop.right,props.crop.bottom,props.crop.left]);
 // A single slice may still be a safely shortened print viewport.
 const paginated=!!plan&&(plan.slices.length>1||plan.slices[0].bottom<plan.height);
 const sliceNumbering=(top:number,bottom:number)=>{
  const layout=props.automaticNumbering;if(!layout)return undefined;
  const start=layout.imageHeight*props.crop.top/100+top,end=layout.imageHeight*props.crop.top/100+bottom;
  const intersects=(r:{top:number;height:number})=>r.top*layout.imageHeight<end&&(r.top+r.height)*layout.imageHeight>start;
  return {...layout,numberRects:layout.numberRects.filter(intersects),totalRects:layout.totalRects.filter(t=>intersects(t.rect))};
 };
 return <div className={`assessment-paged-image${paginated?" is-paginated":""}`} data-pagination-state={plan?"ready":"loading"}>
  {!paginated&&<div className="assessment-source-image"><CroppedImage {...props} onImageReady={onImageReady}/></div>}
  {paginated&&<>
   {plan.warning&&<p className="assessment-pagination-warning print-hide" role="status">{plan.warning}</p>}
   <div className={`assessment-image-slices${plan.slices.some(slice=>slice.inlineWithPrevious)?" is-compact":""}`}>{plan.slices.map((slice,index)=><div className={`assessment-image-page${index&&!slice.inlineWithPrevious?" is-continuation":""}${slice.inlineWithPrevious?" is-compact-followup":""}`} key={index}>
    {index>0&&!slice.inlineWithPrevious&&<div className="assessment-continuation-heading">{continuationLabel}</div>}
    <div className="assessment-image-viewport" data-slice-top={slice.top} data-slice-bottom={slice.bottom} style={{aspectRatio:String(plan.width/(slice.bottom-slice.top)),containerType:"inline-size"} as CSSProperties}>
     <div className="assessment-image-translation" style={{transform:`translateY(-${slice.top/plan.width*100}cqw)`}}><CroppedImage {...props} alt={`${props.alt} — page ${index+1} of ${plan.slices.length}`} automaticNumbering={sliceNumbering(slice.top,slice.bottom)}/></div>
    </div>
   </div>)}</div>
  </>}
 </div>;
}
