import {describe,it,expect} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import type {BankQuestion} from "./questionData";
import {buildAssessmentGroups} from "./assessmentGroups";
import ShadowSuggestionSummary from "./ShadowSuggestionSummary";
const part=(id:string,marks:number,performance:number|null,extra:Partial<BankQuestion>={}):BankQuestion=>({id,sourceId:`2023_3H_Q14${id}`,marks,grade:6,gradePerformance:{6:performance},ao:"AO1",topic:"Algebra",skill:"Expanding double brackets",tier:"Higher",calculator:true,series:"June 2023",challenge:"Standard",tags:[],prompt:"",answer:"",imageCrops:{question:{top:0,bottom:0,left:0,right:0},mark:{top:0,bottom:0,left:0,right:0}},cropReview:{question:"approved",mark:"approved"},...extra});
const group=(parts:BankQuestion[])=>buildAssessmentGroups(parts,[parts[0].id])[0];
const render=(a:BankQuestion[],b:BankQuestion[],targetStudentGrade:number|null=6)=>renderToStaticMarkup(createElement(ShadowSuggestionSummary,{original:group(a),replacement:group(b),targetStudentGrade}));
const original=[part("a",2,80),part("b",3,84.5)];
describe("replacement metadata comparison",()=>{
 it("compares real mark-weighted multipart performance in the same final-grade cohort",()=>{
  const html=render(original,[part("a",2,90),part("b",3,87.5)]);
  expect(html).toContain("82.7%");expect(html).toContain("88.5%");expect(html).toContain("+5.8");expect(html).toContain("percentage points");
  expect(html).toContain("final GCSE grade 6");expect(html).toContain("not proof that a question is easier or harder");
 });
 it("preserves genuine zero performance instead of displaying missing data",()=>{
  const html=render([part("a",2,0)],[part("a",2,0)]);
  expect(html.match(/0%/g)).toHaveLength(2);expect(html).not.toContain("No data");
 });
 it("does not invent a combined percentage when any multipart history is missing",()=>{
  const html=render(original,[part("a",2,90),part("b",3,null)]);
  expect(html).toContain("82.7%");expect(html).toContain("No data");expect(html).toContain("No complete comparison available");
  expect(html).not.toContain("90%");expect(html).not.toContain("percentage points");
 });
 it("does not select a comparison cohort using a guessed original grade",()=>{
  const html=render([part("a",2,80,{grade:0})],[part("a",2,90)],null);
  expect(html).toContain("Choose a target student grade");expect(html.match(/No data/g)).toHaveLength(2);expect(html).not.toContain("80%");expect(html).not.toContain("90%");
 });
 it("highlights marks, AO and mapped-part differences with original values",()=>{
  const html=render(original,[part("a",3,88.5,{grade:7,ao:"AO2"})]);
  expect(html.match(/class="targeted-fact-difference"/g)).toHaveLength(3);
  for(const text of ["Original: 5","Original: AO1","Original: 2"])expect(html).toContain(text);
  expect(html).not.toMatch(/easier than|equivalent question|confidence/i);
 });
 it("shows unknown AO explicitly and uses the explicitly chosen student cohort despite mixed legacy grade defaults",()=>{
  const a=[part("a",2,80,{gradePerformance:{7:60}}),part("b",3,84.5,{grade:7,gradePerformance:{7:70}})];
  const html=render(a,[part("a",5,90,{ao:"Unmapped",gradePerformance:{7:75}})],7);
  expect(html).toContain("Unavailable");expect(html).toContain("final GCSE grade 7");expect(html).toContain("66%");expect(html).toContain("75%");
 });
});
