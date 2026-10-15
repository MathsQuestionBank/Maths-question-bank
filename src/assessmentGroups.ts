import type { BankQuestion } from "./questionData";

export type AssessmentGroup = {
 key:string;
 question:BankQuestion;
 parts:BankQuestion[];
 marks:number;
 label:string;
};

/** Interim whole-question rule: selecting any lettered part includes every
 * available part of that original exam question, with the source image once.
 * Each part's recorded marks contribute exactly once.
 */
export function buildAssessmentGroups(all:BankQuestion[], selectedIds:string[]):AssessmentGroup[]{
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
  const parts=siblings;
  // The source image includes all parts, so assess all parts until individual-part cropping is supported.
  const representative=parts.find(p=>p.questionUrl)||q;
  const marks=parts.reduce((sum,p)=>sum+p.marks,0);
  output.push({key,question:representative,parts,marks,label:`${key} (${parts.map(p=>(p.sourceId||"").slice(key.length)).join(", ")})`});
 }
 return output;
}
