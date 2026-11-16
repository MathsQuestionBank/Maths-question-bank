import type {BankQuestion} from "./questionData";
import {buildAssessmentGroups,checkAssessmentExport,type AssessmentGroup} from "./assessmentGroups";
import {shadowIsReady} from "./shadowAssessments";
import {weightedGradePerformance} from "./teacherQuestionStats";

export type ShadowDifficulty="same"|"easier"|"harder";
export type ReplacementMethod="official"|"alternative";
export type MatchCategory="Strong metadata match"|"Possible match — teacher review recommended";
export type ShadowSuggestion={group:AssessmentGroup;method:ReplacementMethod;category:MatchCategory;reasons:string[];warnings:string[]};
export type TargetedShadowInfo={version:1;originalTitle:string;difficulty:ShadowDifficulty;replacements:{originalKey:string;originalIds:string[];replacementKey:string;replacementIds:string[];method:ReplacementMethod}[];unmatchedOriginalIds:string[]};
export type TargetedChoice={originalKey:string;replacementKey:string|null};
const normal=(s:string)=>s.normalize("NFKC").toLowerCase().replace(/[‐‑–—-]/g," ").replace(/\s+/g," ").trim();
const absent=(s:string|undefined)=>!s||/^(?:unknown|unspecified|unmapped|standard|n\/a)$/i.test(s.trim());
const broad=new Set(["algebra","geometry","number","probability","ratio","statistics","ratio and proportion","ratio, proportion and rates of change","geometry and measures","geometry & measures","ratio & proportion","unmapped","unknown","unspecified","n/a"]);
export function enhancedSkills(group:AssessmentGroup):string[]{return [...new Set(group.parts.flatMap(part=>part.skill.split(";").map(normal).filter(skill=>skill&&!broad.has(skill))))].sort()}
function skillComplete(group:AssessmentGroup){return group.parts.every(part=>part.skill.split(";").some(skill=>{const s=normal(skill);return !!s&&!broad.has(s)}))}
export function groupGrade(group:AssessmentGroup):{min:number;max:number;value:number}|null{
 if(group.parts.some(part=>!Number.isInteger(part.grade)||part.grade<1||part.grade>9))return null;
 const grades=group.parts.map(part=>part.grade),marks=group.parts.reduce((sum,part)=>sum+Math.max(0,part.marks),0);
 return {min:Math.min(...grades),max:Math.max(...grades),value:marks?group.parts.reduce((sum,part)=>sum+part.grade*Math.max(0,part.marks),0)/marks:grades.reduce((a,b)=>a+b,0)/grades.length};
}
function tier(group:AssessmentGroup):string|null{
 const values=group.parts.map(part=>"sourceTier" in part?part.sourceTier:part.tier);
 return values.every(value=>value===values[0])&&(values[0]==="Higher"||values[0]==="Foundation")?values[0]:null;
}
function calculator(group:AssessmentGroup):boolean|null{
 const values=group.parts.map(part=>"sourceCalculator" in part?part.sourceCalculator:part.calculator);
 return typeof values[0]==="boolean"&&values.every(value=>value===values[0])?values[0]:null;
}
const aos=(group:AssessmentGroup)=>[...new Set(group.parts.flatMap(part=>part.ao.toUpperCase().match(/AO[123]/g)||[]))].sort();
const same=(a:string[],b:string[])=>a.length===b.length&&a.every((value,index)=>value===b[index]);
const compare=(a:number[],b:number[])=>{for(let i=0;i<a.length;i++){const n=a[i]-b[i];if(n)return n}return 0};

/** Build the whole-question catalogue once; per-question skill intersections
 * avoid scanning the bank for each rendered suggestion. No random ranking. */
export function createSmartShadowMatcher(all:BankQuestion[],assessmentIds:string[],additionalExcludedIds:string[]=[]){
 const catalogue=buildAssessmentGroups(all,all.map(q=>q.id));
 const originals=buildAssessmentGroups(all,assessmentIds);
 const byId=new Map(all.map(q=>[q.id,q]));
 const byKey=new Map(catalogue.map(group=>[group.key,group]));
 const family=(group:AssessmentGroup)=>new Set(group.parts.map(part=>{
  const q=part.shadowOfQuestionId?byId.get(part.shadowOfQuestionId)||part:part;
  const source=q.sourceId?.match(/^(.+[-_]Q)0*(\d+)[a-z]*$/i);
  const explicit=q.questionNumber?.match(/^(?:Q(?:uestion)?\s*)?0*(\d+)(?:[a-z]+|(?:\([a-z0-9]+\))+)?$/i);
  const number=explicit?.[1]||source?.[2];
  // Legacy and newer imports may name the same exam question differently.
  // Use actual source fields when complete, never infer a series or board.
  if(number&&!absent(q.examBoard)&&!absent(q.series)&&!absent(q.paperCode))return [q.examBoard!,q.series,q.paperCode!,String(Number(number))].map(normal).join("|");
  return source?normal(source[1])+Number(source[2]):q.id;
 }));
 const excluded=buildAssessmentGroups(all,[...assessmentIds,...additionalExcludedIds]);
 const inAssessment=new Set(excluded.map(group=>group.key));
 const originalFamilies=new Set(excluded.flatMap(group=>[...family(group)]));
 const skillIndex=new Map<string,Set<string>>();
 for(const group of catalogue)for(const skill of enhancedSkills(group)){const keys=skillIndex.get(skill)||new Set<string>();keys.add(group.key);skillIndex.set(skill,keys)}
 const ready=(group:AssessmentGroup)=>checkAssessmentExport([group],"both").ready&&group.parts.every(part=>Number.isFinite(part.marks)&&part.marks>0);
 function officialFor(original:AssessmentGroup,candidate:AssessmentGroup){
  const ids=new Set(original.parts.map(part=>part.shadowOfQuestionId||part.id));
  return candidate.parts.length===ids.size&&candidate.parts.every(part=>shadowIsReady(part)&&ids.has(part.shadowOfQuestionId!))&&new Set(candidate.parts.map(part=>part.shadowOfQuestionId)).size===ids.size&&new Set(candidate.parts.map(part=>part.shadowPaperId)).size===1;
 }
 function assess(original:AssessmentGroup,candidate:AssessmentGroup,difficulty:ShadowDifficulty):{suggestion:ShadowSuggestion;rank:number[]}|null{
  if(inAssessment.has(candidate.key)||[...family(candidate)].some(id=>originalFamilies.has(id))&&!candidate.question.shadowPaperId)return null;
  // Linked official variants may share the original family; all other shadows
  // are excluded rather than being passed off as bank alternatives.
  const official=!!candidate.question.shadowPaperId&&officialFor(original,candidate);
  if(candidate.question.shadowPaperId&&!official)return null;
  if(!ready(candidate)||(!official&&(!skillComplete(original)||!skillComplete(candidate))))return null;
  const originalTier=tier(original),candidateTier=tier(candidate),calc=calculator(original),candidateCalc=calculator(candidate);
  if(!originalTier||candidateTier!==originalTier||calc===null||candidateCalc!==calc)return null;
  const wanted=enhancedSkills(original),skills=enhancedSkills(candidate);
  if(!official&&(!wanted.length||!wanted.every(skill=>skills.includes(skill))))return null;
  const originalGrade=groupGrade(original),candidateGrade=groupGrade(candidate);
  if(candidateGrade&&(candidateTier==="Foundation"&&candidateGrade.max>5||candidateTier==="Higher"&&candidateGrade.min<4))return null;
  const targetGrade=originalGrade?Math.round(originalGrade.value):null;
  const p=targetGrade?weightedGradePerformance(original.parts,targetGrade):null,c=targetGrade?weightedGradePerformance(candidate.parts,targetGrade):null;
  const delta=originalGrade&&candidateGrade?candidateGrade.value-originalGrade.value:null;
  if(difficulty==="same"&&delta!==null&&(Math.abs(delta)>1||Math.abs(candidateGrade!.max-originalGrade!.max)>1||Math.abs(candidateGrade!.min-originalGrade!.min)>1))return null;
  if(difficulty!=="same"){
   if(delta===null)return null;
   const gradeDirection=difficulty==="easier"?delta<0&&delta>=-2&&candidateGrade!.max<=originalGrade!.max:delta>0&&delta<=2&&candidateGrade!.min>=originalGrade!.min;
   const performanceDirection=delta===0&&p!==null&&c!==null&&(difficulty==="easier"?c-p>=5:p-c>=5);
   if(!gradeDirection&&!performanceDirection)return null;
  }
  const reasons=[official?"Complete, approved official shadow linked to every original part.":"Same enhanced skill coverage.","Same tier and compatible calculator requirement."];
  const warnings:string[]=[];
  const exactSkills=skillComplete(original)&&skillComplete(candidate)&&same(wanted,skills);
  if(!skillComplete(original)||!skillComplete(candidate))warnings.push("Enhanced skill metadata is incomplete; review the linked official shadow.");
  else if(!exactSkills)warnings.push("Enhanced skill coverage differs; check the extra demand.");
  if(delta===null)warnings.push("Grade metadata is incomplete; the difficulty match cannot be verified.");
  else reasons.push(delta===0&&originalGrade?.min===candidateGrade?.min&&originalGrade?.max===candidateGrade?.max?"Same listed grade range.":`Listed grades are ${difficulty==="same"?"close":difficulty==="easier"?"lower or supported by easier historic performance":"higher or supported by harder historic performance"}; grade alone does not establish equivalent demand.`);
  if(p===null||c===null)warnings.push("Comparable historic difficulty data is unavailable.");
  else reasons.push(`Historic performance at final grade ${targetGrade}: ${p}% vs ${c}% of available marks.`);
  const originalAos=aos(original),candidateAos=aos(candidate),aoMatch=originalAos.length>0&&same(originalAos,candidateAos);
  if(aoMatch)reasons.push("Same assessment objective coverage.");else warnings.push(candidateAos.length&&originalAos.length?"Assessment objective coverage differs.":"Assessment objective metadata is incomplete.");
  if(candidate.marks===original.marks)reasons.push("Same total marks.");else reasons.push(`${candidate.marks} marks instead of ${original.marks}; check the workload.`);
  if(candidate.parts.length===original.parts.length)reasons.push("Same number of mapped parts.");else warnings.push("Question structure differs; review the complete question.");
  if(candidate.parts.some(part=>absent(part.examBoard)||absent(part.series)||absent(part.paperCode)))warnings.push("Some examination source metadata is unavailable.");
  if(candidate.parts.some(part=>part.imagePending))warnings.push("Some images are still loading.");
  const strong=exactSkills&&delta===0&&originalGrade?.min===candidateGrade?.min&&originalGrade?.max===candidateGrade?.max&&aoMatch&&candidate.marks===original.marks&&candidate.parts.length===original.parts.length&&warnings.length===0;
  const suggestion:ShadowSuggestion={group:candidate,method:official?"official":"alternative",category:strong?"Strong metadata match":"Possible match — teacher review recommended",reasons,warnings};
  // Grade proximity precedes historic performance/AO/marks. Same-tier and
  // calculator compatibility are hard gates, never hidden score tradeoffs.
  const distance=delta===null?10:difficulty==="same"?Math.abs(delta):Math.abs(Math.abs(delta)-1);
  return {suggestion,rank:[official?0:1,exactSkills?0:1,distance,p===null||c===null?1:0,p===null||c===null?100:Math.abs(p-c),aoMatch?0:1,Math.abs(candidate.marks-original.marks),Math.abs(candidate.parts.length-original.parts.length)]};
 }
 function ranked(key:string,difficulty:ShadowDifficulty,reserved:ReadonlySet<string>){
  const original=originals.find(group=>group.key===key);if(!original)return [];
  const skills=enhancedSkills(original);
  const keys=new Set<string>(skills.length?[...(skillIndex.get(skills[0])||[])]:[]);
  for(const candidate of catalogue)if(candidate.question.shadowPaperId&&officialFor(original,candidate))keys.add(candidate.key);
  const reservedFamilies=new Set([...reserved].flatMap(key=>{const group=byKey.get(key);return group?[...family(group)]:[]}));
  const ranked=[...keys].filter(key=>!reserved.has(key)&&![...family(byKey.get(key)!)].some(id=>reservedFamilies.has(id))).flatMap(key=>{const group=byKey.get(key)!;const result=assess(original,group,difficulty);return result?[result]:[]}).sort((a,b)=>compare(a.rank,b.rank)||a.suggestion.group.key.localeCompare(b.suggestion.group.key));
  const seen=new Set<string>();return ranked.filter(item=>{const identity=[...family(item.suggestion.group)].sort().join("|");if(seen.has(identity))return false;seen.add(identity);return true});
 }
 return {originals,
  suggest(key:string,difficulty:ShadowDifficulty,reserved:ReadonlySet<string>=new Set(),keepKey?:string){
   const original=originals.find(group=>group.key===key);
   const matches=ranked(key,difficulty,reserved),top=matches.slice(0,3).map(item=>item.suggestion);
   const kept=keepKey?matches.find(item=>item.suggestion.group.key===keepKey)?.suggestion:undefined;
   if(kept&&!top.some(item=>item.group.key===keepKey))top.splice(2,1,kept);
   const reason=!original?"The original question is unavailable.":!skillComplete(original)?"Enhanced skill metadata is missing for one or more parts.":!tier(original)||calculator(original)===null?"Tier or calculator metadata is missing; compatibility cannot be verified.":difficulty!=="same"&&!groupGrade(original)?"Grade metadata is missing; the requested difficulty direction cannot be verified.":"No complete question with the same enhanced skills, compatible tier/calculator and requested difficulty is available outside this assessment and your other choices.";
   return {suggestions:top,available:matches.length,reason:top.length?undefined:reason};
  },
  generate(choices:TargetedChoice[],difficulty:ShadowDifficulty,originalTitle:string){
   if(!choices.length||new Set(choices.map(choice=>choice.originalKey)).size!==choices.length)throw Error("Select distinct original questions.");
   const reserved=new Set<string>(),ids:string[]=[],replacements:TargetedShadowInfo["replacements"]=[],unmatchedOriginalIds:string[]=[];
   for(const choice of choices){
    const original=originals.find(group=>group.key===choice.originalKey);if(!original)throw Error("An original question is unavailable.");
    if(choice.replacementKey===null){unmatchedOriginalIds.push(...original.parts.map(part=>part.id));continue;}
    const found=ranked(choice.originalKey,difficulty,reserved).find(item=>item.suggestion.group.key===choice.replacementKey)?.suggestion;
    if(!found)throw Error("A replacement is duplicate, incomplete or no longer compatible. Review your choices.");
    reserved.add(found.group.key);ids.push(found.group.question.id);
    replacements.push({originalKey:original.key,originalIds:original.parts.map(part=>part.id),replacementKey:found.group.key,replacementIds:found.group.parts.map(part=>part.id),method:found.method});
   }
   if(!ids.length)throw Error("Choose at least one suitable replacement before generating.");
   const info:TargetedShadowInfo={version:1,originalTitle,difficulty,replacements,unmatchedOriginalIds};
   return {ids,info,totalMarks:buildAssessmentGroups(all,ids).reduce((sum,group)=>sum+group.marks,0)};
  }
 };
}
