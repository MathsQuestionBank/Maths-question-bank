import type { BankQuestion } from "./questionData";

export type AssessmentGroup = {
 key:string;
 question:BankQuestion;
 parts:BankQuestion[];
 marks:number;
 label:string;
};

/** Parent IDs are shared by each lettered part of the same complete exam question. */
export function getAssessmentGroupKey(q:Pick<BankQuestion,"id"|"sourceId">):string {
 return q.sourceId?.match(/^(20\d{2}_[123][HF]_Q\d{2})([a-z][a-z0-9]*)$/i)?.[1]||q.id;
}

/** Selecting any lettered part includes the complete original question exactly once. */
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
  const key=getAssessmentGroupKey(q);
  if(seen.has(key))continue;
  seen.add(key);
  if(!match){output.push({key,question:q,parts:[q],marks:q.marks,label:q.sourceId||q.id});continue}
  const parts=(parents.get(key)||[]).slice().sort((a,b)=>(a.sourceId||"").localeCompare(b.sourceId||"",undefined,{numeric:true}));
  const representative=parts.find(p=>p.questionUrl)||q;
  const marks=parts.reduce((sum,p)=>sum+p.marks,0);
  output.push({key,question:representative,parts,marks,label:`${key} (${parts.map(p=>(p.sourceId||"").slice(key.length)).join(", ")})`});
 }
 return output;
}

export function calculateAssessmentMarks(groups:ReadonlyArray<AssessmentGroup>):number {
 return groups.reduce((sum,group)=>sum+group.marks,0);
}

/** Preserve selected part IDs when removing a whole exam question. */
export function removeAssessmentGroupIds(all:ReadonlyArray<BankQuestion>,selectedIds:ReadonlyArray<string>,groupKey:string):string[]{
 const byId=new Map(all.map(q=>[q.id,q]));
 return selectedIds.filter(id=>{
  const q=byId.get(id);
  return q ? getAssessmentGroupKey(q)!==groupKey : true;
 });
}

/** Move a complete question to a position, shifting others rather than swapping.
 *  Only selected IDs are moved; their siblings are still supplied by buildAssessmentGroups.
 *  Unknown/stale IDs are retained, so saving doesn't silently discard records.
 */
export function moveAssessmentGroupIds(all:ReadonlyArray<BankQuestion>,selectedIds:ReadonlyArray<string>,from:number,to:number):string[]{
 const groups=buildAssessmentGroups([...all],[...selectedIds]);
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=groups.length||to>=groups.length||from===to)return [...selectedIds];
 const reordered=[...groups];
 const [moved]=reordered.splice(from,1);
 reordered.splice(to,0,moved);
 const byId=new Map(all.map(q=>[q.id,q]));
 const selectedByGroup=new Map(groups.map(g=>[g.key,[] as string[]]));
 const stale:string[]=[];
 for(const id of selectedIds){
  const q=byId.get(id);
  if(!q){stale.push(id);continue;}
  selectedByGroup.get(getAssessmentGroupKey(q))?.push(id);
 }
 return [...reordered.flatMap(g=>selectedByGroup.get(g.key)||[]),...stale];
}
