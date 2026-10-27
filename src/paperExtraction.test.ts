import {describe,it,expect} from "vitest";
import {makeReviewDrafts,isReviewable,findQuestionAnchors,totalMarks,type TextLine} from "./paperExtraction";
import type {MappingRow} from "./EnhancedMappingImporter";
const row=(code:string,marks:number):MappingRow=>({id:"EDX-F-NOVEMBER2022-1F-"+code.toUpperCase(),board:"Edexcel",tier:"Foundation",series:"November 2022",paper:"1F",question:code,topic:"Number",strands:"Number; Ratio",skills:"Ratio and algebra",review:"Mapped",excelRow:2,marks,ao:"AO2",spec:"R1",gradePercent:{1:24,2:43,3:60,4:77,5:88}});
describe("staged question extraction proposals",()=>{
 it("groups multipart mappings and preserves marks",()=>{
  const lines:TextLine[]=[{page:3,top:.12,left:.1,text:"7 Use this information"},{page:4,top:.18,left:.08,text:"8 Work out the answer"}];
  const drafts=makeReviewDrafts([row("Q07a",1),row("Q07bi",1),row("Q07bii",2),row("Q08",3)],lines,lines);
  expect(drafts.map(x=>x.number)).toEqual([7,8]);
  expect(drafts[0].parts).toHaveLength(3);
  expect(totalMarks(drafts)).toBe(7);
  expect(drafts[0].question.page).toBe(3);
  expect(drafts[0].questionDetected).toBe(true);
  expect(drafts[0].approved).toBe(false);
 });
 it("ignores footer numbers and requires complete valid crops before approval",()=>{
  const lines:TextLine[]=[{page:1,top:.99,left:.02,text:"7"},{page:2,top:.1,left:.1,text:"7 Test"}];
  expect(findQuestionAnchors(lines,[7]).get(7)?.page).toBe(2);
  const d=makeReviewDrafts([row("Q07",2)],lines,[])[0];
  expect(d.markDetected).toBe(false);
  expect(isReviewable(d,10,10)).toBe(true);
  expect(isReviewable({...d,question:{page:30,top:0,bottom:1}},10,10)).toBe(false);
 });
});
