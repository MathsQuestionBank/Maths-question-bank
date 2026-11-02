import { describe, expect, it } from "vitest";
import { buildAssessmentGroups, calculateAssessmentMarks, checkAssessmentExport, getAssessmentGroupKey, moveAssessmentGroupIds, removeAssessmentGroupIds, sortAssessmentGroupIdsByGrade, sortAssessmentGroupIds, appendAssessmentGroupIds } from "./assessmentGroups";
import type { BankQuestion } from "./questionData";
import { weightedGradePerformance, averageQuestionPerformance } from "./teacherQuestionStats";

const make=(id:string,sourceId:string,marks:number,image=false):BankQuestion=>({
 id,sourceId,marks,questionUrl:image?"signed-question-url":undefined,markSchemeUrl:image?"signed-mark-url":undefined,
 topic:"Algebra",skill:"Substitution",tier:"Higher",grade:6,calculator:false,series:"November 2022",ao:"AO1",challenge:"Standard",
 prompt:"Question",answer:"Mark scheme",tags:[],gradePerformance:{4:null,5:null,6:null,7:null,8:null,9:null},
 imageCrops:{question:{top:0,right:0,bottom:0,left:0},mark:{top:0,right:0,bottom:0,left:0}},cropReview:{question:"unreviewed",mark:"unreviewed"}
});
const a=make("a","2022_1H_Q02a",2,true);
const b=make("b","2022_1H_Q02b",2,true);
const c=make("c","2021_2H_Q11",6,true);
const d=make("d","2020_3H_Q07",3,true);
const all=[a,b,c,d];

describe("V6.2 whole-question grouping",()=>{
 it("selecting part a brings all sibling parts once and sums their marks",()=>{
  const groups=buildAssessmentGroups(all,["a"]);
  expect(groups).toHaveLength(1);
  expect(groups[0].parts.map(q=>q.sourceId)).toEqual(["2022_1H_Q02a","2022_1H_Q02b"]);
  expect(groups[0].marks).toBe(4);
 });
 it("selecting part b and then part a never duplicates the question or marks",()=>{
  const groups=buildAssessmentGroups(all,["b","a","b"]);
  expect(groups).toHaveLength(1);
  expect(calculateAssessmentMarks(groups)).toBe(4);
 });
 it("uses the whole question image as one group, not one image per part",()=>{
  const groups=buildAssessmentGroups(all,["a","b"]);
  expect(groups).toHaveLength(1);
  expect(groups[0].question.questionUrl).toBe("signed-question-url");
 });
 it("keeps question groups in selection order and totals all distinct marks",()=>{
  const groups=buildAssessmentGroups(all,["d","b","c"]);
  expect(groups.map(g=>g.key)).toEqual(["d","2022_1H_Q02","c"]);
  expect(calculateAssessmentMarks(groups)).toBe(13);
 });
 it("groups use the full exam paper reference, avoiding collisions across papers",()=>{
  const other=make("e","2022_2H_Q02a",5,true);
  expect(buildAssessmentGroups([...all,other],["a","e"])).toHaveLength(2);
 });
});

describe("assessment ordering and removal",()=>{
 it("moves a whole multipart group rather than swapping two distant questions",()=>{
  const order=moveAssessmentGroupIds(all,["a","c","d"],0,2);
  expect(buildAssessmentGroups(all,order).map(g=>g.key)).toEqual(["c","d","2022_1H_Q02"]);
 });
 it("moving the second group to the first preserves the originally selected part ID",()=>{
  const order=moveAssessmentGroupIds(all,["d","b","c"],1,0);
  expect(order).toEqual(["b","d","c"]);
  expect(calculateAssessmentMarks(buildAssessmentGroups(all,order))).toBe(13);
 });
 it("direct position change shifts intervening groups and preserves all selected multipart parts",()=>{
  const selected=["a","b","c","d"];
  const result=moveAssessmentGroupIds(all,selected,0,2);
  expect(buildAssessmentGroups(all,result).map(g=>g.key)).toEqual(["c","d","2022_1H_Q02"]);
  expect(result).toEqual(["c","d","a","b"]);
  expect(calculateAssessmentMarks(buildAssessmentGroups(all,result))).toBe(13);
 });
 it("out-of-range moves do not alter selected IDs",()=>{
  expect(moveAssessmentGroupIds(all,["a","c","d"],0,100)).toEqual(["a","c","d"]);
 });
 it("removes the entire multipart question even when both parts are selected",()=>{
  expect(removeAssessmentGroupIds(all,["a","b","c"],getAssessmentGroupKey(a))).toEqual(["c"]);
 });
 it("keeps stale saved IDs rather than silently deleting them",()=>{
  expect(moveAssessmentGroupIds(all,["unknown","a","c"],0,1)).toContain("unknown");
 });
 it("never changes the total when only the ordering changes",()=>{
  const original=["a","c","d"];
  const moved=moveAssessmentGroupIds(all,original,2,0);
  expect(calculateAssessmentMarks(buildAssessmentGroups(all,moved))).toBe(calculateAssessmentMarks(buildAssessmentGroups(all,original)));
 });
});

describe("assessment PDF export readiness",()=>{
 it("requires question images for a question-only paper",()=>{
  expect(checkAssessmentExport(buildAssessmentGroups(all,["a","c"]),"questions").ready).toBe(true);
  const unavailable=make("x","2022_1H_Q30",4);
  expect(checkAssessmentExport(buildAssessmentGroups([...all,unavailable],["x"]),"questions").missingQuestions).toHaveLength(1);
 });
 it("requires mark-scheme images for marks-only export, not question images",()=>{
  const markOnly={...make("x","2022_1H_Q30",4),markSchemeUrl:"signed-mark-url"};
  expect(checkAssessmentExport(buildAssessmentGroups([markOnly],["x"]),"marks").ready).toBe(true);
  expect(checkAssessmentExport(buildAssessmentGroups([markOnly],["x"]),"questions").ready).toBe(false);
 });
 it("combined export requires both images for every grouped question",()=>{
  const partial={...make("x","2022_1H_Q30",4),questionUrl:"signed-question-url"};
  const assessment=buildAssessmentGroups([...all,partial],["a","x"]);
  expect(checkAssessmentExport(assessment,"both").ready).toBe(false);
  expect(checkAssessmentExport(assessment,"both").missingMarks).toEqual(["2022_1H_Q30"]);
 });
 it("cannot print an empty assessment in any export mode",()=>{
  for(const mode of ["questions","marks","both"] as const)expect(checkAssessmentExport([],mode).ready).toBe(false);
 });
});

describe("teacher original practice export",()=>{
 it("allows text-only original questions and answer sheets in all export modes",()=>{
  const question={...make("original-1","ORIGINAL-PRACTICE-01",2),originalContent:true};
  const groups=buildAssessmentGroups([question],["original-1"]);
  expect(checkAssessmentExport(groups,"questions").ready).toBe(true);
  expect(checkAssessmentExport(groups,"marks").ready).toBe(true);
  expect(checkAssessmentExport(groups,"both").ready).toBe(true);
 });
 it("does not bypass exam-image checks for unsupported questions",()=>{
  const question={...make("exam-1","2020_1H_Q01",2),originalContent:false};
  expect(checkAssessmentExport(buildAssessmentGroups([question],["exam-1"]),"both").ready).toBe(false);
 });
});

describe("automatic grade-performance question ordering",()=>{
 const graded=[
  {...a,gradePerformance:{...a.gradePerformance,8:40,7:65}},
  {...b,gradePerformance:{...b.gradePerformance,8:80,7:45}},
  {...c,gradePerformance:{...c.gradePerformance,8:30,7:50}},
  {...d,gradePerformance:{...d.gradePerformance,8:70,7:75}}
 ];
 it("sorts grade 8 lowest to highest without splitting parts of Q02",()=>{
  const result=sortAssessmentGroupIdsByGrade(graded,["d","b","a","c"],8,"ascending");
  expect(result).toEqual(["c","b","a","d"]);
  expect(buildAssessmentGroups(graded,result).map(g=>g.key)).toEqual(["c","2022_1H_Q02","d"]);
  expect(calculateAssessmentMarks(buildAssessmentGroups(graded,result))).toBe(13);
 });
 it("sorts highest to lowest with multipart percent weighted by marks",()=>{
  const result=sortAssessmentGroupIdsByGrade(graded,["a","c","d"],8,"descending");
  expect(result).toEqual(["d","a","c"]);
 });
 it("keeps missing grade data LAST even when sorting descending",()=>{
  const incomplete=graded.map(q=>q.id==="b"?{...q,gradePerformance:{...q.gradePerformance,8:null}}:q);
  for(const direction of ["ascending","descending"] as const){
   const result=sortAssessmentGroupIdsByGrade(incomplete,["a","c","d"],8,direction);
   const sortedGroups=buildAssessmentGroups(incomplete,result);
   expect(sortedGroups[sortedGroups.length-1]?.key).toBe("2022_1H_Q02");
  }
 });
 it("preserves tied scores and stale references",()=>{
  const equal=graded.map(q=>({...q,gradePerformance:{...q.gradePerformance,8:50}}));
  expect(sortAssessmentGroupIdsByGrade(equal,["d","unknown","b","c"],8,"ascending")).toEqual(["d","b","c","unknown"]);
 });
 it("rejects invalid grade values without reordering",()=>{
  expect(sortAssessmentGroupIdsByGrade(graded,["d","a","c"],0)).toEqual(["d","a","c"]);
 });
});

describe("June 2022 Foundation real import multipart IDs",()=>{
 const q8a={...make("q8a","EDX-F-JUNE2022-1F-Q08A",2,true),series:"June 2022",paperCode:"1F",questionNumber:"Q08a",tier:"Foundation" as const,gradePerformance:{1:70,2:60,3:null,4:null,5:null}};
 const q8b={...make("q8b","EDX-F-JUNE2022-1F-Q08B",1,true),series:"June 2022",paperCode:"1F",questionNumber:"Q08b",tier:"Foundation" as const,gradePerformance:{1:90,2:80,3:null,4:null,5:null}};
 const q9a={...make("q9a","EDX-F-JUNE2022-1F-Q09A",1,true),series:"June 2022",paperCode:"1F",questionNumber:"Q09a",tier:"Foundation" as const};
 const q9b={...make("q9b","EDX-F-JUNE2022-1F-Q09B",1,true),series:"June 2022",paperCode:"1F",questionNumber:"Q09b",tier:"Foundation" as const};
 const all=[q8a,q8b,q9a,q9b];
 it("groups source IDs with uppercase part suffix into one question and adds all its marks once",()=>{
  expect(getAssessmentGroupKey(q8a)).toBe("EDX-F-JUNE2022-1F-Q08");
  const groups=buildAssessmentGroups(all,["q8a","q8b","q8b"]);
  expect(groups).toHaveLength(1);
  expect(groups[0].parts.map(part=>part.questionNumber)).toEqual(["Q08a","Q08b"]);
  expect(calculateAssessmentMarks(groups)).toBe(3);
 });
 it("adding part b after part a or bulk adding the same paper never duplicates groups",()=>{
  const afterFirst=appendAssessmentGroupIds(all,[],["q8a"]);
  const afterSecond=appendAssessmentGroupIds(all,afterFirst,["q8b"]);
  expect(afterSecond).toEqual(["q8a"]);
  const bulk=appendAssessmentGroupIds(all,afterSecond,["q8a","q8b","q9a","q9b"]);
  expect(bulk).toEqual(["q8a","q9a"]);
  expect(buildAssessmentGroups(all,bulk)).toHaveLength(2);
  expect(calculateAssessmentMarks(buildAssessmentGroups(all,bulk))).toBe(5);
  expect(removeAssessmentGroupIds(all,bulk,"EDX-F-JUNE2022-1F-Q08")).toEqual(["q9a"]);
 });
 it("retains the different part percentages for the mark-weighted combined historic stats",()=>{
  expect(weightedGradePerformance([q8a,q8b],1)).toBe(76.7);
  expect(weightedGradePerformance([q8a,q8b],2)).toBe(66.7);
  expect(averageQuestionPerformance([q8a,q8b],"Foundation")).toBe(71.7);
 });
 it("preserves paper identity across series and tiers",()=>{
  const elsewhere={...q8a,id:"other",sourceId:"EDX-F-NOVEMBER2022-1F-Q08A",series:"November 2022"};
  expect(buildAssessmentGroups([...all,elsewhere],["q8a","other"])).toHaveLength(2);
 });
});
describe("full builder sort options",()=>{
 const graded=[
  {...a,gradePerformance:{...a.gradePerformance,7:65,8:40}},
  {...b,gradePerformance:{...b.gradePerformance,7:45,8:80}},
  {...c,topic:"Geometry",gradePerformance:{...c.gradePerformance,7:50,8:30}},
  {...d,topic:"Number",gradePerformance:{...d.gradePerformance,7:75,8:70}}
 ];
 const allIds=["d","a","c"];
 it("sorts Grade 8 lowest or highest with multipart score once",()=>{
  expect(sortAssessmentGroupIds(graded,allIds,"grade-lowest",8)).toEqual(["c","a","d"]);
  expect(sortAssessmentGroupIds(graded,allIds,"grade-highest",8)).toEqual(["d","a","c"]);
 });
 it("sorts mean of available grade-group averages easiest or hardest, not percent fully correct",()=>{
  expect(sortAssessmentGroupIds(graded,allIds,"average-highest")).toEqual(["d","a","c"]);
  expect(sortAssessmentGroupIds(graded,allIds,"average-lowest")).toEqual(["c","a","d"]);
 });
 it("sorts by marks, original question and topic while keeping multipart questions intact",()=>{
  expect(sortAssessmentGroupIds(graded,allIds,"marks-highest")).toEqual(["c","a","d"]);
  expect(sortAssessmentGroupIds(graded,allIds,"paper-lowest")).toEqual(["a","d","c"]);
  expect(sortAssessmentGroupIds(graded,allIds,"paper-highest")).toEqual(["c","d","a"]);
  expect(sortAssessmentGroupIds(graded,allIds,"topic-az")).toEqual(["a","c","d"]);
 });
 it("keeps unavailable grades at the end for both average directions",()=>{
  const incomplete=graded.map(q=>q.id==="c"?{...q,gradePerformance:{}}:q);
  expect(sortAssessmentGroupIds(incomplete,allIds,"average-highest").slice(-1)).toEqual(["c"]);
  expect(sortAssessmentGroupIds(incomplete,allIds,"average-lowest").slice(-1)).toEqual(["c"]);
 });
});
