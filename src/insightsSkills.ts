import mapping from "./insightsSkillAliases.json";
import type {BankQuestion} from "./questionData";

// Deliberately no stemming, fuzzy matching, topic/tier/specification inference or
// prefix expansion. In particular truncated labels and generic equations are not aliases.
export const normalInsightSkill=(s:string)=>s.normalize("NFKC").trim().replace(/\s+/g," ").toLowerCase();
export const cleanInsightSkill=(s:string)=>s.normalize("NFKC").trim().replace(/\s+/g," ");
export const knownInsightSkill=(s:string)=>!!s.trim()&&!/^(unmapped|unknown|unspecified|n\/a)$/i.test(s.trim());
export type InsightSkill={id:string;label:string;originalLabels:string[];reviewReason:string|null;rationale:string};
const aliases=new Map<string,typeof mapping.groups[number]>();
for(const group of mapping.groups)for(const alias of group.aliases){
 const key=normalInsightSkill(alias);
 if(aliases.has(key)&&aliases.get(key)!.id!==group.id)throw new Error("Conflicting Insights skill aliases");
 aliases.set(key,group);
}
const review=new Map(mapping.requiresReview.map(r=>[normalInsightSkill(r.label),r.reason]));
export function resolveInsightSkill(original:string):InsightSkill {
 const key=normalInsightSkill(original),group=aliases.get(key);
 const reviewReason=review.get(key)||(/\.\.\.|…/.test(original)?"Truncated source wording: retain separately until the complete original skill is verified.":null);
 return {id:group?`canonical:${group.id}`:`stored:${key}`,label:group?.label||cleanInsightSkill(original),originalLabels:[original],reviewReason,rationale:group?.rationale||"Retained as stored, apart from case/spacing identity. No semantic alias is inferred."};
}
export function canonicalInsightSkills(q:Pick<BankQuestion,"skill">):InsightSkill[]{
 const result=new Map<string,InsightSkill>();
 for(const raw of q.skill.split(";").filter(knownInsightSkill)){
  const skill=resolveInsightSkill(raw),existing=result.get(skill.id);
  if(existing){if(!existing.originalLabels.includes(raw))existing.originalLabels.push(raw);}else result.set(skill.id,skill);
 }
 return [...result.values()];
}
/** Ambiguous labels keep the pre-existing topic/tier partitions. They are not
 * promoted into a typed canonical skill just because the text looks similar. */
export function insightSkillRowKey(skill:InsightSkill,topic:string,tier:string){
 return skill.reviewReason?JSON.stringify([skill.id,normalInsightSkill(topic),tier]):skill.id;
}
