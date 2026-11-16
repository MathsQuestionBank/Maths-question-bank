import {useEffect,useRef,useState,type ReactNode} from "react";
import type {BankQuestion} from "./questionData";
import {assessmentGroupImages,type AssessmentGroup} from "./assessmentGroups";
import {formatAssessmentSource,formatQuestionSource} from "./assessmentNumbering";
import {CroppedImage} from "./CropEditor";
import ShadowSuggestionSummary from "./ShadowSuggestionSummary";
import type {ShadowSuggestion} from "./smartShadowMatching";

export function QuestionSkills({group}:{group:AssessmentGroup}){return <>{[...new Set(group.parts.map(part=>part.skill))].join("; ")}</>}
export function QuestionPreview({group,initialOpen=true,summaryLabel="Preview question and mark scheme",deferUntilOpen=false}:{group:AssessmentGroup;initialOpen?:boolean;summaryLabel?:string;deferUntilOpen?:boolean}){
 const [open,setOpen]=useState(initialOpen);
 const [kind,setKind]=useState<"question"|"mark">("question"),[enlarged,setEnlarged]=useState(false);
 const dialog=useRef<HTMLDialogElement>(null);
 const content=()=> <>{assessmentGroupImages(group,kind).map(image=><CroppedImage key={image.key} src={image.src} crop={image.crop} alt={`${group.label} ${kind==="question"?"question":"mark scheme"}`}/>)}
 {!assessmentGroupImages(group,kind).length&&!group.parts.some(part=>part.originalContent)&&<p role="status">{kind==="question"?"Question":"Mark scheme"} image is loading or unavailable.</p>}
 {group.parts.filter(part=>part.originalContent&&!(kind==="question"?part.questionUrl:part.markSchemeUrl)).map(part=><p className="assessment-text" key={part.id}>{kind==="question"?part.prompt:part.answer}</p>)}</>;
 return <details className="targeted-preview" open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary>{summaryLabel}</summary><div className="targeted-preview-tabs"><button type="button" className="secondary small" aria-pressed={kind==="question"} onClick={()=>setKind("question")}>Question image</button><button type="button" className="secondary small" aria-pressed={kind==="mark"} onClick={()=>setKind("mark")}>Mark scheme image</button></div>
 {(!deferUntilOpen||open)&&content()}<button type="button" className="text-button" onClick={()=>{setEnlarged(true);dialog.current?.showModal()}}>Enlarge preview</button>
 <dialog ref={dialog} className="targeted-enlarged-preview" aria-label="Enlarged replacement preview" onClose={()=>setEnlarged(false)}><div className="v62-modal-heading"><h3>{group.label} · {kind==="question"?"Question":"Mark scheme"}</h3><button type="button" className="secondary small" onClick={()=>dialog.current?.close()}>Close enlarged preview</button></div>{enlarged&&content()}</dialog>
 </details>;
}

export function QuestionAlternatives({targetStudentGrade,original,suggestions,questions,chosenKey,onChoose,renderAction,deferInactivePreviews=false}:{targetStudentGrade:number|null;original:AssessmentGroup;suggestions:ShadowSuggestion[];questions:BankQuestion[];chosenKey?:string|null;onChoose?:(key:string)=>void;renderAction?:(suggestion:ShadowSuggestion)=>ReactNode;deferInactivePreviews?:boolean}){
 const [activeKey,setActiveKey]=useState<string>();
 const [compact,setCompact]=useState(()=>typeof matchMedia!=="undefined"&&matchMedia("(max-width:719px)").matches);
 useEffect(()=>{const media=matchMedia("(max-width:719px)"),update=()=>setCompact(media.matches);media.addEventListener("change",update);return ()=>media.removeEventListener("change",update)},[]);
 const list=useRef<HTMLDivElement>(null);
 const browse=(key:string)=>{setActiveKey(key);requestAnimationFrame(()=>list.current?.scrollIntoView({block:"start"}))};
 const activeIndex=Math.max(0,suggestions.findIndex(item=>item.group.key===activeKey));
 const chosenIndex=suggestions.findIndex(item=>item.group.key===chosenKey);
 if(!suggestions.length)return null;
 return <>
  {suggestions.length>1&&<div className="targeted-alternative-nav" role="group" aria-label="Browse alternatives"><button type="button" className="secondary small" disabled={activeIndex===0} onClick={()=>browse(suggestions[activeIndex-1].group.key)}>Previous alternative</button><span aria-live="polite">Alternative {activeIndex+1} of {suggestions.length}</span><button type="button" className="secondary small" disabled={activeIndex===suggestions.length-1} onClick={()=>browse(suggestions[activeIndex+1].group.key)}>Next alternative</button></div>}
  <div className="targeted-suggestions" ref={list}>{suggestions.map((suggestion,index)=><Suggestion targetStudentGrade={targetStudentGrade} key={suggestion.group.key} original={original} suggestion={suggestion} questions={questions} index={index} active={index===activeIndex} onActivate={()=>setActiveKey(suggestion.group.key)} selected={chosenKey===suggestion.group.key} renderAction={renderAction} renderPreview={!deferInactivePreviews||!compact||index===activeIndex} onChoose={()=>onChoose?.(suggestion.group.key)}/>)}</div>
  {chosenIndex>=0&&<p className="targeted-mobile-choice">Chosen: alternative {chosenIndex+1}.<button type="button" className="text-button" onClick={()=>browse(chosenKey!)}>View chosen replacement</button></p>}
 </>;
}
function Suggestion({targetStudentGrade,original,suggestion,questions,index,active,onActivate,selected,onChoose,renderAction,renderPreview}:{targetStudentGrade:number|null;original:AssessmentGroup;suggestion:ShadowSuggestion;questions:BankQuestion[];index:number;active:boolean;onActivate:()=>void;selected:boolean;onChoose:()=>void;renderAction?:(suggestion:ShadowSuggestion)=>ReactNode;renderPreview:boolean}){
 const group=suggestion.group;
 return <div className={`targeted-suggestion${selected?" is-selected":""}`} data-active={active} onFocusCapture={onActivate}>
  <div className="targeted-suggestion-heading"><h4>Alternative {index+1}</h4><span className="targeted-match-label">{suggestion.method==="official"?"Official shadow":"Smart alternative"}</span></div><strong className="targeted-match-category">{suggestion.category}</strong>
  <p className="targeted-source">{suggestion.method==="official"?<>Replacement source: {formatQuestionSource(group.question)}<br/>{formatAssessmentSource(group,questions)}</>:formatAssessmentSource(group,questions)}</p><p><QuestionSkills group={group}/></p><p className="targeted-compatibility">{group.question.tier} · {group.question.calculator?"Calculator":"Non-calculator"}</p>
  <ShadowSuggestionSummary targetStudentGrade={targetStudentGrade} original={original} replacement={group}/>
  {suggestion.warnings.length>0&&<div className="targeted-warnings" aria-label="Recommendation warnings"><strong>Check before choosing</strong><ul>{suggestion.warnings.map(warning=><li key={warning}>{warning}</li>)}</ul></div>}
  <details className="targeted-reasons"><summary>Why this question?</summary><ul>{suggestion.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul></details>
  {renderPreview&&<QuestionPreview group={group}/>}
  {renderAction?renderAction(suggestion):<button type="button" className={selected?"primary small":"secondary small"} aria-pressed={selected} onClick={onChoose}>{selected?"Replacement chosen":"Choose this replacement"}</button>}
 </div>;
}
