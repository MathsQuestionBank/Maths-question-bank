import type {MappingRow} from "./EnhancedMappingImporter";

export type TextLine={page:number;top:number;left:number;text:string};
export type SliceFragment={page:number;top:number;bottom:number;left?:number;right?:number};
export type Slice={page:number;top:number;bottom:number;endPage?:number;left?:number;right?:number;trimBorder?:boolean;borderVersion?:2;selectedPagesOnly?:true;fragments?:SliceFragment[]};
export type QuestionDraft={number:number;parts:MappingRow[];question:Slice;mark:Slice;questionDetected:boolean;questionInferred:boolean;questionManuallyAdjusted?:boolean;markDetected:boolean;markManuallyAdjusted?:boolean;approved:boolean;notes:string};
export const questionNumber=(row:Pick<MappingRow,"question"|"id">):number|null=>{
 const match=(row.question||row.id).trim().match(/^Q0*(\d{1,2})(?:[a-z](?:i{1,3}|iv|v|vi{0,3}|ix|x)?)?$/i);
 return match?Number(match[1]):null;
};
export function findQuestionAnchors(lines:TextLine[],expected:number[],alignNumberColumn=false):Map<number,TextLine>{
 const allowed=new Set(expected);
 // Some embedded PDF fonts attach a combining stroke from the answer to the number.
 const leadingNumber=(text:string)=>text.trim().replace(/^(\d{1,2})\u0336+(?=\s|$)/,"$1").match(/^(\d{1,2})(?:[.)]|\s|$)/);
 let candidates=lines.filter(l=>{
  if(l.left>.28||l.top<.035||l.top>.94)return false;
  if(/^\d{1,2}$/.test(l.text.trim())&&l.top>.85)return false;
  const m=leadingNumber(l.text);
  return !!m&&allowed.has(Number(m[1]));
 }).sort((a,b)=>a.page-b.page||a.top-b.top||a.left-b.left);
 // Mark-scheme working columns can contain small numerals that resemble question labels.
 // Align to the leftmost occurrence of the first expected number on its first table page.
 if(alignNumberColumn){
  const first=candidates.filter(c=>Number(leadingNumber(c.text)?.[1])===Math.min(...allowed));
  const page=Math.min(...first.map(c=>c.page));
  const left=Math.min(...first.filter(c=>c.page===page).map(c=>c.left));
  if(Number.isFinite(left))candidates=candidates.filter(c=>Math.abs(c.left-left)<.025);
 }
 const byNumber=new Map<number,TextLine>();
 let previous:{page:number;top:number}|null=null;
 for(const n of [...allowed].sort((a,b)=>a-b)){
  const total=lines.find(l=>new RegExp(`\\btotal\\s+for\\s+question\\s+(?:is\\s+)?0*${n}\\b`,"i").test(l.text));
  const priorTotal=lines.find(l=>new RegExp(`\\btotal\\s+for\\s+question\\s+(?:is\\s+)?0*${n-1}\\b`,"i").test(l.text));
  const found=candidates.find(c=>(!total||c.page<total.page||c.page===total.page&&c.top<total.top)&&(!priorTotal||c.page>priorTotal.page||c.page===priorTotal.page&&c.top>priorTotal.top)&&leadingNumber(c.text)?.[1]===String(n) && (!previous||c.page>previous.page||(c.page===previous.page&&c.top>previous.top+.003)));
  if(found){byNumber.set(n,found);previous=found}
 }
 return byNumber;
}
/**
 * Pearson mark schemes begin with numbered general guidance. Those numbered
 * paragraphs must never be mistaken for numbered question mark allocations.
 * Only propose mark crops after an actual mark-table column header.
 * An unfamiliar paper with no identifiable header requires manual start-page selection.
 */
export function findMarkSchemeStartPage(lines:TextLine[]):number|null{
 const pages=[...new Set(lines.map(l=>l.page))].sort((a,b)=>a-b);
 for(const page of pages){
  const top=lines.filter(l=>l.page===page&&l.top>=0&&l.top<.48);
  const hasTableHeader=top.some(l=>/\bquestion(?:\s+number)?\b\s+(?:working\s+)?\banswer\b\s+\bmarks?\b/i.test(l.text));
  // PDF text extraction occasionally puts heading columns in separate spans.
  const separateColumns=top.some(q=>/^(?:question|question\s+number)$/i.test(q.text.trim())&&
   top.some(a=>Math.abs(a.top-q.top)<.025&&/^(?:answer)$/i.test(a.text.trim()))&&
   top.some(m=>Math.abs(m.top-q.top)<.025&&/^marks?$/i.test(m.text.trim())));
  if(hasTableHeader||separateColumns)return page;
 }
 return null;
}
/** Pearson appends separate modified-large-print schemes after the standard answers. */
export function findMarkSchemeEndPage(lines:TextLine[]):number|null{
 const appendix=lines.filter(l=>/modifications? to the mark scheme.*(?:modified large print|MLP)/i.test(l.text))
  .sort((a,b)=>a.page-b.page)[0];
 return appendix?appendix.page-1:null;
}
const bounded=(x:number)=>Math.max(0,Math.min(1,x));
/**
 * Recover question positions where the PDF's leading numeral wasn't recognised.
 * Pearson papers contain "Total for Question N is X marks" at the end of most
 * complete questions. This gives a grounded page and lower crop boundary.
 * It is still a suggested crop, not an automatic approval.
 */
export function inferQuestionFromTotalMarker(
  number:number,
  lines:TextLine[],
  next:TextLine|undefined
):Slice|null{
 const totalPattern=new RegExp(`\\btotal\\s+for\\s+question\\s+(?:is\\s+)?0*${number}\\b`,"i");
 const totals=lines.filter(l=>totalPattern.test(l.text)&&l.top>=.07&&l.top<.96)
  .sort((a,b)=>a.page-b.page||a.top-b.top);
 const end=totals[0];
 if(!end)return null;
 const previousTotals=lines.filter(l=>l.page===end.page&&l.top<end.top&&
  /\btotal\s+for\s+question\s+(?:is\s+)?\d+\b/i.test(l.text))
  .sort((a,b)=>b.top-a.top);
 const earliest=Math.max(.035,(previousTotals[0]?.top??.008)+.027);
 // Look for a separately extracted question numeral even when it was too far
 // right / oddly spaced to satisfy the main text-anchor detector.
 const startPattern=new RegExp(`^(?:question\\s+)?0*${number}(?:[.)]|\\s|$)`,"i");
 const potential=lines.filter(l=>l.page===end.page&&l.top>=earliest&&l.top<end.top&&
  startPattern.test(l.text.trim())&&l.left>=0&&l.left<=.48)
  .sort((a,b)=>a.top-b.top);
 const start=potential[0];
 const top=bounded(Math.max(earliest,start?start.top-.018:earliest));
 let bottom=bounded(end.top+.014);
 if(next&&next.page===end.page&&next.top>top+.025)bottom=Math.min(bottom,bounded(next.top-.022));
 if(bottom-top<.025)return null;
 return {page:end.page,top,bottom};
}
/**
 * A next question beginning near the top of a fresh marking-table page should
 * not make the preceding question include that page's repeated table heading.
 * Preserve an actual continuation if there is answer/working text above the
 * next question number. These are proposals only; saved teacher crops win.
 */
export function markSchemeHasNextPageContinuation(lines:TextLine[],next:TextLine):boolean{
 const header=/^(?:paper\s*:|pearson|edexcel|mark scheme|gcse|question(?:\s+number)?(?:\s+working)?\s+answer|page\s+\d)/i;
 return lines.some(line=>line.page===next.page&&line.top>=.13&&
   line.top<next.top-.018&&!!line.text.trim()&&
   !header.test(line.text.trim())&&
   (/\bcontinu(?:ed|ation)\b/i.test(line.text)||line.top>=.20&&next.top>=.32));
}
export function makeReviewDrafts(rows:MappingRow[],questionLines:TextLine[],markLines:TextLine[],markSchemeStartPage:number|null=findMarkSchemeStartPage(markLines)):QuestionDraft[]{
 const groups=new Map<number,MappingRow[]>();
 for(const row of rows){
  const n=questionNumber(row);
  if(n===null)continue;
  const a=groups.get(n)||[];a.push(row);groups.set(n,a);
 }
 const nums=[...groups.keys()].sort((a,b)=>a-b);
 const questionAnchors=findQuestionAnchors(questionLines,nums);
 const markEnd=findMarkSchemeEndPage(markLines);
 const standardMarkLines=markLines.filter(line=>(markSchemeStartPage===null?false:line.page>=markSchemeStartPage)&&(markEnd===null||line.page<=markEnd));
 const markAnchors=findQuestionAnchors(standardMarkLines,nums,true);
 return nums.map((number,index)=>{
  const q=questionAnchors.get(number),m=markAnchors.get(number);
  const nextQ=nums.slice(index+1).map(n=>questionAnchors.get(n)).find(Boolean);
  const previousQ=[...nums.slice(0,index)].reverse().map(n=>questionAnchors.get(n)).find(Boolean);
  const nextM=nums.slice(index+1).map(n=>markAnchors.get(n)).find(Boolean);
  const inferred=q?null:inferQuestionFromTotalMarker(number,questionLines,nextQ);
  // Never use the cover page as the default for an undetected question.
  // Keep this estimate unapproved until a teacher inspects or adjusts it.
  const nearbyPage=previousQ&&nextQ?
    (previousQ.page===nextQ.page?previousQ.page:Math.min(previousQ.page+1,nextQ.page)):
    nextQ?.page??previousQ?.page??1;
  const questionFallback=inferred??{page:nearbyPage,top:.10,bottom:.95};
  const segment=(a:TextLine|undefined,b:TextLine|undefined,fallbackPage=1,sourceLines:TextLine[]=[],question?:number):Slice=>{
   if(!a)return {page:fallbackPage,top:.05,bottom:.95};
   const end=question===undefined?undefined:sourceLines.find(l=>l.page>=a.page&&new RegExp(`\\btotal\\s+for\\s+question\\s+(?:is\\s+)?0*${question}\\b`,"i").test(l.text));
   const endPage=end?.page??(b?(b.page>a.page&&b.top-.022<=.075?b.page-1:b.page):Math.max(a.page,...sourceLines.map(l=>l.page)));
   const top=bounded(a.top-.018);
   let bottom=end?bounded(end.top+.014):b&&b.page===endPage?bounded(b.top-.022):.96;
   if(end&&b?.page===endPage)bottom=Math.min(bottom,bounded(b.top-.022));
   // Compact one-line marking rows still need a valid, readable crop.
   if(question===undefined&&b?.page===a.page&&bottom-top<.025)bottom=Math.min(b.top-.012,top+.026);
   return {page:a.page,top,bottom,...(endPage>a.page?{endPage}:{})};
  };
  let mark=segment(m,nextM,markSchemeStartPage??1,standardMarkLines);
  // Repeated marking-table headings on the next PDF page are not part of
  // the previous answer. Keep genuine continuations on the next page.
  if(m&&nextM&&nextM.page===m.page+1&&mark.endPage===nextM.page&&
     !markSchemeHasNextPageContinuation(standardMarkLines,nextM)){
   mark={page:m.page,top:bounded(m.top-.018),bottom:.96};
  }
  return {number,parts:groups.get(number)||[],question:{...(q?segment(q,nextQ,1,questionLines,number):questionFallback),trimBorder:true,borderVersion:2},mark,
   questionDetected:!!q,questionInferred:!!inferred,markDetected:!!m,approved:false,notes:""};
 });
}
const validWidth=(left:number,right:number)=>Number.isFinite(left)&&Number.isFinite(right)&&left>=0&&right<=1&&right-left>=.025;
export const validSlice=(s:Slice,pages:number):boolean=>Number.isInteger(s.page)&&s.page>=1&&
 Number.isInteger(s.endPage??s.page)&&(s.endPage??s.page)>=s.page&&(s.endPage??s.page)<=pages&&
 validWidth(s.left??0,s.right??1)&&
 (s.trimBorder===undefined||typeof s.trimBorder==="boolean")&&(s.borderVersion===undefined||s.borderVersion===2)&&
 (s.selectedPagesOnly===undefined||s.selectedPagesOnly===true&&Array.isArray(s.fragments))&&
 Number.isFinite(s.top)&&Number.isFinite(s.bottom)&&s.top>=0&&s.top<=.975&&s.bottom>=.025&&s.bottom<=1&&
 ((s.endPage??s.page)>s.page||s.bottom-s.top>=.025)&&
 (s.fragments===undefined||Array.isArray(s.fragments)&&s.fragments.length>0&&
  (s.selectedPagesOnly===true||s.fragments.length===(s.endPage??s.page)-s.page+1)&&
  s.fragments.every((f,i)=>f&&Number.isInteger(f.page)&&f.page>=s.page&&f.page<=(s.endPage??s.page)&&
   (s.selectedPagesOnly===true?(i===0||f.page>s.fragments![i-1].page):f.page===s.page+i)&&
   Number.isFinite(f.top)&&Number.isFinite(f.bottom)&&f.top>=0&&f.bottom<=1&&f.bottom-f.top>=.025&&validWidth(f.left??s.left??0,f.right??s.right??1))&&
  s.fragments[0].page===s.page&&s.fragments[s.fragments.length-1].page===(s.endPage??s.page)&&
  s.fragments[0].top===s.top&&s.fragments[s.fragments.length-1].bottom===s.bottom);
/** Teacher-controlled fix for a suggested crop that erroneously includes a later page. */
export function endSliceAtFirstPage(slice:Slice):Slice{
 const next={...slice};
 delete next.endPage;delete next.fragments;delete next.selectedPagesOnly;
 return {...next,bottom:.96};
}
export function adjustSlice(slice:Slice,key:"page"|"endPage"|"top"|"bottom"|"left"|"right",value:number):Slice{
 const next={...slice,[key]:value};
 if(key==="page"||key==="endPage"){delete next.fragments;delete next.selectedPagesOnly}
 else if(slice.fragments)next.fragments=slice.fragments.map((f,i)=>
  i===0&&(key==="top"||((key==="left"||key==="right")&&f[key]!==undefined))?{...f,[key]:value}:
  key==="bottom"&&i===slice.fragments!.length-1?{...f,bottom:value}:{...f});
 return next;
}
export function adjustFragment(slice:Slice,index:number,key:keyof SliceFragment,value:number):Slice{
 if(!slice.fragments?.[index])return slice;
 const fragments=slice.fragments.map((f,i)=>i===index?{...f,[key]:value}:{...f});
 const first=fragments[0],last=fragments[fragments.length-1];
 return {...slice,fragments,page:first.page,endPage:last.page,top:first.top,bottom:last.bottom};
}
export const isReviewable=(d:QuestionDraft,questionPages:number,markPages:number)=>
 validSlice(d.question,questionPages)&&validSlice(d.mark,markPages)&&
 (d.questionDetected||d.questionInferred||d.questionManuallyAdjusted===true)&&
 (d.markDetected||d.markManuallyAdjusted===true)&&
 d.parts.length>0&&d.parts.every(x=>Number.isInteger(x.marks)&&x.marks>0&&x.marks<=20&&/^AO[123]$/.test(x.ao)&&x.topic.trim()&&x.skills.trim()&&x.id.trim());
export const totalMarks=(drafts:QuestionDraft[])=>drafts.flatMap(d=>d.parts).reduce((sum,p)=>sum+p.marks,0);
