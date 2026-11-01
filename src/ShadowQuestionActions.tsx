import {useState} from "react";
import type {BankQuestion} from "./questionData";
import {convertToShadowAssessment,shadowOptionsForOriginal} from "./shadowAssessments";

/** The shadow can be previewed individually; it is selectable only when its whole original question is matched. */
export default function ShadowQuestionActions({original,questions,onPreview,onAdd}:{
 original:BankQuestion;questions:BankQuestion[];onPreview:(id:string)=>void;onAdd:(id:string)=>void;
}){
 const [selectedId,setSelectedId]=useState("");
 if(original.shadowPaperId)return null;
 const alternatives=shadowOptionsForOriginal(questions,original.id);
 if(!alternatives.length)return null;
 const selected=alternatives.find(q=>q.id===selectedId)||alternatives[0];
 const complete=convertToShadowAssessment(questions,[original.id],selected.shadowSet||"").replaced===1;
 return <div className="shadow-question-actions">
  <span className="hint">{alternatives.length} shadow option{alternatives.length===1?"":"s"} available</span>
  {alternatives.length>1&&<select aria-label="Select linked shadow set" value={selected.id} onChange={e=>setSelectedId(e.target.value)}>{alternatives.map(q=><option key={q.id} value={q.id}>{q.shadowSet||"Shadow"}</option>)}</select>}
  <button type="button" className="secondary small" onClick={()=>onPreview(selected.id)}>View shadow {selected.shadowSet||""}</button>
  <button type="button" className="secondary small" disabled={!complete} title={complete?"":"Some parts of this question still have no verified shadow"} onClick={()=>onAdd(selected.id)}>+ Add shadow</button>
  {!complete&&<small className="hint">Preview only until every part is reviewed and linked.</small>}
 </div>;
}
