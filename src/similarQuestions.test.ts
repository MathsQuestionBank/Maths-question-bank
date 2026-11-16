import {describe,it,expect} from "vitest";
import type {BankQuestion} from "./questionData";
import {createSmartShadowMatcher} from "./smartShadowMatching";
import {appendAssessmentGroupIds,buildAssessmentGroups,assessmentGroupImages} from "./assessmentGroups";

const q=(id:string,extra:Partial<BankQuestion>={}):BankQuestion=>({id,sourceId:`2023_3H_Q${id}`,questionNumber:id,topic:"Algebra",skill:"Solving simultaneous equations",examBoard:"Edexcel",series:"June 2023",paperCode:"3H",tier:"Higher",sourceTier:"Higher",calculator:true,sourceCalculator:true,grade:7,marks:4,ao:"AO1",challenge:"Standard",prompt:"",answer:"",tags:[],gradePerformance:{4:30,6:70,7:85},questionPath:`${id}/q.png`,markSchemePath:`${id}/m.png`,questionUrl:`https://private-fixture/${id}/q.png`,markSchemeUrl:`https://private-fixture/${id}/m.png`,imageCrops:{question:{top:0,bottom:0,left:0,right:0},mark:{top:0,bottom:0,left:0,right:0}},cropReview:{question:"approved",mark:"approved"},...extra});
const browse=(all:BankQuestion[],id="1")=>createSmartShadowMatcher(all,[id]);

describe("standalone similar-question browsing",()=>{
 it("works with an empty basket and retains exact skill-first ordering, not topic-only matches",()=>{
  const m=browse([q("1"),q("2",{skill:"Solving simultaneous equations; Expanding brackets"}),q("3"),q("4",{skill:"Algebra"}),q("5",{skill:"Expanding brackets"})]);
  expect(m.browse("1","same",6).suggestions.map(s=>s.group.key)).toEqual(["3","2"]);
 });
 it.each(["same","easier","harder"] as const)("matches existing Smart Shadow recommendations exactly for %s at explicit student grades",practice=>{
  const all=[q("1"),q("2"),q("3",{gradePerformance:{4:40,6:80,7:95}}),q("4",{gradePerformance:{4:20,6:60,7:75}})];
  const standalone=browse(all);
  for(const grade of [4,6,7]){
   const existing=createSmartShadowMatcher(all,["1"],[],grade).suggest("1",practice);
   const found=standalone.browse("1",practice,grade);
   expect(found.suggestions).toEqual(existing.suggestions);expect(found.available).toBe(existing.available);
  }
 });
 it("keeps complete multipart originals/candidates and associated marking images together for either clicked sibling",()=>{
  const all=[q("a",{sourceId:"2022_3H_Q14a",questionNumber:"14a",series:"June 2022",marks:2}),q("b",{sourceId:"2022_3H_Q14b",questionNumber:"14b",series:"June 2022",marks:3}),q("c",{sourceId:"2023_3H_Q8a",questionNumber:"8a",marks:2}),q("d",{sourceId:"2023_3H_Q8b",questionNumber:"8b",marks:3})];
  const fromA=browse(all,"a"),fromB=browse(all,"b");
  expect(fromA.originals[0].key).toBe(fromB.originals[0].key);expect(fromA.originals[0].parts.map(p=>p.id)).toEqual(["a","b"]);
  const a=fromA.browse(fromA.originals[0].key,"same",6),b=fromB.browse(fromB.originals[0].key,"same",6);
  expect(a.suggestions).toEqual(b.suggestions);expect(a.suggestions[0].group.parts.map(p=>p.id)).toEqual(["c","d"]);expect(a.suggestions[0].group.marks).toBe(5);
  expect(assessmentGroupImages(a.suggestions[0].group,"mark").map(i=>i.src)).toEqual(["https://private-fixture/c/m.png","https://private-fixture/d/m.png"]);
  const basket=["a"],before=[...basket];const ids=appendAssessmentGroupIds(all,basket,["d"]);
  expect(basket).toEqual(before);expect(buildAssessmentGroups(all,ids).map(g=>g.marks)).toEqual([5,5]);expect(appendAssessmentGroupIds(all,ids,["c"])).toEqual(ids);
 });
 it("never weakens tier/calculator, complete assets or original-family exclusions",()=>{
  const all=[q("1"),q("alias",{questionNumber:"1"}),q("2",{sourceTier:"Foundation",tier:"Foundation"}),q("3",{sourceCalculator:false,calculator:false}),q("4",{markSchemeUrl:undefined}),q("5",{sourceCalculator:undefined}),q("6")];
  expect(browse(all).browse("1","same",6).suggestions.map(s=>s.group.key)).toEqual(["6"]);
 });
 it("rejects a whole multipart candidate if one of its distinct known marking assets has no available link",()=>{
  const all=[q("1"),q("a",{sourceId:"2023_3H_Q9a",questionNumber:"9a",marks:2}),q("b",{sourceId:"2023_3H_Q9b",questionNumber:"9b",marks:3,markSchemeUrl:undefined})];
  expect(browse(all).browse("1","same",6).suggestions).toEqual([]);
 });
 it("prioritises reviewed complete official shadows and never presents partial/unreviewed variants as bank alternatives",()=>{
  const linked=(id:string,extra:Partial<BankQuestion>={})=>q(id,{shadowPaperId:id,shadowOfQuestionId:"1",shadowStatus:"reviewed",...extra});
  const all=[q("1"),q("2"),linked("approved"),linked("unreviewed",{shadowStatus:"awaiting-review"}),linked("unavailable",{markSchemeUrl:undefined})];
  expect(browse(all).browse("1","same",6).suggestions.map(s=>[s.group.key,s.method])).toEqual([["approved:1","official"],["2","alternative"]]);
 });
 it("pages beyond three in deterministic batches without duplicates, rescoring or input mutations",()=>{
  const all=Array.from({length:9},(_,i)=>q(String(i+1))),before=JSON.stringify(all),m=browse(all);
  const first=m.browse("1","same",6),next=m.browse("1","same",6,3),last=m.browse("1","same",6,6),again=m.browse("1","same",6);
  expect(first).toMatchObject({available:8,hasMore:true});expect(last).toMatchObject({hasMore:false});
  expect([...first.suggestions,...next.suggestions,...last.suggestions].map(s=>s.group.key)).toEqual(["2","3","4","5","6","7","8","9"]);
  expect(again.suggestions[0]).toBe(first.suggestions[0]);expect(JSON.stringify(all)).toBe(before);
  expect(m.browse("1","same",6,9).suggestions).toEqual([]);
  expect(browse([...all].reverse()).browse("1","same",6).suggestions).toEqual(first.suggestions);
 });
 it("standalone browsing does not alter a matcher’s existing assessment cohort, reservations or three-choice behavior",()=>{
  const all=[q("1"),q("2",{gradePerformance:{4:40,6:60}}),q("3",{gradePerformance:{4:20,6:80}}),q("4"),q("5")],m=createSmartShadowMatcher(all,["1"],[],6),reserved=new Set(["4"]);
  const before=m.suggest("1","same",reserved);
  m.browse("1","easier",4,0,20);m.browse("1","harder",6,0,20);
  expect(m.suggest("1","same",reserved)).toEqual(before);expect(before.suggestions).toHaveLength(3);
 });
 it("deduplicates candidate source families across every revealed batch, including legacy import aliases",()=>{
  const all=[q("1"),q("2"),q("alias",{sourceId:"EDX-H-JUNE2023-3H-Q02",questionNumber:"Q02"}),q("3"),q("4"),q("5")],m=browse(all);
  expect(m.browse("1","same",6,0,20).suggestions.map(s=>s.group.key)).toEqual(["2","3","4","5"]);
 });
 it("recognises basket source aliases without preventing an original and its official shadow coexisting",()=>{
  const all=[q("1"),q("2"),q("alias",{sourceId:"EDX-H-JUNE2023-3H-Q02",questionNumber:"Q02"}),q("shadow",{shadowPaperId:"reviewed",shadowOfQuestionId:"1",shadowStatus:"reviewed"})],m=browse(all);
  expect(m.isSelected("2",new Set(["alias"])) ).toBe(true);expect(m.isSelected("2",new Set(["1"])) ).toBe(false);
  expect(m.isSelected("reviewed:1",new Set(["1"])) ).toBe(false);expect(m.isSelected("reviewed:1",new Set(["shadow"])) ).toBe(true);
 });
 it("requires a selected final student grade and refreshes directed suggestions without using legacy question grade",()=>{
  const all=[q("1"),q("2",{grade:1,gradePerformance:{4:40,6:60}}),q("3",{grade:9,gradePerformance:{4:20,6:80}})],m=browse(all);
  expect(m.browse("1","same",null).reason).toContain("Choose a target student grade");
  expect(m.browse("1","easier",4).suggestions.map(s=>s.group.key)).toEqual(["2"]);
  expect(m.browse("1","easier",6).suggestions.map(s=>s.group.key)).toEqual(["3"]);
  expect(m.browse("1","harder",6).suggestions.map(s=>s.group.key)).toEqual(["2"]);
 });
 it("permits only warned skill-led similar matches with missing history and explains directed no-match safely",()=>{
  const m=browse([q("1",{gradePerformance:{}}),q("2")]);
  expect(m.browse("1","same",6).suggestions[0]).toMatchObject({category:"Possible match — teacher review recommended",warnings:expect.arrayContaining([expect.stringContaining("skill-led")])});
  expect(m.browse("1","easier",6)).toMatchObject({available:0,reason:expect.stringContaining("historical performance is missing")});
  expect(browse([q("1"),q("2",{skill:"Different enhanced skill"})]).browse("1","same",6)).toMatchObject({available:0,hasMore:false,reason:expect.stringContaining("No other question is mapped to the required enhanced skills")});
 });
});
