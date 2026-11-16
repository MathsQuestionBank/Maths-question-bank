import {describe,it,expect} from "vitest";
import type {BankQuestion} from "./questionData";
import {buildInsightsModel,skillCoverage,gradeCoverage,tierCoverage,paperCoverage,emptyCoverageFilters,coverageStatus,validCoverageThresholds,coverageCsv,missingInsightMetadata,countInsightPapers} from "./questionBankInsights";
const q=(id:string,extra:Partial<BankQuestion>={}):BankQuestion=>({id,sourceId:`EDX-F-JUNE2022-1F-Q${id}`,questionNumber:id,examBoard:"Edexcel",paperCode:"1F",topic:"Algebra",skill:"Expanding brackets",tier:"Foundation",sourceTier:"Foundation",calculator:false,sourceCalculator:false,grade:4,marks:2,series:"June 2022",ao:"AO1",challenge:"Standard",prompt:"",answer:"",tags:[],gradePerformance:{4:90},questionPath:`${id}/q.png`,markSchemePath:`${id}/m.png`,imageCrops:{question:{top:0,bottom:0,left:0,right:0},mark:{top:0,bottom:0,left:0,right:0}},cropReview:{question:"approved",mark:"approved"},...extra});
const multipart=()=>[q("a",{sourceId:"2022_1F_Q14a",questionNumber:"14a",grade:3,marks:2}),q("b",{sourceId:"2022_1F_Q14b",questionNumber:"14b",grade:4,marks:3})];
const filter=(extra:Partial<typeof emptyCoverageFilters>)=>({...emptyCoverageFilters,...extra});
describe("question bank insights inventory",()=>{
 it("counts multipart rows as one whole question and never mutates source records",()=>{
  const all=multipart(),before=JSON.stringify(all),m=buildInsightsModel(all);
  expect(m.records).toHaveLength(2);expect(m.groups).toHaveLength(1);expect(m.groups[0].usable).toBe(true);expect(m.groups[0].group.marks).toBe(5);expect(JSON.stringify(all)).toBe(before);
  const rows=skillCoverage(m);expect(rows).toHaveLength(1);expect(rows.every(r=>r.usable===1&&r.questions===1)).toBe(true);
  const grades=gradeCoverage(m);expect(grades.find(g=>g.grade===3)?.withData).toBe(0);expect(grades.find(g=>g.grade===4)?.withData).toBe(1);
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
 it("matches topic/skill on the same part, but weights all parts for the selected student grade",()=>{
  const all=multipart();all[0].skill="Solving equations";all[0].gradePerformance={4:50};all[1].gradePerformance={4:100};
  const m=buildInsightsModel(all);
  expect(skillCoverage(m,filter({targetGrade:"4",skill:"Solving"}))[0]).toMatchObject({usable:1,withPerformance:1,medianPercent:80});
  expect(skillCoverage(m,filter({targetGrade:"4",skill:"Expanding",performanceBand:"middle"}))).toEqual([]);
 });
 it("filters actual tier/calculator metadata without grade defaults or display fallbacks",()=>{
  const m=buildInsightsModel([q("1"),q("2",{tier:"Higher",sourceTier:"Higher",grade:7,calculator:true,sourceCalculator:true}),q("3",{sourceTier:undefined,sourceCalculator:undefined,grade:0})]);
  expect(skillCoverage(m,filter({tier:"Foundation",targetGrade:"4",calculator:"Non-calculator"}))).toHaveLength(1);
  expect(skillCoverage(m,filter({tier:"Unknown",targetGrade:"4",calculator:"Unknown"}))[0]).toMatchObject({targetStudentGrade:4,tier:"Unknown",unknownCalculator:1});
  expect(gradeCoverage(m,"Foundation").find(g=>g.grade===7)?.withData).toBe(0);
 });
 it("uses g4 despite legacy grade 3, 7 or absent, preserving raw metadata",()=>{
  const all=[q("1",{grade:3}),q("2",{grade:7}),q("3",{grade:0})],before=JSON.stringify(all),m=buildInsightsModel(all);
  expect(skillCoverage(m,filter({tier:"Foundation",targetGrade:"4"}))[0]).toMatchObject({usable:3,withPerformance:3,medianPercent:90});
  expect(m.readiness.incompleteMetadata).toBe(0);expect(m.metadataIssues).not.toContainEqual(["Grade",1]);expect(JSON.stringify(all)).toBe(before);
 });
 it("shows each final-grade group's resource-level median and complete/missing counts, never question classifications",()=>{
  const values=[1,5,12,22,35,45,25,70,90],profile=Object.fromEntries(values.map((v,i)=>[i+1,v]));
  const m=buildInsightsModel([q("1",{grade:7,gradePerformance:profile}),q("2",{grade:3,gradePerformance:{7:75}}),q("3",{grade:0,gradePerformance:{7:0}})]);
  const grades=gradeCoverage(m);
  expect(grades).toHaveLength(9);expect(grades.find(g=>g.grade===7)).toEqual({grade:7,withData:3,missingData:0,medianPercent:25});
  expect(grades.find(g=>g.grade===1)).toEqual({grade:1,withData:1,missingData:2,medianPercent:1});
  expect(skillCoverage(m,filter({targetGrade:"7",performanceBand:"lowest"}))[0]).toMatchObject({usable:1,medianPercent:0});
  expect(skillCoverage(m,filter({targetGrade:"4",performanceBand:"missing"}))[0]).toMatchObject({usable:2,withPerformance:0,missingPerformance:2,medianPercent:null});
  expect(skillCoverage(m,filter({targetGrade:"4"}))[0]).toMatchObject({usable:3,withPerformance:1,missingPerformance:2,medianPercent:22});
 });
 it("does not impute missing multipart performance or discard zero, and validates mark shares",()=>{
  const all=multipart();all[0].gradePerformance={4:0};all[1].gradePerformance={4:null};
  const m=buildInsightsModel(all);expect(gradeCoverage(m).find(g=>g.grade===4)).toMatchObject({withData:0,missingData:1,medianPercent:null});
  expect(skillCoverage(m,filter({targetGrade:"4",performanceBand:"available"}))).toEqual([]);
  for(const value of [-1,101,NaN,Infinity])expect(gradeCoverage(buildInsightsModel([q("1",{gradePerformance:{4:value}})])).find(g=>g.grade===4)?.withData).toBe(0);
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
  expect(skillCoverage(m,filter({board:"AQA",topic:"Geometry",targetGrade:"4"}))[0]).toMatchObject({questions:1,usable:1,calculator:1});
  expect(skillCoverage(m,filter({board:"AQA",topic:"Algebra"}))).toEqual([]);
 });
 it("counts full source paper identities instead of prefixes shared by many series and papers",()=>{
  const all=[q("1",{sourceId:"EDX-F-JUNE2022-1F-Q01",paperId:"one"}),q("2",{sourceId:"EDX-F-JUNE2023-1F-Q01",series:"June 2023",paperId:"two"}),q("3",{sourceId:"EDX-F-JUNE2023-2F-Q01",series:"June 2023",paperCode:"2F",paperId:"three"})];
  expect(new Set(all.map(q=>q.sourceId!.slice(0,7))).size).toBe(1);expect(countInsightPapers(all)).toBe(3);
  expect(countInsightPapers([...all,{...all[0],id:"reimport",paperId:"reimport-id"}])).toBe(3);
 });
 it("counts unknown-source linked paper IDs without guessing missing source metadata",()=>{
  const a=q("1",{paperId:"one"}),b=q("2",{paperId:"one",examBoard:undefined,series:"Unspecified",sourceTier:undefined}),c=q("3",{paperId:"unknown",examBoard:undefined,series:"Unspecified",sourceTier:undefined});
  expect(countInsightPapers([a,b,c])).toBe(2);
  expect(countInsightPapers([{...c,paperId:undefined}])).toBe(0);
 });
 it("exports all sorted filtered rows with meaningful headings, Unicode, quotes and formula protection",()=>{
  const all=[q("1",{skill:'=HYPERLINK("unsafe")',topic:"Ratio, proportion"}),q("2",{skill:"Angles — triangles"}),q("3",{grade:5,gradePerformance:{}})];
  const rows=skillCoverage(buildInsightsModel(all),filter({targetGrade:"4",performanceBand:"available"}),{developing:2,good:3},"skill");const csv=coverageCsv(rows,{developing:2,good:3},"Edexcel");
  expect(rows).toHaveLength(2);expect(csv.charCodeAt(0)).toBe(0xfeff);expect(csv).toContain('"Complete usable questions"');expect(csv).toContain("Target final student GCSE grade");expect(csv).not.toContain("Stored GCSE grade");expect(csv).toContain('"\'=HYPERLINK(""unsafe"")"');expect(csv).toContain('"Ratio, proportion"');expect(csv).toContain("Angles — triangles");expect(csv.split("\r\n")).toHaveLength(3);expect(csv).toContain('"2","3","Edexcel"');
 });
});
