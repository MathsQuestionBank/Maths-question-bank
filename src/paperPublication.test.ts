import {describe,it,expect} from "vitest";
import {preparePublication,exportMappedParts} from "./paperPublication";
import type {QuestionDraft} from "./paperExtraction";
import type {MappingRow} from "./EnhancedMappingImporter";
const part=(i:number,marks:number):MappingRow=>({
 id:"EDX-F-NOVEMBER2022-1F-Q"+String(i).padStart(2,"0"),board:"Edexcel",
 tier:"Foundation",series:"November 2022",paper:"1F",
 question:"Q"+String(i).padStart(2,"0"),topic:"Algebra",strands:"Algebra; Ratio",
 skills:"Solving equations",review:"Mapped",excelRow:i+1,
 marks,ao:"AO1",spec:"A1",gradePercent:{1:42,2:63,3:78,4:87,5:94}
});
const reviewed=(number:number,marks:number):QuestionDraft=>({
 number,parts:[part(number,marks)],
 approved:true,questionDetected:true,questionInferred:false,markDetected:true,notes:"",
 question:{page:2,top:.15,bottom:.5},mark:{page:6,top:.2,bottom:.45}
});
describe("publish a completed Edexcel Foundation paper",()=>{
 const full=()=>Array.from({length:26},(_,i)=>reviewed(i+1,i<2?3: i<24?3:4));
 // 2*3 + 22*3 + 2*4 = 80
 it("accepts 26 complete questions and 80 verified marks",()=>{
  expect(preparePublication(full())).toEqual({questions:26,parts:26,marks:80});
 });
 it("refuses unapproved parts, duplicate identifiers, and incomplete totals",()=>{
  const items=full();
  items[3].approved=false;
  expect(()=>preparePublication(items)).toThrow(/Approve every question/);
  items[3].approved=true;items[1].parts[0].id=items[0].parts[0].id;
  expect(()=>preparePublication(items)).toThrow(/Repeated mapping identifier/);
  items[1].parts[0].id="different";
  items[2].parts[0].marks=1;
  expect(()=>preparePublication(items)).toThrow(/80 marks/);
 });
 it("preserves multi-topic tags and grade 1–5 data for each part",()=>{
  expect(exportMappedParts(reviewed(5,1))[0]).toMatchObject({
   question:"Q05",marks:1,tags:["Algebra","Ratio"],skill:"Solving equations",
   grade_percent:{"1":42,"2":63,"3":78,"4":87,"5":94}
  });
 });
});
