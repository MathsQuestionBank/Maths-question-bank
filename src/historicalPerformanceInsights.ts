import {median,type InsightsModel} from "./questionBankInsights";
import {validStudentGrade,weightedGradePerformance} from "./teacherQuestionStats";

const allGrades=Array.from({length:9},(_,i)=>i+1);
export function historicalGradeComparison(model:InsightsModel,options:{tier:string;sameQuestions:boolean;grades?:number[]}) {
 const base=model.groups.filter(g=>g.usable&&(options.tier==="All"||g.tier===options.tier));
 const values=new Map(allGrades.map(grade=>[grade,new Map(base.flatMap(g=>{
  const value=weightedGradePerformance(g.group.parts,grade);
  return value===null?[]:[[g.group.key,value] as const];
 }))]));
 const availableGrades=allGrades.filter(grade=>values.get(grade)!.size>0);
 const grades=[...new Set((options.grades??(options.sameQuestions?availableGrades:allGrades)).filter(validStudentGrade))].sort((a,b)=>a-b);
 const representedTiers=[...new Set(base.map(g=>g.tier))].sort();
 const sharedTierGrades=availableGrades.filter(grade=>representedTiers.every(tier=>base.some(g=>g.tier===tier&&values.get(grade)!.has(g.group.key))));
 const commonKeys=options.sameQuestions&&grades.length?base.filter(g=>grades.every(grade=>values.get(grade)!.has(g.group.key))).map(g=>g.group.key):[];
 const rows=grades.map(grade=>{
  const atGrade=values.get(grade)!;
  // In comparison mode reuse exactly one immutable population for every point.
  const populationKeys=options.sameQuestions?commonKeys:[...atGrade.keys()];
  return {grade,withData:populationKeys.length,missingData:base.length-populationKeys.length,
   availableAtGrade:atGrade.size,missingAtGrade:base.length-atGrade.size,
   medianPercent:median(populationKeys.map(key=>atGrade.get(key)!)),populationKeys};
 });
 let warning:string|null=null;
 if(options.sameQuestions){
  if(!grades.length)warning="Select at least one final GCSE grade to compare.";
  else if(!commonKeys.length)warning="No whole questions have complete data for every selected grade. Choose fewer grades or a single tier; no percentages have been inferred.";
  else if(commonKeys.length<5)warning=`Only ${commonKeys.length} whole questions qualify. This small resource sample is not a reliable bank-wide trend; five is a display caution, not a statistical confidence threshold.`;
 }
 return {tier:options.tier,sameQuestions:options.sameQuestions,baseCount:base.length,availableGrades,representedTiers,sharedTierGrades,grades,rows,commonKeys,warning};
}
