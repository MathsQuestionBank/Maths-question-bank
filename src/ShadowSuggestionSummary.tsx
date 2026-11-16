import type {AssessmentGroup} from "./assessmentGroups";
import {weightedGradePerformance,validStudentGrade} from "./teacherQuestionStats";

const objectives=(group:AssessmentGroup)=>[...new Set(group.parts.flatMap(part=>part.ao.toUpperCase().match(/AO[123]/g)||[]))].sort().join(" / ")||"Unavailable";
const percent=(value:number|null)=>value===null?"No data":`${value}%`;

/** Presentation only: compare data at the same final GCSE grade and use the
 * existing complete-part weighting. These values do not change ranking. */
export default function ShadowSuggestionSummary({original,replacement,targetStudentGrade}:{original:AssessmentGroup;replacement:AssessmentGroup;targetStudentGrade:number|null}){
 const cohort=validStudentGrade(targetStudentGrade)?targetStudentGrade:null;
 const originalPercent=cohort===null?null:weightedGradePerformance(original.parts,cohort);
 const replacementPercent=cohort===null?null:weightedGradePerformance(replacement.parts,cohort);
 const delta=originalPercent===null||replacementPercent===null?null:Math.round((replacementPercent-originalPercent)*10)/10;
 const facts=[
  {label:"Marks",value:String(replacement.marks),original:String(original.marks)},
  {label:"Assessment objective",value:objectives(replacement),original:objectives(original)},
  {label:"Mapped parts",value:String(replacement.parts.length),original:String(original.parts.length)}
 ];
 return <>
  <dl className="targeted-summary-facts">{facts.map(fact=><div key={fact.label} className={fact.value!==fact.original?"targeted-fact-difference":undefined}><dt>{fact.label}</dt><dd>{fact.value}{fact.value!==fact.original&&<small>Original: {fact.original}</small>}</dd></div>)}</dl>
  <div className="targeted-history" aria-label="Historical performance comparison">
   <strong>Historical performance</strong>
   <p>{cohort===null?"Choose a target student grade; no cohort is inferred from question metadata.":`Average % of available marks · pupils at final GCSE grade ${cohort}`}</p>
   <dl><div><dt>Original</dt><dd>{percent(originalPercent)}</dd></div><div><dt>Replacement</dt><dd>{percent(replacementPercent)}</dd></div></dl>
   {delta!==null?<p className="targeted-history-difference">{delta>0?"+":""}{delta} percentage points</p>:<p>No complete comparison available.</p>}
   <p>Average marks earned by students who achieved this final grade, not the share answering fully correctly. Historical performance is not proof that a question is easier or harder.</p>
  </div>
 </>;
}
