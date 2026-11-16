import {describe,it,expect} from "vitest";
import rules from "./insightsSkillAliases.json";
import report from "../docs/insights-skill-audit/atomic-labels.json";
import {canonicalInsightSkills,normalInsightSkill,resolveInsightSkill} from "./insightsSkills";
import {buildInsightsModel,skillCoverage,tierCoverage,emptyCoverageFilters,coverageCsv,defaultCoverageThresholds} from "./questionBankInsights";
import type {BankQuestion} from "./questionData";
const q=(id:string,skill:string,extra:Partial<BankQuestion>={}):BankQuestion=>({id,sourceId:`EDX-F-JUNE2022-1F-Q${id}`,questionNumber:id,paperId:"paper-f",examBoard:"Edexcel",paperCode:"1F",topic:"Algebra",skill,tier:"Foundation",sourceTier:"Foundation",calculator:false,sourceCalculator:false,grade:3,marks:2,series:"June 2022",ao:"AO1",challenge:"Standard",prompt:"",answer:"",tags:[],gradePerformance:{4:75},questionPath:`${id}/q.png`,markSchemePath:`${id}/m.png`,imageCrops:{question:{top:0,bottom:0,left:0,right:0},mark:{top:0,bottom:0,left:0,right:0}},cropReview:{question:"approved",mark:"approved"},...extra});
const filters=(extra:Partial<typeof emptyCoverageFilters>)=>({...emptyCoverageFilters,...extra});
describe("controlled Insights wording registry",()=>{
 it("has unique IDs and unambiguous exact aliases with no chains or tier-based rules",()=>{
  expect(new Set(rules.groups.map(g=>g.id)).size).toBe(rules.groups.length);
  const seen=new Map<string,string>();for(const g of rules.groups)for(const alias of g.aliases){const key=normalInsightSkill(alias);expect([undefined,g.id]).toContain(seen.get(key));seen.set(key,g.id);expect(resolveInsightSkill(alias).id).toBe(`canonical:${g.id}`);expect(resolveInsightSkill(alias).label).toBe(g.label);}
 });
 it("agrees with every raw-label entry in the committed full-bank audit",()=>{
  expect(report.length).toBeGreaterThan(600);for(const row of report){const resolved=resolveInsightSkill(row.original_label);expect(resolved.id,row.original_label).toBe(row.canonical_id);expect(resolved.label,row.original_label).toBe(row.canonical_label);expect(!!resolved.reviewReason,row.original_label).toBe(!!row.review_reason);}
 });
 it.each([
  ['Solve linear equations','Solve quadratic equations'],['Solve linear equations','Solve simultaneous linear equations'],['Solve simultaneous linear equations','Solve simultaneous linear and quadratic equations'],['Solve two simultaneous equations','Solve simultaneous linear equations'],['Solving equations','Solve linear equations'],['Solving equations','Solve quadratic equations'],['Solve linear inequalities','Solve linear equations'],['Estimate the mean from grouped data','Estimate the median from grouped data'],['Properties of 2D shapes','Properties of 3D shapes'],['Expand and simplify two linear brackets','Expand and simplify three linear brackets'],['Convert positive standard form to an ordinary number','Convert negative standard form to an ordinary number'],['Recurring decimals and their corresponding fractions','Terminating decimals and their corresponding fractions'],['Round to significant figures','Round to two significant figures'],['Pythagoras','Pythagoras and trigonometry'],['Factorise a linear expression','Factorise a quadratic expression']
 ])("never merges mathematically different or underspecified labels: %s / %s",(a,b)=>expect(resolveInsightSkill(a).id).not.toBe(resolveInsightSkill(b).id));
 it("recognises reordered terms and equivalent median-class wording but protects inverse scale operations",()=>{
  expect(resolveInsightSkill('Roots and powers').id).toBe(resolveInsightSkill('Powers and roots').id);
  expect(resolveInsightSkill('Identify the median class').id).toBe(resolveInsightSkill('Identify the class containing the median').id);
  expect(resolveInsightSkill('Find a real distance using a map scale').id).toBe(resolveInsightSkill('Use a map scale to calculate real distance').id);
  expect(resolveInsightSkill('Calculate a map distance using a scale').id).not.toBe(resolveInsightSkill('Calculate a real distance using a map scale').id);
 });
 it("does not expand truncated words, guess typo corrections or classify new unseen labels",()=>{
  const raw='Translate situations or procedures into algebraic expressions, formulae or eq...';expect(resolveInsightSkill(raw).reviewReason).toContain("Truncated");expect(resolveInsightSkill(raw).id).not.toBe(resolveInsightSkill('Translate situations or procedures into algebraic expressions, formulae or equations').id);expect(resolveInsightSkill('Solv quadratic equashuns').label).toBe('Solv quadratic equashuns');expect(resolveInsightSkill('Solving equations').reviewReason).toBeTruthy();
 });
 it("preserves original case/spacing evidence while collapsing repeated aliases within a record",()=>{
  const [skill]=canonicalInsightSkills({skill:' Solve a linear equation ;Solve linear equations;Solving linear equations; Unmapped'});expect(skill.label).toBe('Solving linear equations');expect(skill.originalLabels).toEqual([' Solve a linear equation ','Solve linear equations','Solving linear equations']);
 });
});
describe("Insights canonical resource counting",()=>{
 it("unions topics and tiers, deduplicates multipart aliases and keeps every original label",()=>{
  const all=[q('1a','Solve a linear equation',{sourceId:'2022_1F_Q1a',questionNumber:'1a'}),q('1b','Solve linear equations; Solving linear equations',{sourceId:'2022_1F_Q1b',questionNumber:'1b',topic:'Number'}),q('2','Solving linear equations',{sourceTier:'Higher',tier:'Higher',paperId:'paper-h'})],before=JSON.stringify(all),m=buildInsightsModel(all),rows=skillCoverage(m);
  expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({skill:'Solving linear equations',records:3,questions:2,available:2,usable:2,topic:'Algebra | Number',tier:'Foundation | Higher'});expect(rows[0].originalLabels).toHaveLength(4);expect(m.skills).toEqual(['Solving linear equations']);expect(JSON.stringify(all)).toBe(before);
  expect(tierCoverage(m,defaultCoverageThresholds).find(t=>t.tier==='Foundation')).toMatchObject({skills:1,questions:1});
 });
 it("counts one record and one whole question even when the same part has several aliases",()=>{
  const row=skillCoverage(buildInsightsModel([q('1','Solve a linear equation; Solve linear equations; Solve a linear equation')]))[0];expect(row).toMatchObject({records:1,questions:1,usable:1});
 });
 it("filters the canonical group through an original alias, without discarding its other aliases",()=>{
  const m=buildInsightsModel([q('1','Solve a linear equation'),q('2','Solve linear equations'),q('3','Solving linear equations')]);for(const text of ['Solve a linear equation','Solving linear equations','Solve linear'])expect(skillCoverage(m,filters({skill:text}))[0].questions).toBe(3);
 });
 it("keeps topic/calculator/board filters on the same part and whole-question performance unchanged",()=>{
  const all=[q('1a','Solve a linear equation',{sourceId:'2022_1F_Q1a',questionNumber:'1a',gradePerformance:{4:50}}),q('1b','Solve quadratic equations',{sourceId:'2022_1F_Q1b',questionNumber:'1b',topic:'Number',gradePerformance:{4:100},marks:3})],m=buildInsightsModel(all);
  expect(skillCoverage(m,filters({skill:'Solve linear equations',topic:'Number'}))).toEqual([]);expect(skillCoverage(m,filters({skill:'Solve linear equations',topic:'Algebra',targetGrade:'4'}))[0]).toMatchObject({records:1,questions:1,medianPercent:80});
 });
 it("retains ambiguous original topic/tier partitions and never infers equation type from Foundation or grade",()=>{
  const m=buildInsightsModel([q('1','Solving equations'),q('2','Solving equations',{topic:'Number'}),q('3','Solving equations',{tier:'Higher',sourceTier:'Higher',grade:7}),q('4','Solve linear equations'),q('5','Solve quadratic equations'),q('6','Solve simultaneous linear equations')]);
  const rows=skillCoverage(m);expect(rows).toHaveLength(6);expect(rows.filter(r=>r.skill==='Solving equations')).toHaveLength(3);expect(rows.filter(r=>r.reviewReason)).toHaveLength(3);expect(rows.filter(r=>!r.reviewReason).map(r=>r.questions)).toEqual([1,1,1]);
 });
 it("makes the same canonical counts and original labels visible in CSV and tier summaries",()=>{
  const m=buildInsightsModel([q('1','Collect like terms'),q('2','Collecting like terms',{topic:'Number'}),q('3','Solving equations')]),rows=skillCoverage(m),csv=coverageCsv(rows,defaultCoverageThresholds);expect(rows.find(r=>r.skill==='Collecting like terms')).toMatchObject({questions:2,usable:2});expect(tierCoverage(m,defaultCoverageThresholds)[0].skills).toBe(2);expect(csv).toContain('"Original skill labels (JSON)"');expect(csv).toContain('Collecting like terms');expect(csv).toContain('Collect like terms');expect(csv).toContain('Needs review — unmerged');
 });
 it("shows deterministic fallback labels and counts independent of record order",()=>{
  const a=q('1',' Expanding brackets '),b=q('2','EXPANDING BRACKETS');const first=skillCoverage(buildInsightsModel([a,b])),second=skillCoverage(buildInsightsModel([b,a]));expect(first).toEqual(second);
 });
});
