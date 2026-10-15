import { buildAssessmentGroups } from "./assessmentGroups";
import CropReviewQueue from "./CropReviewQueue";
import { CroppedImage, type Crop } from "./CropEditor";
import ZipImporter from "./ZipImporter";
import { useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";
import { loadBankQuestions } from "./questionData";
import { supabase } from "./supabase";

type Page = "home" | "bank" | "builder" | "saved" | "qualifications" | "import" | "insights" | "review";
type Question = { id:string; topic:string; skill:string; tier:"Foundation"|"Higher"; grade:number; marks:number; calculator:boolean; series:string; ao:string; challenge:string; prompt:string; answer:string; tags:string[]; sourceId?:string; meanPct?:number; gradePerformance:Record<number,number|null>; imagePending?:boolean; questionUrl?:string; markSchemeUrl?:string; imageCrops:{question:Crop;mark:Crop}; cropReview:{question:string;mark:string} };
const groups=["Algebra","Geometry","Number","Probability","Ratio","Statistics"];
const tiles:{page:Page;icon:string;name:string;desc:string}[]=[
{page:"bank",icon:"⌕",name:"Enhanced Skills Mapped Question Bank",desc:"Search GCSE questions by skill, topic, grade and assessment objective."},
{page:"builder",icon:"▤",name:"Assessment Builder",desc:"Select questions and create printable assessments and mark schemes."},
{page:"saved",icon:"▣",name:"Saved Worksheets / Assessments",desc:"Return to assessments you have saved on this device."},
{page:"qualifications",icon:"∑",name:"More Qualifications",desc:"Further Mathematics and GCSE Statistics question banks."}
];
export default function App(){
const [questions,setQuestions]=useState<Question[]>([]);
const [loadingQuestions,setLoadingQuestions]=useState(true);
const [questionError,setQuestionError]=useState("");
const [loadStatus,setLoadStatus]=useState("Not started");
const [diagnostics,setDiagnostics]=useState("");
const [checking,setChecking]=useState(false);
const requestVersion=useRef(0);
const reloadQuestions=async()=>{
 const version=++requestVersion.current;
 setQuestionError("");setLoadingQuestions(true);setLoadStatus("Loading records…");
 for(let attempt=0;attempt<5;attempt++){
  try{
   const data=await loadBankQuestions(withImages=>{if(version===requestVersion.current)setQuestions(withImages)});
   if(version!==requestVersion.current)return;
   if(data.length>0){setQuestions(data);setQuestionError("");setLoadStatus(`${data.length} records loaded`);setLoadingQuestions(false);return;}
   if(attempt===4){setQuestionError("No question records returned from the database. Please check the connection.");setLoadStatus("No visible records");setLoadingQuestions(false);return;}
  }catch(e){
   if(version!==requestVersion.current)return;
   if(attempt===4){setQuestionError(e instanceof Error?e.message:"Could not load questions");setLoadStatus("Request failed");setLoadingQuestions(false);return;}
  }
  await new Promise<void>(resolve=>window.setTimeout(resolve,500*(attempt+1)));
 }
};
const checkDatabase=async()=>{setChecking(true);try{const [{data:{user},error:authError},{data:owner,error:ownerError},{count,error:countError}]=await Promise.all([supabase.auth.getUser(),supabase.rpc("is_approved_owner"),supabase.from("questions").select("id",{count:"exact",head:true})]);setDiagnostics(`Session: ${user?"signed in":"missing"}${authError?" ("+authError.message+")":""}; owner permission: ${ownerError?"error "+ownerError.message:String(owner)}; visible database rows: ${countError?"error "+countError.message:String(count)}; displayed rows: ${questions.length}`);}catch(e){setDiagnostics(e instanceof Error?e.message:String(e))}finally{setChecking(false)}};

const [page,setPage]=useState<Page>("home");
useEffect(()=>{
 if(page==="bank"||page==="builder"||page==="review"||page==="saved")void reloadQuestions();
 return()=>{requestVersion.current++};
},[page]);
const [tier,setTier]=useState("All");
const [topic,setTopic]=useState("All");
const [skill,setSkill]=useState("All");
const [ao,setAo]=useState("All");
const [grade,setGrade]=useState("Any");
const [challenge,setChallenge]=useState("Any");
const [series,setSeries]=useState("All");
const [calc,setCalc]=useState("All");
const [tags,setTags]=useState<string[]>([]);
const [match,setMatch]=useState("Any selected topic");
const [query,setQuery]=useState("");
const [sort,setSort]=useState("Selected grade: highest % first");
const [selected,setSelected]=useState<string[]>([]);
const [draggingQuestion,setDraggingQuestion]=useState<string|null>(null);
const [dragOverQuestion,setDragOverQuestion]=useState<string|null>(null);
const [previewId,setPreviewId]=useState<string|null>(null);
const [previewKind,setPreviewKind]=useState<"question"|"mark">("question");
const [assessmentTitle,setAssessmentTitle]=useState("Mathematics Assessment");
const [minutes,setMinutes]=useState(45);
const [cover,setCover]=useState(true);
const [answers,setAnswers]=useState(false);
const [includeName,setIncludeName]=useState(true);
const [includeClass,setIncludeClass]=useState(false);
const [builderTier,setBuilderTier]=useState<"Any"|"Higher"|"Foundation"|"Crossover">("Any");
const [builderCalc,setBuilderCalc]=useState<"Any"|"Calculator"|"Non-calculator">("Any");
const [saved,setSaved]=useState<{name:string;ids:string[];minutes:number;nameBox?:boolean;classBox?:boolean;paperTier?:string;paperCalc?:string;cover?:boolean;answers?:boolean}[]>(()=>{try{return JSON.parse(localStorage.getItem("mqb-draft-assessments")||"[]")}catch{return []}});
const challengeBands=[
 {label:"Accessible (70%+)",min:70,max:Infinity},
 {label:"Appropriate (45-70%)",min:45,max:70},
 {label:"Challenging (25-45%)",min:25,max:45},
 {label:"Very challenging (<25%)",min:-Infinity,max:25}
];
const gradePercentage=(q:Question)=>grade==="Any"?null:q.gradePerformance[Number(grade)]??null;
const meetsChallenge=(q:Question)=>{
 if(challenge==="Any")return true;
 const percent=gradePercentage(q);
 if(percent===null)return false;
 const band=challengeBands.find(b=>b.label===challenge);
 return !!band&&percent>=band.min&&percent<band.max;
};
const filtered=useMemo(()=>questions.filter(q=>
 (tier==="All"||q.tier===tier)
 &&(topic==="All"||q.topic===topic||q.tags.includes(topic))
 &&(skill==="All"||q.skill===skill)
 &&(ao==="All"||q.ao===ao)
 &&(grade==="Any"||q.gradePerformance[Number(grade)]!==null&&q.gradePerformance[Number(grade)]!==undefined)
 &&meetsChallenge(q)
 &&(series==="All"||q.series===series)
 &&(calc==="All"||(calc==="Calculator"?q.calculator:!q.calculator))
 &&(!tags.length||(match==="All selected topics"?tags.every(t=>q.tags.includes(t)):tags.some(t=>q.tags.includes(t))))
 &&(!query||[q.topic,q.skill,q.prompt].join(" ").toLowerCase().includes(query.toLowerCase()))
).sort((a,b)=>{
 const aPct=gradePercentage(a),bPct=gradePercentage(b);
 if(sort==="Selected grade: highest % first")return (bPct??-1)-(aPct??-1);
 if(sort==="Selected grade: lowest % first")return (aPct??101)-(bPct??101);
 if(sort==="Question marks: highest first")return b.marks-a.marks;
 return a.topic.localeCompare(b.topic);
}),[questions,tier,topic,skill,ao,grade,challenge,series,calc,tags,match,query,sort]);
const chosenAll=useMemo(()=>buildAssessmentGroups(questions,selected),[questions,selected]);
const chosen=chosenAll.filter(group=>((builderTier==="Any"||builderTier==="Crossover")||group.question.tier===builderTier)&&(builderCalc==="Any"||(builderCalc==="Calculator"?group.question.calculator:!group.question.calculator)));
const excluded=chosenAll.length-chosen.length;
const includedIds=new Set(chosenAll.flatMap(group=>group.parts.map(part=>part.id)));
const removeGroup=(key:string)=>setSelected(current=>current.filter(id=>{
 const q=questions.find(item=>item.id===id);
 return q && ((q.sourceId?.match(/^(20\d{2}_[123][HF]_Q\d{2})[a-z][a-z0-9]*$/i)?.[1]||q.id)!==key);
}));
const moveAssessmentGroup=(from:number,to:number)=>{
 if(to<0||to>=chosenAll.length)return;
 const reordered=[...chosenAll];
 [reordered[from],reordered[to]]=[reordered[to],reordered[from]];
 // Preserve exactly the saved part selections; moving a multipart question moves it as one unit.
 const selectedByGroup=new Map<string,string[]>();
 for(const group of chosenAll)selectedByGroup.set(group.key,[]);
 const sourceKey=(id:string)=>{
  const q=questions.find(item=>item.id===id);
  return q?.sourceId?.match(/^(20\d{2}_[123][HF]_Q\d{2})[a-z][a-z0-9]*$/i)?.[1]||id;
 };
 for(const id of selected){const key=sourceKey(id);selectedByGroup.get(key)?.push(id)}
 setSelected(reordered.flatMap(group=>selectedByGroup.get(group.key)||[]));
};
const previewQuestion=questions.find(q=>q.id===previewId);
const bankPapers=new Set(questions.filter(q=>q.sourceId).map(q=>q.sourceId!.slice(0,7))).size;
const bankMapped=questions.filter(q=>q.topic!=="Unmapped"&&q.skill!=="Unmapped").length;
const bankImages=questions.filter(q=>q.questionUrl&&q.markSchemeUrl).length;
const compactQuestionTitle=(q:Question)=>{const match=q.sourceId?.match(/^(\d{4})_(\d[HF])_(Q\d+[a-zA-Z0-9]*)$/);const reference=match?`${q.series} ${match[2]} - ${match[3]}`:`${q.series} - ${q.sourceId||q.id}`;const skill=q.skill.replace(/\b[a-z]/g,letter=>letter.toUpperCase());return `${reference} - ${skill}`;};
const total=chosen.reduce((n,g)=>n+g.marks,0);
const toggle=(id:string)=>setSelected(current=>{
 const question=questions.find(q=>q.id===id);
 const key=question?.sourceId?.match(/^(20\d{2}_[123][HF]_Q\d{2})[a-z][a-z0-9]*$/i)?.[1];
 if(includedIds.has(id)||current.includes(id)){
  if(!key)return current.filter(x=>x!==id);
  return current.filter(x=>{
   const q=questions.find(item=>item.id===x);
   return (q?.sourceId?.match(/^(20\d{2}_[123][HF]_Q\d{2})[a-z][a-z0-9]*$/i)?.[1])!==key;
  });
 }
 return [...current,id];
});
const navigate=(p:Page)=>{setPage(p);window.scrollTo(0,0)};
const save=()=>{const next=[...saved,{name:assessmentTitle||"Untitled assessment",ids:selected,minutes,nameBox:includeName,classBox:includeClass,paperTier:builderTier,paperCalc:builderCalc,cover,answers}];setSaved(next);localStorage.setItem("mqb-draft-assessments",JSON.stringify(next))};
const reset=()=>{setTier("All");setTopic("All");setSkill("All");setAo("All");setGrade("Any");setChallenge("Any");setSeries("All");setCalc("All");setTags([]);setQuery("");setSort("Selected grade: highest % first");void reloadQuestions()};
const options=(items:string[])=>items.map(x=><option key={x}>{x}</option>);
return <div className="site"><header className="header"><div className="header-inner"><button className="brand brand-button" onClick={()=>navigate("home")}><span className="logo">∑</span><span>Maths <strong>Question Bank</strong></span></button><span className="header-note">Made for UK mathematics teachers</span></div></header><main className="main">
{page==="home"?<><section className="hero"><span className="eyebrow">MATHS QUESTION BANK</span><h1>Find questions. Build better assessments.</h1><p>Choose a tool to get started.</p></section><h2 className="dashboard-title">What would you like to do?</h2><div className="dashboard-grid">{tiles.map(t=><button className="dashboard-tile" key={t.page} onClick={()=>navigate(t.page)}><span className="tile-icon">{t.icon}</span><strong>{t.name}</strong><span>{t.desc}</span><span className="tile-arrow">Explore →</span></button>)}</div><div className="notice"><strong>Early preview:</strong> The mapped exam-question metadata is now in your private Supabase database. Import your existing V6.2 ZIP using the owner-only Import Exam Papers tool to add question images and mark schemes securely.</div><section className="owner-info"><h2>Owner tools</h2><div className="dashboard-grid"><button className="dashboard-tile" onClick={()=>navigate("import")}><span className="tile-icon">⇧</span><strong>Import Exam Papers</strong><span>Upload your V6.2 ZIP securely to private storage.</span><span className="tile-arrow">Open →</span></button><button className="dashboard-tile" onClick={()=>navigate("review")}><span className="tile-icon">✓</span><strong>Review image crops</strong><span>Check imported question images and mark schemes.</span><span className="tile-arrow">Open →</span></button><button className="dashboard-tile" onClick={()=>navigate("insights")}><span className="tile-icon">▥</span><strong>Question Bank Insights</strong><span>Review mapping coverage and question bank performance — in development.</span><span className="tile-arrow">Open →</span></button></div></section></>:
<><div className="page-top"><button className="back-link" onClick={()=>navigate("home")}>← Home</button><h1>{page==="bank"?"Enhanced Skills Mapped Question Bank":page==="builder"?"Assessment Builder":page==="saved"?"Saved Worksheets / Assessments":page==="qualifications"?"More Qualifications":page==="import"?"Import Exam Papers":page==="review"?"Review image crops":"Question Bank Insights"}</h1></div>
{page==="bank"&&<><section className="panel v62-overview"><div className="v62-overview-heading"><h2>Question bank overview</h2><span className="hint">Live figures from your private question bank</span></div><div className="v62-stats"><div><strong>{questions.length}</strong><span>Mapped records</span></div><div><strong>{bankPapers}</strong><span>Exam papers</span></div><div><strong>{questions.length?Math.round(bankMapped/questions.length*100):0}%</strong><span>Mapping coverage</span></div><div><strong>{bankImages} / {questions.length}</strong><span>With both images</span></div></div></section><div className="panel wide-filters"><h2>Find questions</h2><div className="filter-grid">
<label>Tier<select value={tier} onChange={e=>setTier(e.target.value)}>{options(["All","Foundation","Higher"])}</select></label>
<label>Topic<select value={topic} onChange={e=>setTopic(e.target.value)}>{options(["All",...groups])}</select></label>
<label>Skill<select value={skill} onChange={e=>setSkill(e.target.value)}>{options(["All",...new Set(questions.map(q=>q.skill))])}</select></label>
<label>Assessment objective<select value={ao} onChange={e=>setAo(e.target.value)}>{options(["All","AO1","AO2","AO3"])}</select></label>
<label>Target grade<select value={grade} onChange={e=>{setGrade(e.target.value);if(e.target.value==="Any")setChallenge("Any")}}>{options(["Any",..."456789"])}</select></label>
<label>Challenge<select value={challenge} disabled={grade==="Any"} onChange={e=>setChallenge(e.target.value)}>{options(["Any","Accessible (70%+)","Appropriate (45-70%)","Challenging (25-45%)","Very challenging (<25%)"])}</select></label>
<label>Series<select value={series} onChange={e=>setSeries(e.target.value)}>{options(["All",...new Set(questions.map(q=>q.series))])}</select></label>
<label>Calculator requirement<select value={calc} onChange={e=>setCalc(e.target.value)}>{options(["All","Calculator","Non-calculator"])}</select></label>
</div><div className="advanced-filter"><h3>Advanced topic filter</h3><p>Select multiple topics. “All selected” only finds questions tagged with every selected topic. Additional topics must be reviewed before they are treated as verified.</p><div className="topic-checks">{groups.map(t=><label key={t}><input type="checkbox" checked={tags.includes(t)} onChange={e=>setTags(s=>e.target.checked?[...s,t]:s.filter(x=>x!==t))}/>{t}</label>)}</div><label className="filter-inline">Match topics<select value={match} onChange={e=>setMatch(e.target.value)}>{options(["Any selected topic","All selected topics"])}</select></label></div><div className="filter-bottom"><label>Search skills<input placeholder="e.g. Pythagoras, ratio, quadratics" value={query} onChange={e=>setQuery(e.target.value)}/></label><label>Sort results<select value={sort} onChange={e=>setSort(e.target.value)}>{options(["Selected grade: highest % first","Selected grade: lowest % first","Question marks: highest first","Topic A–Z"])}</select></label><button className="secondary" onClick={()=>{setAo("AO3");setChallenge("Any")}}>Problem-solving shortcut (AO3)</button><button className="secondary" onClick={reset}>Reset</button></div><p className="hint">Difficulty is calculated from the historic average mark percentage achieved by candidates at the selected final GCSE grade. Select a grade to use the challenge bands or to sort by grade performance.</p></div><div className="v62-bank-layout"><section className="v62-results"><div className="section-heading results-heading"><div><h2>Results</h2><p>{loadingQuestions?"Loading questions…":`${filtered.length} question records match your filters`}</p></div></div><div className="v62-bulk"><button className="secondary small" onClick={()=>setSelected(old=>[...new Set([...old,...filtered.filter(q=>!q.imagePending).map(q=>q.id)])])}>Add all filtered results</button><button className="secondary small" onClick={()=>setSelected([])}>Clear basket</button></div>{questionError&&<div className="panel empty" role="alert">Could not load questions: {questionError}</div>}{!loadingQuestions&&questions.length===0&&<div className="panel"><p>The database returned no visible questions. This may be a session or access-permission issue. Status: {loadStatus}</p><button className="secondary" onClick={checkDatabase} disabled={checking}>{checking?"Checking…":"Check database connection"}</button>{diagnostics&&<p role="status" className="hint">{diagnostics}</p>}</div>}{filtered.map(q=><article className="v62-result-card" key={q.id}><div><h3>{compactQuestionTitle(q)}</h3><p className="v62-meta">{q.topic} · {q.ao} · {q.marks} marks · {q.calculator?"Calculator":"Non-calculator"}</p><div className="v62-pills"><span>{q.tier}</span>{q.grade>0&&<span>Grade {q.grade}</span>}{q.imagePending&&<span>Question image pending</span>}</div><div className="v62-performance" aria-label="Grade performance">{[4,5,6,7,8,9].map(n=><span key={n} className={Number(grade)===n?"target":""}>G{n}: {q.gradePerformance[n]===null?"—":`${q.gradePerformance[n]}%`}</span>)}</div></div><div className="v62-card-actions"><button className="secondary small" disabled={!q.questionUrl&&!q.markSchemeUrl} onClick={()=>{setPreviewId(q.id);setPreviewKind("question")}}>Preview</button><button className={includedIds.has(q.id)?"added small":"primary small"} disabled={q.imagePending} onClick={()=>toggle(q.id)}>{includedIds.has(q.id)?"✓ Added — remove":"+ Add"}</button></div></article>)}{loadingQuestions?<div className="panel empty" role="status">Loading question bank…</div>:!filtered.length&&<div className="panel empty">{questionError?`Unable to load question records: ${questionError}`:questions.length===0?"No questions loaded. Try Reset.":"No questions match these filters. Try Reset."}</div>}</section><aside className="panel v62-basket"><h2>Worksheet basket <span className="count">{chosenAll.length}</span></h2><p className="hint">{chosenAll.reduce((sum,g)=>sum+g.marks,0)} marks · {chosenAll.length} distinct exam questions</p>{chosenAll.length?chosenAll.map(g=><div className="v62-basket-item" key={g.key}><span>{g.label} — {g.marks} marks</span><button aria-label={`Remove ${g.label}`} onClick={()=>removeGroup(g.key)}>×</button></div>):<p className="hint">Add questions from the results to build a worksheet.</p>}<button className="primary full" disabled={!chosenAll.length} onClick={()=>navigate("builder")}>Open assessment builder →</button></aside></div>{previewQuestion&&<div className="v62-modal" role="presentation" onClick={()=>setPreviewId(null)}><div className="v62-modal-dialog" role="dialog" aria-modal="true" aria-label="Question preview" onClick={e=>e.stopPropagation()}><div className="v62-modal-heading"><h2>{previewQuestion.sourceId||previewQuestion.id} — {previewQuestion.skill}</h2><button className="secondary small" onClick={()=>setPreviewId(null)}>Close ×</button></div><div className="v62-preview-tabs"><button className={previewKind==="question"?"primary small":"secondary small"} onClick={()=>setPreviewKind("question")}>Question</button><button className={previewKind==="mark"?"primary small":"secondary small"} onClick={()=>setPreviewKind("mark")}>Mark scheme</button></div>{(previewKind==="question"?previewQuestion.questionUrl:previewQuestion.markSchemeUrl)?<CroppedImage key={previewQuestion.id+previewKind} src={(previewKind==="question"?previewQuestion.questionUrl:previewQuestion.markSchemeUrl)!} crop={previewQuestion.imageCrops[previewKind]} alt={`${previewQuestion.sourceId||previewQuestion.id} ${previewKind}`}/>:<p className="hint">Image not yet available.</p>}</div></div>}</>}
{page==="builder"&&<div className="layout"><aside className="panel filters"><h2>Assessment settings</h2><label>Assessment title<input value={assessmentTitle} onChange={e=>setAssessmentTitle(e.target.value)}/></label><label>Time allowance (minutes)<input type="number" min="1" value={minutes} onChange={e=>setMinutes(Math.max(1,Number(e.target.value)||1))}/></label><fieldset className="builder-choice"><legend>Paper tier</legend><div className="builder-choice-options">{(["Any","Higher","Foundation","Crossover"] as const).map(value=><button type="button" key={value} className={builderTier===value?"primary small":"secondary small"} aria-pressed={builderTier===value} onClick={()=>setBuilderTier(value)}>{value==="Any"?"Mixed":value}</button>)}</div></fieldset><fieldset className="builder-choice"><legend>Calculator requirement</legend><div className="builder-choice-options">{(["Any","Calculator","Non-calculator"] as const).map(value=><button type="button" key={value} className={builderCalc===value?"primary small":"secondary small"} aria-pressed={builderCalc===value} onClick={()=>setBuilderCalc(value)}>{value==="Any"?"Mixed":value}</button>)}</div></fieldset><label className="check"><input type="checkbox" checked={includeName} onChange={e=>setIncludeName(e.target.checked)}/> Include student name box</label><label className="check"><input type="checkbox" checked={includeClass} onChange={e=>setIncludeClass(e.target.checked)}/> Include class box</label><label className="check"><input type="checkbox" checked={cover} onChange={e=>setCover(e.target.checked)}/> Include cover page</label><label className="check"><input type="checkbox" checked={answers} onChange={e=>setAnswers(e.target.checked)}/> Include mark scheme</label><button className="primary full" disabled={!chosen.length} onClick={()=>window.print()}>Print / save as PDF</button><button className="secondary full" disabled={!chosen.length} onClick={save}>Save assessment on this device</button><p className="hint">Saved assessments use this browser's local storage, not a secure online account.</p></aside><section className="results"><div className="section-heading"><div><h2>Assessment preview</h2><p>{chosen.length} distinct questions · {total} marks · {builderTier==="Any"?"Mixed tiers":builderTier} · {builderCalc==="Any"?"Mixed calculator":builderCalc}</p></div><button className="secondary small" onClick={()=>navigate("bank")}>+ Add questions</button></div>{chosenAll.length>1&&<div className="panel print-hide" style={{padding:"14px 18px",marginBottom:14}}>
 <h3 style={{margin:"0 0 6px"}}>Arrange questions</h3>
 <p className="hint">Drag a question to a new position, or use the position selector. The assessment and mark scheme update together.</p>
 <ol className="assessment-order-list">{chosenAll.map((group,index)=><li
 key={group.key}
 draggable
 onDragStart={e=>{e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",group.key);setDraggingQuestion(group.key)}}
 onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect="move";setDragOverQuestion(group.key)}}
 onDrop={e=>{e.preventDefault();const dragged=e.dataTransfer.getData("text/plain");const from=chosenAll.findIndex(g=>g.key===dragged);if(from!==-1)moveAssessmentGroup(from,index);setDraggingQuestion(null);setDragOverQuestion(null)}}
 onDragEnd={()=>{setDraggingQuestion(null);setDragOverQuestion(null)}}
 className={`assessment-order-row${draggingQuestion===group.key?" is-dragging":""}${dragOverQuestion===group.key&&draggingQuestion!==group.key?" drag-over":""}`}>
 <span className="assessment-drag-handle" aria-hidden="true">⠿</span>
 <span className="assessment-order-title"><strong>{index+1}.</strong> {group.label} <span className="assessment-order-marks">· {group.marks} marks</span></span>
 <label className="assessment-order-position"><span className="sr-only">Position for question {index+1}</span><select aria-label={`Position for question ${index+1}`} value={index+1} onChange={e=>moveAssessmentGroup(index,Number(e.target.value)-1)}>{chosenAll.map((_,n)=><option value={n+1} key={n}>{n+1}</option>)}</select></label>
 </li>)}</ol>
 </div>}
 <div className="paper">{cover&&<div className="cover"><div className="paper-brand">MATHS QUESTION BANK</div><h2>{assessmentTitle}</h2><p className="cover-paper-type">{builderTier==="Any"?"Mixed Tier":builderTier+" Tier"} · {builderCalc==="Any"?"Mixed Calculator / Non-calculator":builderCalc+" Paper"}</p><p>Time allowed: {minutes} minutes</p><p>Total marks: {total}</p><div className="paper-student-fields">{includeName&&<div className="name-line">Name: __________________________________</div>}{includeClass&&<div className="name-line">Class: __________________________________</div>}</div><p className="paper-instructions">Answer all questions. Show your working clearly.</p></div>}{!cover&&(includeName||includeClass)&&<div className="paper-student-fields paper-inline-fields">{includeName&&<div className="name-line">Name: __________________________________</div>}{includeClass&&<div className="name-line">Class: __________________________________</div>}</div>}{!chosen.length?<div className="empty"><h3>Your assessment is empty</h3><p>Visit the Enhanced Skills Mapped Question Bank to add questions.</p></div>:chosen.map((group,i)=><div className="paper-question" key={group.key}><div className="paper-row"><strong>{i+1}.</strong><span>{group.question.questionUrl?<CroppedImage key={group.key} src={group.question.questionUrl} crop={group.question.imageCrops.question} alt={`Question ${i+1}`}/>:group.question.prompt}<span className="hint print-hide">Included parts: {group.parts.map(p=>p.sourceId).join(", ")}</span></span><span className="marks">({group.marks} marks)</span></div><div className="working-space"/><button className="remove print-hide" onClick={()=>removeGroup(group.key)}>Remove</button></div>)}{answers&&chosen.length>0&&<div className="mark-scheme"><h2>Mark scheme</h2>{chosen.map((group,i)=><div className="mark-scheme-item" key={group.key}><strong>{i+1}.</strong> {group.question.markSchemeUrl?<CroppedImage src={group.question.markSchemeUrl} crop={group.question.imageCrops.mark} alt={`Mark scheme ${i+1}`}/>:group.question.answer}<span>({group.marks} marks)</span></div>)}</div>}</div></section></div>}
{page==="saved"&&<div className="panel saved-panel"><p className="hint">These assessments are saved only in this browser on this device. Clearing browser data may delete them.</p>{!saved.length?<div className="empty">No saved assessments yet. Create an assessment and select “Save assessment on this device”.</div>:saved.map((s,i)=><div className="saved-item" key={i}><div><strong>{s.name}</strong><p>{s.ids.length} questions · {s.minutes} minutes</p></div><button className="secondary" onClick={()=>{setAssessmentTitle(s.name);setSelected(s.ids);setMinutes(s.minutes);setIncludeName(s.nameBox??true);setIncludeClass(s.classBox??false);setBuilderTier(s.paperTier==="Higher"||s.paperTier==="Foundation"||s.paperTier==="Crossover"?s.paperTier:"Any");setBuilderCalc(s.paperCalc==="Calculator"||s.paperCalc==="Non-calculator"?s.paperCalc:"Any");setCover(s.cover??true);setAnswers(s.answers??false);navigate("builder")}}>Open</button><button className="remove" onClick={()=>{const next=saved.filter((_,j)=>j!==i);setSaved(next);localStorage.setItem("mqb-draft-assessments",JSON.stringify(next))}}>Delete</button></div>)}</div>}
{page==="import"&&<ZipImporter onComplete={()=>{void reloadQuestions()}}/>}{page==="review"&&<CropReviewQueue questions={questions} onUpdate={(id,patch)=>setQuestions(old=>old.map(q=>q.id===id?{...q,...patch}:q))}/>}{page==="insights"&&<div className="panel saved-panel"><p>The database-backed insights dashboard is planned.</p></div>}
{page==="qualifications"&&<div className="dashboard-grid"><div className="dashboard-tile static-tile"><span className="tile-icon">∑</span><strong>Further Mathematics</strong><span>Dedicated question bank planned. Questions will be added when appropriately licensed or original content is available.</span></div><div className="dashboard-tile static-tile"><span className="tile-icon">▥</span><strong>GCSE Statistics</strong><span>Dedicated question bank planned. Questions will be added when appropriately licensed or original content is available.</span></div></div>}
</>}
<footer>Maths Question Bank · Early preview · Private database-backed preview</footer></main></div>
}