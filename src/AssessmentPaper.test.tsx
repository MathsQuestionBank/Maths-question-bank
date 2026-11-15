import { describe, expect, it, vi } from "vitest";
// Rendering and cover geometry never need a live database client.
vi.mock("./supabase",()=>({supabase:{}}));
import { renderToStaticMarkup } from "react-dom/server";
import AssessmentPaper from "./AssessmentPaper";
import { buildAssessmentGroups } from "./assessmentGroups";
import type { BankQuestion } from "./questionData";

const part=(id:string,suffix:string,marks:number):BankQuestion=>({
 id,sourceId:`2023_1H_Q17${suffix}`,questionNumber:`Q17${suffix}`,marks,originalContent:true,
 topic:"Algebra",skill:"Equations",tier:"Higher",grade:6,calculator:false,series:"June 2023",ao:"AO1",challenge:"Standard",tags:[],gradePerformance:{},
 prompt:`(${suffix}) Solve x² + ${marks} = 7.`,answer:`(${suffix}) Award ${marks} marks for x² = ${7-marks}.`,
 imageCrops:{question:{top:0,right:0,bottom:0,left:0},mark:{top:0,right:0,bottom:0,left:0}},cropReview:{question:"approved",mark:"approved"}
});
describe("multipart text assessment exports",()=>{
 it("keeps every original text part and its marking guidance once under the matching parent number",()=>{
  const questions=[part("a","a",2),part("b","b",3)];
  const groups=buildAssessmentGroups(questions,["b","a"]);
  const html=renderToStaticMarkup(<AssessmentPaper groups={groups} allQuestions={questions} mode="both" sequential cover={false} title="Algebra assessment" minutes={20} total={5} tier="Higher" calculator="Any" includeName={false} includeClass={false} replaceSourceTotals masks={{}} onReview={()=>{}} onRemove={()=>{}} teacherSourceMode="inline" performanceGrade="All grades" printTeacherStats={false}/>);
  for(const question of questions){
   expect(html.split(question.prompt)).toHaveLength(2);
   expect(html.split(question.answer)).toHaveLength(2);
  }
  expect(html.match(/class="assessment-question-number">Question 1</g)).toHaveLength(2);
  expect(html).not.toContain("Question 17");
  expect(html.indexOf(questions[0].prompt)).toBeLessThan(html.indexOf(questions[1].prompt));
 });
});
