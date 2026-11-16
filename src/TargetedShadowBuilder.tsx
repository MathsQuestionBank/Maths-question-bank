import {weightedGradePerformance} from "./teacherQuestionStats";
import {studentGrades} from "./gradeBands";
import {QuestionSkills as Skills,QuestionAlternatives as Suggestions} from "./QuestionComparisons";
import {useMemo,useState} from "react";
import type {BankQuestion} from "./questionData";
import {type AssessmentGroup} from "./assessmentGroups";
import {formatAssessmentSource} from "./assessmentNumbering";
import {createSmartShadowMatcher,type ShadowDifficulty,type TargetedShadowInfo} from "./smartShadowMatching";

export const difficultyLabels:Record<ShadowDifficulty,string>={same:"Same difficulty",easier:"Slightly easier",harder:"Slightly harder"};
function performanceLabel(group:AssessmentGroup,grade:number|null){const value=grade===null?null:weightedGradePerformance(group.parts,grade);return grade===null?"Select target student grade":`Final Grade ${grade} students: ${value===null?"no complete performance data":`${value}% average marks`}`;}
export default function TargetedShadowBuilder({questions,ids,excludedIds=[],title,initialTargetStudentGrade=null,onClose,onGenerate}:{questions:BankQuestion[];ids:string[];excludedIds?:string[];title:string;initialTargetStudentGrade?:number|null;onClose:()=>void;onGenerate:(result:{ids:string[];info:TargetedShadowInfo;totalMarks:number})=>void}){
 const idsSignature=ids.join("\u0000"),excludedSignature=excludedIds.join("\u0000");
 const [targetStudentGrade,setTargetStudentGrade]=useState<number|null>(initialTargetStudentGrade);
 const matcher=useMemo(()=>createSmartShadowMatcher(questions,ids,excludedIds,targetStudentGrade),[questions,idsSignature,excludedSignature,targetStudentGrade]);
 const [targeted,setTargeted]=useState<string[]>([]),[difficulty,setDifficulty]=useState<ShadowDifficulty>("same");
 const [choices,setChoices]=useState<Record<string,string|null>>({}),[error,setError]=useState("");
 const originals=matcher.originals,selected=originals.filter(group=>targeted.includes(group.key));
 const reservedFor=(key:string)=>new Set(Object.entries(choices).filter(([original,replacement])=>original!==key&&targeted.includes(original)&&replacement).map(([,replacement])=>replacement!));
 const selectedMarks=selected.reduce((sum,group)=>sum+group.marks,0);
 const complete=selected.length>0&&selected.every(group=>Object.prototype.hasOwnProperty.call(choices,group.key));
 const accepted=selected.filter(group=>!!choices[group.key]);
 const generate=()=>{try{const result=matcher.generate(selected.map(group=>({originalKey:group.key,replacementKey:choices[group.key]??null})),difficulty,title);onGenerate(result)}catch(e){setError(e instanceof Error?e.message:String(e))}};
 return <section className="panel targeted-shadow-panel print-hide" aria-label="Targeted shadow assessment">
 <div className="targeted-heading"><div><span className="builder-eyebrow">TARGETED FOLLOW-UP</span><h2>Create Targeted Shadow Assessment</h2><p>Choose the complete questions answered incorrectly, then review and choose replacements. Your original stays intact.</p></div><button type="button" className="secondary small" onClick={onClose}>Cancel targeted shadow</button></div>
 <div className="targeted-controls"><label>Target student grade<select aria-label="Targeted shadow target student grade" value={targetStudentGrade??""} onChange={e=>{setTargetStudentGrade(e.target.value?Number(e.target.value):null);setChoices({});setError("")}}><option value="">Choose final GCSE student grade</option>{studentGrades.map(grade=><option key={grade} value={grade}>Grade {grade}</option>)}</select></label><label>Follow-up difficulty<select aria-label="Targeted shadow difficulty" value={difficulty} onChange={e=>{setDifficulty(e.target.value as ShadowDifficulty);setChoices({});setError("")}}>{Object.entries(difficultyLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><p className="hint">Compare average % of available marks earned by students who achieved the selected final GCSE grade. Same: within 10 percentage points; easier: 5–20 points higher; harder: 5–20 points lower. These are recommendation windows, not calibrated difficulty or equivalence. Without complete performance data, only skill-led suggestions for same difficulty are available, with a warning.</p></div>
 {questions.some(q=>(q.questionPath&&!q.questionUrl)||(q.markSchemePath&&!q.markSchemeUrl))&&<p className="hint" role="status">Some question or marking images are unavailable or still loading. Only complete, loaded questions can be chosen; recommendations update as images load.</p>}
 <div className="targeted-selection-actions"><button type="button" className="secondary small" onClick={()=>setTargeted(originals.map(group=>group.key))}>Select all incorrect questions</button><button type="button" className="secondary small" onClick={()=>{setTargeted([]);setChoices({})}}>Clear selection</button><strong role="status">{selected.length} questions selected · {selectedMarks} marks selected</strong></div>
 <fieldset className="targeted-originals"><legend>Questions answered incorrectly</legend>{originals.map((group,index)=>{const options=matcher.suggest(group.key,difficulty,reservedFor(group.key),choices[group.key]||undefined);return <label key={group.key}><input type="checkbox" checked={targeted.includes(group.key)} aria-label={`Target question ${index+1}`} onChange={e=>{setTargeted(previous=>e.target.checked?[...previous,group.key]:previous.filter(key=>key!==group.key));setChoices(previous=>{const next={...previous};delete next[group.key];return next})}}/><span><strong>Question {index+1} — <Skills group={group}/></strong><small>{performanceLabel(group,targetStudentGrade)} · {group.marks} marks · {group.parts.length} mapped part{group.parts.length===1?"":"s"} · {options.available?`${options.available} suitable alternative${options.available===1?"":"s"} available`:"No suitable match"}</small></span></label>})}</fieldset>
 <p className="targeted-review-note">Recommendations compare stored metadata, not mathematical equivalence. Preview the question and check its suitability before choosing it. Complete approved official shadows are prioritised when compatible with your difficulty choice.</p>
 {selected.map(group=>{const index=originals.findIndex(item=>item.key===group.key),options=matcher.suggest(group.key,difficulty,reservedFor(group.key),choices[group.key]||undefined);return <article className="targeted-question" key={group.key} aria-label={`Replacements for question ${index+1}`}>
  <h3>Question {index+1} — <Skills group={group}/></h3><p className="hint">Original: {performanceLabel(group,targetStudentGrade)} · {group.marks} marks · {formatAssessmentSource(group,questions)}</p>
  {!options.suggestions.length&&<p className="targeted-no-match">No suitable match. {options.reason}</p>}
  <Suggestions targetStudentGrade={targetStudentGrade} original={group} suggestions={options.suggestions} questions={questions} chosenKey={choices[group.key]} onChoose={replacement=>setChoices(previous=>({...previous,[group.key]:replacement}))}/>
  <label className="targeted-unmatched"><input type="radio" name={`unmatched-${group.key}`} checked={choices[group.key]===null} onChange={()=>setChoices(previous=>({...previous,[group.key]:null}))}/>Leave this question unmatched</label>
  {choices[group.key]&&<button type="button" className="text-button" onClick={()=>setChoices(previous=>{const next={...previous};delete next[group.key];return next})}>Reject chosen replacement</button>}
 </article>})}
 {error&&<p role="alert">{error}</p>}
 <div className="targeted-generate"><p>{accepted.length} replacement{accepted.length===1?"":"s"} chosen. {selected.length-accepted.length} not chosen or unmatched. Only chosen replacements will be included.</p><button type="button" className="primary" disabled={!complete||!accepted.length} onClick={generate}>Generate Shadow Assessment</button></div>
 </section>;
}
