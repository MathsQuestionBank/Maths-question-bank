import {describe,it,expect} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import TeacherGradePerformance from "./TeacherGradePerformance";
const parts=[
 {marks:2,gradePerformance:{9:80},questionNumber:"Q21a",sourceId:"2022_2H_Q21a"},
 {marks:3,gradePerformance:{9:60},questionNumber:"Q21b",sourceId:"2022_2H_Q21b"}
];
describe("Teacher grade performance display",()=>{
 it("shows both parts and the weighted combined percentage",()=>{
  const html=renderToStaticMarkup(createElement(TeacherGradePerformance,{parts,tier:"Higher",selectedGrade:"9"}));
  expect(html).toContain("Q21a: 80%");
  expect(html).toContain("Q21b: 60%");
  expect(html).toContain("Combined: ");
  expect(html).toContain("68%");
 });
 it("shows available part data even when the combined percentage cannot be calculated",()=>{
  const incomplete=[parts[0],{...parts[1],gradePerformance:{9:null}}];
  const html=renderToStaticMarkup(createElement(TeacherGradePerformance,{parts:incomplete,tier:"Higher",selectedGrade:"9"}));
  expect(html).toContain("Q21a: 80%");
  expect(html).toContain("Q21b: No data");
  expect(html).toContain("Combined: ");
  expect(html).toContain("No data");
  expect(html).not.toContain("Combined: </span>68%");
 });
 it("shows all relevant grades when requested",()=>{
  const html=renderToStaticMarkup(createElement(TeacherGradePerformance,{parts,tier:"Higher",selectedGrade:"All grades"}));
  expect(html).toContain("Grade 4");
  expect(html).toContain("Grade 9");
  expect(html).not.toContain("Grade 1");
 });
});
