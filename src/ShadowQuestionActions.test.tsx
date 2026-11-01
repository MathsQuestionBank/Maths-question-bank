import {describe,it,expect} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ShadowQuestionActions from "./ShadowQuestionActions";
import type {BankQuestion} from "./questionData";
const base=(id:string):BankQuestion=>({id,sourceId:"2022_2H_Q05",questionNumber:"Q05",tier:"Higher",series:"June 2022",paperCode:"2H",topic:"Algebra",skill:"",grade:7,marks:2,calculator:true,ao:"AO1",challenge:"Standard",prompt:"",answer:"",tags:[],gradePerformance:{},imageCrops:{question:{top:0,right:0,left:0,bottom:0},mark:{top:0,right:0,left:0,bottom:0}},cropReview:{question:"approved",mark:"approved"},questionPath:"q.png",markSchemePath:"m.png"});
describe("shadow question actions",()=>{
 it("only displays when a verified shadow exists",()=>{
  const original=base("original");
  const shadow={...base("shadow"),sourceId:"SHADOW-Q05",shadowPaperId:"s1",shadowOfQuestionId:"original",shadowSet:"Set 1",shadowStatus:"reviewed"};
  const html=renderToStaticMarkup(createElement(ShadowQuestionActions,{original,questions:[original,shadow],onPreview:()=>{},onAdd:()=>{}}));
  expect(html).toContain("View shadow Set 1");
  expect(html).toContain("Add shadow");
 });
 it("does not show pre-review shadow images to teachers",()=>{
  const original=base("o");
  const shadow={...base("s"),shadowPaperId:"s1",shadowOfQuestionId:"o",shadowSet:"Set 1",shadowStatus:"awaiting-review"};
  const html=renderToStaticMarkup(createElement(ShadowQuestionActions,{original,questions:[original,shadow],onPreview:()=>{},onAdd:()=>{}}));
  expect(html).toBe("");
 });
});
