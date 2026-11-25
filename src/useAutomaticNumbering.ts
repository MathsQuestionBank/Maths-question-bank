import { useEffect, useRef, useState } from "react";
import type { AssessmentPrintAsset } from "./assessmentExport";
import { isNumberingMaskReviewed, type NumberingMask } from "./numberingMasks";
import { processNumbering, rememberManualNumbering, bindManualNumbering, numberingProcessingIdentity, requireVerifiedPrintedTotal, type NumberingResult } from "./numberingProcessing";

/** Processing is automatic. Advanced manual decisions are image-specific and
 * reusable; uncertain detection never becomes a guessed opaque rectangle. */
export function useAutomaticNumbering(assets:AssessmentPrintAsset[],masks:Record<string,NumberingMask>,replaceSourceTotals:boolean){
 const [cache,setCache]=useState<Record<string,NumberingResult>>({});
 const manual=useRef(new Map<string,NumberingResult>());
 const key=(asset:AssessmentPrintAsset,mask=masks[asset.maskKey])=>JSON.stringify([numberingProcessingIdentity(asset),asset.src,replaceSourceTotals&&asset.kind==="question",mask?.imageHash,mask?.imageHash?mask?.reviewedFor:undefined]);
 const wanted=useRef(new Set<string>());
 wanted.current=new Set(assets.filter(asset=>asset.needsReview).map(asset=>key(asset)));
 const identities=assets.filter(asset=>asset.needsReview).map(asset=>key(asset)+asset.src).join("|");
 useEffect(()=>{
  let stopped=false;
  for(const asset of assets.filter(asset=>asset.needsReview)){
   const identity=key(asset),chosen=manual.current.get(identity);
   if(chosen){setCache(previous=>({...previous,[identity]:chosen}));continue;}
   setCache(previous=>({...previous,[identity]:{status:"processing"}}));
   void processNumbering(asset,replaceSourceTotals&&asset.kind==="question",masks[asset.maskKey],()=>wanted.current.has(identity)).then(result=>{
    if(stopped||manual.current.has(identity))return;
    setCache(previous=>({...previous,[identity]:requireVerifiedPrintedTotal(result,replaceSourceTotals&&asset.kind==="question")}));
   });
  }
  return()=>{stopped=true};
 },[identities]);
 const acceptManual=(asset:AssessmentPrintAsset,mask:NumberingMask)=>{
  const footer=replaceSourceTotals&&asset.kind==="question";
  if(!isNumberingMaskReviewed(mask,asset.src,asset.crop,footer))return mask;
  mask=bindManualNumbering(asset,mask);
  const result:NumberingResult={status:"manual",mask,reused:false};
  manual.current.set(key(asset,mask),result);
  setCache(previous=>({...previous,[key(asset,mask)]:result}));
  void rememberManualNumbering(asset,mask,footer).catch(()=>{/* Current correction remains saved with the assessment. */});
  return mask;
 };
 const results:Record<string,NumberingResult>=Object.fromEntries(assets.map(asset=>[asset.maskKey,cache[key(asset)]||{status:"processing"}]));
 const needed=assets.filter(asset=>asset.needsReview);
 return {results,acceptManual,pending:needed.filter(asset=>results[asset.maskKey].status==="processing"),unsupported:needed.filter(asset=>results[asset.maskKey].status==="unsupported")};
}
