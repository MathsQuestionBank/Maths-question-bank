import type {MappingRow} from "./EnhancedMappingImporter";

export type TextLine={page:number;top:number;left:number;text:string};
export type Slice={page:number;top:number;bottom:number;endPage?:number;left?:number;right?:number;trimBorder?:boolean};
export type QuestionDraft={number:number;parts:MappingRow[];question:Slice;mark:Slice;questionDetected:boolean;questionInferred:boolean;questionManuallyAdjusted?:boolean;markDetected:boolean;markManuallyAdjusted?:boolean;approved:boolean;notes:string};
export const questionNumber=(row:Pick<MappingRow,"question"|"id">):number|null=>{
 const match=(row.question||row.id).trim().match(/^Q0*(\d{1,2})(?:[a-z](?:i{1,3}|iv|v|vi{0,3}|ix|x)?)?$/i);
 return match?Number(match[1]):null;
};
export function findQuestionAnchors(lines:TextLine[],expected:number[]):Map<number,TextLine>{
 const allowed=new Set(expected);
 const candidates=lines.filter(l=>{
  if(l.left>.28||l.top<.035||l.top>.94)return false;
  if(/^\d{1,2}$/.test(l.text.trim())&&l.top>.85)return false;
  const m=l.text.trim().match(/^(\d{1,2})(?:[.)]|\s|$)/);
  return !!m&&allowed.has(Number(m[1]));
 }).sort((a,b)=>a.page-b.page||a.top-b.top||a.left-b.left);
 const byNumber=new Map<number,TextLine>();
 let previous:{page:number;top:number}|null=null;
 for(const n of [...allowed].sort((a,b)=>a-b)){
  const total=lines.find(l=>new RegExp(`\\btotal\\s+for\\s+question\\s+0*${n}\\b`,"i").test(l.text));
  const found=candidates.find(c=>(!total||c.page<total.page||c.page===total.page&&c.top<total.top)&&c.text.match(/^(\d{1,2})(?:[.)]|\s|$)/)?.[1]===String(n) && (!previous||c.page>previous.page||(c.page===previous.page&&c.top>previous.top+.003)));
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
  const hasTableHeader=top.some(l=>/\bquestion(?:\s+number)?\b\s+\banswer\b\s+\bmarks?\b/i.test(l.text));
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
 const totalPattern=new RegExp(`\\btotal\\s+for\\s+question\\s+0*${number}\\b`,"i");
 const totals=lines.filter(l=>totalPattern.test(l.text)&&l.top>=.07&&l.top<.96)
  .sort((a,b)=>a.page-b.page||a.top-b.top);
 const end=totals[0];
 if(!end)return null;
 const previousTotals=lines.filter(l=>l.page===end.page&&l.top<end.top&&
  /\btotal\s+for\s+question\s+\d+\b/i.test(l.text))
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
 let bottom=bounded(end.top+.035);
 if(next&&next.page===end.page&&next.top>top+.025)bottom=Math.min(bottom,bounded(next.top-.022));
 if(bottom-top<.025)return null;
 return {page:end.page,top,bottom};
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
 const markAnchors=findQuestionAnchors(standardMarkLines,nums);
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
   const end=question===undefined?undefined:sourceLines.find(l=>l.page>=a.page&&new RegExp(`\\btotal\\s+for\\s+question\\s+0*${question}\\b`,"i").test(l.text));
   const endPage=end?.page??(b?(b.page>a.page&&b.top-.022<=.075?b.page-1:b.page):Math.max(a.page,...sourceLines.map(l=>l.page)));
   return {page:a.page,top:bounded(a.top-.018),bottom:end?bounded(end.top+.035):b&&b.page===endPage?bounded(b.top-.022):.96,...(endPage>a.page?{endPage}:{})};
  };
  return {number,parts:groups.get(number)||[],question:{...(q?segment(q,nextQ,1,questionLines,number):questionFallback),trimBorder:true},mark:segment(m,nextM,markSchemeStartPage??1,standardMarkLines),
   questionDetected:!!q,questionInferred:!!inferred,markDetected:!!m,approved:false,notes:""};
 });
}
export const validSlice=(s:Slice,pages:number)=>Number.isInteger(s.page)&&s.page>=1&&
 Number.isInteger(s.endPage??s.page)&&(s.endPage??s.page)>=s.page&&(s.endPage??s.page)<=pages&&
 Number.isFinite(s.left??0)&&Number.isFinite(s.right??1)&&(s.left??0)>=0&&(s.right??1)<=1&&(s.right??1)-(s.left??0)>=.025&&
 (s.trimBorder===undefined||typeof s.trimBorder==="boolean")&&
 Number.isFinite(s.top)&&Number.isFinite(s.bottom)&&s.top>=0&&s.top<=.975&&s.bottom>=.025&&s.bottom<=1&&
 ((s.endPage??s.page)>s.page||s.bottom-s.top>=.025);
export const isReviewable=(d:QuestionDraft,questionPages:number,markPages:number)=>
 validSlice(d.question,questionPages)&&validSlice(d.mark,markPages)&&
 (d.questionDetected||d.questionInferred||d.questionManuallyAdjusted===true)&&
 (d.markDetected||d.markManuallyAdjusted===true)&&
 d.parts.length>0&&d.parts.every(x=>Number.isInteger(x.marks)&&x.marks>0&&x.marks<=20&&/^AO[123]$/.test(x.ao)&&x.topic.trim()&&x.skills.trim()&&x.id.trim());
export const totalMarks=(drafts:QuestionDraft[])=>drafts.flatMap(d=>d.parts).reduce((sum,p)=>sum+p.marks,0);
