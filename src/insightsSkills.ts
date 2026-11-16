import {bracketCanonicalSkill,bracketReviewFor,replacedBracketLabels,type SkillQuestion} from "./bracketSkillClassification";
import mapping from "./insightsSkillAliases.json";

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
 const bracket=bracketCanonicalSkill(original);
 if(bracket)return {...bracket,originalLabels:[original],reviewReason:null,rationale:"Focused bracket category; source-verified overlays are bound to individual records, never guessed from a legacy title."};
 const reviewReason=review.get(key)||(/\.\.\.|…/.test(original)?"Truncated source wording: retain separately until the complete original skill is verified.":null);
 return {id:group?`canonical:${group.id}`:`stored:${key}`,label:group?.label||cleanInsightSkill(original),originalLabels:[original],reviewReason,rationale:group?.rationale||"Retained as stored, apart from case/spacing identity. No semantic alias is inferred."};
}
export function canonicalInsightSkills(q:SkillQuestion):InsightSkill[]{
 const result=new Map<string,InsightSkill>();
 for(const raw of q.skill.split(";").filter(knownInsightSkill)){
  const skill=resolveInsightSkill(raw),existing=result.get(skill.id);
  if(existing){if(!existing.originalLabels.includes(raw))existing.originalLabels.push(raw);}else result.set(skill.id,skill);
 }
 const reviewed=bracketReviewFor(q);
 if(reviewed?.skills.length){
  const replaced:string[]=[];
  for(const [id,membership] of result){
   if(membership.originalLabels.every(raw=>replacedBracketLabels.has(normalInsightSkill(raw))||reviewed.excludeOriginalLabels.some(label=>normalInsightSkill(label)===normalInsightSkill(raw)))){replaced.push(...membership.originalLabels);result.delete(id);}
  }
  for(const label of reviewed.skills){const canonical=resolveInsightSkill(label);result.set(canonical.id,{...canonical,originalLabels:replaced.length?replaced:[q.skill],rationale:reviewed.observation});}
 }else if(reviewed?.needsTeacherReview){
  for(const membership of result.values())membership.reviewReason=reviewed.observation;
 }else if(!reviewed){
  for(const membership of result.values())if(membership.originalLabels.some(raw=>replacedBracketLabels.has(normalInsightSkill(raw))))membership.reviewReason="Bracket content has not been verified for this record. The stored classification is retained; teacher source review is required before assigning one of the three focused bracket categories.";
 }
 return [...result.values()];
}
/** Ambiguous labels keep the pre-existing topic/tier partitions. They are not
 * promoted into a typed canonical skill just because the text looks similar. */
export function insightSkillRowKey(skill:InsightSkill,topic:string,tier:string){
 return skill.reviewReason?JSON.stringify([skill.id,normalInsightSkill(topic),tier]):skill.id;
}

/** Shared wording/alias search for Insights and the Question Bank. */
export function insightSkillMatchesText(skill:InsightSkill,query:string,originals:Iterable<string>=skill.originalLabels){
 const text=normalInsightSkill(query);return !text||resolveInsightSkill(query).id===skill.id||normalInsightSkill(skill.label).includes(text)||[...originals].some(raw=>normalInsightSkill(raw).includes(text));
}
