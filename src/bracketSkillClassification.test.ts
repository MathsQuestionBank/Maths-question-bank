import {describe,it,expect} from "vitest";
import review from "./bracketSkillReview.json";
import {bracketSkillNames,bracketSkillIds,bracketReviewFor,bracketSearchIntent} from "./bracketSkillClassification";
import {canonicalInsightSkills} from "./insightsSkills";
import {buildInsightsModel,skillCoverage,emptyCoverageFilters,coverageCsv} from "./questionBankInsights";
import {buildQuestionSkillIndex,matchesQuestionSkill,matchesQuestionKeywords} from "./questionSkillSearch";
import type {BankQuestion} from "./questionData";
const verified=review.reviews.filter(r=>r.status==="source_verified");
const bank=(r=verified[0]):BankQuestion=>({...r.identity,tier:r.identity.sourceTier as BankQuestion['tier'],sourceTier:r.identity.sourceTier as BankQuestion['sourceTier'],calculator:false,sourceCalculator:false,grade:0,ao:"AO1",topic:"Algebra",challenge:"Standard",prompt:"Original title remains",answer:"",tags:[],questionPath:"fixture/q.png",markSchemePath:"fixture/m.png",gradePerformance:{4:50},imageCrops:{question:{top:0,bottom:0,left:0,right:0},mark:{top:0,bottom:0,left:0,right:0}},cropReview:{question:"approved",mark:"approved"}});
describe("source-bound bracket classifications",()=>{
 it("keeps the three requested mathematical categories distinct",()=>{
  expect(new Set(bracketSkillIds).size).toBe(3);
  expect(bracketSkillNames).toEqual(["Expand single bracket","Expand 2 single brackets and simplify","Expand double brackets and simplify"]);
  expect(bracketSearchIntent("double brackets")?.id).toBe(bracketSkillIds[2]);
  expect(bracketSearchIntent("two brackets")).toBeNull();
 });
 it.each(verified)("uses inspected content for $identity.sourceId without mutating stored metadata",r=>{
  const q=bank(r),before=JSON.stringify(q),members=canonicalInsightSkills(q);
  expect(members.filter(s=>bracketSkillIds.includes(s.id as typeof bracketSkillIds[number])).map(s=>s.label)).toEqual(r.skills);
  expect(JSON.stringify(q)).toBe(before);expect(r.teacherApproved).toBe(false);expect(r.privateAssetInspected).toBe(false);
 });
 it("fails closed for every stale identity field and never applies a sibling's correction",()=>{
  const q=bank();
  for(const field of Object.keys(verified[0].identity)){
   const changed={...q,[field]:field==="marks"?99:`changed-${q[field as keyof BankQuestion]}`};
   if(field==="id")expect(bracketReviewFor(changed)).toBeNull();
   else expect(bracketReviewFor(changed)).toMatchObject({status:"stale_identity",skills:[],needsTeacherReview:true});
   expect(canonicalInsightSkills(changed).some(s=>s.id.startsWith("canonical:bracket-"))).toBe(false);
  }
 });
 it("retains ambiguous and method-dependent records and flags unknown legacy bracket wording",()=>{
  for(const r of review.reviews.filter(r=>r.needsTeacherReview)){
   expect(canonicalInsightSkills(bank(r)).every(s=>s.reviewReason&& !s.id.startsWith("canonical:bracket-"))).toBe(true);
  }
  for(const skill of ["Expand and simplify two brackets","Expand and simplify two linear brackets","Expand brackets and collect like terms"]){
   const q={...bank(),id:"not-inspected",skill};expect(canonicalInsightSkills(q)[0]).toMatchObject({originalLabels:[skill],reviewReason:expect.any(String)});
   expect(canonicalInsightSkills(q).some(s=>s.id.startsWith("canonical:bracket-"))).toBe(false);
  }
 });
 it("retains other genuine skills and exposes original labels",()=>{
  const r=verified.find(r=>r.identity.series==="June 2025"&&r.identity.paperCode==="2H")!;
  const members=canonicalInsightSkills(bank(r));expect(members.some(s=>/index|indices/i.test(s.label))).toBe(true);
  expect(members.find(s=>s.id===bracketSkillIds[0])?.originalLabels.length).toBeGreaterThan(0);
 });
 it("counts complete questions once per canonical skill, separately by actual tier",()=>{
  const questions=verified.map(bank),model=buildInsightsModel(questions);
  for(const [tier,expected] of [["Foundation",[8,3,5]],["Higher",[2,3,1]]] as const){
   const rows=skillCoverage(model,{...emptyCoverageFilters,tier});
   expect(bracketSkillNames.map(skill=>rows.filter(r=>r.skill===skill).reduce((n,r)=>n+r.questions,0))).toEqual(expected);
  }
  const first=questions[0];
  const duplicate={...first,id:"extra-mapping",skill:bracketSkillNames[0],sourceId:first.sourceId};
  const originalCount=skillCoverage(model).find(r=>r.skill===bracketSkillNames[0])!.questions;
  expect(skillCoverage(buildInsightsModel([...questions,duplicate])).find(r=>r.skill===bracketSkillNames[0])!.questions).toBe(originalCount);
  // A multi-skill whole question may count in each genuine category, never twice within one category.
  expect(model.groups).toHaveLength(21);expect(verified).toHaveLength(22);
 });
 it("shares canonical filters with Insights and keeps original-label and flexible keyword search",()=>{
  const questions=verified.map(bank),index=buildQuestionSkillIndex(questions),model=buildInsightsModel(questions);
  for(const name of bracketSkillNames){
   const selected=questions.filter(q=>matchesQuestionSkill(q,name,index));
   expect(new Set(buildInsightsModel(selected).groups.map(g=>g.group.key)).size).toBe(skillCoverage(model,{...emptyCoverageFilters,skill:name}).find(r=>r.skill===name)?.questions);
  }
  const single=questions.find(q=>canonicalInsightSkills(q).some(s=>s.id===bracketSkillIds[0]))!;
  expect(matchesQuestionKeywords(single,"double brackets",index)).toBe(false);
  expect(matchesQuestionKeywords(single,"Original title",index)).toBe(true);
  expect(matchesQuestionSkill(single,"original:"+single.skill,index)).toBe(true);
  const sums=questions.filter(q=>matchesQuestionSkill(q,bracketSkillNames[1],index));
  expect(sums.every(q=>!matchesQuestionKeywords(q,"double brackets",index))).toBe(true);
  expect(questions.filter(q=>matchesQuestionKeywords(q,"double brackets",index))).toHaveLength(6);
  expect(coverageCsv(skillCoverage(model,{...emptyCoverageFilters,skill:bracketSkillNames[2]}),{developing:5,good:10})).toContain(bracketSkillNames[2]);
 });
 it("requires public source provenance and pending teacher approval, with no private paths",()=>{
  for(const r of review.reviews){expect(r.source.url).toMatch(/^https:\/\/pmt\.physicsandmathstutor\.com\//);expect(r.source.sha256).toMatch(/^[a-f0-9]{64}$/);expect(r.source.page).toBeGreaterThan(0);expect(r.teacherApproved).toBe(false);}
  expect(JSON.stringify(review)).not.toMatch(/storage_path|signedURL|token|password/);
 });
});

// The committed report is a dated census, not a live database assertion.
// Its provenance and runtime subset must remain internally consistent.
import sourceAudit from "../docs/bracket-performance-audit/bracket-source-audit.json";
import sourceManifest from "../docs/bracket-performance-audit/public-source-manifest.json";
import calculationReport from "../docs/bracket-performance-audit/coverage-and-performance.json";
describe("audit evidence integrity",()=>{
 it("accounts for all source-inspected candidates and pending teacher review",()=>{
  expect(sourceAudit.records).toHaveLength(165);expect(new Set(sourceAudit.records.map(r=>r.identity.id)).size).toBe(165);
  expect(sourceAudit.records.filter(r=>r.status==="source_verified")).toHaveLength(22);
  expect(sourceAudit.records.filter(r=>r.needsTeacherReview)).toHaveLength(25);
  expect(review.reviews).toEqual(sourceAudit.records.filter(r=>r.status==="source_verified"||r.needsTeacherReview).map(({originalSkill,specification,topic,...r})=>r));
 });
 it("links every examined task to an archived public source hash",()=>{
  expect(sourceManifest).toHaveLength(71);
  for(const r of sourceAudit.records)expect(sourceManifest.some(s=>s.url===r.source.url&&s.sha256===r.source.sha256&&s.series===r.identity.series&&s.paper===r.identity.paperCode)).toBe(true);
 });
 it("records identical population hashes and denominators for every same-question comparison point",()=>{
  for(const c of calculationReport.comparisons.filter(c=>c.sameQuestions)){
   expect(new Set(c.rows.map(r=>r.populationSha256)).size).toBeLessThanOrEqual(1);
   expect(new Set(c.rows.map(r=>r.withData)).size).toBeLessThanOrEqual(1);
   expect(c.rows.every(r=>r.withData+r.missingData===c.baseCount)).toBe(true);
  }
 });
});
