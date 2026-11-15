import { describe, expect, it } from "vitest";
import { assessmentQuestionNumber, canReuseOriginalPrintedQuestion, formatAssessmentSource } from "./assessmentNumbering";
import { buildAssessmentGroups, moveAssessmentGroupIds, removeAssessmentGroupIds } from "./assessmentGroups";
import type { BankQuestion } from "./questionData";

const question=(id:string,overrides:Partial<BankQuestion>={}):BankQuestion=>({
 id,sourceId:`EDX-H-JUNE2023-2H-Q${id}`,questionNumber:`Q${id}`,examBoard:"Edexcel",
 paperCode:"2H",series:"June 2023",tier:"Higher",sourceTier:"Higher",topic:"Algebra",skill:"Equations",
 grade:6,marks:3,calculator:true,ao:"AO1",challenge:"Standard",prompt:"Solve 17x = 8. Use diagram A.",
 answer:"x = 8/17",tags:[],gradePerformance:{},questionUrl:`question-${id}`,markSchemeUrl:`mark-${id}`,
 imageCrops:{question:{top:0,right:0,bottom:0,left:0},mark:{top:0,right:0,bottom:0,left:0}},
 cropReview:{question:"approved",mark:"approved"},...overrides
});
const numbers=(all:BankQuestion[],ids:string[],sequential:boolean)=>
 buildAssessmentGroups(all,ids).map((group,index)=>assessmentQuestionNumber(group,index+1,sequential));

describe("assessment numbering shared by student, teacher and marking outputs",()=>{
 it("starts a single question at one",()=>{
  expect(numbers([question("17")],["17"],true)).toEqual(["1"]);
 });
 it("numbers different papers in the teacher's selection order",()=>{
  const all=[question("17"),question("8",{series:"November 2022",paperCode:"1F",tier:"Foundation"}),question("21",{series:"June 2024",paperCode:"3H"})];
  expect(numbers(all,["21","17","8"],true)).toEqual(["1","2","3"]);
  expect(numbers(all,["21","17","8"],false)).toEqual(["21","17","8"]);
 });
 it("keeps identical original numbers in separate papers distinct",()=>{
  const all=[question("first",{questionNumber:"Q17",sourceId:"EDX-H-JUNE2023-2H-Q17"}),
   question("second",{questionNumber:"Q17",sourceId:"EDX-H-JUNE2024-2H-Q17",series:"June 2024"})];
  expect(numbers(all,["first","second"],true)).toEqual(["1","2"]);
  expect(numbers(all,["first","second"],false)).toEqual(["17","17"]);
 });
 it("gives a whole multipart question its parent number and preserves question text",()=>{
  const partA=question("a",{questionNumber:"Q08a",sourceId:"EDX-H-JUNE2023-2H-Q08A"});
  const partB=question("b",{questionNumber:"Q08b",sourceId:"EDX-H-JUNE2023-2H-Q08B"});
  const group=buildAssessmentGroups([partB,partA],["b","a"])[0];
  expect(group.parts.map(part=>part.questionNumber)).toEqual(["Q08a","Q08b"]);
  expect(group.marks).toBe(6);
  expect(assessmentQuestionNumber(group,1,true)).toBe("1");
  expect(assessmentQuestionNumber(group,1,false)).toBe("8");
  expect(partA.prompt).toBe("Solve 17x = 8. Use diagram A.");
  expect(partA.answer).toBe("x = 8/17");
 });
 it("recalculates sequential numbers after reordering and removal",()=>{
  const all=[question("17"),question("8"),question("21")];
  const reordered=moveAssessmentGroupIds(all,["17","8","21"],2,0);
  expect(numbers(all,reordered,false)).toEqual(["21","17","8"]);
  expect(numbers(all,reordered,true)).toEqual(["1","2","3"]);
  const removed=removeAssessmentGroupIds(all,reordered,"17");
  expect(numbers(all,removed,false)).toEqual(["21","8"]);
  expect(numbers(all,removed,true)).toEqual(["1","2"]);
 });
 it("prefers the explicit question reference over a legacy source ID",()=>{
  const [group]=buildAssessmentGroups([question("17",{questionNumber:"Question 08(b)"})],["17"]);
  expect(assessmentQuestionNumber(group,1,false)).toBe("8");
 });
 it("supports archived source IDs when explicit numbering is missing",()=>{
  const [group]=buildAssessmentGroups([question("old",{questionNumber:undefined,sourceId:"2020_2H_Q10c"})],["old"]);
  expect(assessmentQuestionNumber(group,1,false)).toBe("10");
 });
 it("reads nested part references as the parent number without changing their labels",()=>{
  for(const questionNumber of ["Q07bi","Q07bii","Question 07(b)(ii)"]){
   const q=question("nested",{questionNumber,sourceId:undefined});
   const [group]=buildAssessmentGroups([q],[q.id]);
   expect(assessmentQuestionNumber(group,1,false)).toBe("7");
   expect(assessmentQuestionNumber(group,1,true)).toBe("1");
   expect(formatAssessmentSource(group)).toContain("Original Q7");
   expect(group.parts[0].questionNumber).toBe(questionNumber);
  }
 });
 it("recognises enhanced and archived nested part IDs for numbering and safe printed-number reuse",()=>{
  for(const sourceId of ["EDX-H-JUNE2023-2H-Q07BI","EDX-H-JUNE2023-2H-Q07BII","2020_2H_Q07bi","2020_2H_Q07bii"]){
   const q=question("nested",{questionNumber:undefined,sourceId});
   const [group]=buildAssessmentGroups([q],[q.id]);
   expect(assessmentQuestionNumber(group,1,false)).toBe("7");
   expect(formatAssessmentSource(group)).toContain("Original Q7");
   expect(canReuseOriginalPrintedQuestion(group,7)).toBe(true);
   expect(canReuseOriginalPrintedQuestion(group,1)).toBe(false);
  }
 });
 it("does not trust the printed-number shortcut when stored references disagree",()=>{
  const [group]=buildAssessmentGroups([question("1",{questionNumber:"Q17"})],["1"]);
  expect(assessmentQuestionNumber(group,1,false)).toBe("17");
  expect(canReuseOriginalPrintedQuestion(group,1)).toBe(false);
 });
 it("does not derive numbering from prompts, diagrams, unknown source IDs or zero",()=>{
  for(const sourceId of [undefined,"diagram-17","17x=8","EDX-H-JUNE2023-2H-Q00"]){
   const [group]=buildAssessmentGroups([question("missing",{questionNumber:undefined,sourceId})],["missing"]);
   expect(assessmentQuestionNumber(group,1,false)).toBe("Original unknown");
   expect(assessmentQuestionNumber(group,1,true)).toBe("1");
  }
 });
});

describe("teacher assessment source references",()=>{
 it("uses only the stored board, series, tier, paper and parent question",()=>{
  const [group]=buildAssessmentGroups([question("17")],["17"]);
  expect(formatAssessmentSource(group)).toBe("Edexcel | June 2023 | Higher | Paper 2 | Original Q17");
 });
 it("does not invent a board, series, paper or missing tier",()=>{
  const missing=question("missing",{sourceId:undefined,questionNumber:undefined,examBoard:undefined,
   series:"Unspecified",paperCode:undefined,sourceTier:undefined});
  const [group]=buildAssessmentGroups([missing],["missing"]);
  expect(formatAssessmentSource(group)).toBe("Source metadata unavailable");
 });
 it("can show partial metadata without guessing a board from the source ID",()=>{
  const [group]=buildAssessmentGroups([question("17",{examBoard:undefined,sourceTier:undefined,series:"Unspecified",paperCode:undefined})],["17"]);
  expect(formatAssessmentSource(group)).toBe("Original Q17");
 });
 it("keeps compatibility with older in-memory question objects lacking sourceTier",()=>{
  const legacy=question("17");
  delete legacy.sourceTier;
  const [group]=buildAssessmentGroups([legacy],["17"]);
  expect(formatAssessmentSource(group)).toContain("Higher");
 });
 it("identifies shadow sets using the explicit link to the original exam question",()=>{
  const original=question("17");
  const shadow=question("shadow",{questionNumber:"Q17",sourceId:"SHADOW-UNRELATED-Q99",examBoard:"Wrong shadow metadata",
   shadowOfQuestionId:original.id,shadowPaperId:"shadow-paper",shadowSet:"Set 1"});
  const all=[original,shadow];
  const [group]=buildAssessmentGroups(all,["shadow"]);
  expect(formatAssessmentSource(group,all)).toBe("Shadow Set 1 | Based on: Edexcel | June 2023 | Higher | Paper 2 | Original Q17");
  expect(assessmentQuestionNumber(group,2,true)).toBe("2");
  expect(assessmentQuestionNumber(group,2,false)).toBe("17");
  expect(canReuseOriginalPrintedQuestion(group,17)).toBe(false);
 });
 it("reports an unavailable shadow original without inferring it from a matching number",()=>{
  const shadow=question("shadow",{questionNumber:"Q17",shadowOfQuestionId:"missing-original",shadowPaperId:"shadow-paper",shadowSet:"Set 2"});
  const [group]=buildAssessmentGroups([question("17"),shadow],["shadow"]);
  expect(formatAssessmentSource(group,[question("17"),shadow])).toBe("Shadow Set 2 | Original source unavailable");
 });
 it("keeps original and shadow sources distinct in mixed assessments",()=>{
  const original=question("17");
  const shadow=question("shadow",{questionNumber:"Q17",shadowOfQuestionId:"17",shadowPaperId:"shadow-paper",shadowSet:"Set 1"});
  const all=[original,shadow];
  const grouped=buildAssessmentGroups(all,["shadow","17"]);
  expect(grouped.map((group,index)=>assessmentQuestionNumber(group,index+1,true))).toEqual(["1","2"]);
  expect(grouped.map(group=>formatAssessmentSource(group,all))).toEqual([
   "Shadow Set 1 | Based on: Edexcel | June 2023 | Higher | Paper 2 | Original Q17",
   "Edexcel | June 2023 | Higher | Paper 2 | Original Q17"
  ]);
 });
});
