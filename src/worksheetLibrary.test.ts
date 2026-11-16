import { describe,it,expect } from "vitest";
import { normaliseAssessments,replaceAssessment,removeAssessment,renameAssessment,moveAssessmentToFolder,makeWorksheetBackup,parseWorksheetBackup,mergeWorksheetBackup } from "./worksheetLibrary";
const legacy={name:"Year 10 Assessment",ids:["q1","q2"],minutes:45,answers:true,cover:true};
describe("saved worksheet library",()=>{
 it("migrates old browser drafts without losing question selection, settings or order",()=>{
  const items=normaliseAssessments([legacy]);
  expect(items[0]).toMatchObject({...legacy,id:"legacy-0",folder:"Unfiled"});
  expect(items[0].ids).toEqual(["q1","q2"]);
 });
 it("updating an existing saved assessment does not create a duplicate",()=>{
  const original=normaliseAssessments([legacy]);
  const result=replaceAssessment(original,{...original[0],minutes:60,name:"Revised"});
  expect(result).toHaveLength(1);expect(result[0].minutes).toBe(60);
 });
 it("folder moves and renames do not modify questions",()=>{
  const original=normaliseAssessments([legacy]);
  const moved=moveAssessmentToFolder(original,"legacy-0","Year 10");
  const renamed=renameAssessment(moved,"legacy-0","New name");
  expect(renamed[0]).toMatchObject({folder:"Year 10",name:"New name",ids:["q1","q2"]});
 });
 it("duplicating with new ID preserves original independently",()=>{
  const original=normaliseAssessments([legacy]);
  const result=replaceAssessment(original,{...original[0],id:"copy",ids:[...original[0].ids]});
  expect(result).toHaveLength(2);expect(result[0].name).toBe("Year 10 Assessment");
 });
 it("deleting a resource retains other saved assessments",()=>{
  const original=normaliseAssessments([legacy,{...legacy,name:"Other"}]);
  expect(removeAssessment(original,"legacy-0").map(x=>x.name)).toEqual(["Other"]);
 });
 it("backup preserves folders, assessment IDs, settings and question order",()=>{
  const first=normaliseAssessments([legacy])[0];
  const backup=makeWorksheetBackup([{...first,folder:"Year 10",exportMode:"both"}],["Year 10"],"2026-10-27T00:00:00.000Z");
  expect(backup).toMatchObject({format:"maths-question-bank-worksheets",version:1,exportedAt:"2026-10-27T00:00:00.000Z",folders:["Year 10"]});
  expect(backup.assessments[0]).toMatchObject({id:"legacy-0",folder:"Year 10",ids:["q1","q2"],exportMode:"both"});
 });
 it("rejects invalid or incompatible backups without import",()=>{
  expect(()=>parseWorksheetBackup({format:"other",version:1,assessments:[],folders:[]})).toThrow();
  expect(()=>parseWorksheetBackup({format:"maths-question-bank-worksheets",version:1,assessments:[{name:"Bad",ids:"wrong"}],folders:[]})).toThrow();
 });
 it("restores assessments while preserving existing IDs and question order",()=>{
  const current=normaliseAssessments([legacy]);
  const incoming=makeWorksheetBackup([{...current[0],name:"Imported",folder:"Imported folder"}],["Imported folder"],"2026-10-27");
  const merged=mergeWorksheetBackup(current,["Original"],parseWorksheetBackup(incoming));
  expect(merged.assessments).toHaveLength(2);
  expect(merged.assessments[0]).toEqual(current[0]);
  expect(merged.assessments[1].id).not.toBe(current[0].id);
  expect(merged.assessments[1].ids).toEqual(["q1","q2"]);
  expect(merged.folders).toEqual(["Original","Imported folder"]);
 });
 it("skips identical backups and labels changed versions",()=>{
  const current=normaliseAssessments([legacy]);
  const same=makeWorksheetBackup(current,[],"2026-10-27");
  const skipped=mergeWorksheetBackup(current,[],same);
  expect(skipped.added).toBe(0);expect(skipped.skipped).toBe(1);
  const changed=makeWorksheetBackup([{...current[0],minutes:60}],[],"2026-10-27");
  const restored=mergeWorksheetBackup(current,[],changed);
  expect(restored.assessments[1].name).toBe("Year 10 Assessment (Restored)");
  expect(restored.assessments[0].minutes).toBe(45);
  const twice=mergeWorksheetBackup(restored.assessments,[],makeWorksheetBackup([{...current[0],minutes:75}],[],"2026-10-27"));
  expect(twice.assessments[2].name).toBe("Year 10 Assessment (Restored 2)");
 });
 it("preserves student renumbering and image cover positions across saved assessment backups",()=>{
  const original=normaliseAssessments([{...legacy,renumberStudentQuestions:true,replaceSourceTotals:true,numberingMasks:{"EDX-H-JUNE2023-2H-Q02":{numberWidth:12,numberHeight:8,footerHeight:11}}}])[0];
  const backup=makeWorksheetBackup([original],[],"2026-11-02");
  const restored=parseWorksheetBackup(backup).assessments[0];
  expect(restored.renumberStudentQuestions).toBe(true);
  expect(restored.replaceSourceTotals).toBe(true);
  expect(restored.numberingMasks?.["EDX-H-JUNE2023-2H-Q02"]).toMatchObject({numberWidth:12,numberHeight:8,footerHeight:11});
 });
 it.each([true,false])("reopens %s sequential numbering and the complete reviewed print configuration",renumberStudentQuestions=>{
  const item=normaliseAssessments([{
   ...legacy,id:"saved-order",ids:["q3","q1","q2"],renumberStudentQuestions,
   exportMode:"teacher",teacherSourceMode:"sheet",performanceGrade:"8",printTeacherStats:true,
   numberingMasks:{q3:{numberWidth:4,numberHeight:3,numberTop:2,numberLeft:5,footerHeight:3,footerWidth:40,footerBottom:1,footerLeft:50,numberEnabled:true,footerEnabled:false,reviewedFor:"source-and-crop-fingerprint"}}
  }])[0];
  const restored=parseWorksheetBackup(JSON.parse(JSON.stringify(makeWorksheetBackup([item],[],"2026-11-15")))).assessments[0];
  expect(restored).toEqual(item);
  expect(restored).toMatchObject({ids:["q3","q1","q2"],renumberStudentQuestions,exportMode:"teacher",teacherSourceMode:"sheet",performanceGrade:"8",printTeacherStats:true});
  expect(restored.numberingMasks?.q3).toMatchObject({numberTop:2,numberLeft:5,footerBottom:1,footerLeft:50,numberEnabled:true,footerEnabled:false,reviewedFor:"source-and-crop-fingerprint"});
 });
 it("keeps legacy original numbering and supplies safe defaults for damaged print settings",()=>{
  const restored=normaliseAssessments([{...legacy,exportMode:"unknown",teacherSourceMode:"unknown",numberingMasks:[] }])[0];
  expect(restored).toMatchObject({exportMode:"both",teacherSourceMode:"inline",renumberStudentQuestions:false,numberingMasks:{}});
 });
 it.each([
  {renumberStudentQuestions:true},{replaceSourceTotals:false},{exportMode:"teacher" as const},
  {teacherSourceMode:"sheet" as const},{performanceGrade:"8"},{printTeacherStats:true},
  {numberingMasks:{q1:{numberWidth:4,numberHeight:4,footerHeight:3,numberLeft:6}}}
 ])("does not discard changed print settings as an identical backup: %o",patch=>{
  const current=normaliseAssessments([legacy]);
  const changed=makeWorksheetBackup([{...current[0],...patch}],[],"2026-11-15");
  expect(mergeWorksheetBackup(current,[],changed).added).toBe(1);
 });
 it("ignores damaged entries rather than crashing the library",()=>{
  expect(normaliseAssessments([null,{},legacy])).toHaveLength(1);
 });
});

describe("targeted shadow saved compatibility",()=>{
 const targetedShadow={version:1 as const,originalTitle:"Class assessment",difficulty:"same" as const,replacements:[{originalKey:"q1",originalIds:["q1a","q1b"],replacementKey:"r1",replacementIds:["r1a","r1b"],method:"alternative" as const}],unmatchedOriginalIds:["q2"]};
 it("preserves the parent link, multipart provenance and sequential exports through backup/reopen",()=>{
  const original=normaliseAssessments([{...legacy,id:"original"}])[0];
  const next={...original,id:"targeted",name:original.name+" — Targeted Shadow",ids:["r1a"],targetedShadow,linkedOriginalAssessmentId:"original-cloud-id",renumberStudentQuestions:true,exportMode:"both" as const};
  const list=replaceAssessment([original],next);
  const reopened=parseWorksheetBackup(JSON.parse(JSON.stringify(makeWorksheetBackup(list,[],"2026-11-16")))).assessments;
  expect(reopened[0]).toEqual(original);expect(reopened[1]).toEqual(next);expect(reopened[1].ids).toEqual(["r1a"]);
  expect(mergeWorksheetBackup([next],[],makeWorksheetBackup([{...next,targetedShadow:{...targetedShadow,difficulty:"easier"}}],[],"2026-11-16")).added).toBe(1);
 });
 it("ignores damaged optional provenance without losing the assessment",()=>{
  const item=normaliseAssessments([{...legacy,targetedShadow:{version:1,replacements:"damaged"}}])[0];
  expect(item.ids).toEqual(legacy.ids);expect(item.targetedShadow).toBeUndefined();
 });
});
