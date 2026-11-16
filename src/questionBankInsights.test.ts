import {describe,it,expect} from "vitest";
import type {BankQuestion} from "./questionData";
import {buildInsightsModel,skillCoverage,gradeCoverage,tierCoverage,paperCoverage,emptyCoverageFilters,coverageStatus,validCoverageThresholds,coverageCsv,missingInsightMetadata} from "./questionBankInsights";
const q=(id:string,extra:Partial<BankQuestion>={}):BankQuestion=>({id,sourceId:`EDX-F-JUNE2022-1F-Q${id}`,questionNumber:id,examBoard:"Edexcel",paperCode:"1F",topic:"Algebra",skill:"Expanding brackets",tier:"Foundation",sourceTier:"Foundation",calculator:false,sourceCalculator:false,grade:4,marks:2,series:"June 2022",ao:"AO1",challenge:"Standard",prompt:"",answer:"",tags:[],gradePerformance:{4:90},questionPath:`${id}/q.png`,markSchemePath:`${id}/m.png`,imageCrops:{question:{top:0,bottom:0,left:0,right:0},mark:{top:0,bottom:0,left:0,right:0}},cropReview:{question:"approved",mark:"approved"},...extra});
const multipart=()=>[q("a",{sourceId:"2022_1F_Q14a",questionNumber:"14a",grade:3,marks:2}),q("b",{sourceId:"2022_1F_Q14b",questionNumber:"14b",grade:4,marks:3})];
const filter=(extra:Partial<typeof emptyCoverageFilters>)=>({...emptyCoverageFilters,...extra});
describe("question bank insights inventory",()=>{
 it("counts multipart rows as one whole question and never mutates source records",()=>{
  const all=multipart(),before=JSON.stringify(all),m=buildInsightsModel(all);
  expect(m.records).toHaveLength(2);expect(m.groups).toHaveLength(1);expect(m.groups[0].usable).toBe(true);expect(m.groups[0].group.marks).toBe(5);expect(JSON.stringify(all)).toBe(before);
  const rows=skillCoverage(m);expect(rows.map(r=>r.grade)).toEqual([3,4]);expect(rows.every(r=>r.usable===1&&r.questions===1)).toBe(true);
  const grades=gradeCoverage(m);expect(grades.find(g=>g.grade===3)?.count).toBe(1);expect(grades.find(g=>g.grade===4)?.count).toBe(1);
 });
 it("deduplicates sibling mappings within the same skill/grade row",()=>{
  const all=multipart().map(p=>({...p,grade:4})),row=skillCoverage(buildInsightsModel(all))[0];
  expect(row).toMatchObject({records:2,questions:1,available:1,usable:1,nonCalculator:1});
 });
 it("uses the builder's shared-image rules without requiring signed image URLs",()=>{
  const all=multipart();all[1].questionPath=undefined;all[1].markSchemePath=undefined;
  const m=buildInsightsModel(all);expect(m.groups[0].usable).toBe(true);expect(m.readiness.bothImages).toBe(1);expect(m.readiness.missingQuestion).toBe(1);
  const signed=buildInsightsModel(all.map(p=>({...p,questionUrl:p.questionPath?"signed-q":undefined,markSchemeUrl:p.markSchemePath?"signed-m":undefined})));
  expect(signed.groups[0].usable).toBe(true);expect(m.readiness.unavailableLinks).toBe(1);expect(signed.readiness.unavailableLinks).toBe(0);
 });
 it("counts stored marking sets independently of URL signing without guessing missing legacy siblings",()=>{
  const all=multipart();all[1].markSchemePath=undefined;all[1].questionPath="different/q.png";
  // No separate mark path is an ambiguous shared legacy representation, not proof of a missing file.
  expect(buildInsightsModel(all).groups[0].markReady).toBe(true);
  all[1].markSchemePath="b/m.png";
  expect(buildInsightsModel(all).groups[0].usable).toBe(true); // both stored marking paths count even before signing
  all[0].markSchemePath=undefined;all[1].markSchemePath=undefined;
  expect(buildInsightsModel(all).groups[0].markReady).toBe(false);
 });
 it("requires conjunctions on the same part, not grade on one sibling and skill on another",()=>{
  const all=multipart();all[0].skill="Solving equations";
  const m=buildInsightsModel(all);
  expect(skillCoverage(m,filter({grade:"4",skill:"Solving"}))).toEqual([]);
  expect(skillCoverage(m,filter({grade:"4",skill:"Expanding"}))[0].usable).toBe(1);
 });
 it("filters actual tier/grade/calculator metadata without display fallbacks",()=>{
  const m=buildInsightsModel([q("1"),q("2",{tier:"Higher",sourceTier:"Higher",grade:7,calculator:true,sourceCalculator:true}),q("3",{sourceTier:undefined,sourceCalculator:undefined,grade:0})]);
  expect(skillCoverage(m,filter({tier:"Foundation",grade:"4",calculator:"Non-calculator"}))).toHaveLength(1);
  expect(skillCoverage(m,filter({tier:"Unknown",grade:"Unclassified",calculator:"Unknown"}))[0]).toMatchObject({grade:null,tier:"Unknown",unknownCalculator:1});
  expect(gradeCoverage(m,"Foundation").find(g=>g.grade===7)?.count).toBe(0);expect(gradeCoverage(m).find(g=>g.grade===null)?.count).toBe(1);
 });
 it("does not infer a grade from historic performance percentages",()=>{
  const m=buildInsightsModel([q("1",{grade:0,gradePerformance:{4:99}})]);
  expect(gradeCoverage(m).find(g=>g.grade===4)?.count).toBe(0);expect(skillCoverage(m,filter({grade:"4"}))).toEqual([]);
  expect(m.readiness.incompleteMetadata).toBe(1);expect(m.metadataIssues).toContainEqual(["Grade",1]);
 });
 it("reports only stored grade classes and leaves unavailable Grade 4 honestly empty",()=>{
  const m=buildInsightsModel([q("1",{grade:3}),q("2",{grade:7}),q("3",{grade:0})]);
  expect(m.storedGrades).toEqual([3,7]);expect(m.unclassifiedRecords).toBe(1);
  expect(skillCoverage(m,filter({tier:"Foundation",grade:"4"}))).toEqual([]);
  expect(skillCoverage(m,filter({tier:"Foundation",grade:"Unclassified"}))[0].usable).toBe(1);
 });
 it("normalises skill case/spacing, splits semicolons, and avoids duplicate skill memberships",()=>{
  const m=buildInsightsModel([q("1",{skill:" Expanding brackets ; expanding   brackets; Solving equations "}),q("2",{skill:"EXPANDING BRACKETS"})]);
  expect(m.skills).toHaveLength(2);const rows=skillCoverage(m);expect(rows).toHaveLength(2);expect(rows.find(r=>r.questions===2)?.records).toBe(2);
 });
 it.each([[0,"No coverage"],[1,"Limited coverage"],[4,"Limited coverage"],[5,"Developing coverage"],[9,"Developing coverage"],[10,"Good coverage"]])("classifies %s complete usable questions as %s",(n,status)=>expect(coverageStatus(Number(n))).toBe(status));
 it("adjusts validated thresholds and safely rejects damaged browser settings",()=>{
  expect(coverageStatus(3,{developing:2,good:3})).toBe("Good coverage");
  for(const value of [null,{}, {developing:0,good:3},{developing:5,good:5},{developing:2.5,good:10},{developing:2,good:10001}])expect(validCoverageThresholds(value)).toBe(false);
  expect(coverageStatus(3,{developing:0,good:1})).toBe("Limited coverage");
 });
 it("shows zero usable resources only for represented mappings, not invented curriculum gaps",()=>{
  const m=buildInsightsModel([q("1",{markSchemePath:undefined}),q("2",{skill:"Unmapped"})]);
  const rows=skillCoverage(m);expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({available:1,usable:0,status:"No coverage"});
  expect(skillCoverage(m,filter({skill:"Circle theorems"}))).toEqual([]);
 });
 it("separates asset readiness, metadata issues and applicable crop decisions",()=>{
  const m=buildInsightsModel([q("1",{sourceCalculator:undefined,grade:0}),q("2",{markSchemePath:undefined,cropReview:{question:"unreviewed",mark:"needs-fix"}}),q("3",{cropReview:{question:"needs-fix",mark:"approved"}})]);
  expect(m.readiness).toMatchObject({questionImages:3,markImages:2,bothImages:2,missingMark:1,unavailableLinks:3,incompleteMetadata:1,cropOutstanding:2,cropNeedsFix:1});
  expect(m.groups.map(g=>g.usable)).toEqual([true,false,false]);
  expect(missingInsightMetadata(q("0",{sourceId:"2022_1F_Q00",questionNumber:"0"}))).toContain("Question reference");
 });
 it("excludes original practice and official shadow records from examination inventory",()=>{
  const m=buildInsightsModel([q("1"),q("practice",{originalContent:true}),q("s",{shadowPaperId:"set",shadowOfQuestionId:"1"})]);expect(m.excluded).toBe(2);expect(m.records).toHaveLength(1);expect(m.groups).toHaveLength(1);
 });
 it("aggregates tier skill counts across grades instead of labelling each sparse grade a sparse skill",()=>{
  const all=Array.from({length:5},(_,i)=>q(String(i+1),{grade:i%2?3:4}));
  const t=tierCoverage(buildInsightsModel(all),{developing:5,good:10})[0];expect(t).toMatchObject({questions:5,skills:1,limitedSkills:0,usable:5,nonCalculator:5});
 });
 it("uses actual board, series and paper metadata, including years and unknown sources",()=>{
  const all=[...multipart(),q("3",{examBoard:"AQA",series:"November 2024",paperCode:"2F"}),q("4",{examBoard:undefined,series:"Unspecified",paperCode:undefined})];
  const m=buildInsightsModel(all),papers=paperCoverage(m);expect(papers).toHaveLength(3);expect(papers.find(p=>p.series==="June 2022")).toMatchObject({records:2,questions:1,usable:1});expect(papers.find(p=>p.board==="Unknown board")?.series).toBe("Unknown series");
  expect(skillCoverage(m,filter({board:"AQA"}))[0].questions).toBe(1);
 });
 it("keeps identical question numbers in different papers/boards separate and filters their topics",()=>{
  const first=multipart();
  const other=first.map((part,index)=>({...part,id:`other-${index}`,sourceId:`AQA-F-JUNE2024-2F-Q14${index?"b":"a"}`,examBoard:"AQA",series:"June 2024",paperCode:"2F",topic:"Geometry",calculator:true,sourceCalculator:true,questionPath:`other-${index}/q.png`,markSchemePath:`other-${index}/m.png`}));
  const m=buildInsightsModel([...first,...other]);expect(m.groups).toHaveLength(2);expect(paperCoverage(m)).toHaveLength(2);
  expect(skillCoverage(m,filter({board:"AQA",topic:"Geometry",grade:"4"}))[0]).toMatchObject({questions:1,usable:1,calculator:1});
  expect(skillCoverage(m,filter({board:"AQA",topic:"Algebra"}))).toEqual([]);
 });
 it("exports all sorted filtered rows with meaningful headings, Unicode, quotes and formula protection",()=>{
  const all=[q("1",{skill:'=HYPERLINK("unsafe")',topic:"Ratio, proportion"}),q("2",{skill:"Angles — triangles"}),q("3",{grade:5})];
  const rows=skillCoverage(buildInsightsModel(all),filter({grade:"4"}),{developing:2,good:3},"skill");const csv=coverageCsv(rows,{developing:2,good:3},"Edexcel");
  expect(rows).toHaveLength(2);expect(csv.charCodeAt(0)).toBe(0xfeff);expect(csv).toContain('"Complete usable questions"');expect(csv).toContain('"\'=HYPERLINK(""unsafe"")"');expect(csv).toContain('"Ratio, proportion"');expect(csv).toContain("Angles — triangles");expect(csv.split("\r\n")).toHaveLength(3);expect(csv).toContain('"2","3","Edexcel"');
 });
});
