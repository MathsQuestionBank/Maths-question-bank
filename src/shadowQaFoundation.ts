// Finite, source-transcribed Foundation methods. Unknown methods fail closed.
const integer = (value: unknown): value is number =>
 typeof value === "number" && Number.isSafeInteger(value) && Math.abs(value) <= 1e9;
const ints = (value: unknown, min: number, max = min): value is number[] =>
 Array.isArray(value) && value.length >= min && value.length <= max && value.every(integer);
const equal = (a: number[], b: number[]) => a.length === b.length && a.every((value, i) => value === b[i]);
const sorted = (value: number[]) => [...value].sort((a, b) => a - b);
const point = (value: unknown): value is [number, number] => ints(value, 2);
const compare = (a: bigint, b: bigint) => a === b ? 0 : a < b ? -1 : 1;

export function foundationCheck(method: string, input: unknown, expected: unknown): boolean {
 switch (method) {
  case "round":
   return ints(input, 2) && input[0] >= 0 && input[1] > 0 && integer(expected)
    && Math.floor((input[0] * 2 + input[1]) / (2 * input[1])) * input[1] === expected;
  case "ordered":
   return ints(input, 2, 60) && ints(expected, 2, 60) && equal(sorted(input), expected);
  case "root":
   return integer(input) && integer(expected) && expected >= 0 && BigInt(expected) ** 2n === BigInt(input);
  case "power":
   return ints(input, 2) && input[1] >= 0 && input[1] <= 32 && !(input[0] === 0 && input[1] === 0)
    && integer(expected) && BigInt(input[0]) ** BigInt(input[1]) === BigInt(expected);
  case "angle-kind": {
   if (!Array.isArray(input) || input.length !== 2 || !input.every(point)) return false;
   const [[a,b],[c,d]] = input as [number, number][];
   if (BigInt(a)*BigInt(d) === BigInt(b)*BigInt(c)) return false;
   const dot = BigInt(a)*BigInt(c) + BigInt(b)*BigInt(d);
   return expected === (dot > 0n ? "acute" : dot === 0n ? "right" : "obtuse");
  }
  case "angles-point":
   return ints(input, 2, 12) && input.every(value => value > 0 && value < 360)
    && integer(expected) && expected > 0 && input.reduce((sum, value) => sum + value, expected) === 360;
  case "ratio": {
   if (!ints(input, 2) || !ints(expected, 2) || [...input, ...expected].some(n => n <= 0)) return false;
   let [a,b] = input;
   while (b) [a,b] = [b,a%b];
   return equal(input.map(n => n/a), expected);
  }
  case "median": {
   if (!ints(input, 1, 100) || !integer(expected)) return false;
   const values = sorted(input);
   const lo = values[Math.floor((values.length-1)/2)];
   return lo + values[Math.floor(values.length/2)] === expected * 2;
  }
  case "range":
   return ints(input, 1, 100) && integer(expected) && Math.max(...input) - Math.min(...input) === expected;
  case "best-unit-rate": {
   if (!Array.isArray(input) || input.length < 2 || input.length > 20 || !input.every(point) || !integer(expected)
    || expected < 0 || expected >= input.length || !input.every(([size, cost]) => size > 0 && cost >= 0)) return false;
   const [size, cost] = input[expected];
   return input.every(([otherSize, otherCost], i) => i === expected
    || BigInt(cost)*BigInt(otherSize) < BigInt(otherCost)*BigInt(size));
  }
  case "translation":
   return Array.isArray(input) && input.length >= 2 && input.length <= 20 && point(expected)
    && input.every(pair => Array.isArray(pair) && pair.length === 2 && pair.every(point)
     && equal([pair[1][0]-pair[0][0], pair[1][1]-pair[0][1]], expected));
  case "nth-term":
   return ints(input, 3, 40) && point(expected) && input.every((value, i) => value === expected[0]*(i+1)+expected[1]);
  case "exceeds-probability": {
   if (!Array.isArray(input) || input.length !== 2 || !ints(input[0], 1, 100) || !integer(input[1]) || !point(expected)) return false;
   const [outcomes, threshold] = input as [number[], number];
   return expected[1] > 0 && outcomes.filter(value => value > threshold).length * expected[1] === outcomes.length * expected[0];
  }
  case "paint": {
   if (!ints(input, 7) || typeof expected !== "boolean" || input.some(value => value <= 0)) return false;
   const [width,height,cutWidth,cutHeight,tins,decilitres,areaPerLitre] = input;
   if (cutWidth >= width || cutHeight >= height) return false;
   const area = BigInt(width)*BigInt(height)-BigInt(cutWidth)*BigInt(cutHeight);
   return expected === (BigInt(tins)*BigInt(decilitres)*BigInt(areaPerLitre) >= area*10n);
  }
  case "complement":
  case "complement-probability": {
   if (!Array.isArray(input) || input.length !== 2 || !ints(input[0], 1, 100) || !ints(input[1], 0, 100)
    || !ints(expected, 0, 100)) return false;
   const [universe, subset] = input as number[][];
   if (new Set(universe).size !== universe.length || !subset.every(value => universe.includes(value))) return false;
   const remaining = universe.filter(value => !subset.includes(value));
   return method === "complement" ? equal(sorted(remaining), sorted(expected))
    : point(expected) && expected[1] > 0 && remaining.length*expected[1] === universe.length*expected[0];
  }
  case "linear-solution":
  case "linear-bound": {
   if (!ints(input, 4) || !point(expected)) return false;
   const [a,b,c,d] = input.map(BigInt);
   const [num,den] = expected.map(BigInt);
   return den > 0n && a !== c && (a-c)*num === (d-b)*den && (method === "linear-solution" || a > c);
  }
  case "line": {
   if (!Array.isArray(input) || input.length < 2 || input.length > 20 || !input.every(point) || !point(expected)
    || new Set(input.map(pair => pair[0])).size < 2) return false;
   return input.every(([x,y]) => BigInt(y) === BigInt(expected[0])*BigInt(x)+BigInt(expected[1]));
  }
  case "parallel":
   return point(input) && point(expected) && input[0] === expected[0] && input[1] !== expected[1];
  case "compare":
   return ints(input, 2) && expected === compare(BigInt(input[0]), BigInt(input[1]));
  default:
   return false;
 }
}
