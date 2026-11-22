import type { Bundle } from "./shadowBundle";

export const shadowQaRuleVersion = "shadow-qa-1";
export const linkKinds = ["exact-replacement", "skill-variant", "lower-demand-variant", "unsuitable"] as const;
export type LinkKind = typeof linkKinds[number];
export type Part = { question: string; marks: number; topic: string; skill: string; proposed_original_question_id: string };
export type LinkEvidence = { part: string; kind: LinkKind; evidence: string };
export type Check = { state: "pass" | "exception"; evidence: string };
export type QaQuestion = {
 number: number;
 status: "qa-passed" | "exception";
 mathematics: Check;
 marking: Check;
 skill: Check;
 links: LinkEvidence[];
 annotation?: string;
};
export type Rule = {
 mathematics: string;
 marking: string;
 skill: string;
 annotation?: string;
 markingException?: boolean;
 calculation?: readonly [readonly (number | "+" | "-" | "*" | "/")[], number];
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
  if (rule.calculation !== undefined) {
   const calculation = rule.calculation;
   if (!Array.isArray(calculation) || calculation.length !== 2) throw Error("Invalid independent calculation.");
   const [tokens, expected] = calculation;
   if (!Array.isArray(tokens) || tokens.length < 3 || tokens.length > 100
    || !tokens.every(token => Number.isFinite(token) || ["+", "-", "*", "/"].includes(token))
    || !Number.isFinite(expected)) throw Error("Invalid independent calculation.");
  }
 }
 return value as unknown as RulePack;
}

function arithmeticPass(calculation: NonNullable<Rule["calculation"]>) {
 const [tokens, expected] = calculation;
 const stack: number[] = [];
 for (const token of tokens) {
  if (typeof token === "number") { stack.push(token); continue; }
  const right = stack.pop();
  const left = stack.pop();
  if (left === undefined || right === undefined || (token === "/" && right === 0)) return false;
  stack.push(token === "+" ? left + right : token === "-" ? left - right : token === "*" ? left * right : left / right);
 }
 return stack.length === 1 && Number.isFinite(stack[0]) && Math.abs(stack[0] - expected) < 1e-9;
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
  const mathPass = !!rule && (!rule.calculation || arithmeticPass(rule.calculation));
  const markingPass = mathPass && !rule?.markingException;
  const skillPass = !!rule && hasLabels;
  return {
   number, status: mathPass && markingPass && skillPass ? "qa-passed" : "exception",
   mathematics: { state: mathPass ? "pass" : "exception",
    evidence: !rule ? "No source-bound mathematical rule covers this question." :
     mathPass ? rule.mathematics : "The independent calculation did not reproduce the expected answer." },
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
