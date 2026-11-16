import {describe,it,expect} from "vitest";
import type {BankQuestion} from "./questionData";
import {buildAssessmentGroups,assessmentGroupImages,checkAssessmentExport} from "./assessmentGroups";
import {createSmartShadowMatcher as matcher,enhancedSkills} from "./smartShadowMatching";
const createSmartShadowMatcher=(all:BankQuestion[],ids:string[],excluded:string[]=[],grade:number|null=6)=>matcher(all,ids,excluded,grade);
const q=(id:string,opts:Partial<BankQuestion>={}):BankQuestion=>({id,sourceId:`EDX-H-JUNE2022-3H-Q${id}`,questionNumber:id,examBoard:"Edexcel",topic:"Algebra",skill:"Solving simultaneous equations",tier:"Higher",sourceTier:"Higher",sourceCalculator:true,calculator:true,paperCode:"3H",grade:6,marks:4,series:"June 2022",ao:"AO1",challenge:"Standard",prompt:"",answer:"",tags:[],gradePerformance:{6:70},questionPath:`${id}/q.png`,markSchemePath:`${id}/m.png`,questionUrl:`https://fixture/${id}/q.png`,markSchemeUrl:`https://fixture/${id}/m.png`,imageCrops:{question:{top:0,bottom:100,left:0,right:100},mark:{top:0,bottom:100,left:0,right:100}},cropReview:{question:"approved",mark:"approved"},...opts});
const options=(all:BankQuestion[],difficulty:"same"|"easier"|"harder"="same",ids=["1"])=>{const m=createSmartShadowMatcher(all,ids);return m.suggest(m.originals[0].key,difficulty).suggestions};
const multipart=()=>[q("a",{sourceId:"2022_3H_Q14a",marks:2}),q("b",{sourceId:"2022_3H_Q14b",skill:"Expanding double brackets",marks:3}),q("c",{sourceId:"2023_3H_Q18a",marks:2}),q("d",{sourceId:"2023_3H_Q18b",skill:"Expanding double brackets",marks:3})];
const official=(id:string,original:string,opts:Partial<BankQuestion>={})=>q(id,{shadowPaperId:"official-set",shadowOfQuestionId:original,shadowSet:"A",shadowStatus:"reviewed",...opts});
describe("smart targeted shadow matching",()=>{
 it("requires enhanced skill, never broad topic, and ignores legacy question grade",()=>{
  const all=[q("1"),q("2",{grade:7,gradePerformance:{6:74}}),q("3"),q("4",{skill:"Algebra"}),q("5",{skill:"Expanding double brackets"})];
  const found=options(all);expect(found.map(s=>s.group.question.id)).toEqual(["3","2"]);
  expect(found[0].category).toBe("Strong metadata match");
  expect(found[0].reasons).toContain("Same enhanced skill coverage.");
 });
 it("normalises spacing/case but prioritises exact skill sets before additional skills",()=>{
  const found=options([q("1"),q("2",{skill:"Solving simultaneous equations; Expanding double brackets"}),q("3",{skill:"  SOLVING   SIMULTANEOUS EQUATIONS  "})]);
  expect(found.map(s=>s.group.question.id)).toEqual(["3","2"]);expect(found[1].warnings.join(" ")).toContain("skill coverage differs");
 });
 it("offers at most three, with deterministic ties independent of bank order",()=>{
  const all=[q("1"),q("5"),q("3"),q("2"),q("4")];
  expect(options(all).map(s=>s.group.key)).toEqual(["2","3","4"]);
  expect(options([...all].reverse()).map(s=>s.group.key)).toEqual(["2","3","4"]);
 });
 it("uses complete selected-cohort performance windows, never legacy grade direction",()=>{
  const all=[q("1",{grade:7}),q("2",{grade:9,gradePerformance:{6:80}}),q("3",{grade:3,gradePerformance:{6:60}}),q("4",{grade:5,gradePerformance:{6:99}}),q("5",{grade:0,gradePerformance:{}})];
  expect(options(all,"easier").map(s=>s.group.question.id)).toEqual(["2"]);
  expect(options(all,"harder").map(s=>s.group.question.id)).toEqual(["3"]);
  expect(options(all,"easier")[0].reasons.join(" ")).toContain("original 70%, replacement 80%");
  expect(options(all).some(s=>s.group.question.id==="5")).toBe(true);
 });
 it("offers skill-led possible matches with explicit missing-performance warnings, never directed estimates",()=>{
  const all=[q("1",{grade:0,gradePerformance:{}}),q("2",{grade:0,ao:"Unmapped",gradePerformance:{},examBoard:undefined,series:"Unspecified"})];
  const found=options(all)[0];expect(found.category).toBe("Possible match — teacher review recommended");
  expect(found.warnings.join(" ")).toMatch(/historical performance.*unavailable.*objective metadata.*source metadata/);
  expect(options(all,"easier")).toEqual([]);
  const m=createSmartShadowMatcher(all,["1"]);expect(m.suggest("1","easier").reason).toContain("historical performance");
 });
 it("requires an explicit target student grade, never derives it from metadata.grade",()=>{
  const m=createSmartShadowMatcher([q("1"),q("2")],["1"],[],null);
  expect(m.suggest("1","same")).toMatchObject({available:0,reason:expect.stringContaining("Choose a target student grade")});
  expect(()=>m.generate([{originalKey:"1",replacementKey:"2"}],"same","Test")).toThrow();
 });
 it("reverses recommendations with realistic grade 1–9 profiles and ignores legacy grades",()=>{
  const profile=(values:number[])=>Object.fromEntries(values.map((v,i)=>[i+1,v]));
  const all=[q("1",{grade:7,gradePerformance:profile([2,8,17,30,45,60,72,85,95])}),q("2",{grade:3,gradePerformance:profile([5,12,24,40,55,65,70,82,94])}),q("3",{grade:9,gradePerformance:profile([1,5,12,23,40,60,82,92,98])})];
  const at=(grade:number,difficulty:"same"|"easier"|"harder")=>createSmartShadowMatcher(all,["1"],[],grade).suggest("1",difficulty).suggestions.map(s=>s.group.key);
  expect(at(4,"easier")).toEqual(["2"]);expect(at(4,"harder")).toEqual(["3"]);
  expect(at(7,"easier")).toEqual(["3"]);expect(at(7,"harder")).toEqual([]);
  const changed=all.map(p=>({...p,grade:0}));expect(options(changed).map(s=>s.group.key)).toEqual(options(all).map(s=>s.group.key));
 });
 it("uses bounded inclusive recommendation windows and keeps real zero performance",()=>{
  const all=[q("1"),q("near",{gradePerformance:{6:75}}),q("far",{gradePerformance:{6:90}}),q("too-near",{gradePerformance:{6:74.9}}),q("too-far",{gradePerformance:{6:90.1}})];
  expect(options(all,"easier").map(s=>s.group.key).sort()).toEqual(["far","near"]);
  expect(options([q("1",{gradePerformance:{6:10}}),q("zero",{gradePerformance:{6:0}})],"harder").map(s=>s.group.key)).toEqual(["zero"]);
 });
 it.each([NaN,Infinity,-1,101,null])("rejects invalid or missing performance %s in directed suggestions",value=>{
  expect(options([q("1"),q("2",{gradePerformance:{6:value}})],"easier")).toEqual([]);
 });
 it.each(["Foundation","Higher"] as const)("only accepts compatible %s tier and calculator metadata",tier=>{
  const grade=tier==="Higher"?6:4;
  const all=[q("1",{tier,sourceTier:tier,grade}),q("2",{tier,sourceTier:tier,grade}),q("3",{tier,sourceTier:tier,grade,sourceCalculator:false,calculator:false}),q("4",{tier,sourceTier:undefined,grade}),q("5",{tier,sourceTier:tier,grade,sourceCalculator:undefined}),q("6",{sourceTier:tier==="Higher"?"Foundation":"Higher",grade})];
  expect(options(all).map(s=>s.group.question.id)).toEqual(["2"]);
 });
 it("uses the stored tier rather than excluding real Higher questions with grade-3 skill metadata",()=>{
  expect(options([q("1",{grade:3}),q("2",{grade:3}),q("3",{grade:3,tier:"Foundation",sourceTier:"Foundation"})]).map(s=>s.group.key)).toEqual(["2"]);
 });
 it("does not infer non-calculator from the database display fallback",()=>{
  const m=createSmartShadowMatcher([q("1",{sourceCalculator:undefined,calculator:false}),q("2",{sourceCalculator:false,calculator:false})],["1"]);
  expect(m.suggest("1","same")).toMatchObject({available:0,reason:expect.stringContaining("calculator metadata is missing")});
 });
 it("excludes originals, assessment members, equivalent parent IDs and already chosen families",()=>{
  const all=[q("1",{sourceId:"2022_3H_Q14a"}),q("b",{sourceId:"2022_3H_Q14b"}),q("alias",{sourceId:"2022_3H_Q014"}),q("2"),q("3"),q("4")];
  const m=createSmartShadowMatcher(all,["1","2"]),key=m.originals[0].key;
  expect(m.suggest(key,"same",new Set(["3"])).suggestions.map(s=>s.group.question.id)).toEqual(["4"]);
 });
 it("excludes selected questions hidden by paper filters as well as visible originals",()=>{
  const m=createSmartShadowMatcher([q("1"),q("2"),q("3")],["1"],["1","2"]);
  expect(m.originals.map(g=>g.key)).toEqual(["1"]);
  expect(m.suggest("1","same").suggestions.map(s=>s.group.key)).toEqual(["3"]);
 });
 it("does not offer legacy/new import aliases of the same exam question",()=>{
  const all=[q("1",{sourceId:"2022_3H_Q14a",questionNumber:"14a"}),q("alias",{sourceId:"EDX-H-JUNE2022-3H-Q14",questionNumber:"Q14"}),q("2",{sourceId:"2023_3H_Q19",questionNumber:"19",series:"June 2023"}),q("alias2",{sourceId:"EDX-H-JUNE2023-3H-Q19",questionNumber:"Q19",series:"June 2023"})];
  expect(options(all).map(s=>s.group.key)).toEqual(["2"]);
 });
 it("keeps multipart coverage, marks, all question/mark images and representative IDs together",()=>{
  const all=multipart(),m=createSmartShadowMatcher(all,["a"]),source=m.originals[0];
  expect(source.parts.map(p=>p.id)).toEqual(["a","b"]);expect(enhancedSkills(source)).toHaveLength(2);
  const suggestion=m.suggest(source.key,"same").suggestions[0];expect(suggestion.group.parts.map(p=>p.id)).toEqual(["c","d"]);expect(suggestion.group.marks).toBe(5);
  const generated=m.generate([{originalKey:source.key,replacementKey:suggestion.group.key}],"same","Original");
  expect(generated).toMatchObject({ids:["c"],totalMarks:5,info:{replacements:[{originalIds:["a","b"],replacementIds:["c","d"]}]}});
  const groups=buildAssessmentGroups(all,generated.ids);expect(assessmentGroupImages(groups[0],"mark")).toHaveLength(2);expect(checkAssessmentExport(groups,"both").ready).toBe(true);
  expect(options([q("1",{skill:"Solving simultaneous equations; Expanding double brackets"}),q("2")])).toEqual([]);
 });
 it("prioritises complete reviewed official shadows while retaining bank alternatives",()=>{
  const all=[q("1"),q("2"),official("s","1")];
  expect(options(all).map(s=>s.method)).toEqual(["official","alternative"]);
  expect(options(all)[0].reasons[0]).toContain("approved official shadow");
 });
 it.each(["partial","unreviewed","duplicate-link","mixed-set"])("rejects %s multipart official links",variant=>{
  const [a,b,c,d]=multipart();
  const sa=official("sa","a"),sb=official("sb","b",variant==="unreviewed"?{shadowStatus:"awaiting-review"}:variant==="duplicate-link"?{shadowOfQuestionId:"a"}:variant==="mixed-set"?{shadowPaperId:"other-set"}:{});
  const all=[a,b,c,d,sa,...(variant==="partial"?[]:[sb])],m=createSmartShadowMatcher(all,["a"]);
  expect(m.suggest(m.originals[0].key,"same").suggestions.every(s=>s.method==="alternative")).toBe(true);
 });
 it("accepts a complete multipart official and excludes linked shadows for other originals",()=>{
  const [a,b,c,d]=multipart(),all=[a,b,c,d,official("sa","a"),official("sb","b"),official("sc","c")];
  const m=createSmartShadowMatcher(all,["a"]),s=m.suggest(m.originals[0].key,"same").suggestions[0];
  expect(s.method).toBe("official");expect(s.group.parts.map(p=>p.id)).toEqual(["sa","sb"]);
 });
 it("never passes orphan shadow links off as examination alternatives",()=>{
  const all=[q("1"),q("2",{skill:"Other enhanced skill"}),q("orphan",{shadowOfQuestionId:"2",shadowStatus:"awaiting-review"}),q("3")];
  expect(options(all).map(s=>s.group.key)).toEqual(["3"]);
 });
 it("does not offer unavailable question or mark assets or metadata-only imports",()=>{
  expect(options([q("1"),q("2",{markSchemeUrl:undefined}),q("3",{questionUrl:undefined}),q("4",{marks:0})])).toEqual([]);
 });
 it("explains no match instead of substituting a broad-topic question",()=>{
  const m=createSmartShadowMatcher([q("1",{skill:"Unmapped"}),q("2")],["1"]);expect(m.suggest("1","same")).toMatchObject({available:0,reason:expect.stringContaining("Enhanced skill metadata is missing")});
 });
 it("creates a separate ordered assessment, preserves originals and rejects duplicates/stale choices",()=>{
  const all=[q("1"),q("2"),q("3"),q("4")],ids=["2","1"],before=JSON.stringify(all),m=createSmartShadowMatcher(all,ids);
  const generated=m.generate([{originalKey:"2",replacementKey:"4"},{originalKey:"1",replacementKey:"3"}],"same","Class test");
  expect(generated.ids).toEqual(["4","3"]);expect(generated.totalMarks).toBe(8);expect(ids).toEqual(["2","1"]);expect(JSON.stringify(all)).toBe(before);
  expect(()=>m.generate([{originalKey:"2",replacementKey:"3"},{originalKey:"1",replacementKey:"3"}],"same","Class test")).toThrow(/duplicate/);
  expect(()=>m.generate([{originalKey:"2",replacementKey:"missing"}],"same","Class test")).toThrow();
  expect(()=>m.generate([{originalKey:"2",replacementKey:"3"},{originalKey:"2",replacementKey:"4"}],"same","Class test")).toThrow(/distinct/);
 });
 it("leaves explicit unmatched questions out without filling them silently",()=>{
  const m=createSmartShadowMatcher([q("1"),q("2"),q("3")],["1","2"]);
  const r=m.generate([{originalKey:"1",replacementKey:null},{originalKey:"2",replacementKey:"3"}],"same","Test");
  expect(r.ids).toEqual(["3"]);expect(r.info.unmatchedOriginalIds).toEqual(["1"]);
  expect(()=>m.generate([{originalKey:"1",replacementKey:null}],"same","Test")).toThrow(/at least one/);
 });
});
