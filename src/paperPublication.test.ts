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

describe('publication integrity regressions',()=>{
 const full=()=>Array.from({length:26},(_,i)=>reviewed(i+1,i<24?3:4));
 it('preserves the 26 complete questions / 44 mapped parts / 80 marks structure',()=>{
  const drafts=full();
  for(let i=0;i<18;i++){
   const original=drafts[i].parts[0];
   drafts[i].parts=[{...original,id:original.id+'a',question:original.question+'a',marks:1},{...original,id:original.id+'b',question:original.question+'b',marks:2}];
  }
  expect(preparePublication(drafts)).toEqual({questions:26,parts:44,marks:80});
 });
 it('rejects mismatched and repeated part references before upload',()=>{
  const drafts=full();drafts[1].parts[0].question='Q01';
  expect(()=>preparePublication(drafts)).toThrow(/Mismatched/);
 });
 it('preserves all available grade percentages and original mapping provenance',()=>{
  const draft=reviewed(1,2);Object.assign(draft.parts[0],{originalSkill:'Pearson skill',mappingBasis:'Teacher suggestion',gradePercent:{4:12,5:34,6:56,7:78,8:90,9:99}});
  expect(exportMappedParts(draft)[0]).toMatchObject({original_skill:'Pearson skill',mapping_basis:'Teacher suggestion',grade_percent:{'1':null,'6':56,'9':99}});
 });
 it('rejects invalid crops, missing complete question numbers and fabricated percentages',()=>{
  const drafts=full();drafts[0].question.page=0;
  expect(()=>preparePublication(drafts)).toThrow(/Invalid crop/);
  drafts[0].question.page=2;drafts[0].parts[0].gradePercent[1]=101;
  expect(()=>preparePublication(drafts)).toThrow(/grade percentage/);
  drafts[0].parts[0].gradePercent[1]=20;drafts.shift();
  expect(()=>preparePublication(drafts)).toThrow(/numbering/);
 });
});
