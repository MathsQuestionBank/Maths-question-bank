import {useEffect,useMemo,useRef,useState} from "react";
import type {BankQuestion} from "./questionData";
import {createSmartShadowMatcher,type ShadowDifficulty} from "./smartShadowMatching";
import {QuestionAlternatives,QuestionPreview,QuestionSkills} from "./QuestionComparisons";
import {formatAssessmentSource} from "./assessmentNumbering";
import {studentGrades} from "./gradeBands";
import {weightedGradePerformance} from "./teacherQuestionStats";

const practiceLabels:Record<ShadowDifficulty,string>={same:"Similar historical demand",easier:"More accessible practice",harder:"Greater challenge"};

/** A single indexed matcher lives for the open original question. Changing
 * controls, browsing batches and adding to the basket never rebuild it. */
export default function SimilarQuestionsDialog({questions,originalId,initialStudentGrade=null,includedIds,basketCount,basketMarks,loading,onAdd,onClose}:{
 questions:BankQuestion[];originalId:string;initialStudentGrade?:number|null;includedIds:ReadonlySet<string>;basketCount:number;basketMarks:number;loading:boolean;onAdd:(id:string)=>void;onClose:()=>void;
}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [studentGrade,setStudentGrade]=useState<number|null>(initialStudentGrade),[practice,setPractice]=useState<ShadowDifficulty>("same"),[visibleCount,setVisibleCount]=useState(3),[notice,setNotice]=useState("");
 const matcher=useMemo(()=>createSmartShadowMatcher(questions,[originalId]),[questions,originalId]);
 const original=matcher.originals[0];
 const result=useMemo(()=>matcher.browse(original?.key||"",practice,studentGrade,0,visibleCount),[matcher,original?.key,practice,studentGrade,visibleCount]);
 useEffect(()=>{
  const opener=document.activeElement as HTMLElement|null,node=dialog.current!,overflow=document.body.style.overflow;
  node.showModal();document.body.style.overflow="hidden";
  return ()=>{node.close();document.body.style.overflow=overflow;opener?.focus({preventScroll:true})};
 },[]);
 const reset=()=>{setVisibleCount(3);setNotice("")};
 const percent=original&&studentGrade!==null?weightedGradePerformance(original.parts,studentGrade):null;
 return <dialog ref={dialog} className="similar-dialog print-hide" aria-labelledby="similar-title" onCancel={e=>{if(e.target===dialog.current){e.preventDefault();onClose()}}} onClick={e=>{if(e.target===dialog.current){const rect=dialog.current.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)onClose()}}}>
  <div className="targeted-heading"><div><span className="builder-eyebrow">QUESTION BANK</span><h2 id="similar-title">Find Similar Questions</h2><p>Compare complete questions, then choose which to add to your worksheet.</p></div><button type="button" className="secondary small" autoFocus onClick={onClose}>Close similar questions</button></div>
  {original?<>
   <section className="similar-original" aria-label="Original complete question"><h3>Original — <QuestionSkills group={original}/></h3><p className="targeted-source">{formatAssessmentSource(original,questions)}</p>
    <p>{original.marks} marks · {[...new Set(original.parts.map(p=>p.ao))].join(" / ")} · {original.parts.length} mapped part{original.parts.length===1?"":"s"}</p><p>{original.parts.every(p=>p.sourceTier===original.parts[0].sourceTier)?original.parts[0].sourceTier||"Tier unavailable":"Mixed tier metadata"} · {original.parts.every(p=>p.sourceCalculator===original.parts[0].sourceCalculator)&&typeof original.parts[0].sourceCalculator==="boolean"?(original.parts[0].sourceCalculator?"Calculator":"Non-calculator"):"Calculator requirement unavailable"}</p>
    {studentGrade!==null&&<p>Final Grade {studentGrade} students: {percent===null?"No complete historical performance data":`${percent}% average available marks`}</p>}
    <QuestionPreview group={original} initialOpen={false} deferUntilOpen summaryLabel="Preview original question and mark scheme"/>
   </section>
   <div className="targeted-controls"><label>Target student grade<select aria-label="Similar questions target student grade" value={studentGrade??""} onChange={e=>{setStudentGrade(e.target.value?Number(e.target.value):null);reset()}}><option value="">Choose final GCSE student grade</option>{studentGrades.map(grade=><option key={grade} value={grade}>Grade {grade}</option>)}</select></label>
    <label>Practice level<select value={practice} onChange={e=>{setPractice(e.target.value as ShadowDifficulty);reset()}}>{Object.entries(practiceLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <p className="hint">Historical data shows average % of available marks earned by students achieving that final GCSE grade, not question grades or the share answering fully correctly. Similar: within 10 percentage points; more accessible: 5–20 points higher; greater challenge: 5–20 points lower. These are recommendation heuristics, not definitive difficulty or mathematical equivalence. Review the content before adding it.</p>
   </div>
   {(loading||questions.some(q=>q.questionPath&&!q.questionUrl||q.markSchemePath&&!q.markSchemeUrl))&&<p className="hint" role="status">Some private image links are loading or unavailable. Only questions with complete question and mark scheme links are suggested; results update as links become available.</p>}
   <div className="similar-results" aria-label="Similar question suggestions"><h3>Similar questions</h3><p role="status">Showing {result.suggestions.length} of {result.available} ranked whole questions</p>
    {!result.suggestions.length&&<p className="targeted-no-match">{studentGrade===null?"": "No suitable match. "}{result.reason}</p>}
    <QuestionAlternatives key={`${studentGrade}-${practice}`} original={original} suggestions={result.suggestions} questions={questions} targetStudentGrade={studentGrade} deferInactivePreviews renderAction={suggestion=>{
     const added=matcher.isSelected(suggestion.group.key,includedIds);
     return <button type="button" className={added?"added small":"primary small"} disabled={added} onClick={()=>{onAdd(suggestion.group.question.id);setNotice(`${suggestion.group.label} added to worksheet.`)}}>{added?"✓ Added to worksheet":"+ Add to worksheet"}</button>;
    }}/>
    {result.hasMore?<button type="button" className="secondary similar-more" onClick={()=>setVisibleCount(count=>Math.min(result.available,count+3))}>Show more similar questions</button>:result.suggestions.length>0&&<p className="hint" role="status">No further matches available for these settings.</p>}
   </div>
  </>:<p role="status">The original question is no longer available. Close this comparison and refresh the Question Bank.</p>}
  <footer className="similar-basket-strip"><div role="status"><strong>Worksheet basket: {basketCount} {basketCount===1?"question":"questions"} · {basketMarks} marks</strong>{notice&&<small>{notice}</small>}</div><button type="button" className="secondary small" onClick={onClose}>Return to Question Bank</button></footer>
 </dialog>;
}
