import {describe,expect,it} from "vitest";
import {gradesForTier} from "./gradeBands";

describe("question-bank grade-performance labels",()=>{
 it("displays exactly G1–G5 for Foundation papers",()=>{
  expect(gradesForTier("Foundation")).toEqual([1,2,3,4,5]);
 });
 it("retains G4–G9 for Higher papers",()=>{
  expect(gradesForTier("Higher")).toEqual([4,5,6,7,8,9]);
 });
 it("offers grades 1–9 when searching both tiers",()=>{
  expect(gradesForTier("All")).toEqual([1,2,3,4,5,6,7,8,9]);
 });
});
