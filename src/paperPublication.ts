import type {QuestionDraft} from "./paperExtraction";

export const preparePublication=(drafts:QuestionDraft[])=>{
 if(!drafts.length||drafts.length>50)throw new Error("A complete reviewed paper is required.");
 const missing=drafts.filter(d=>!d.approved);
 if(missing.length)throw new Error("Approve every question before publishing: "+missing.map(d=>"Q"+d.number).join(", "));
 const numbers=new Set<number>(),refs=new Set<string>();
 let total=0,parts=0;
 for(const draft of drafts){
  if(!Number.isInteger(draft.number)||draft.number<1||draft.number>50||numbers.has(draft.number))
    throw new Error("Repeated or invalid complete question number.");
  numbers.add(draft.number);
  if(!draft.parts.length)throw new Error("Question "+draft.number+" has no mapped parts.");
  for(const part of draft.parts){
   if(!part.id||!part.question||!Number.isInteger(part.marks)||part.marks<1||part.marks>20||
     !part.topic?.trim()||!part.skills?.trim()||!["AO1","AO2","AO3"].includes(part.ao)){
    throw new Error("Incomplete Enhanced Skills Mapping for "+part.question);
   }
   const ref=part.id.trim().toLowerCase();
   if(refs.has(ref))throw new Error("Repeated mapping identifier "+part.id);
   refs.add(ref);parts++;total+=part.marks;
  }
 }
 if(total!==80)throw new Error("A complete GCSE paper must contain 80 marks, not "+total+".");
 return {questions:drafts.length,parts,marks:total};
};

export const exportMappedParts=(draft:QuestionDraft)=>draft.parts.map(p=>({
 id:p.id,question:p.question,marks:p.marks,ao:p.ao,topic:p.topic,
 skill:p.skills,tags:[...new Set(p.strands.split(/[;,]/).map(t=>t.trim()).filter(Boolean).concat(p.topic))],
 spec:p.spec,grade_percent:Object.fromEntries([1,2,3,4,5].map(n=>[String(n),p.gradePercent[n]??null]))
}));
