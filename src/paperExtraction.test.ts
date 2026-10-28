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
 it("recovers missing Q5 from the printed total-for-question line on the page before Q6",()=>{
  const paper:TextLine[]=[
   {page:2,top:.46,left:.08,text:"4 Write down a factor of 60"},
   {page:2,top:.71,left:.12,text:"(Total for Question 4 is 1 mark)"},
   {page:3,top:.145,left:.51,text:"Simplify 3 × w × 5 × t"},
   {page:3,top:.33,left:.13,text:"(Total for Question 5 is 1 mark)"},
   {page:3,top:.42,left:.09,text:"6 Fay is planning a trip to a theme park"},
   {page:3,top:.91,left:.13,text:"(Total for Question 6 is 4 marks)"}
  ];
  const scheme:TextLine[]=[
   {page:6,top:.08,left:.06,text:"Question Answer Mark"},
   {page:6,top:.30,left:.09,text:"5 15wt B1"},
   {page:6,top:.47,left:.09,text:"6 108 B4"}
  ];
  const drafts=makeReviewDrafts([row("Q04",1),row("Q05",1),row("Q06",4)],paper,scheme);
  const q5=drafts.find(d=>d.number===5)!;
  expect(q5.questionDetected).toBe(false);
  expect(q5.questionInferred).toBe(true);
  expect(q5.question.page).toBe(3);
  expect(q5.question.top).toBeGreaterThanOrEqual(.035);
  expect(q5.question.bottom).toBeLessThan(.42);
  expect(q5.markDetected).toBe(true);
  expect(isReviewable(q5,24,20)).toBe(true);
 });
 it("never defaults to a cover page or permits approving an unlocated question",()=>{
  const paper:TextLine[]=[
   {page:2,top:.18,left:.08,text:"4 Write a fraction"},
   {page:3,top:.41,left:.08,text:"6 Find the amount"}
  ];
  const scheme:TextLine[]=[
   {page:6,top:.08,left:.08,text:"Question Answer Mark"},
   {page:6,top:.19,left:.08,text:"4 one B1"},
   {page:6,top:.32,left:.08,text:"5 two B1"},
   {page:6,top:.50,left:.08,text:"6 three B1"}
  ];
  const q5=makeReviewDrafts([row("Q04",1),row("Q05",1),row("Q06",1)],paper,scheme)[1];
  expect(q5.question.page).toBe(3);
  expect(q5.questionInferred).toBe(false);
  expect(isReviewable(q5,24,20)).toBe(false);
  expect(isReviewable({...q5,questionManuallyAdjusted:true},24,20)).toBe(true);
 });
 it("ignores footer numbers and requires complete valid crops before approval",()=>{
  const lines:TextLine[]=[{page:1,top:.99,left:.02,text:"7"},{page:2,top:.1,left:.1,text:"7 Test"}];
  expect(findQuestionAnchors(lines,[7]).get(7)?.page).toBe(2);
  const d=makeReviewDrafts([row("Q07",2)],lines,[])[0];
  expect(d.markDetected).toBe(false);
  expect(isReviewable(d,10,10)).toBe(false);
  expect(isReviewable({...d,markManuallyAdjusted:true},10,10)).toBe(true);
  expect(isReviewable({...d,question:{page:30,top:0,bottom:1}},10,10)).toBe(false);
 });
});

describe('multi-page question preservation',()=>{
 it('keeps every page through the printed total and next question boundary',()=>{
  const lines:TextLine[]=[{page:2,top:.12,left:.1,text:'1 Solve the problem'},{page:3,top:.7,left:.2,text:'(Total for Question 1 is 5 marks)'},{page:4,top:.12,left:.1,text:'2 Next question'}];
  const [draft]=makeReviewDrafts([row('Q01a',2),row('Q01b',3),row('Q02',1)],lines,[]);
  expect(draft.question).toEqual({page:2,endPage:3,top:.102,bottom:.735});
  expect(draft.parts).toHaveLength(2);
  expect(draft.approved).toBe(false);
 });
 it('rejects fractional pages, reversed page ranges and invalid crop coordinates',()=>{
  const d=makeReviewDrafts([row('Q01',2)],[{page:2,top:.1,left:.1,text:'1 Question'}],[])[0];
  for(const question of [{page:1.5,top:0,bottom:1},{page:2,endPage:1,top:0,bottom:1},{page:2,endPage:11,top:0,bottom:1},{page:2,top:NaN,bottom:1}])expect(isReviewable({...d,question,markManuallyAdjusted:true},10,10)).toBe(false);
 });
});


describe('real Pearson layout regressions',()=>{
 it('finds questions printed near the top edge and rejects footer page numbers',()=>{
  const lines:TextLine[]=[{page:14,top:.0503,left:.119,text:'18 The scatter graph shows information'},{page:14,top:.9264,left:.04,text:'14'},{page:15,top:.8,left:.15,text:'(Total for Question 18 is 4 marks)'},{page:16,top:.0503,left:.119,text:'19 Calculate the value'}];
  const draft=makeReviewDrafts([row('Q18a',2),row('Q18b',2),row('Q19',3)],lines,[])[0];
  expect(draft.question).toMatchObject({page:14,endPage:15});
  expect(draft.question.top).toBeLessThan(.0503);expect(draft.questionDetected).toBe(true);
  expect(findQuestionAnchors(lines,[14]).has(14)).toBe(false);
 });
 it('rejects an apparent question anchor after its printed total',()=>{
  const lines:TextLine[]=[{page:6,top:.8,left:.2,text:'(Total for Question 10 is 4 marks)'},{page:10,top:.926,left:.04,text:'10'}];
  expect(findQuestionAnchors(lines,[10]).size).toBe(0);
 });
});
