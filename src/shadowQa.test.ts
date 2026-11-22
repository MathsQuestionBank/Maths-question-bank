import { describe, expect, it } from "vitest";
import { evaluateShadowQa, isBundlePath, parseShadowQaPack, reviewState, type QaEvent, type RulePack } from "./shadowQa";
import type { Bundle } from "./shadowBundle";

const part = { question: "Q01", marks: 2, topic: "Number", skill: "Fractions", proposed_original_question_id: "original" };
const bundle: Bundle = {
 paperId: "paper", set: "Set 1", hash: "bundle", questions: 1, parts: 1, marks: 2,
 files: [{ path: "intake.json", hash: "manifest", bytes: new Uint8Array(), contentType: "application/json" }],
 manifest: { parts: [part] },
};
const pack: RulePack = { manifestHash: "manifest", questions: {
 1: { mathematics: "Evaluate two halves.", marking: "The scheme awards the exact sum.",
  skill: "Add fractions using a common denominator, supported by the task.", calculations: { Q01: [[1, 2, "/", 1, 2, "/", "+"], 1] },
  links: [{ part: "Q01", kind: "lower-demand-variant", originalHash: "original-image", evidence: "Original needs a conversion." }] },
} };
const taxonomy = new Set(["Fractions"]);
const originals = new Map([["original", "original-image"]]);
const evaluate = (packs: readonly RulePack[] = [pack], labels = taxonomy, hashes = originals) =>
 evaluateShadowQa(bundle, labels, hashes, packs)[0];

describe("shadow QA evidence", () => {
 it("keeps question approval independent of replacement suitability", () => {
  expect(evaluate()).toMatchObject({ status: "qa-passed", links: [{ kind: "lower-demand-variant" }] });
  expect(evaluate([pack], taxonomy, new Map())).toMatchObject({ status: "qa-passed", links: [{ kind: "unsuitable" }] });
 });
 it("requires source-bound skill and marking evidence even for valid taxonomy labels", () => {
  expect(evaluate([{ ...pack, manifestHash: "different-source" }])).toMatchObject({
   status: "exception", mathematics: { state: "exception" }, skill: { state: "exception" },
  });
  expect(evaluate([pack], new Set())).toMatchObject({ status: "exception", skill: { state: "exception" } });
  expect(evaluate([{ ...pack, questions: { 1: { ...pack.questions[1], markingException: true } } }]))
   .toMatchObject({ status: "exception", mathematics: { state: "pass" }, marking: { state: "exception" } });
 });
 it("fails a calculation when the result disagrees with the marking evidence", () => {
  expect(evaluate([{ ...pack, questions: { 1: { ...pack.questions[1], calculations: { Q01: [[1, 1, "+"], 1] } } } }]))
   .toMatchObject({ status: "exception", mathematics: { state: "exception" } });
 });
 it("keeps written-only and partially checked multipart questions unresolved", () => {
  const rule = pack.questions[1];
  expect(evaluate([{ ...pack, questions: { 1: { ...rule, calculations: undefined } } }]))
   .toMatchObject({ status: "exception", mathematics: { state: "exception", evidence: expect.stringContaining("Q01") } });
  const multipart = { ...bundle, manifest: { parts: [{ ...part, question: "Q01a" }, { ...part, question: "Q01b" }] } };
  const partial = { ...pack, questions: { 1: { ...rule, calculations: { Q01a: [[1, 1, "+"], 2] as const } } } };
  expect(evaluateShadowQa(multipart, taxonomy, originals, [partial])[0])
   .toMatchObject({ status: "exception", mathematics: { evidence: expect.stringContaining("Q01b") } });
 });
 it("checks exact rational equality and rejects invalid expressions", () => {
  const rule = pack.questions[1];
  for (const calculation of [[[1, 3, "/"], [1, 3]], [[1, 0, "/"], 0], [[1, "+", 1], 2],
    [[1, 1_000_000_000, "/"], 0]] as const) {
   const result = evaluate([{ ...pack, questions: { 1: { ...rule, calculations: { Q01: calculation } } } }]);
   expect(result.mathematics.state).toBe(Array.isArray(calculation[1]) ? "pass" : "exception");
  }
 });
 it("rejects malformed private packs and cross-question link evidence", () => {
  const rule = pack.questions[1];
  const valid = { manifestHash: "a".repeat(64), questions: {
   1: { ...rule, links: [{ ...rule.links[0], originalHash: "b".repeat(64) }] },
  } };
  expect(parseShadowQaPack(valid)).toEqual(valid);
  expect(() => parseShadowQaPack({ ...valid, manifestHash: "other" })).toThrow(/Invalid QA evidence/);
  expect(() => parseShadowQaPack({ ...valid, questions: {
   1: { ...valid.questions[1], links: [{ ...valid.questions[1].links[0], part: "Q02" }] },
  } })).toThrow(/Invalid original-link/);
 });
 it("only opens ZIP intakes inside the matching paper folder", () => {
  const base = "shadow-paper-intake/123/set-1/456";
  const path = `${base}/bundles/${"a".repeat(64)}/intake.json`;
  expect(isBundlePath(path, "123")).toBe(true);
  expect(isBundlePath(path, "124")).toBe(false);
  expect(isBundlePath(`${base}/intake.json`, "123")).toBe(false);
 });
});

describe("review history", () => {
 it("tracks the active audit, records the batch and leaves individual decisions intact", () => {
  const events: QaEvent[] = [
   { id: 1, kind: "run", payload: { sample: [1, 3] } },
   { id: 2, kind: "audit", payload: { number: 1, outcome: "pass" } },
   { id: 3, kind: "decision", payload: { number: 2, outcome: "approved-with-changes", note: "Clarify an allowance." } },
   { id: 4, kind: "audit", payload: { number: 3, outcome: "pass" } },
   { id: 5, kind: "batch", payload: { numbers: [1, 3] } },
  ];
  const state = reviewState(events);
  expect(state.audited).toEqual(new Set([1, 3]));
  expect(state.recorded).toEqual(new Map([[2, "approved-with-changes"], [1, "approved"], [3, "approved"]]));
  expect(state.notes.get(2)).toBe("Clarify an allowance.");
 });
 it("escalates a failed audit and scopes decisions to the rule run", () => {
  const events: QaEvent[] = [
   { id: 1, kind: "run", payload: { ruleVersion: "one" } },
   { id: 2, kind: "audit", payload: { number: 1, outcome: "substantive-error" } },
   { id: 3, kind: "decision", payload: { number: 1, outcome: "held", note: "Crop" } },
  ];
  expect(reviewState(events)).toMatchObject({ failed: true, batched: false });
  expect(reviewState([...events, { id: 4, kind: "run", payload: { ruleVersion: "two" } }]))
   .toMatchObject({ failed: false, recorded: new Map() });
 });
});
