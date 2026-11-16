import ShadowSuggestionSummary from "./ShadowSuggestionSummary";
import {useMemo,useRef,useState} from "react";
import type {BankQuestion} from "./questionData";
import {assessmentGroupImages,type AssessmentGroup} from "./assessmentGroups";
import {formatAssessmentSource,formatQuestionSource} from "./assessmentNumbering";
import {CroppedImage} from "./CropEditor";
import {createSmartShadowMatcher,groupGrade,type ShadowDifficulty,type TargetedShadowInfo,type ShadowSuggestion} from "./smartShadowMatching";

export const difficultyLabels:Record<ShadowDifficulty,string>={same:"Same difficulty",easier:"Slightly easier",harder:"Slightly harder"};
export function questionGradeLabel(group:AssessmentGroup){const grade=groupGrade(group);return grade?`Grade ${grade.min===grade.max?grade.min:grade.min+"–"+grade.max}`:"Grade unavailable"}
function Skills({group}:{group:AssessmentGroup}){return <>{[...new Set(group.parts.map(part=>part.skill))].join("; ")}</>}
function Preview({group}:{group:AssessmentGroup}){
 const [kind,setKind]=useState<"question"|"mark">("question"),[enlarged,setEnlarged]=useState(false);
 const dialog=useRef<HTMLDialogElement>(null);
 const content=()=> <>{assessmentGroupImages(group,kind).map(image=><CroppedImage key={image.key} src={image.src} crop={image.crop} alt={`${group.label} ${kind==="question"?"question":"mark scheme"}`}/>)}
 {group.parts.filter(part=>part.originalContent&&!(kind==="question"?part.questionUrl:part.markSchemeUrl)).map(part=><p className="assessment-text" key={part.id}>{kind==="question"?part.prompt:part.answer}</p>)}</>;
 return <details className="targeted-preview" open><summary>Preview question and mark scheme</summary><div className="targeted-preview-tabs"><button type="button" className="secondary small" aria-pressed={kind==="question"} onClick={()=>setKind("question")}>Question image</button><button type="button" className="secondary small" aria-pressed={kind==="mark"} onClick={()=>setKind("mark")}>Mark scheme image</button></div>
 {content()}<button type="button" className="text-button" onClick={()=>{setEnlarged(true);dialog.current?.showModal()}}>Enlarge preview</button>
 <dialog ref={dialog} className="targeted-enlarged-preview" aria-label="Enlarged replacement preview" onClose={()=>setEnlarged(false)}><div className="v62-modal-heading"><h3>{group.label} · {kind==="question"?"Question":"Mark scheme"}</h3><button type="button" className="secondary small" onClick={()=>dialog.current?.close()}>Close enlarged preview</button></div>{enlarged&&content()}</dialog>
 </details>;
}
export default function TargetedShadowBuilder({questions,ids,excludedIds=[],title,onClose,onGenerate}:{questions:BankQuestion[];ids:string[];excludedIds?:string[];title:string;onClose:()=>void;onGenerate:(result:{ids:string[];info:TargetedShadowInfo;totalMarks:number})=>void}){
 const idsSignature=ids.join("\u0000"),excludedSignature=excludedIds.join("\u0000");
 const matcher=useMemo(()=>createSmartShadowMatcher(questions,ids,excludedIds),[questions,idsSignature,excludedSignature]);
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
 <div className="targeted-controls"><label>Follow-up difficulty<select aria-label="Targeted shadow difficulty" value={difficulty} onChange={e=>{setDifficulty(e.target.value as ShadowDifficulty);setChoices({});setError("")}}>{Object.entries(difficultyLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><p className="hint">Same difficulty supports consolidation; easier supports scaffolding; harder supports greater challenge. Grades and metadata do not establish pedagogical equivalence.</p></div>
 {questions.some(q=>(q.questionPath&&!q.questionUrl)||(q.markSchemePath&&!q.markSchemeUrl))&&<p className="hint" role="status">Some question or marking images are unavailable or still loading. Only complete, loaded questions can be chosen; recommendations update as images load.</p>}
 <div className="targeted-selection-actions"><button type="button" className="secondary small" onClick={()=>setTargeted(originals.map(group=>group.key))}>Select all incorrect questions</button><button type="button" className="secondary small" onClick={()=>{setTargeted([]);setChoices({})}}>Clear selection</button><strong role="status">{selected.length} questions selected · {selectedMarks} marks selected</strong></div>
 <fieldset className="targeted-originals"><legend>Questions answered incorrectly</legend>{originals.map((group,index)=>{const options=matcher.suggest(group.key,difficulty,reservedFor(group.key),choices[group.key]||undefined);return <label key={group.key}><input type="checkbox" checked={targeted.includes(group.key)} aria-label={`Target question ${index+1}`} onChange={e=>{setTargeted(previous=>e.target.checked?[...previous,group.key]:previous.filter(key=>key!==group.key));setChoices(previous=>{const next={...previous};delete next[group.key];return next})}}/><span><strong>Question {index+1} — <Skills group={group}/></strong><small>{questionGradeLabel(group)} · {group.marks} marks · {group.parts.length} mapped part{group.parts.length===1?"":"s"} · {options.available?`${options.available} suitable alternative${options.available===1?"":"s"} available`:"No suitable match"}</small></span></label>})}</fieldset>
 <p className="targeted-review-note">Recommendations compare stored metadata, not mathematical equivalence. Preview the question and check its suitability before choosing it. Complete approved official shadows are prioritised when compatible with your difficulty choice.</p>
 {selected.map(group=>{const index=originals.findIndex(item=>item.key===group.key),options=matcher.suggest(group.key,difficulty,reservedFor(group.key),choices[group.key]||undefined);return <article className="targeted-question" key={group.key} aria-label={`Replacements for question ${index+1}`}>
  <h3>Question {index+1} — <Skills group={group}/></h3><p className="hint">Original: {questionGradeLabel(group)} · {group.marks} marks · {formatAssessmentSource(group,questions)}</p>
  {!options.suggestions.length&&<p className="targeted-no-match">No suitable match. {options.reason}</p>}
  <Suggestions original={group} suggestions={options.suggestions} questions={questions} chosenKey={choices[group.key]} onChoose={replacement=>setChoices(previous=>({...previous,[group.key]:replacement}))}/>
  <label className="targeted-unmatched"><input type="radio" name={`unmatched-${group.key}`} checked={choices[group.key]===null} onChange={()=>setChoices(previous=>({...previous,[group.key]:null}))}/>Leave this question unmatched</label>
  {choices[group.key]&&<button type="button" className="text-button" onClick={()=>setChoices(previous=>{const next={...previous};delete next[group.key];return next})}>Reject chosen replacement</button>}
 </article>})}
 {error&&<p role="alert">{error}</p>}
 <div className="targeted-generate"><p>{accepted.length} replacement{accepted.length===1?"":"s"} chosen. {selected.length-accepted.length} not chosen or unmatched. Only chosen replacements will be included.</p><button type="button" className="primary" disabled={!complete||!accepted.length} onClick={generate}>Generate Shadow Assessment</button></div>
 </section>;
}
function Suggestions({original,suggestions,questions,chosenKey,onChoose}:{original:AssessmentGroup;suggestions:ShadowSuggestion[];questions:BankQuestion[];chosenKey?:string|null;onChoose:(key:string)=>void}){
 const [activeKey,setActiveKey]=useState<string>();
 const list=useRef<HTMLDivElement>(null);
 const browse=(key:string)=>{setActiveKey(key);requestAnimationFrame(()=>list.current?.scrollIntoView({block:"start"}))};
 const activeIndex=Math.max(0,suggestions.findIndex(item=>item.group.key===activeKey));
 const chosenIndex=suggestions.findIndex(item=>item.group.key===chosenKey);
 if(!suggestions.length)return null;
 return <>
  {suggestions.length>1&&<div className="targeted-alternative-nav" role="group" aria-label="Browse alternatives"><button type="button" className="secondary small" disabled={activeIndex===0} onClick={()=>browse(suggestions[activeIndex-1].group.key)}>Previous alternative</button><span aria-live="polite">Alternative {activeIndex+1} of {suggestions.length}</span><button type="button" className="secondary small" disabled={activeIndex===suggestions.length-1} onClick={()=>browse(suggestions[activeIndex+1].group.key)}>Next alternative</button></div>}
  <div className="targeted-suggestions" ref={list}>{suggestions.map((suggestion,index)=><Suggestion key={suggestion.group.key} original={original} suggestion={suggestion} questions={questions} index={index} active={index===activeIndex} onActivate={()=>setActiveKey(suggestion.group.key)} selected={chosenKey===suggestion.group.key} onChoose={()=>onChoose(suggestion.group.key)}/>)}</div>
  {chosenIndex>=0&&<p className="targeted-mobile-choice">Chosen: alternative {chosenIndex+1}.<button type="button" className="text-button" onClick={()=>browse(chosenKey!)}>View chosen replacement</button></p>}
 </>;
}
function Suggestion({original,suggestion,questions,index,active,onActivate,selected,onChoose}:{original:AssessmentGroup;suggestion:ShadowSuggestion;questions:BankQuestion[];index:number;active:boolean;onActivate:()=>void;selected:boolean;onChoose:()=>void}){
 const group=suggestion.group;
 return <div className={`targeted-suggestion${selected?" is-selected":""}`} data-active={active} onFocusCapture={onActivate}>
  <div className="targeted-suggestion-heading"><h4>Alternative {index+1}</h4><span className="targeted-match-label">{suggestion.method==="official"?"Official shadow":"Smart alternative"}</span></div><strong className="targeted-match-category">{suggestion.category}</strong>
  <p className="targeted-source">{suggestion.method==="official"?<>Replacement source: {formatQuestionSource(group.question)}<br/>{formatAssessmentSource(group,questions)}</>:formatAssessmentSource(group,questions)}</p><p><Skills group={group}/></p><p className="targeted-compatibility">{group.question.tier} · {group.question.calculator?"Calculator":"Non-calculator"}</p>
  <ShadowSuggestionSummary original={original} replacement={group}/>
  {suggestion.warnings.length>0&&<div className="targeted-warnings" aria-label="Recommendation warnings"><strong>Check before choosing</strong><ul>{suggestion.warnings.map(warning=><li key={warning}>{warning}</li>)}</ul></div>}
  <details className="targeted-reasons"><summary>Why this question?</summary><ul>{suggestion.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul></details>
  <Preview group={group}/><button type="button" className={selected?"primary small":"secondary small"} aria-pressed={selected} onClick={onChoose}>{selected?"Replacement chosen":"Choose this replacement"}</button>
 </div>;
}
