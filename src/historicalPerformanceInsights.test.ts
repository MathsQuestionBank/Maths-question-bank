import {describe,it,expect} from "vitest";
import {buildInsightsModel,gradeCoverage} from "./questionBankInsights";
import {historicalGradeComparison} from "./historicalPerformanceInsights";
import type {BankQuestion} from "./questionData";
const q=(id:string,tier:"Foundation"|"Higher",profile:Record<number,number|null>,extra:Partial<BankQuestion>={}):BankQuestion=>({id,sourceId:`2022_${tier==='Foundation'?'1F':'1H'}_Q${id}`,paperId:tier,questionNumber:id,examBoard:"Edexcel",paperCode:tier==='Foundation'?'1F':'1H',topic:"Algebra",skill:"Fixture skill",tier,sourceTier:tier,calculator:false,sourceCalculator:false,grade:tier==='Foundation'?3:7,marks:2,series:"June 2022",ao:"AO1",challenge:"Standard",prompt:"",answer:"",tags:[],gradePerformance:profile,questionPath:`${id}/q.png`,markSchemePath:`${id}/m.png`,imageCrops:{question:{top:0,bottom:0,left:0,right:0},mark:{top:0,bottom:0,left:0,right:0}},cropReview:{question:"approved",mark:"approved"},...extra});
const f={1:20,2:38,3:56,4:72,5:85},h={3:8,4:17,5:35,6:52,7:68,8:82,9:93};
describe("historical available-mark-share comparisons",()=>{
 it("preserves the exact original available-question calculation for every tier and grade",()=>{
  const model=buildInsightsModel([q('1','Foundation',f),q('2','Higher',h),q('3','Higher',{...h,3:null})]);
  for(const tier of ['All','Foundation','Higher'])expect(historicalGradeComparison(model,{tier,sameQuestions:false}).rows.map(({grade,withData,missingData,medianPercent})=>({grade,withData,missingData,medianPercent}))).toEqual(gradeCoverage(model,tier));
 });
 it("reproduces an All-tier decrease caused by changing question populations without correcting the data",()=>{
  const model=buildInsightsModel([q('1','Foundation',f),q('2','Foundation',f),q('3','Foundation',f),q('4','Higher',h)]),result=historicalGradeComparison(model,{tier:'All',sameQuestions:false});
  expect(result.rows.find(p=>p.grade===5)).toMatchObject({withData:4,medianPercent:85});expect(result.rows.find(p=>p.grade===6)).toMatchObject({withData:1,medianPercent:52});
 });
 it("uses actual tier metadata and derives reported grades from data, including Higher Grade 3",()=>{
  const model=buildInsightsModel([q('1','Foundation',f),q('2','Higher',h),q('3','Higher',h,{sourceTier:undefined})]);
  const foundation=historicalGradeComparison(model,{tier:'Foundation',sameQuestions:true}),higher=historicalGradeComparison(model,{tier:'Higher',sameQuestions:true});
  expect(foundation.availableGrades).toEqual([1,2,3,4,5]);expect(higher.availableGrades).toEqual([3,4,5,6,7,8,9]);expect(higher.baseCount).toBe(1);expect(foundation.baseCount).toBe(1);expect(historicalGradeComparison(model,{tier:'Unknown',sameQuestions:false}).baseCount).toBe(1);
 });
 it("supports additional actually reported grades instead of hard-coding ranges by tier",()=>{
  const model=buildInsightsModel([q('1','Foundation',{...f,6:60}),q('2','Higher',{...h,2:5})]);expect(historicalGradeComparison(model,{tier:'Foundation',sameQuestions:true}).grades).toEqual([1,2,3,4,5,6]);expect(historicalGradeComparison(model,{tier:'Higher',sameQuestions:true}).grades).toEqual([2,3,4,5,6,7,8,9]);
 });
 it("requires exactly the same whole-question IDs at every selected grade",()=>{
  const model=buildInsightsModel([q('1','Foundation',f),q('2','Higher',h),q('3','Higher',{...h,3:null})]);
  const result=historicalGradeComparison(model,{tier:'All',sameQuestions:true,grades:[3,4,5]});expect(result.commonKeys).toHaveLength(2);for(const point of result.rows){expect(point.populationKeys).toBe(result.commonKeys);expect(point.withData).toBe(2);expect(point.missingData).toBe(1)}expect(result.rows.find(p=>p.grade===4)).toMatchObject({missingAtGrade:0,availableAtGrade:3});
 });
 it("excludes Higher records missing Grade 3 from a 3–9 comparison, but not from 4–9",()=>{
  const model=buildInsightsModel([q('1','Higher',h),q('2','Higher',{...h,3:null})]);expect(historicalGradeComparison(model,{tier:'Higher',sameQuestions:true}).commonKeys).toHaveLength(1);expect(historicalGradeComparison(model,{tier:'Higher',sameQuestions:true,grades:[4,5,6,7,8,9]}).commonKeys).toHaveLength(2);
 });
 it("warns on an empty cross-tier intersection and offers a data-derived shared range",()=>{
  const model=buildInsightsModel([q('1','Foundation',f),q('2','Higher',h)]),result=historicalGradeComparison(model,{tier:'All',sameQuestions:true});expect(result.commonKeys).toEqual([]);expect(result.warning).toContain('No whole questions');expect(result.rows.every(r=>r.medianPercent===null)).toBe(true);expect(result.sharedTierGrades).toEqual([3,4,5]);
 });
 it("handles empty/invalid/duplicate comparison grades without vacuous inclusion or fabricated values",()=>{
  const model=buildInsightsModel([q('1','Foundation',f)]);expect(historicalGradeComparison(model,{tier:'All',sameQuestions:true,grades:[]}).commonKeys).toEqual([]);expect(historicalGradeComparison(model,{tier:'All',sameQuestions:true,grades:[]}).warning).toContain('Select');expect(historicalGradeComparison(model,{tier:'All',sameQuestions:true,grades:[4,4,10,NaN]}).grades).toEqual([4]);expect(historicalGradeComparison(model,{tier:'All',sameQuestions:true,grades:[9]}).rows[0].medianPercent).toBeNull();
 });
 it("mark-weights every multipart member, counts its whole question once, and retains true decreases",()=>{
  const all=[q('2a','Foundation',{4:50,5:100},{marks:2}),q('2b','Foundation',{4:100,5:0},{marks:3})],before=JSON.stringify(all),result=historicalGradeComparison(buildInsightsModel(all),{tier:'Foundation',sameQuestions:true,grades:[4,5]});
  expect(result.baseCount).toBe(1);expect(result.rows.map(r=>[r.withData,r.medianPercent])).toEqual([[1,80],[1,40]]);expect(result.warning).toContain('Only 1');expect(JSON.stringify(all)).toBe(before);
 });
 it.each([null,undefined,-1,101,NaN,Infinity])("excludes a whole question with an invalid or missing part value %s",value=>{
  const profile={4:value} as Record<number,number|null>;const model=buildInsightsModel([q('2a','Foundation',{4:50}),q('2b','Foundation',profile)]);expect(historicalGradeComparison(model,{tier:'Foundation',sameQuestions:true,grades:[4]}).commonKeys).toEqual([]);
 });
 it("keeps valid zero values, computes even medians accurately and warns without claiming confidence",()=>{
  const result=historicalGradeComparison(buildInsightsModel([q('1','Foundation',{4:0}),q('2','Foundation',{4:21})]),{tier:'Foundation',sameQuestions:true,grades:[4]});expect(result.rows[0]).toMatchObject({withData:2,medianPercent:10.5});expect(result.warning).toContain('not a statistical confidence');
 });
 it("distinguishes unusable assets/marks from missing performance in the scoped denominator",()=>{
  const result=historicalGradeComparison(buildInsightsModel([q('1','Foundation',f),q('2','Foundation',f,{marks:0}),q('3','Foundation',f,{markSchemePath:undefined})]),{tier:'Foundation',sameQuestions:false});expect(result.baseCount).toBe(1);
 });
});
