import {describe,it,expect} from "vitest";
import {makeReviewDrafts,isReviewable,findQuestionAnchors,findMarkSchemeStartPage,totalMarks,type TextLine} from "./paperExtraction";
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
 it("skips Pearson's numbered examiner guidance and starts marking at the actual table",()=>{
  const paper:TextLine[]=[{page:2,top:.12,left:.09,text:"1 Write 0.3 as a fraction."},{page:2,top:.35,left:.09,text:"2 Work out 3 squared."}];
  const scheme:TextLine[]=[
   {page:3,top:.15,left:.08,text:"1 All candidates must receive the same treatment."},
   {page:3,top:.42,left:.09,text:"2 All the marks on the mark scheme are designed to be awarded"},
   {page:4,top:.20,left:.08,text:"8 Probability"},
   {page:5,top:.18,left:.07,text:"M method mark"},
   {page:6,top:.08,left:.08,text:"Paper: 1MA1/1F"},
   {page:6,top:.13,left:.07,text:"Question Answer Mark Mark scheme Additional guidance"},
   {page:6,top:.17,left:.09,text:"1 3/10 B1 for 3/10"},
   {page:6,top:.33,left:.09,text:"2 9 B1 cao"}
  ];
  expect(findMarkSchemeStartPage(scheme)).toBe(6);
  const draft=makeReviewDrafts([row("Q01",1),row("Q02",1)],paper,scheme);
  expect(draft[0].mark.page).toBe(6);
  expect(draft[0].mark.top).toBeCloseTo(.152);
  expect(draft[0].mark.bottom).toBeCloseTo(.308);
  expect(draft[0].markDetected).toBe(true);
  expect(draft[1].mark.page).toBe(6);
  expect(makeReviewDrafts([row("Q01",1)],paper,scheme,6)[0].mark.page).toBe(6);
 });
 it("fails closed on schemes without a mark-table header",()=>{
  const guidance:TextLine[]=[{page:3,top:.16,left:.1,text:"1 All candidates must receive equal treatment."}];
  expect(findMarkSchemeStartPage(guidance)).toBeNull();
  const d=makeReviewDrafts([row("Q01",1)],[],guidance)[0];
  expect(d.markDetected).toBe(false);
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
