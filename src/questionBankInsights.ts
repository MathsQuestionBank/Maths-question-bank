import type {BankQuestion} from "./questionData";
import {buildAssessmentGroups,checkAssessmentExport,type AssessmentGroup} from "./assessmentGroups";

export type CoverageThresholds={developing:number;good:number};
export const defaultCoverageThresholds:CoverageThresholds={developing:5,good:10};
export type CoverageStatus="No coverage"|"Limited coverage"|"Developing coverage"|"Good coverage";
export type CoverageFilters={tier:string;grade:string;topic:string;skill:string;calculator:string;board:string};
export const emptyCoverageFilters:CoverageFilters={tier:"All",grade:"All",topic:"All",skill:"",calculator:"All",board:"All"};
export type CoverageSort="least"|"most"|"topic"|"skill"|"grade";
export const known=(value:string|undefined)=>!!value?.trim()&&!/^(?:unmapped|unknown|unspecified|n\/a)$/i.test(value.trim());
const normal=(s:string)=>s.normalize("NFKC").trim().replace(/\s+/g," ").toLowerCase();
export const storedTier=(q:BankQuestion)=>{const value="sourceTier" in q?q.sourceTier:q.tier;return value==="Foundation"||value==="Higher"?value:"Unknown"};
export const storedGrade=(q:BankQuestion)=>Number.isInteger(q.grade)&&q.grade>=1&&q.grade<=9?q.grade:null;
export const storedCalculator=(q:BankQuestion)=>{const value="sourceCalculator" in q?q.sourceCalculator:q.calculator;return typeof value==="boolean"?(value?"Calculator":"Non-calculator"):"Unknown"};
export const splitInsightSkills=(q:BankQuestion)=>[...new Map(q.skill.split(";").filter(known).map(s=>[normal(s),s.trim().replace(/\s+/g," ")])).values()];
const sourceNumber=(q:BankQuestion)=>q.questionNumber?.trim().match(/^(?:Q(?:uestion)?\s*)?0*(\d+)(?:[a-z]+|(?:\([a-z0-9]+\))+)?$/i)?.[1]||q.sourceId?.match(/[-_]Q0*(\d+)[a-z]*$/i)?.[1];
export function missingInsightMetadata(q:BankQuestion):string[]{
 return [!known(q.topic)&&"Topic",!splitInsightSkills(q).length&&"Enhanced skill",storedTier(q)==="Unknown"&&"Tier",storedGrade(q)===null&&"Grade",storedCalculator(q)==="Unknown"&&"Calculator",(!Number.isFinite(q.marks)||q.marks<=0)&&"Marks",!q.ao.match(/AO[123]/i)&&"Assessment objective",!known(q.examBoard)&&"Exam board",!known(q.series)&&"Series",!known(q.paperCode)&&"Paper",(!sourceNumber(q)||Number(sourceNumber(q))<=0)&&"Question reference"].filter((x):x is string=>!!x);
}
export function validCoverageThresholds(value:unknown):value is CoverageThresholds{
 if(!value||typeof value!=="object")return false;
 const v=value as CoverageThresholds;return Number.isInteger(v.developing)&&v.developing>=2&&Number.isInteger(v.good)&&v.good>v.developing&&v.good<=10000;
}
export function coverageStatus(count:number,thresholds:CoverageThresholds=defaultCoverageThresholds):CoverageStatus{
 const t=validCoverageThresholds(thresholds)?thresholds:defaultCoverageThresholds;
 return count<=0?"No coverage":count<t.developing?"Limited coverage":count<t.good?"Developing coverage":"Good coverage";
}
/** Count stored paper identities, never a truncated question source ID.
 * Linked paper IDs retain unknown-source papers and connect incomplete sibling
 * metadata; complete source tuples also deduplicate reimported paper records. */
export function countInsightPapers(all:BankQuestion[]):number {
 const source=(q:BankQuestion)=>known(q.examBoard)&&known(q.series)&&known(q.paperCode)&&storedTier(q)!=="Unknown"?JSON.stringify([q.examBoard!,q.series,q.paperCode!,storedTier(q)].map(normal)):null;
 const sourcesById=new Map<string,string>();
 for(const q of all){const key=source(q);if(q.paperId&&key&&!sourcesById.has(q.paperId))sourcesById.set(q.paperId,key);}
 return new Set(all.flatMap(q=>{const key=q.paperId?sourcesById.get(q.paperId)||`paper:${q.paperId}`:source(q);return key?[key]:[]})).size;
}
export type InsightGroup={group:AssessmentGroup;questionReady:boolean;markReady:boolean;usable:boolean;tier:string;calculator:string};
export type CoverageRow={key:string;topic:string;skill:string;tier:string;grade:number|null;records:number;questions:number;available:number;usable:number;calculator:number;nonCalculator:number;unknownCalculator:number;status:CoverageStatus};
export type InsightsModel=ReturnType<typeof buildInsightsModel>;

/** Reuse export's distinct-asset/shared-image rules, without downloading or
 * depending on temporary signed URLs. These virtual URLs are never rendered. */
function storedAssets(group:AssessmentGroup){
 const parts=group.parts.map(q=>({...q,questionUrl:q.questionPath?`stored:${q.questionPath}`:undefined,markSchemeUrl:q.markSchemePath?`stored:${q.markSchemePath}`:undefined}));
 const stored={...group,parts,question:parts[0]};
 return {questionReady:checkAssessmentExport([stored],"questions").ready,markReady:checkAssessmentExport([stored],"marks").ready};
}
const consensus=(parts:BankQuestion[],read:(q:BankQuestion)=>string)=>{const set=new Set(parts.map(read));return set.size===1?[...set][0]:"Unknown"};
export function buildInsightsModel(all:BankQuestion[]){
 // Official variants and original-practice resources are not extra exam questions.
 const records=all.filter(q=>!q.originalContent&&!q.shadowPaperId&&!q.shadowOfQuestionId);
 const groups:InsightGroup[]=buildAssessmentGroups(records,records.map(q=>q.id)).map(group=>{
  const assets=storedAssets(group);
  const needsFix=group.parts.some(q=>q.questionPath&&q.cropReview.question==="needs-fix"||q.markSchemePath&&q.cropReview.mark==="needs-fix");
  const referenced=group.parts.every(q=>!!sourceNumber(q)&&Number(sourceNumber(q))>0&&Number.isFinite(q.marks)&&q.marks>0);
  return {group,...assets,usable:assets.questionReady&&assets.markReady&&referenced&&!needsFix,tier:consensus(group.parts,storedTier),calculator:consensus(group.parts,storedCalculator)};
 });
 const byPart=new Map(groups.flatMap(g=>g.group.parts.map(q=>[q.id,g] as const)));
 const metadataIssues=new Map<string,number>();
 for(const q of records)for(const issue of missingInsightMetadata(q))metadataIssues.set(issue,(metadataIssues.get(issue)||0)+1);
 const series=new Set(records.filter(q=>known(q.series)).map(q=>normal(q.series)));
 const skillNames=new Map<string,string>();for(const q of records)for(const skill of splitInsightSkills(q))if(!skillNames.has(normal(skill)))skillNames.set(normal(skill),skill);
 const readiness={records:records.length,questionImages:records.filter(q=>q.questionPath).length,markImages:records.filter(q=>q.markSchemePath).length,bothImages:records.filter(q=>q.questionPath&&q.markSchemePath).length,missingQuestion:records.filter(q=>!q.questionPath).length,missingMark:records.filter(q=>!q.markSchemePath).length,unavailableLinks:records.filter(q=>q.questionPath&&!q.questionUrl||q.markSchemePath&&!q.markSchemeUrl).length,incompleteMetadata:records.filter(q=>missingInsightMetadata(q).length).length,cropOutstanding:records.filter(q=>q.questionPath&&q.cropReview.question!=="approved"||q.markSchemePath&&q.cropReview.mark!=="approved").length,cropNeedsFix:records.filter(q=>q.questionPath&&q.cropReview.question==="needs-fix"||q.markSchemePath&&q.cropReview.mark==="needs-fix").length};
 return {records,groups,byPart,readiness,storedGrades:[...new Set(records.map(storedGrade).filter((n):n is number=>n!==null))].sort((a,b)=>a-b),unclassifiedRecords:records.filter(q=>storedGrade(q)===null).length,metadataIssues:[...metadataIssues].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])),excluded:all.length-records.length,skillNames,skills:[...skillNames.values()].sort((a,b)=>a.localeCompare(b)),series:series.size,topics:[...new Set(records.map(q=>known(q.topic)?q.topic.trim():"Unmapped"))].sort(),boards:[...new Set(records.filter(q=>known(q.examBoard)).map(q=>q.examBoard!.trim()))].sort()};
}
export function skillCoverage(model:InsightsModel,filters:CoverageFilters=emptyCoverageFilters,thresholds:CoverageThresholds=defaultCoverageThresholds,sort:CoverageSort="least"):CoverageRow[]{
 const buckets=new Map<string,{row:CoverageRow;groups:Set<InsightGroup>}>();
 for(const q of model.records){
  const tier=storedTier(q),grade=storedGrade(q),topic=known(q.topic)?q.topic.trim():"Unmapped",calc=storedCalculator(q);
  if(filters.tier!=="All"&&tier!==filters.tier||filters.grade!=="All"&&(filters.grade==="Unclassified"?grade!==null:grade!==Number(filters.grade))||filters.topic!=="All"&&normal(topic)!==normal(filters.topic)||filters.calculator!=="All"&&calc!==filters.calculator||filters.board!=="All"&&normal(q.examBoard||"")!==normal(filters.board))continue;
  for(const raw of splitInsightSkills(q)){
   if(filters.skill&&!normal(raw).includes(normal(filters.skill)))continue;
   const skill=model.skillNames.get(normal(raw))||raw;
   const key=JSON.stringify([normal(topic),normal(skill),tier,grade]);
   if(!buckets.has(key))buckets.set(key,{row:{key,topic,skill,tier,grade,records:0,questions:0,available:0,usable:0,calculator:0,nonCalculator:0,unknownCalculator:0,status:"No coverage"},groups:new Set()});
   const entry=buckets.get(key)!;entry.row.records++;entry.groups.add(model.byPart.get(q.id)!);
  }
 }
 const rows=[...buckets.values()].map(({row,groups})=>{
  row.questions=groups.size;
  for(const g of groups){if(g.questionReady){row.available++;if(g.calculator==="Calculator")row.calculator++;else if(g.calculator==="Non-calculator")row.nonCalculator++;else row.unknownCalculator++;}if(g.usable)row.usable++;}
  row.status=coverageStatus(row.usable,thresholds);return row;
 });
 const alphabetical=(a:CoverageRow,b:CoverageRow)=>a.topic.localeCompare(b.topic)||a.skill.localeCompare(b.skill)||a.tier.localeCompare(b.tier)||(a.grade??99)-(b.grade??99);
 return rows.sort((a,b)=>(sort==="least"?a.usable-b.usable||a.available-b.available:sort==="most"?b.usable-a.usable:sort==="skill"?a.skill.localeCompare(b.skill):sort==="grade"?(a.grade??99)-(b.grade??99):0)||alphabetical(a,b));
}
/** One usable whole question per stored grade touched, not a guessed mean/max.
 * A mixed-grade multipart question can appear in more than one bar. */
export function gradeCoverage(model:InsightsModel,tier="All"){
 return [...Array.from({length:9},(_,i)=>i+1),null].map(grade=>({grade,count:model.groups.filter(g=>g.usable&&g.group.parts.some(q=>(tier==="All"||storedTier(q)===tier)&&storedGrade(q)===grade)).length}));
}
export function tierCoverage(model:InsightsModel,thresholds:CoverageThresholds){
 return ["Foundation","Higher","Unknown"].map(tier=>{
  const groups=model.groups.filter(g=>g.tier===tier),records=model.records.filter(q=>storedTier(q)===tier);
  const skills=new Map<string,Set<InsightGroup>>();
  for(const q of records)for(const skill of splitInsightSkills(q)){const key=normal(skill);if(!skills.has(key))skills.set(key,new Set());const g=model.byPart.get(q.id)!;if(g.usable)skills.get(key)!.add(g);}
  const perSkill=[...skills.values()].map(set=>set.size);
  return {tier,records:records.length,questions:groups.length,usable:groups.filter(g=>g.usable).length,skills:skills.size,limitedSkills:perSkill.filter(n=>n<thresholds.developing).length,calculator:groups.filter(g=>g.usable&&g.calculator==="Calculator").length,nonCalculator:groups.filter(g=>g.usable&&g.calculator==="Non-calculator").length,unknownCalculator:groups.filter(g=>g.usable&&g.calculator==="Unknown").length};
 });
}
export function paperCoverage(model:InsightsModel){
 const papers=new Map<string,{board:string;series:string;paper:string;tier:string;records:number;groups:Set<InsightGroup>}>();
 for(const q of model.records){
  const board=known(q.examBoard)?q.examBoard!:"Unknown board",series=known(q.series)?q.series:"Unknown series",paper=known(q.paperCode)?q.paperCode!:"Unknown paper",tier=storedTier(q),key=JSON.stringify([normal(board),normal(series),normal(paper),tier]);
  if(!papers.has(key))papers.set(key,{board,series,paper,tier,records:0,groups:new Set()});
  const entry=papers.get(key)!;entry.records++;entry.groups.add(model.byPart.get(q.id)!);
 }
 return [...papers.values()].map(p=>({...p,questions:p.groups.size,usable:[...p.groups].filter(g=>g.usable).length})).sort((a,b)=>a.board.localeCompare(b.board)||a.series.localeCompare(b.series,undefined,{numeric:true})||a.paper.localeCompare(b.paper)||a.tier.localeCompare(b.tier));
}
const csvCell=(value:string|number)=>{
 let text=String(value);if(/^[\s]*[=+\-@]/.test(text)||/^[\t\r]/.test(text))text="'"+text;
 return '"'+text.replace(/"/g,'""')+'"';
};
export function coverageCsv(rows:CoverageRow[],thresholds:CoverageThresholds,board="All"){
 const headers=["Topic","Enhanced skill","Tier","Stored GCSE grade","Mapped records","Grouped whole questions","Question-image available questions","Complete usable questions","Calculator available questions","Non-calculator available questions","Unknown calculator available questions","Coverage status (usable quantity)","Developing starts at","Good starts at","Exam board filter"];
 return "\uFEFF"+[headers,...rows.map(r=>[r.topic,r.skill,r.tier,r.grade??"Unclassified",r.records,r.questions,r.available,r.usable,r.calculator,r.nonCalculator,r.unknownCalculator,r.status,thresholds.developing,thresholds.good,board])].map(row=>row.map(csvCell).join(",")).join("\r\n");
}
