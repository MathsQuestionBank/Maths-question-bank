import { describe,expect,it } from "vitest";
import { reconcileAssessments } from "./assessmentReconciliation";
import type { SavedAssessment } from "./worksheetLibrary";
const local:SavedAssessment={id:"local-1",name:"Year 10",folder:"Algebra",ids:["q1","q2"],minutes:45};
const remote=(item:SavedAssessment,originBrowserId?:string)=>({cloudId:"uuid-1",item:{...item,id:"cloud-uuid-1",originBrowserId},createdAt:"2026-10-27T00:00:00Z"});
describe("safe account migration",()=>{
 it("identifies identical cloud copies by source browser ID",()=>{
  const result=reconcileAssessments([local],[remote(local,local.id)]);
  expect(result.alreadySynced).toHaveLength(1);expect(result.browserOnly).toHaveLength(0);
 });
 it("deduplicates identical copies even when legacy source IDs differ",()=>{
  const result=reconcileAssessments([local],[remote(local)]);
  expect(result.alreadySynced).toHaveLength(1);
 });
 it("never silently overwrites when local and cloud copies diverged",()=>{
  const changed={...local,name:"Renamed locally"};
  const result=reconcileAssessments([changed],[remote(local,local.id)]);
  expect(result.conflicts).toHaveLength(1);expect(result.browserOnly).toHaveLength(0);
 });
 it("preserves genuinely browser-only assessments for explicit migration",()=>{
  const result=reconcileAssessments([local],[]);
  expect(result.browserOnly).toEqual([local]);
 });
});
