import type {MappingRow} from "./EnhancedMappingImporter";

export type TextLine={page:number;top:number;left:number;text:string};
export type Slice={page:number;top:number;bottom:number};
export type QuestionDraft={number:number;parts:MappingRow[];question:Slice;mark:Slice;questionDetected:boolean;markDetected:boolean;approved:boolean;notes:string};
export const questionNumber=(row:Pick<MappingRow,"question"|"id">):number|null=>{
 const match=(row.question||row.id).match(/Q0*(\d{1,2})(?:[a-z]|$)/i);
 return match?Number(match[1]):null;
};
export function findQuestionAnchors(lines:TextLine[],expected:number[]):Map<number,TextLine>{
 const allowed=new Set(expected);
 const candidates=lines.filter(l=>{
  if(l.left>.28||l.top<.07||l.top>.94)return false;
  const m=l.text.trim().match(/^(\d{1,2})(?:[.)]|\s|$)/);
  return !!m&&allowed.has(Number(m[1]));
 }).sort((a,b)=>a.page-b.page||a.top-b.top||a.left-b.left);
 const byNumber=new Map<number,TextLine>();
 let previous:{page:number;top:number}|null=null;
 for(const n of [...allowed].sort((a,b)=>a-b)){
  const found=candidates.find(c=>c.text.match(/^(\d{1,2})(?:[.)]|\s|$)/)?.[1]===String(n) && (!previous||c.page>previous.page||(c.page===previous.page&&c.top>previous.top+.003)));
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
const bounded=(x:number)=>Math.max(0,Math.min(1,x));
export function makeReviewDrafts(rows:MappingRow[],questionLines:TextLine[],markLines:TextLine[],markSchemeStartPage:number|null=findMarkSchemeStartPage(markLines)):QuestionDraft[]{
 const groups=new Map<number,MappingRow[]>();
 for(const row of rows){
  const n=questionNumber(row);
  if(n===null)continue;
  const a=groups.get(n)||[];a.push(row);groups.set(n,a);
 }
 const nums=[...groups.keys()].sort((a,b)=>a-b);
 const questionAnchors=findQuestionAnchors(questionLines,nums);
 const markAnchors=findQuestionAnchors(markSchemeStartPage===null?[]:markLines.filter(line=>line.page>=markSchemeStartPage),nums);
 return nums.map((number,index)=>{
  const q=questionAnchors.get(number),m=markAnchors.get(number);
  const nextQ=nums.slice(index+1).map(n=>questionAnchors.get(n)).find(Boolean);
  const nextM=nums.slice(index+1).map(n=>markAnchors.get(n)).find(Boolean);
  const segment=(a:TextLine|undefined,b:TextLine|undefined,fallbackPage=1):Slice=>({
   page:a?.page||fallbackPage,
   top:a?bounded(a.top-.018):0.05,
   bottom:a?(b&&b.page===a.page?bounded(b.top-.022):.96):.95
  });
  return {number,parts:groups.get(number)||[],question:segment(q,nextQ),mark:segment(m,nextM,markSchemeStartPage??1),
   questionDetected:!!q,markDetected:!!m,approved:false,notes:""};
 });
}
export const isReviewable=(d:QuestionDraft,questionPages:number,markPages:number)=>
 d.question.page>=1&&d.question.page<=questionPages&&d.mark.page>=1&&d.mark.page<=markPages&&
 d.question.top>=0&&d.question.bottom<=1&&d.mark.top>=0&&d.mark.bottom<=1&&
 d.question.bottom-d.question.top>=.025&&d.mark.bottom-d.mark.top>=.025&&
 d.parts.length>0&&d.parts.every(x=>x.marks>0&&/^AO[123]$/.test(x.ao)&&x.topic.trim()&&x.id.trim());
export const totalMarks=(drafts:QuestionDraft[])=>drafts.flatMap(d=>d.parts).reduce((sum,p)=>sum+p.marks,0);
