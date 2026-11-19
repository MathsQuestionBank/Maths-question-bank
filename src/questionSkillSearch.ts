import type {BankQuestion} from "./questionData";
import {canonicalInsightSkills,insightSkillMatchesText,resolveInsightSkill,type InsightSkill} from "./insightsSkills";
import {bracketSearchIntent} from "./bracketSkillClassification";
export function buildQuestionSkillIndex(questions:BankQuestion[]) {
 const memberships=new Map(questions.map(q=>[q.id,canonicalInsightSkills(q)]));
 const originals=new Map<string,Set<string>>(),names=new Map<string,string>();
 for(const list of memberships.values())for(const skill of list){
  if(!originals.has(skill.id))originals.set(skill.id,new Set());
  for(const raw of skill.originalLabels)originals.get(skill.id)!.add(raw);
  const old=names.get(skill.id),order=(s:string)=>(s===s.toUpperCase()?"1":"0")+s;
  if(!old||order(skill.label).localeCompare(order(old),"en-GB")<0)names.set(skill.id,skill.label);
 }
 return {memberships,originals,labels:[...names.values()].sort((a,b)=>a.localeCompare(b))};
}
export type QuestionSkillIndex=ReturnType<typeof buildQuestionSkillIndex>;
export function matchesQuestionSkill(q:BankQuestion,selected:string,index:QuestionSkillIndex) {
 if(selected==='All')return true;
 if(selected.startsWith('original:'))return q.skill===selected.slice(9);
 const id=resolveInsightSkill(selected).id;
 return (index.memberships.get(q.id)||[]).some(skill=>skill.id===id);
}
export function matchesQuestionKeywords(q:BankQuestion,query:string,index:QuestionSkillIndex) {
 const text=query.trim();if(!text)return true;
 const memberships=index.memberships.get(q.id)||[];
 // Explicit bracket intent is a category query, not a broad title substring.
 // In particular a sum of two single brackets is never a double-bracket match.
 const bracket=bracketSearchIntent(text);
 if(bracket)return memberships.some(skill=>skill.id===bracket.id);
 const exact=resolveInsightSkill(text);
 if(exact.id.startsWith('canonical:'))return memberships.some(skill=>skill.id===exact.id);
 if([q.topic,q.skill,q.prompt].join(' ').toLowerCase().includes(text.toLowerCase()))return true;
 return memberships.some(skill=>insightSkillMatchesText(skill,text,index.originals.get(skill.id)));
}
export function displayedQuestionSkills(q:BankQuestion,index:QuestionSkillIndex):InsightSkill[]{
 return index.memberships.get(q.id)||[];
}
