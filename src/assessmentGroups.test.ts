import { describe, expect, it } from "vitest";
import { buildAssessmentGroups, calculateAssessmentMarks, checkAssessmentExport, getAssessmentGroupKey, moveAssessmentGroupIds, removeAssessmentGroupIds } from "./assessmentGroups";
import type { BankQuestion } from "./questionData";

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
