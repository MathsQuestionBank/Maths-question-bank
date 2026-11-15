import { useState } from "react";
import { CroppedImage, type Crop } from "./CropEditor";
import { defaultNumberingMask, normaliseNumberingMask, reviewNumberingMask, type NumberingMask } from "./numberingMasks";

type Asset={key:string;src:string;crop:Crop;kind:"question"|"mark";label:string};
type Props={asset:Asset;mask:NumberingMask;replaceSourceTotals:boolean;onChange:(mask:NumberingMask)=>void;onClose:()=>void};

/** Assessment-only covers: this editor never writes to the question bank. */
export default function AssessmentMaskEditor({asset,mask:input,replaceSourceTotals,onChange,onClose}:Props){
 const [imageReady,setImageReady]=useState(false);
 const mask=normaliseNumberingMask(input);
 const change=(patch:Partial<NumberingMask>)=>onChange(normaliseNumberingMask({...mask,...patch,reviewedFor:undefined}));
 const fields=[
  {key:"numberWidth",label:"Number cover width",max:25},
  {key:"numberHeight",label:"Number cover depth",max:25},
  {key:"numberTop",label:"Number cover down",max:200},
  {key:"numberLeft",label:"Number cover from left",max:100},
  {key:"footerHeight",label:"Footer cover depth",max:25},
  {key:"footerBottom",label:"Footer cover up",max:200},
  {key:"footerWidth",label:"Footer cover width",max:100},
  {key:"footerLeft",label:"Footer cover from left",max:100}
 ] as const;
 return <section className="builder-mask-editor" aria-label={`Original print covers for ${asset.label}`}>
  <div className="builder-mask-editor-title"><strong>Adjust covers — {asset.label}</strong><button type="button" className="secondary small" onClick={onClose} aria-label="Close cover adjustments">Close</button></div>
  <p>Check the shaded areas against the original print. Move, resize or disable a cover if it overlaps mathematical content, part labels, diagrams, marks, answer lines or working space. These covers affect this assessment only.</p>
  <div className="mask-editor-layout"><div className="mask-editor-preview" onLoadCapture={event=>{const img=event.target as HTMLImageElement;setImageReady(img.naturalWidth>0&&img.naturalHeight>0)}} onErrorCapture={()=>setImageReady(false)}>
   <CroppedImage key={asset.key+asset.src} src={asset.src} crop={asset.crop} alt={`Cover adjustment preview for ${asset.label}`} coverOriginalNumber coverOriginalFooter={replaceSourceTotals} numberingMask={mask} showCoverGuides/>
  </div>
  <div className="mask-editor-controls"><label className="check"><input type="checkbox" checked={mask.numberEnabled} onChange={event=>change({numberEnabled:event.target.checked})}/>Cover original printed number</label>
  {replaceSourceTotals&&<label className="check"><input type="checkbox" checked={mask.footerEnabled} onChange={event=>change({footerEnabled:event.target.checked})}/>Cover original printed total</label>}
  <label className="check"><input type="checkbox" checked={!mask.numberEnabled&&!mask.footerEnabled} onChange={event=>change(event.target.checked?{numberEnabled:false,footerEnabled:false}:{numberEnabled:true,footerEnabled:replaceSourceTotals})}/>Original number and total are already cropped out or absent</label>
  <p className="hint">Depth and vertical offsets use a percentage of the image width, so the covered area stays consistent when printed. Horizontal positions start at the left edge.</p>
  {fields.filter(field=>field.key.startsWith("number")?mask.numberEnabled:replaceSourceTotals&&mask.footerEnabled).map(field=><label key={field.key}>{field.label}
   <input aria-label={`${field.label} for ${asset.label}`} type="number" min={0} max={field.max} step={0.5} value={mask[field.key]} onChange={event=>change({[field.key]:Number(event.target.value)})}/>%
  </label>)}
  <div className="mask-editor-actions"><button type="button" className="secondary small" onClick={()=>onChange({...defaultNumberingMask})}>Reset covers for this question</button>{" "}<button type="button" className="primary small" disabled={!imageReady} onClick={()=>{onChange(reviewNumberingMask(mask,asset.src,asset.crop,replaceSourceTotals));onClose()}}>Confirm covers avoid question content</button></div>
  {!imageReady&&<p className="hint" role="status">Wait for the original image to load before confirming covers.</p>}</div></div>
 </section>;
}
