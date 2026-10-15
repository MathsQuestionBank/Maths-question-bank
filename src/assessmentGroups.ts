import type { BankQuestion } from "./questionData";

export type AssessmentGroup = {
 key:string;
 question:BankQuestion;
 parts:BankQuestion[];
 marks:number;
 label:string;
};

/** V6.2: selecting a later lettered part also selects the preceding parts.
 * A parent question's single original PNG is displayed exactly once.
 * Each part contributes its own recorded mark allocation exactly once.
 */
export function buildAssessmentGroups(all:BankQuestion[], selectedIds:string[]):AssessmentGroup[]{
 const selected=new Set(selectedIds);
 const byId=new Map(all.map(q=>[q.id,q]));
 const parents=new Map<string,BankQuestion[]>();
 for(const q of all){
  const match=q.sourceId?.match(/^(20\d{2}_[123][HF]_Q\d{2})([a-z][a-z0-9]*)$/i);
  if(!match)continue;
  const key=match[1];
  const entries=parents.get(key)||[];
  entries.push(q);parents.set(key,entries);
 }
 const output:AssessmentGroup[]=[];
 const seen=new Set<string>();
 for(const id of selectedIds){
  const q=byId.get(id);if(!q)continue;
  const match=q.sourceId?.match(/^(20\d{2}_[123][HF]_Q\d{2})([a-z][a-z0-9]*)$/i);
  const key=match?.[1]||q.id;
  if(seen.has(key))continue;
  seen.add(key);
  if(!match){output.push({key,question:q,parts:[q],marks:q.marks,label:q.sourceId||q.id});continue}
  const siblings=(parents.get(key)||[]).slice().sort((a,b)=>(a.sourceId||"").localeCompare(b.sourceId||"",undefined,{numeric:true}));
  const latest=siblings.reduce((max,s,i)=>selected.has(s.id)?Math.max(max,i):max,-1);
  const parts=siblings.slice(0,latest+1);
  // The image represents the whole printed question. Mark only the included parts.
  const representative=parts.find(p=>p.questionUrl)||q;
  const marks=parts.reduce((sum,p)=>sum+p.marks,0);
  output.push({key,question:representative,parts,marks,label:`${key} (${parts.map(p=>(p.sourceId||"").slice(key.length)).join(", ")})`});
 }
 return output;
}
