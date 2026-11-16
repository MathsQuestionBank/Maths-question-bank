import {useId,useMemo,useState} from "react";
import type {InsightsModel} from "./questionBankInsights";
import {historicalGradeComparison} from "./historicalPerformanceInsights";

const percent=(n:number|null)=>n===null?"No data":`${n}%`;
export default function HistoricalPerformanceChart({model,onExplore}:{model:InsightsModel;onExplore:(tier:string,grade:number)=>void}) {
 const [tier,setTier]=useState("All"),[sameQuestions,setSameQuestions]=useState(false),[chosenGrades,setChosenGrades]=useState<number[]|null>(null);
 const comparison=useMemo(()=>historicalGradeComparison(model,{tier,sameQuestions,grades:sameQuestions&&chosenGrades!==null?chosenGrades:undefined}),[model,tier,sameQuestions,chosenGrades]);
 const id=useId(),points=comparison.rows,nonEmpty=points.some(p=>p.withData>0);
 const firstGrade=points[0]?.grade??1,lastGrade=points[points.length-1]?.grade??9;
 const x=(i:number)=>lastGrade>firstGrade?42+(points[i].grade-firstGrade)*310/(lastGrade-firstGrade):197;
 const y=(n:number)=>188-n*1.5;
 const segments:string[]=[];let current:string[]=[];
 points.forEach((p,i)=>{if(p.medianPercent===null){if(current.length)segments.push(current.join(" "));current=[];}else current.push(`${x(i)},${y(p.medianPercent)}`)});
 if(current.length)segments.push(current.join(" "));
 return <section className="panel insights-panel" aria-labelledby="insights-grade-title">
  <h2 id="insights-grade-title">Historical performance by final student grade</h2>
  <div className="historical-chart-controls"><label className="insights-chart-select">Chart tier<select value={tier} onChange={e=>{setTier(e.target.value);setChosenGrades(null)}}>{["All","Foundation","Higher",...(model.groups.some(g=>g.tier==="Unknown")?["Unknown"]:[])].map(t=><option key={t} value={t}>{t==="All"?"All tiers":t}</option>)}</select></label>
   <label className="historical-comparison-toggle"><input type="checkbox" checked={sameQuestions} onChange={e=>setSameQuestions(e.target.checked)}/>Compare the same questions</label></div>
  <p className="hint">Average percentage of available marks earned by students who achieved each final GCSE grade; not a fully-correct rate or a question grade. Each point is the median across usable whole questions, with multipart percentages weighted by marks.</p>
  <p className="historical-population-note">The All-tier view can decrease when grades use different Foundation/Higher questions or have missing data. Even the same questions compare different historical student groups. Cohort sizes and cross-paper calibration are unavailable; the line is not smoothed or adjusted.</p>
  {sameQuestions&&<fieldset className="historical-grade-selection"><legend>Final grades included in the comparison</legend>{Array.from({length:9},(_,i)=>i+1).map(grade=><label key={grade}><input type="checkbox" aria-label={`Include final Grade ${grade}`} disabled={!comparison.availableGrades.includes(grade)} checked={comparison.grades.includes(grade)} onChange={e=>setChosenGrades(e.target.checked?[...comparison.grades,grade]:comparison.grades.filter(g=>g!==grade))}/>G{grade}{!comparison.availableGrades.includes(grade)&&<small> No data</small>}</label>)}
   {tier==="All"&&comparison.representedTiers.length>1&&comparison.sharedTierGrades.length>0&&<button type="button" className="secondary small" onClick={()=>setChosenGrades(comparison.sharedTierGrades)}>Use grades with data in every selected tier ({comparison.sharedTierGrades.join(", ")})</button>}
  </fieldset>}
  <p className="historical-population-summary"><strong>{tier==="All"?"All tiers":tier}</strong> · {sameQuestions?`Same questions at every displayed grade: ${comparison.commonKeys.length} included of ${comparison.baseCount}`:`Available questions separately at each grade · ${comparison.baseCount} usable whole questions in scope`}</p>
  {comparison.warning&&<p role="alert" className="historical-warning">{comparison.warning}</p>}
  {nonEmpty?<svg className="historical-line-chart" viewBox="0 0 400 240" role="img" aria-labelledby={id}>
   <title id={id}>Median percentage of available marks, {tier==="All"?"All tiers":tier}, {sameQuestions?"same questions at every grade":"available questions at each grade"}. Exact values and populations follow in the table.</title>
   {[0,25,50,75,100].map(n=><g key={n}><line x1="42" x2="352" y1={y(n)} y2={y(n)} stroke="#dce5e8"/><text x="35" y={y(n)+5} textAnchor="end">{n}%</text></g>)}
   {segments.map((s,i)=><polyline key={i} points={s} fill="none" stroke="#236a78" strokeWidth="2.5"/>)}
   {points.map((p,i)=><g key={p.grade}>{p.medianPercent!==null&&<circle cx={x(i)} cy={y(p.medianPercent)} r="4" fill="#236a78"><title>Final Grade {p.grade}: {p.medianPercent}% · {p.withData} included · {p.missingData} excluded</title></circle>}<text x={x(i)} y="211" textAnchor="middle">{p.grade}</text></g>)}
   <text x="197" y="234" textAnchor="middle">Final GCSE grade</text>
  </svg>:<p role="status">No historical percentages are available for this comparison.</p>}
  <table className="historical-data-table"><caption>{sameQuestions?"Same-question historical performance comparison":"Original available-question historical performance calculation"}</caption><thead><tr><th>Final grade</th><th>Median % marks</th><th>Included</th><th>Excluded</th><th>Missing this grade</th></tr></thead><tbody>{points.map(p=><tr key={p.grade}>
   <th scope="row">G{p.grade}</th><td>{percent(p.medianPercent)}</td><td>{p.withData}</td><td>{p.missingData}</td><td>{p.missingAtGrade}</td>
  </tr>)}</tbody></table>
  <p className="hint">{sameQuestions?"Excluded means missing valid data on any selected grade; the excluded count is identical at every point. Missing this grade is shown separately. The same-question requirement does not fill missing values or imply comparable pupil cohorts.":"Excluded means missing valid data at that grade. This is the original calculation, retained for comparison. A question with a missing part percentage is excluded rather than estimated."}</p>
  {!sameQuestions&&<div className="historical-explore-grades">{points.map(p=><button type="button" className="secondary small" key={p.grade} aria-label={`Explore final Grade ${p.grade} performance for ${tier} tiers: ${p.withData} usable questions with data, ${p.missingData} missing`} onClick={()=>onExplore(tier,p.grade)}>Explore Grade {p.grade}</button>)}</div>}
 </section>;
}
