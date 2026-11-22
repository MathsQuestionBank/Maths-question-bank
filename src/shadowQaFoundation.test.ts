import { describe, expect, it } from "vitest";
import { foundationCheck } from "./shadowQaFoundation";

describe("independently checkable Foundation methods", () => {
 it.each([
  ["round", [1499, 1000], 1000, 2000],
  ["ordered", [5, 2, 4], [2, 4, 5], [2, 5, 4]],
  ["root", 144, 12, -12],
  ["power", [3, 4], 81, 12],
  ["angle-kind", [[1, 0], [1, 1]], "acute", "obtuse"],
  ["angles-point", [170, 90], 100, 110],
  ["ratio", [12, 18], [2, 3], [4, 6]],
  ["median", [9, 5, 1, 3], 4, 5],
  ["range", [9, 5, 1], 8, 9],
  ["translation", [[[1, 1], [3, 4]], [[2, 2], [4, 5]]], [2, 3], [3, 2]],
  ["nth-term", [3, 7, 11, 15], [4, -1], [3, 1]],
  ["exceeds-probability", [[10, 20, 30], 10], [2, 3], [1, 3]],
  ["paint", [10, 5, 2, 3, 2, 10, 25], true, false],
  ["complement", [[1, 2, 3], [2]], [1, 3], [1, 2]],
  ["complement-probability", [[1, 2, 3], [2]], [2, 3], [1, 3]],
  ["linear-solution", [2, 0, 0, 1], [1, 2], [1, 1]],
  ["linear-bound", [2, 8, 1, 4], [-4, 1], [4, 1]],
  ["line", [[0, 1], [3, 7]], [2, 1], [1, 2]],
  ["parallel", [3, 0], [3, 1], [3, 0]],
  ["best-unit-rate", [[5, 6], [10, 9]], 1, 0],
 ])("verifies %s independently and rejects a wrong expected result", (method, input, correct, wrong) => {
  expect(foundationCheck(method, input, correct)).toBe(true);
  expect(foundationCheck(method, input, wrong)).toBe(false);
 });
 it("holds unsupported, degenerate or ambiguous inputs for review", () => {
  expect(foundationCheck("chart-construction", [4, 5], true)).toBe(false);
  expect(foundationCheck("angle-kind", [[0, 0], [1, 1]], "right")).toBe(false);
  expect(foundationCheck("linear-bound", [1, 2, 2, 3], [-1, 1])).toBe(false);
  expect(foundationCheck("best-unit-rate", [[5, 5], [10, 10]], 0)).toBe(false);
  expect(foundationCheck("complement-probability", [[1, 1, 2], [1]], [1, 3])).toBe(false);
 });
});
