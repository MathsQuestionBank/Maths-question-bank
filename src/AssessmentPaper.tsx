import type { NumberingResult } from "./numberingProcessing";
import { projectNumberingRect } from "./automaticNumbering";
import { assessmentQuestionNumber, formatAssessmentSource } from "./assessmentNumbering";
import { assessmentGroupImages, type AssessmentExportMode, type AssessmentGroup } from "./assessmentGroups";
import { assessmentPrintAssets, type AssessmentPrintAsset } from "./assessmentExport";
import { CroppedImage } from "./CropEditor";
import { defaultNumberingMask, type NumberingMask } from "./numberingMasks";
import type { BankQuestion } from "./questionData";
import type { TeacherSourceMode } from "./worksheetLibrary";
import TeacherGradePerformance from "./TeacherGradePerformance";

type Props={groups:AssessmentGroup[];allQuestions:BankQuestion[];mode:AssessmentExportMode;sequential:boolean;cover:boolean;title:string;minutes:number;total:number;tier:string;calculator:string;includeName:boolean;includeClass:boolean;replaceSourceTotals:boolean;masks:Record<string,NumberingMask>;numberingResults?:Record<string,NumberingResult>;onReview:(asset:AssessmentPrintAsset)=>void;onRemove:(key:string)=>void;teacherSourceMode:TeacherSourceMode;performanceGrade:string;printTeacherStats:boolean};
export default function AssessmentPaper(p:Props){
 const assets=assessmentPrintAssets(p.groups,p.mode,p.sequential);
 const number=(group:AssessmentGroup,i:number)=>assessmentQuestionNumber(group,i+1,p.sequential);
 const fields=<div className="paper-student-fields">{p.includeName&&<div className="name-line">Name: __________________________________</div>}{p.includeClass&&<div className="name-line">Class: __________________________________</div>}</div>;
 const images=(group:AssessmentGroup,i:number,kind:"question"|"mark",partId:string)=>assessmentGroupImages(group,kind).filter(image=>image.question.id===partId).map(image=>{
  const asset=assets.find(a=>a.key===image.key&&a.kind===kind&&a.question.id===image.question.id)!;
  const result=p.numberingResults?.[asset.maskKey];
  const automatic=result?.status==="ready"?result.layout:undefined;
  const mask=result?.status==="manual"?result.mask:p.masks[asset.maskKey]||defaultNumberingMask;
  const manual=asset.needsReview&&result?.status==="manual";
  return <div className="assessment-image-block" key={asset.maskKey}>
   <CroppedImage src={asset.src} crop={asset.crop} alt={`${kind==="question"?"Question":"Mark scheme"} ${number(group,i)}${image.partLabel?` (${image.partLabel})`:""}`} automaticNumbering={asset.needsReview?automatic:undefined} replacementNumber={number(group,i)} replacementMarks={group.marks} replaceAutomaticTotals={p.replaceSourceTotals&&kind==="question"} coverOriginalNumber={manual} coverOriginalFooter={manual&&p.replaceSourceTotals&&kind==="question"} numberingMask={mask}/>
   {asset.needsReview&&result?.status==="unsupported"&&<div className="assessment-mask-review print-hide"><button type="button" className="secondary small" onClick={()=>p.onReview(asset)}>Review original print for {asset.label}</button></div>}
   {asset.needsReview&&(result?.status==="ready"||result?.status==="manual")&&<div className="assessment-mask-adjust print-hide"><button type="button" className="secondary small" onClick={()=>p.onReview(asset)}>Advanced adjustment for {asset.label}</button></div>}
  </div>;
 });
 const content=(group:AssessmentGroup,index:number,kind:"question"|"mark")=>group.parts.flatMap(part=>{
  const imageNodes=images(group,index,kind,part.id);
  if(imageNodes.length)return imageNodes;
  if(part.originalContent&&!(kind==="question"?part.questionUrl:part.markSchemeUrl))return [<div className="assessment-text" key={part.id}>{kind==="question"?part.prompt:part.answer}</div>];
  return [];
 });
 return <div className={`paper export-${p.mode}${p.printTeacherStats?" teacher-stats-print":""}`}>
  {p.mode!=="marks"&&p.cover&&<div className="cover"><div className="paper-brand">MATHS QUESTION BANK</div><h2>{p.title}</h2>{p.mode==="teacher"&&<p>Teacher copy</p>}<p className="cover-paper-type">{p.tier==="Any"?"Mixed Tier":p.tier+" Tier"} · {p.calculator==="Any"?"Mixed Calculator / Non-calculator":p.calculator+" Paper"}</p><p>Time allowed: {p.minutes} minutes</p><p>Total marks: {p.total}</p>{fields}<p className="paper-instructions">Answer all questions. Show your working clearly.</p></div>}
  {p.mode!=="marks"&&!p.cover&&<div className="paper-inline-fields"><h2>{p.title}{p.mode==="teacher"?" — Teacher copy":""}</h2><p>Total marks: {p.total}</p>{fields}</div>}
  {!p.groups.length?<div className="empty"><h3>Your assessment is empty</h3><p>Visit the Enhanced Skills Mapped Question Bank to add questions.</p></div>:p.mode!=="marks"&&p.groups.map((group,i)=><div className="paper-question" key={group.key}>
   <div className="assessment-question-heading"><strong className="assessment-question-number">Question {number(group,i)}</strong><span className="marks">({group.marks} {group.marks===1?"mark":"marks"})</span></div>
   {p.mode==="teacher"&&p.teacherSourceMode==="inline"&&<p className="assessment-source">Source: {formatAssessmentSource(group,p.allQuestions)}</p>}
   <TeacherGradePerformance parts={group.parts} tier={group.question.tier} selectedGrade={p.performanceGrade} className="teacher-stats-question"/>
   <div className="paper-row"><span className="assessment-question-content">{content(group,i,"question")}
    {p.sequential&&p.replaceSourceTotals&&assets.some(a=>{
     if(a.kind!=="question"||!a.needsReview||a.maskKey!==group.key)return false;
     const result=p.numberingResults?.[a.maskKey];
     return result?.status==="manual"||result?.status==="ready"&&!result.layout.totalRects.some(total=>projectNumberingRect(total.rect,a.crop));
    })&&<div className="assessment-renumber-total">(Total for Question {number(group,i)} is {group.marks} {group.marks===1?"mark":"marks"})</div>}
    <span className="hint print-hide">Included parts: {group.parts.map(part=>part.sourceId).join(", ")}</span>
   </span></div><div className="working-space"/><button className="remove print-hide" onClick={()=>p.onRemove(group.key)}>Remove</button>
  </div>)}
  {(p.mode==="marks"||p.mode==="both")&&p.groups.length>0&&<div className={`mark-scheme${p.mode==="marks"?" mark-scheme-only":""}`}><h2>{p.title} — Mark scheme</h2>{p.groups.map((group,i)=><div className="mark-scheme-item" key={group.key}><div className="assessment-question-heading"><strong className="assessment-question-number">Question {number(group,i)}</strong><span>({group.marks} {group.marks===1?"mark":"marks"})</span></div><TeacherGradePerformance parts={group.parts} tier={group.question.tier} selectedGrade={p.performanceGrade} className="teacher-stats-mark"/>{content(group,i,"mark")}</div>)}</div>}
  {p.mode==="teacher"&&p.teacherSourceMode==="sheet"&&p.groups.length>0&&<section className="teacher-source-sheet"><h2>{p.title} — Source references</h2>{p.groups.map((group,i)=><div key={group.key}><strong>Question {number(group,i)} ({group.marks} {group.marks===1?"mark":"marks"})</strong><p className="assessment-source">Source: {formatAssessmentSource(group,p.allQuestions)}</p></div>)}</section>}
 </div>;
}
