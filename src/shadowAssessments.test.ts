import {describe,it,expect} from "vitest";
import {convertToShadowAssessment,shadowIsReady} from "./shadowAssessments";
import type {BankQuestion} from "./questionData";
const q=(id:string,sourceId:string,opts:Partial<BankQuestion>={}):BankQuestion=>({
 id,sourceId,questionNumber:sourceId.split("_").pop(),topic:"Algebra",skill:"Solving",tier:"Higher",
 paperCode:"2H",grade:7,marks:2,calculator:true,series:"June 2022",ao:"AO1",
 challenge:"Standard",prompt:"",answer:"",tags:[],gradePerformance:{},imageCrops:{question:{top:0,bottom:100,left:0,right:100},mark:{top:0,bottom:100,left:0,right:100}},
 cropReview:{question:"approved",mark:"approved"},questionPath:"q.png",markSchemePath:"m.png",...opts
});
describe("shadow assessment conversion",()=>{
 const originalA=q("a","2022_2H_Q21a");
 const originalB=q("b","2022_2H_Q21b");
 const next=q("c","2022_2H_Q13");
 const shadowA=q("sa","SHADOW_A",{shadowPaperId:"set-1",shadowOfQuestionId:"a",shadowSet:"Set 1",shadowStatus:"reviewed"});
 const shadowB=q("sb","SHADOW_B",{shadowPaperId:"set-1",shadowOfQuestionId:"b",shadowSet:"Set 1",shadowStatus:"reviewed"});
 it("replaces a whole multipart question and keeps missing originals",()=>{
  const x=convertToShadowAssessment([originalA,originalB,next,shadowA,shadowB],["a","c"],"Set 1");
  expect(x).toMatchObject({ids:["sa","c"],replaced:1,total:2});
  expect(x.missing).toHaveLength(1);
 });
 it("never substitutes a partial multipart shadow",()=>{
  const x=convertToShadowAssessment([originalA,originalB,shadowA],["a"],"Set 1");
  expect(x.ids).toEqual(["a"]);
  expect(x.replaced).toBe(0);
 });
 it("rejects unreviewed images",()=>{
  expect(shadowIsReady(q("s","SHADOW",{shadowPaperId:"set",shadowOfQuestionId:"a",shadowSet:"Set 1",shadowStatus:"awaiting-review"}))).toBe(false);
  expect(shadowIsReady(shadowA)).toBe(true);
 });
});
