import type { Bundle } from "./shadowBundle";
import { foundationCheck } from "./shadowQaFoundation";

export const shadowQaRuleVersion = "shadow-qa-3";
export const linkKinds = ["exact-replacement", "skill-variant", "lower-demand-variant", "unsuitable"] as const;
export type LinkKind = typeof linkKinds[number];
export type Part = { question: string; marks: number; topic: string; skill: string; proposed_original_question_id: string };
export type LinkEvidence = { part: string; kind: LinkKind; evidence: string };
export type Check = { state: "pass" | "exception"; evidence: string; method?: "part-calculations" };
export type QaQuestion = {
 number: number;
 status: "qa-passed" | "exception";
 mathematics: Check;
 marking: Check;
 skill: Check;
 links: LinkEvidence[];
 annotation?: string;
};
type Arithmetic = readonly [readonly (number | "+" | "-" | "*" | "/")[], number | readonly [number, number]];
type Calculation = Arithmetic | { readonly method: string; readonly input: unknown; readonly expected: unknown };
export type Rule = {
 mathematics: string;
 marking: string;
 skill: string;
 annotation?: string;
 markingException?: boolean;
 calculations?: Readonly<Record<string, Calculation>>;
 links: readonly { part: string; kind: LinkKind; evidence: string; originalHash: string }[];
};
export type RulePack = { manifestHash: string; questions: Readonly<Record<number, Rule>> };
export type QaEvent = {
 id: number;
 actor_id?: string;
 created_at?: string;
 kind: "run" | "audit" | "decision" | "batch";
 payload: {
  questions?: QaQuestion[];
  sample?: number[];
  number?: number;
  outcome?: "pass" | "substantive-error" | Decision;
  note?: string;
  numbers?: number[];
  manifestHash?: string;
  bundleHash?: string;
  ruleVersion?: string;
  batchVerified?: boolean;
 };
};
export const decisions = ["approved", "approved-with-changes", "held", "rejected"] as const;
export type Decision = typeof decisions[number];

export function parseShadowQaPack(value: unknown): RulePack {
 const isObject = (item: unknown): item is Record<string, unknown> =>
  typeof item === "object" && item !== null && !Array.isArray(item);
 const isEvidence = (item: unknown): item is string => typeof item === "string" && !!item.trim() && item.length <= 4000;
 const isHash = (item: unknown) => typeof item === "string" && /^[0-9a-f]{64}$/.test(item);
 if (!isObject(value) || !isHash(value.manifestHash) || !isObject(value.questions)
  || Object.keys(value.questions).length < 1 || Object.keys(value.questions).length > 50) {
  throw Error("Invalid QA evidence pack.");
 }
 for (const [number, rule] of Object.entries(value.questions)) {
  if (!/^([1-9]|[1-4][0-9]|50)$/.test(number) || !isObject(rule)
   || ![rule.mathematics, rule.marking, rule.skill].every(isEvidence)
   || (rule.annotation !== undefined && !isEvidence(rule.annotation))
   || (rule.markingException !== undefined && typeof rule.markingException !== "boolean")
   || !Array.isArray(rule.links) || rule.links.length > 26) throw Error("Invalid question evidence.");
  const refs = new Set<string>();
  for (const link of rule.links) {
   if (!isObject(link) || typeof link.part !== "string" || !/^Q[0-9]{2}[a-z]*$/.test(link.part)
    || Number(link.part.slice(1, 3)) !== Number(number) || refs.has(link.part)
    || !linkKinds.some(kind => kind === link.kind) || !isEvidence(link.evidence) || !isHash(link.originalHash)) {
    throw Error("Invalid original-link evidence.");
   }
   refs.add(link.part);
  }
  if (rule.calculations !== undefined) {
   if (!isObject(rule.calculations) || Object.keys(rule.calculations).length > 26) throw Error("Invalid part calculations.");
   for (const [part, calculation] of Object.entries(rule.calculations)) {
    if (!/^Q[0-9]{2}[a-z]*$/.test(part) || Number(part.slice(1, 3)) !== Number(number)) throw Error("Invalid independent calculation.");
    if (isObject(calculation) && typeof calculation.method === "string" && /^[a-z-]{1,30}$/.test(calculation.method)
     && "input" in calculation && "expected" in calculation) continue;
    if (!Array.isArray(calculation) || calculation.length !== 2) throw Error("Invalid independent calculation.");
    const [tokens, expected] = calculation;
    const integer = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && Math.abs(value) <= 1e9;
    if (!Array.isArray(tokens) || tokens.length < 3 || tokens.length > 50
     || !tokens.every(token => integer(token) || ["+", "-", "*", "/"].includes(token))
     || !(integer(expected) || (Array.isArray(expected) && expected.length === 2
      && expected.every(integer) && expected[1] > 0))) throw Error("Invalid independent calculation.");
   }
  }
 }
 return value as unknown as RulePack;
}

function arithmeticPass(calculation: Arithmetic) {
 const [tokens, expected] = calculation;
 const stack: Array<[bigint, bigint]> = [];
 for (const token of tokens) {
  if (typeof token === "number") { stack.push([BigInt(token), 1n]); continue; }
  const right = stack.pop();
  const left = stack.pop();
  if (!left || !right || (token === "/" && right[0] === 0n)) return false;
  const [a, b] = left;
  const [c, d] = right;
  stack.push(token === "+" ? [a*d + c*b, b*d] : token === "-" ? [a*d - c*b, b*d] :
   token === "*" ? [a*c, b*d] : [a*d, b*c]);
 }
 const [numerator, denominator] = typeof expected === "number" ? [expected, 1] : expected;
 return stack.length === 1 && stack[0][0] * BigInt(denominator) === BigInt(numerator) * stack[0][1];
}

export function isBundlePath(path: string, paperId: string) {
 return /^shadow-paper-intake\/[0-9a-f-]+\/set-[a-z0-9-]+\/[0-9a-f-]+\/bundles\/[0-9a-f]{64}\/intake\.json$/i.test(path)
  && path.split("/")[1] === paperId;
}

export function evaluateShadowQa(
 bundle: Bundle, taxonomy: ReadonlySet<string>, originalHashes: ReadonlyMap<string, string>, packs: readonly RulePack[],
): QaQuestion[] {
 const manifestHash = bundle.files.find(file => file.path === "intake.json")?.hash;
 const pack = packs.find(candidate => candidate.manifestHash === manifestHash);
 const groups = new Map<number, Part[]>();
 for (const part of bundle.manifest.parts as Part[]) {
  const number = Number(part.question.slice(1, 3));
  const group = groups.get(number) ?? [];
  group.push(part);
  groups.set(number, group);
 }
 return [...groups.entries()].sort(([a], [b]) => a - b).map(([number, parts]) => {
  const rule = pack?.questions[number];
  const hasLabels = parts.every(part => part.skill.split(";").every(label => taxonomy.has(label.trim())));
  const missing = parts.filter(part => !rule?.calculations?.[part.question]).map(part => part.question);
  const mathPass = !!rule && missing.length === 0
   && parts.every(part => {
    const check = rule.calculations![part.question];
    return "method" in check ? foundationCheck(check.method, check.input, check.expected) : arithmeticPass(check);
   });
  const markingPass = mathPass && !rule?.markingException;
  const skillPass = !!rule && hasLabels;
  return {
   number, status: mathPass && markingPass && skillPass ? "qa-passed" : "exception",
   mathematics: { state: mathPass ? "pass" : "exception",
    evidence: !rule ? "No source-bound mathematical rule covers this question." :
     mathPass ? rule.mathematics : missing.length ? `Needs independently checkable mathematics for ${missing.join(", ")}.`
      : "An independent part calculation did not reproduce the expected answer.",
    ...(mathPass ? { method: "part-calculations" as const } : {}) },
   marking: { state: markingPass ? "pass" : "exception",
    evidence: mathPass && rule ? rule.marking : "Marking requires verified mathematical evidence." },
   skill: { state: skillPass ? "pass" : "exception",
    evidence: !hasLabels ? "One or more proposed labels are absent from the live taxonomy." :
     rule?.skill ?? "Labels exist in the taxonomy. Evidence of the assessed skill is still required." },
   links: parts.map(part => {
    const evidence = rule?.links.find(link => link.part === part.question);
    return evidence && originalHashes.get(part.proposed_original_question_id) === evidence.originalHash
     ? { part: part.question, kind: evidence.kind, evidence: evidence.evidence }
     : { part: part.question, kind: "unsuitable" as const,
      evidence: "A current original image and matching part evidence are required for replacement." };
   }),
   annotation: rule?.annotation,
  };
 });
}

export function reviewState(events: readonly QaEvent[]) {
 const run = [...events].reverse().find(event => event.kind === "run");
 const current = run ? events.filter(event => event.id > run.id) : [];
 const audited = new Set<number>();
 const recorded = new Map<number, Decision>();
 const notes = new Map<number, string>();
 let failed = false;
 let batched = false;
 for (const event of current) {
  const { number, outcome, numbers, note } = event.payload;
  if (event.kind === "audit" && outcome === "substantive-error") failed = true;
  if (event.kind === "audit" && outcome === "pass" && number !== undefined) audited.add(number);
  if (event.kind === "decision" && number !== undefined && outcome && outcome !== "pass" && outcome !== "substantive-error") {
   recorded.set(number, outcome);
   if (note) notes.set(number, note); else notes.delete(number);
  }
  if (event.kind === "batch") {
   batched = true;
   for (const item of numbers ?? []) recorded.set(item, "approved");
  }
 }
 return { run, audited, failed, recorded, notes, batched };
}
