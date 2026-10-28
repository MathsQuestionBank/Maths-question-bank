import type { BankQuestion } from "./questionData";

export type AssessmentGroup = {
 key:string;
 question:BankQuestion;
 parts:BankQuestion[];
 marks:number;
 label:string;
};

/** Parent IDs are shared by each lettered part of the same complete exam question. */
export function getAssessmentGroupKey(q:Pick<BankQuestion,"id"|"sourceId"|"wholeKey">):string {
 return q.wholeKey||q.sourceId?.match(/^(.*[-_]Q\d{1,2})(?:[a-z][a-z0-9]*)?$/i)?.[1]||q.id;
}

/** Selecting a mapped part includes its complete question once, retaining legacy IDs. */
export function buildAssessmentGroups(all:BankQuestion[], selectedIds:string[]):AssessmentGroup[]{
 const byId=new Map(all.map(q=>[q.id,q]));
 const parents=new Map<string,BankQuestion[]>();
 for(const q of all){
  const key=getAssessmentGroupKey(q);
  const entries=parents.get(key)||[];entries.push(q);parents.set(key,entries);
 }
 const output:AssessmentGroup[]=[],seen=new Set<string>();
 for(const id of selectedIds){
  const q=byId.get(id);if(!q)continue;
  const key=getAssessmentGroupKey(q);if(seen.has(key))continue;seen.add(key);
  const parts=(parents.get(key)||[q]).slice().sort((a,b)=>(a.sourceId||"").localeCompare(b.sourceId||"",undefined,{numeric:true}));
  // An explicit whole-question record supersedes its part allocations.
  const whole=parts.find(p=>p.sourceId===key||/[-_]Q\d{1,2}$/i.test(p.sourceId||""));
  const representative=whole||parts.find(p=>p.questionUrl)||q;
  const marks=whole?.marks??q.wholeMarks??parts.reduce((sum,p)=>sum+p.marks,0);
  output.push({key,question:representative,parts,marks,label:parts.length===1?q.sourceId||q.id:key});
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

export type AssessmentExportMode = "questions"|"marks"|"both";
export type ExportReadiness = {ready:boolean; missingQuestions:string[]; missingMarks:string[]};

/** Block PDF output until every selected question has the required image(s).
 *  The print page must not quietly substitute incomplete metadata or marking notes.
 */
export function checkAssessmentExport(groups:ReadonlyArray<AssessmentGroup>,mode:AssessmentExportMode):ExportReadiness{
 const missingQuestions=mode==="marks"?[]:groups.filter(g=>!g.question.questionUrl).map(g=>g.label);
 const missingMarks=mode==="questions"?[]:groups.filter(g=>!g.question.markSchemeUrl).map(g=>g.label);
 return {ready:groups.length>0&&missingQuestions.length===0&&missingMarks.length===0,missingQuestions,missingMarks};
}
