import review from "./bracketSkillReview.json";
import type {BankQuestion} from "./questionData";

export const bracketSkillNames=["Expand single bracket","Expand 2 single brackets and simplify","Expand double brackets and simplify"] as const;
export const bracketSkillIds=["canonical:bracket-single","canonical:bracket-two-single","canonical:bracket-double"] as const;
export type SkillQuestion=Pick<BankQuestion,"skill"> & Partial<Pick<BankQuestion,"id"|"paperId"|"sourceId"|"questionNumber"|"marks"|"examBoard"|"series"|"paperCode"|"sourceTier">>;
const normal=(s:string)=>s.normalize("NFKC").trim().replace(/\s+/g," ").toLowerCase();
const byId=new Map(review.reviews.map(r=>[r.identity.id,r]));
export function bracketCanonicalSkill(label:string) {
 const i=bracketSkillNames.findIndex(name=>normal(name)===normal(label));
 return i<0?null:{id:bracketSkillIds[i],label:bracketSkillNames[i]};
}
export function bracketReviewFor(q:SkillQuestion) {
 const saved=q.id?byId.get(q.id):undefined;if(!saved)return null;
 const matches=Object.entries(saved.identity).every(([key,value])=>q[key as keyof SkillQuestion]===value);
 if(!matches)return {...saved,status:"stale_identity",skills:[],needsTeacherReview:true,observation:"The source identity, marks or stored skill has changed since review. Keep the stored classification until the source is checked again."};
 return saved;
}
/** Only remove an identified legacy expansion label after this exact record's
 * source task was inspected. No regex-based mathematical classification. */
export const replacedBracketLabels=new Set(["expand expressions","expand a single bracket","expanding single brackets","expand brackets and collect like terms","expand and simplify double brackets","expand and simplify two brackets","expand and simplify two linear brackets"]);
export function bracketSearchIntent(query:string) {
 const exact=bracketCanonicalSkill(query);if(exact)return exact;
 const label=normal(query).replace(/[.!?]+$/,"");
 if(["double bracket","double brackets","expand double brackets","expanding double brackets","expand and simplify double brackets"].includes(label))return bracketCanonicalSkill(bracketSkillNames[2]);
 if(["2 single brackets","two single brackets","expand two single brackets and simplify"].includes(label))return bracketCanonicalSkill(bracketSkillNames[1]);
 if(["single bracket","single brackets","expand a single bracket","expanding single brackets"].includes(label))return bracketCanonicalSkill(bracketSkillNames[0]);
 return null;
}
