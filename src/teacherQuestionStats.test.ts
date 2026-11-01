import {describe,it,expect} from "vitest";
import {paperNumberFromCode,compareOriginalQuestionNumber,weightedGradePerformance} from "./teacherQuestionStats";
const q=(questionNumber:string,id=questionNumber)=>({id,questionNumber,sourceId:`2022_2H_${questionNumber}`,series:"November 2022",paperCode:"2H"});
describe("paper filter and original question ordering",()=>{
 it("recognises paper 1, 2, 3 across tiers",()=>{
  expect(paperNumberFromCode("1F")).toBe(1);
  expect(paperNumberFromCode("2H")).toBe(2);
  expect(paperNumberFromCode("3F")).toBe(3);
  expect(paperNumberFromCode("Unknown")).toBe(null);
 });
 it("sorts question numbers numerically and lettered subparts correctly",()=>{
  const items=[q("Q10"),q("Q21b"),q("Q02"),q("Q21a"),q("Q05")];
  expect(items.sort((a,b)=>compareOriginalQuestionNumber(a,b)).map(x=>x.questionNumber)).toEqual(["Q02","Q05","Q10","Q21a","Q21b"]);
  expect(items.sort((a,b)=>compareOriginalQuestionNumber(a,b,true)).map(x=>x.questionNumber)).toEqual(["Q21b","Q21a","Q10","Q05","Q02"]);
 });
 it("keeps unknown question numbers at the end",()=>{
  const unknown={id:"unknown",sourceId:undefined,questionNumber:undefined,series:"June 2022",paperCode:"1F"};
  expect(compareOriginalQuestionNumber(unknown,q("Q03"))).toBeGreaterThan(0);
  expect(compareOriginalQuestionNumber(unknown,q("Q03"),true)).toBeGreaterThan(0);
 });
});
describe("historic grade performance",()=>{
 it("weights complete multipart data by available marks",()=>{
  expect(weightedGradePerformance([{marks:2,gradePerformance:{9:80}},{marks:3,gradePerformance:{9:60}}],9)).toBe(68);
 });
 it("does not imply a complete-question mean when data is missing",()=>{
  expect(weightedGradePerformance([{marks:2,gradePerformance:{9:80}},{marks:3,gradePerformance:{9:null}}],9)).toBeNull();
  expect(weightedGradePerformance([{marks:2,gradePerformance:{9:null}}],9)).toBeNull();
 });
 it("retains real zero percentages",()=>{
  expect(weightedGradePerformance([{marks:2,gradePerformance:{9:0}}],9)).toBe(0);
 });
});
