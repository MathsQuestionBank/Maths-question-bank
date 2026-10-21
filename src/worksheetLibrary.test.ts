import { describe,it,expect } from "vitest";
import { DEFAULT_FOLDER,normalizeAssessments,normalizeFolders,renameFolder,removeAssessment,upsertAssessment } from "./worksheetLibrary";
describe("My Worksheets V1.2a",()=>{
 const legacy=[{name:"Year 11 Assessment",ids:["a","b"],minutes:45,answers:true},{name:"Starter",ids:["c"],minutes:20}];
 it("retains old browser drafts and assigns stable migration IDs and Unfiled folders",()=>{
  const a=normalizeAssessments(legacy);expect(a).toHaveLength(2);expect(a[0].id).toBe("legacy-0");expect(a[0].folder).toBe(DEFAULT_FOLDER);expect(a[0].answers).toBe(true);
 });
 it("updating an opened draft does not create duplicates",()=>{
  const a=normalizeAssessments(legacy);const updated=upsertAssessment(a,{...a[0],name:"Updated"});expect(updated).toHaveLength(2);expect(updated[0].name).toBe("Updated");expect(updated[0].ids).toEqual(["a","b"]);
 });
 it("duplicates can have independent identities and edits",()=>{
  const a=normalizeAssessments(legacy);const b={...a[0],id:"new-copy",name:"Copy"};const items=upsertAssessment(a,b);expect(items).toHaveLength(3);expect(upsertAssessment(items,{...b,name:"Changed"})[0].name).toBe(a[0].name);
 });
 it("folder rename moves associated assessments",()=>{
  const a=normalizeAssessments([{...legacy[0],folder:"Year 10"}]);expect(renameFolder(a,"Year 10","Year 11")[0].folder).toBe("Year 11");
 });
 it("existing folder names are reconstructed even when folder metadata is missing",()=>{
  const a=normalizeAssessments([{...legacy[0],folder:"Exams"}]);expect(normalizeFolders([],a)).toEqual(["Unfiled","Exams"]);
 });
 it("delete removes only the intended ID",()=>{
  const a=normalizeAssessments(legacy);expect(removeAssessment(a,a[0].id).map(x=>x.name)).toEqual(["Starter"]);
 });
 it("bad storage records do not crash library migration",()=>{
  expect(normalizeAssessments({bad:true})).toEqual([]);expect(normalizeAssessments([null,{},legacy[0]])).toHaveLength(1);
 });
});
