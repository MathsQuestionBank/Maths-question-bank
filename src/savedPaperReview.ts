import {validSlice,type QuestionDraft,type Slice} from './paperExtraction';
export type SavedReview={version:number;mappingFile:string;markSchemeStartPage?:number;items:{number:number;question:Slice;mark:Slice;approved:boolean;notes:string;questionManuallyAdjusted?:boolean;markManuallyAdjusted?:boolean;overrides?:{id:string;topic:string;strands:string;skills:string}[]}[]};

/** Restore the original teacher review, never replace it with a new extraction guess. */
export function restoreSavedReview(saved:SavedReview,drafts:QuestionDraft[],questionPages:number,markPages:number):QuestionDraft[]{
 if(saved.version!==1||!saved.mappingFile||!Array.isArray(saved.items)||saved.items.length!==drafts.length||
    new Set(saved.items.map(x=>x.number)).size!==drafts.length||saved.items.some(x=>!drafts.some(d=>d.number===x.number)))
  throw Error('Saved review does not match the original mapping. Original review retained; preparation stopped.');
 return drafts.map(d=>{
  const prior=saved.items.find(x=>x.number===d.number)!;
  if(!prior.question||!prior.mark||!validSlice(prior.question,questionPages)||!validSlice(prior.mark,markPages)||typeof prior.approved!=='boolean')
   throw Error('Saved crop is invalid for Q'+d.number+'. Original review retained; preparation stopped.');
  if(prior.overrides&&(!Array.isArray(prior.overrides)||prior.overrides.length!==d.parts.length||
     new Set(prior.overrides.map(x=>x.id)).size!==d.parts.length||prior.overrides.some(x=>!d.parts.some(p=>p.id===x.id)||
      typeof x.topic!=='string'||typeof x.strands!=='string'||typeof x.skills!=='string')))
   throw Error('Saved mapping edits do not match Q'+d.number+'. Original review retained; preparation stopped.');
  const adjusted=(a:Slice,b:Slice)=>a.page!==b.page||(a.endPage??a.page)!==(b.endPage??b.page)||a.top!==b.top||a.bottom!==b.bottom;
  const restored={...d,question:{...prior.question},mark:{...prior.mark},notes:typeof prior.notes==='string'?prior.notes:'',
   questionManuallyAdjusted:prior.approved||prior.questionManuallyAdjusted===true||adjusted(prior.question,d.question),
   markManuallyAdjusted:prior.approved||prior.markManuallyAdjusted===true||adjusted(prior.mark,d.mark),
   parts:d.parts.map(p=>{const edit=prior.overrides?.find(x=>x.id===p.id);return edit?{...p,topic:edit.topic,strands:edit.strands,skills:edit.skills}:p}),approved:prior.approved};
  return restored;
 });
}
