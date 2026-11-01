import type {BankQuestion} from "./questionData";
import {buildAssessmentGroups} from "./assessmentGroups";

export function shadowIsReady(q:BankQuestion):boolean {
 return !!q.shadowPaperId&&!!q.shadowOfQuestionId&&q.shadowStatus==="reviewed"
  &&q.cropReview.question==="approved"&&q.cropReview.mark==="approved"
  &&!!q.questionPath&&!!q.markSchemePath;
}
export function shadowOptionsForOriginal(questions:readonly BankQuestion[],originalId:string):BankQuestion[]{
 return questions.filter(q=>q.shadowOfQuestionId===originalId&&shadowIsReady(q))
  .sort((a,b)=>(a.shadowSet||"").localeCompare(b.shadowSet||""));
}
export type ShadowConversion={ids:string[];replaced:number;missing:string[];total:number};
/** Replaces whole original question groups only if every part has a reviewed shadow. */
export function convertToShadowAssessment(questions:BankQuestion[],selectedIds:string[],set:string):ShadowConversion{
 const groups=buildAssessmentGroups(questions,selectedIds);
 const output:string[]=[];
 const missing:string[]=[];
 let replaced=0;
 const candidates=new Map<string,BankQuestion[]>();
 for(const q of questions){
  if(!shadowIsReady(q)||q.shadowSet?.toLowerCase()!==set.toLowerCase())continue;
  const key=q.shadowOfQuestionId!;
  candidates.set(key,[...(candidates.get(key)||[]),q]);
 }
 for(const group of groups){
  if(group.question.shadowPaperId){
   output.push(group.question.id);continue;
  }
  const equivalents=group.parts.map(part=>candidates.get(part.id)||[]);
  // Reject incomplete or ambiguous matches rather than silently dropping parts.
  if(equivalents.some(options=>options.length!==1)){
   output.push(group.question.id);
   missing.push(group.label);
   continue;
  }
  const linked=equivalents.map(options=>options[0]);
  if(new Set(linked.map(q=>q.shadowPaperId)).size!==1){
   output.push(group.question.id);
   missing.push(group.label);
   continue;
  }
  output.push(linked[0].id);
  replaced++;
 }
 return {ids:output,replaced,missing,total:groups.length};
}
