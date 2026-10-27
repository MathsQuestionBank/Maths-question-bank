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
const bounded=(x:number)=>Math.max(0,Math.min(1,x));
export function makeReviewDrafts(rows:MappingRow[],questionLines:TextLine[],markLines:TextLine[]):QuestionDraft[]{
 const groups=new Map<number,MappingRow[]>();
 for(const row of rows){
  const n=questionNumber(row);
  if(n===null)continue;
  const a=groups.get(n)||[];a.push(row);groups.set(n,a);
 }
 const nums=[...groups.keys()].sort((a,b)=>a-b);
 const questionAnchors=findQuestionAnchors(questionLines,nums),markAnchors=findQuestionAnchors(markLines,nums);
 return nums.map((number,index)=>{
  const q=questionAnchors.get(number),m=markAnchors.get(number);
  const nextQ=nums.slice(index+1).map(n=>questionAnchors.get(n)).find(Boolean);
  const nextM=nums.slice(index+1).map(n=>markAnchors.get(n)).find(Boolean);
  const segment=(a:TextLine|undefined,b:TextLine|undefined):Slice=>({
   page:a?.page||1,
   top:a?bounded(a.top-.018):0.05,
   bottom:a?(b&&b.page===a.page?bounded(b.top-.022):.96):.95
  });
  return {number,parts:groups.get(number)||[],question:segment(q,nextQ),mark:segment(m,nextM),
   questionDetected:!!q,markDetected:!!m,approved:false,notes:""};
 });
}
export const isReviewable=(d:QuestionDraft,questionPages:number,markPages:number)=>
 d.question.page>=1&&d.question.page<=questionPages&&d.mark.page>=1&&d.mark.page<=markPages&&
 d.question.top>=0&&d.question.bottom<=1&&d.mark.top>=0&&d.mark.bottom<=1&&
 d.question.bottom-d.question.top>=.025&&d.mark.bottom-d.mark.top>=.025&&
 d.parts.length>0&&d.parts.every(x=>x.marks>0&&/^AO[123]$/.test(x.ao)&&x.topic.trim()&&x.id.trim());
export const totalMarks=(drafts:QuestionDraft[])=>drafts.flatMap(d=>d.parts).reduce((sum,p)=>sum+p.marks,0);
