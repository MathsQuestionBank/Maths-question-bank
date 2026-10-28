import type {MappingRow} from "./EnhancedMappingImporter";
import {validSlice,questionNumber,type QuestionDraft} from "./paperExtraction";

export function validateMappedPart(part:MappingRow){
 if(!part.id||!part.question||!Number.isInteger(part.marks)||part.marks<1||part.marks>20||
     !part.topic?.trim()||!part.skills?.trim()||!["AO1","AO2","AO3"].includes(part.ao)){
    throw new Error("Incomplete Enhanced Skills Mapping for "+part.question);
 }
 for(const percent of Object.values(part.gradePercent))if(percent!==null&&(!Number.isFinite(percent)||percent<0||percent>100))throw Error("Invalid grade percentage for "+part.question);
 if(questionNumber(part)===null)throw Error("Invalid question reference "+part.question);
 if(Object.keys(part.gradePercent).some(key=>!/^[1-9]$/.test(key)))throw Error("Invalid grade key for "+part.question);
}

export const preparePublication=(drafts:QuestionDraft[])=>{
 if(!drafts.length||drafts.length>50)throw new Error("A complete reviewed paper is required.");
 const missing=drafts.filter(d=>!d.approved);
 if(missing.length)throw new Error("Approve every question before publishing: "+missing.map(d=>"Q"+d.number).join(", "));
 const numbers=new Set<number>(),refs=new Set<string>(),partRefs=new Set<string>();
 let total=0,parts=0;
 for(const draft of drafts){
  if(!Number.isInteger(draft.number)||draft.number<1||draft.number>50||numbers.has(draft.number))
    throw new Error("Repeated or invalid complete question number.");
  numbers.add(draft.number);
  if(!validSlice(draft.question,1000)||!validSlice(draft.mark,1000))throw Error("Invalid crop for Q"+draft.number);
  if(draft.parts.length>1&&draft.parts.some(p=>new RegExp(`^Q0*${draft.number}$`,"i").test(p.question.trim())))throw Error("Do not combine whole-question and part allocations for Q"+draft.number);
  if(!draft.parts.length)throw new Error("Question "+draft.number+" has no mapped parts.");
  for(const part of draft.parts){
   validateMappedPart(part);
   if(questionNumber(part)!==draft.number)throw Error("Mismatched question part "+part.question);
   const partRef=part.question.trim().toLowerCase().replace(/^q0*/,"q");
   if(partRefs.has(partRef))throw Error("Repeated question reference "+part.question);
   partRefs.add(partRef);
   const ref=part.id.trim().toLowerCase();
   if(refs.has(ref))throw new Error("Repeated mapping identifier "+part.id);
   refs.add(ref);parts++;total+=part.marks;
  }
 }
 if([...numbers].some((n,_,all)=>!all.includes(n-1)&&n!==1))throw Error("Complete question numbering must start at 1 with no gaps.");
 if(total!==80)throw new Error("A complete GCSE paper must contain 80 marks, not "+total+".");
 return {questions:drafts.length,parts,marks:total};
};

export const exportMappedParts=(draft:QuestionDraft)=>draft.parts.map(p=>({
 id:p.id,question:p.question,marks:p.marks,ao:p.ao,topic:p.topic,
 skill:p.skills,tags:[...new Set((p.strands+";"+(p.additionalTags||"")).split(/[;,]/).map(t=>t.trim()).filter(Boolean).concat(p.topic))],
 spec:p.spec,original_skill:p.originalSkill||"",mapping_basis:p.mappingBasis||"",mapping_review:p.review,grade_percent:Object.fromEntries([1,2,3,4,5,6,7,8,9].map(n=>[String(n),p.gradePercent[n]??null]))
}));
