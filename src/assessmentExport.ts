import { assessmentGroupImages, type AssessmentExportMode, type AssessmentGroup } from "./assessmentGroups";
import { assessmentQuestionNumber, canReuseOriginalPrintedQuestion } from "./assessmentNumbering";
import { isNumberingMaskReviewed, type NumberingMask } from "./numberingMasks";

export function assessmentPrintAssets(groups:AssessmentGroup[],mode:AssessmentExportMode,sequential:boolean){
 return groups.flatMap((group,index)=>(["question","mark"] as const).flatMap(kind=>{
  if(kind==="question"&&mode==="marks"||kind==="mark"&&(mode==="questions"||mode==="teacher"))return [];
  return assessmentGroupImages(group,kind).map((asset,imageIndex)=>({
   ...asset,kind,groupKey:group.key,originalNumber:Number(assessmentQuestionNumber(group,index+1,false))||null,marks:group.marks,
   maskKey:kind==="question"&&imageIndex===0?group.key:`${group.key}:${kind}:${asset.key}`,
   label:`${kind==="question"?"question":"mark scheme"} ${index+1}${imageIndex?` image ${imageIndex+1}`:""}`,
   needsReview:sequential&&!canReuseOriginalPrintedQuestion(group,index+1)
  }));
 }));
}
export type AssessmentPrintAsset=ReturnType<typeof assessmentPrintAssets>[number];
export function unreviewedPrintAssets(assets:AssessmentPrintAsset[],masks:Record<string,NumberingMask>,replaceSourceTotals:boolean){
 return assets.filter(asset=>asset.needsReview&&!isNumberingMaskReviewed(masks[asset.maskKey],asset.src,asset.crop,asset.kind==="question"&&replaceSourceTotals));
}

/** Decode the actual preview images before opening the browser print dialog.
 * A signed URL alone does not prove the image was fetched successfully. */
export async function prepareAssessmentImages(paper:HTMLElement):Promise<void>{
 const images=Array.from(paper.querySelectorAll("img"));
 await Promise.all(images.map(async image=>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   await Promise.race([image.decode(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error("Question images are still loading. Please retry.")),15000)})]);
   if(!image.naturalWidth||!image.naturalHeight)throw new Error("Image unavailable");
  }catch{throw new Error("An assessment image could not be loaded. Retry the image or refresh the Question Bank before exporting.")}
  finally{clearTimeout(timer)}
 }));
 if(paper.querySelector('[role="alert"]'))throw new Error("An assessment image is unavailable. Retry it before exporting.");
 await document.fonts.ready;
 // Let CroppedImage commit its measured crop geometry before print captures it.
 await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
 const currentImages=Array.from(paper.querySelectorAll("img"));
 if(!paper.isConnected||currentImages.length!==images.length||images.some((image,index)=>image!==currentImages[index]))throw new Error("The assessment changed while preparing. Please export it again.");
}
