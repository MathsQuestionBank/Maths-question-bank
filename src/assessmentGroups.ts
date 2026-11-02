import type { BankQuestion } from "./questionData";
import { weightedGradePerformance, averageQuestionPerformance, compareOriginalQuestionNumber } from "./teacherQuestionStats";

export type AssessmentGroup = {
 key:string;
 question:BankQuestion;
 parts:BankQuestion[];
 marks:number;
 label:string;
};

/** Parent IDs are shared by each lettered part of the same complete exam question. */
export function getAssessmentGroupKey(q:Pick<BankQuestion,"id"|"sourceId">):string {
 // Real imported sources include EDX-F-JUNE2022-1F-Q08A / Q08B as well
 // as older 2022_1H_Q02a / Q02b identifiers.
 return q.sourceId?.match(/^(.+[-_]Q\d+)[a-z]$/i)?.[1]||q.id;
}
/** A shadow group's parent is its original question, not its shadow image filename. */
function keyForQuestion(q:BankQuestion,byId:ReadonlyMap<string,BankQuestion>):string{
 if(q.shadowPaperId&&q.shadowOfQuestionId){
  const original=byId.get(q.shadowOfQuestionId);
  return q.shadowPaperId+":"+(original?getAssessmentGroupKey(original):q.shadowOfQuestionId);
 }
 return getAssessmentGroupKey(q);
}

/** Selecting any lettered part includes the complete original question exactly once. */
export function buildAssessmentGroups(all:BankQuestion[], selectedIds:string[]):AssessmentGroup[]{
 const byId=new Map(all.map(q=>[q.id,q]));
 const parents=new Map<string,BankQuestion[]>();
 for(const q of all){
  const key=keyForQuestion(q,byId);
  const entries=parents.get(key)||[];
  entries.push(q);parents.set(key,entries);
 }
 const output:AssessmentGroup[]=[];
 const seen=new Set<string>();
 for(const id of selectedIds){
  const q=byId.get(id);if(!q)continue;
  const key=keyForQuestion(q,byId);
  if(seen.has(key))continue;
  seen.add(key);
  const parts=(parents.get(key)||[q]).slice().sort((a,b)=>(a.questionNumber||a.sourceId||"").localeCompare(b.questionNumber||b.sourceId||"",undefined,{numeric:true}));
  const representative=parts.find(p=>p.questionUrl)||q;
  const marks=parts.reduce((sum,p)=>sum+p.marks,0);
  const label=q.shadowPaperId
   ?`Shadow ${q.shadowSet||"set"} · ${(byId.get(q.shadowOfQuestionId||"")?.sourceId)||q.questionNumber||"Question"}`
   :parts.length>1?`${key} (${parts.map(p=>p.questionNumber||p.sourceId||p.id).join(", ")})`:q.sourceId||q.id;
  output.push({key,question:representative,parts,marks,label});
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
  return q ? keyForQuestion(q,byId)!==groupKey : true;
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
  selectedByGroup.get(keyForQuestion(q,byId))?.push(id);
 }
 return [...reordered.flatMap(g=>selectedByGroup.get(g.key)||[]),...stale];
}

/** Add an entire filtered set without inserting any existing question a second time.
 * One representative ID per whole question is enough: rendering auto-expands all parts.
 */
export function appendAssessmentGroupIds(all:ReadonlyArray<BankQuestion>,selectedIds:ReadonlyArray<string>,incomingIds:ReadonlyArray<string>):string[]{
 const byId=new Map(all.map(q=>[q.id,q]));
 const seen=new Set<string>();
 const output:string[]=[];
 for(const id of [...selectedIds,...incomingIds]){
  const q=byId.get(id);
  if(!q){if(selectedIds.includes(id)&&!output.includes(id))output.push(id);continue;}
  const key=keyForQuestion(q,byId);
  if(seen.has(key))continue;
  seen.add(key);output.push(id);
 }
 return output;
}

/** Sort the complete selected exam questions by mark-weighted grade performance.
 *  Lower percentages are harder for pupils who achieved that grade. Multipart
 *  questions move together and only receive a score when ALL parts have data.
 *  Missing data always goes at the end; tied scores preserve teacher ordering.
 *  Unavailable/stale IDs are kept rather than silently removed from saved work.
 */
export function sortAssessmentGroupIdsByGrade(
 all:ReadonlyArray<BankQuestion>,selectedIds:ReadonlyArray<string>,grade:number,
 direction:"ascending"|"descending"="ascending"
):string[]{
 if(!Number.isInteger(grade)||grade<1||grade>9)return [...selectedIds];
 const groups=buildAssessmentGroups([...all],[...selectedIds]);
 if(groups.length<2)return [...selectedIds];
 const byId=new Map(all.map(q=>[q.id,q]));
 const selectedByGroup=new Map(groups.map(g=>[g.key,[] as string[]]));
 const stale:string[]=[];
 for(const id of selectedIds){
  const q=byId.get(id);
  if(!q){stale.push(id);continue;}
  selectedByGroup.get(keyForQuestion(q,byId))?.push(id);
 }
 const order=groups.map((group,index)=>({
  group,index,percent:weightedGradePerformance(group.parts,grade)
 }));
 order.sort((a,b)=>{
  if(a.percent===null)return b.percent===null?a.index-b.index:1;
  if(b.percent===null)return -1;
  const delta=direction==="ascending"?a.percent-b.percent:b.percent-a.percent;
  return delta||a.index-b.index;
 });
 return [...order.flatMap(({group})=>selectedByGroup.get(group.key)||[]),...stale];
}

export type AssessmentSortMode =
 |"grade-lowest"|"grade-highest"
 |"average-lowest"|"average-highest"
 |"marks-highest"|"paper-lowest"|"paper-highest"|"topic-az";

export function sortAssessmentGroupIds(
 all:ReadonlyArray<BankQuestion>,selectedIds:ReadonlyArray<string>,mode:AssessmentSortMode,grade:number=8
):string[]{
 const groups=buildAssessmentGroups([...all],[...selectedIds]);
 if(groups.length<2)return [...selectedIds];
 const byId=new Map(all.map(q=>[q.id,q]));
 const selectedByGroup=new Map(groups.map(g=>[g.key,[] as string[]]));
 const stale:string[]=[];
 for(const id of selectedIds){
  const q=byId.get(id);
  if(!q){stale.push(id);continue;}
  selectedByGroup.get(keyForQuestion(q,byId))?.push(id);
 }
 const order=groups.map((group,index)=>({
  group,index,
  score:mode.startsWith("grade-")?weightedGradePerformance(group.parts,grade)
   :mode.startsWith("average-")?averageQuestionPerformance(group.parts,group.question.tier)
   :null
 }));
 order.sort((a,b)=>{
  let diff=0;
  if(mode.startsWith("grade-")||mode.startsWith("average-")){
   if(a.score===null)return b.score===null?a.index-b.index:1;
   if(b.score===null)return -1;
   diff=(mode.endsWith("lowest")?a.score-b.score:b.score-a.score);
  }else if(mode==="marks-highest"){
   diff=b.group.marks-a.group.marks;
  }else if(mode==="paper-lowest"||mode==="paper-highest"){
   diff=compareOriginalQuestionNumber(a.group.question,b.group.question,mode==="paper-highest");
  }else if(mode==="topic-az"){
   diff=a.group.question.topic.localeCompare(b.group.question.topic);
  }
  return diff||a.index-b.index;
 });
 return [...order.flatMap(({group})=>selectedByGroup.get(group.key)||[]),...stale];
}

export type AssessmentExportMode = "questions"|"marks"|"both";
export type ExportReadiness = {ready:boolean; missingQuestions:string[]; missingMarks:string[]};

/** Block PDF output until every selected question has the required image(s).
 *  The print page must not quietly substitute incomplete metadata or marking notes.
 */
export function checkAssessmentExport(groups:ReadonlyArray<AssessmentGroup>,mode:AssessmentExportMode):ExportReadiness{
 const missingQuestions=mode==="marks"?[]:groups.filter(g=>!g.question.questionUrl&&!(g.question.originalContent&&g.question.prompt.trim())).map(g=>g.label);
 const missingMarks=mode==="questions"?[]:groups.filter(g=>!g.question.markSchemeUrl&&!(g.question.originalContent&&g.question.answer.trim())).map(g=>g.label);
 return {ready:groups.length>0&&missingQuestions.length===0&&missingMarks.length===0,missingQuestions,missingMarks};
}
