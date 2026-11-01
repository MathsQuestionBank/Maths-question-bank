import {gradesForTier} from "./gradeBands";
import {weightedGradePerformance} from "./teacherQuestionStats";
import type {BankQuestion} from "./questionData";

type Part = Pick<BankQuestion,"marks"|"gradePerformance"|"questionNumber"|"sourceId">;

function partName(part:Part,index:number):string {
 const raw=part.questionNumber || part.sourceId?.match(/Q\d+[a-z]*/i)?.[0];
 return raw || `Part ${index+1}`;
}

export default function TeacherGradePerformance({parts,tier,selectedGrade,className=""}:{parts:readonly Part[];tier:string;selectedGrade:string;className?:string}){
 const grades=selectedGrade==="All grades"?gradesForTier(tier):[Number(selectedGrade)];
 return <div className={`builder-question-performance ${className}`.trim()} aria-label="Historic grade performance for this question">
  <strong>Historic performance — average % of available marks</strong>
  <div className="teacher-grade-rows">
   {grades.map(grade=>{
    const combined=weightedGradePerformance(parts,grade);
    return <div className="teacher-grade-row" key={grade}>
     <strong>Grade {grade}</strong>
     <div className="builder-performance-values">
      {parts.length>1?parts.map((part,i)=>{
       const pct=part.gradePerformance[grade];
       return <span key={part.sourceId||part.questionNumber||i}>{partName(part,i)}: {typeof pct==="number"&&Number.isFinite(pct)?`${pct}%`:"No data"}</span>;
      }):null}
      <span className={parts.length>1?"combined-performance":""}>{parts.length>1?"Combined: ":""}{combined===null?"No data":`${combined}%`}</span>
     </div>
    </div>;
   })}
  </div>
  {parts.length>1&&<small>Combined is mark-weighted and only shown when every part has data. Missing values never conceal available part results.</small>}
 </div>;
}
