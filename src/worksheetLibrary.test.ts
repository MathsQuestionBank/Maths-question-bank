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
 it("ignores damaged entries rather than crashing the library",()=>{
  expect(normaliseAssessments([null,{},legacy])).toHaveLength(1);
 });
});