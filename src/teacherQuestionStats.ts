import type { BankQuestion } from "./questionData";
import { gradesForTier } from "./gradeBands";

/** The paper number is independent of tier and calculator mode. */
export function paperNumberFromCode(paperCode?: string): number | null {
 const match=paperCode?.trim().match(/^([123])[FH]$/i);
 return match ? Number(match[1]) : null;
}

type QuestionPosition = Pick<BankQuestion,"id"|"sourceId"|"questionNumber"|"series"|"paperCode">;

function position(q:QuestionPosition):{number:number;part:string}|null {
 for(const raw of [q.questionNumber,q.sourceId]){
  if(!raw)continue;
  const match=raw.match(/(?:^|[_\s-])Q(?:uestion)?\s*0*(\d+)([a-z]*)(?:$|[_\s-])/i)
   ||raw.trim().match(/^0*(\d+)([a-z]*)$/i);
  if(match)return {number:Number(match[1]),part:match[2].toLowerCase()};
 }
 return null;
}

/** Sort Q2 ahead of Q10 and keep Q21a ahead of Q21b. Unknown numbers stay last. */
export function compareOriginalQuestionNumber(a:QuestionPosition,b:QuestionPosition,descending=false):number {
 const x=position(a),y=position(b);
 if(!x||!y){if(!x&&y)return 1;if(x&&!y)return -1;}
 if(x&&y){
  const byNumber=x.number-y.number;
  if(byNumber)return descending?-byNumber:byNumber;
  const byPart=x.part.localeCompare(y.part,undefined,{numeric:true});
  if(byPart)return descending?-byPart:byPart;
 }
 return a.series.localeCompare(b.series)||a.paperCode?.localeCompare(b.paperCode||"")||a.id.localeCompare(b.id);
}

type GradePart=Pick<BankQuestion,"marks"|"gradePerformance">;

/** Mark-weighted mean of grade-specific average marks; NOT the fully-correct pupil share. */
export function weightedGradePerformance(parts:readonly GradePart[],grade:number):number|null {
 if(parts.length===0)return null;
 let totalMarks=0,weighted=0;
 for(const part of parts){
  const percent=part.gradePerformance[grade];
  if(typeof percent!=="number"||!Number.isFinite(percent)||percent<0||percent>100||!Number.isFinite(part.marks)||part.marks<0)return null;
  weighted+=percent*part.marks;
  totalMarks+=part.marks;
 }
 return totalMarks>0?Math.round(weighted/totalMarks*10)/10:null;
}

/** Unweighted mean of the available final-GCSE-grade group average marks percentages.
 * Each grade's multipart score is weighted by the marks for its parts; grade
 * groups with incomplete part data are excluded rather than guessed.
 * No cohort sizes are supplied, so this is NOT the overall percentage of pupils
 * who got a question correct. Use a precise label in the builder UI.
 */
export function averageQuestionPerformance(
 parts:ReadonlyArray<Pick<BankQuestion,"marks"|"gradePerformance">>,
 tier:string
):number|null {
 const values=gradesForTier(tier).map(grade=>weightedGradePerformance(parts,grade))
  .filter((x):x is number=>x!==null);
 if(!values.length)return null;
 return Math.round(values.reduce((sum,n)=>sum+n,0)/values.length*10)/10;
}
