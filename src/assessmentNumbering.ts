import type { AssessmentGroup } from "./assessmentGroups";
import type { BankQuestion } from "./questionData";

/** Read only a question reference, never question text, mathematics or image labels. */
function storedQuestionNumber(q:BankQuestion):number|null {
 const explicit=q.questionNumber?.trim().match(/^(?:Q(?:uestion)?\s*)?0*(\d+)(?:[a-z]+|(?:\([a-z0-9]+\))+)?$/i);
 const source=q.sourceId?.trim().match(/(?:^|[-_])Q0*(\d+)(?:[a-z]+)?$/i);
 const value=explicit?.[1]??source?.[1];
 if(!value)return null;
 const number=Number(value);
 return Number.isSafeInteger(number)&&number>0?number:null;
}

/** A multipart group receives one parent number in every assessment output. */
export function assessmentQuestionNumber(group:AssessmentGroup,position:number,sequential:boolean):string {
 if(sequential)return String(position);
 const original=storedQuestionNumber(group.question);
 return original===null?"Original unknown":String(original);
}

const available=(value:string|undefined)=>{
 const text=value?.trim()||"";
 return /^(?:unspecified|unknown|unmapped)$/i.test(text)?"":text;
};

function questionSource(q:BankQuestion):string {
 const paper=available(q.paperCode);
 const paperNumber=paper.match(/^([123])[FH]$/i)?.[1];
 // Loaded bank rows distinguish a real tier from the question-bank display's
 // Higher fallback. Old in-memory callers without that field keep their tier.
 const tier=available("sourceTier" in q?q.sourceTier:q.tier);
 const number=storedQuestionNumber(q);
 const fields=[available(q.examBoard),available(q.series),tier,
  paperNumber?`Paper ${paperNumber}`:paper?(/^paper\b/i.test(paper)?paper:`Paper ${paper}`):"",
  number===null?"":`Original Q${number}`].filter(Boolean);
 return fields.length?fields.join(" | "):"Source metadata unavailable";
}

/** Sources come from stored metadata and explicit shadow links, never a guessed
 * exam board, session or paper based on the image filename. */
export function formatAssessmentSource(group:AssessmentGroup,allQuestions:readonly BankQuestion[]=[]):string {
 const q=group.question;
 if(q.shadowPaperId||q.shadowOfQuestionId){
  const shadow=["Shadow",available(q.shadowSet)].filter(Boolean).join(" ");
  const original=allQuestions.find(original=>original.id===q.shadowOfQuestionId);
  return original?`${shadow} | Based on: ${questionSource(original)}`:`${shadow} | Original source unavailable`;
 }
 return questionSource(q);
}

/** The cropped source already contains the desired number/total when the
 * imported question's original paper position is identical to its position
 * in the new assessment. Reuse it instead of placing opaque covers over
 * pupils' answer lines, working space and diagrams.
 *
 * Only trustworthy archived Edexcel IDs qualify. Shadow questions and
 * unrecognised question references always use the replacement-number path.
 */
export function originalPrintedNumber(group:AssessmentGroup):number|null {
 const q=group.question;
 if(q.shadowPaperId||q.shadowOfQuestionId||!q.questionUrl)return null;
 if(q.examBoard?.toLowerCase()!=="edexcel")return null;
 const match=q.sourceId?.match(/^(?:EDX-[FH]-(?:JUNE|NOVEMBER)20\d{2}-[123][FH]|20\d{2}_[123][FH])[-_]Q0*(\d{1,3})(?:[a-z]+)?$/i);
 if(!match)return null;
 const n=Number(match[1]);
 return Number.isInteger(n)&&n>0&&n<=100&&storedQuestionNumber(q)===n?n:null;
}

export function canReuseOriginalPrintedQuestion(group:AssessmentGroup,assessmentPosition:number):boolean {
 return originalPrintedNumber(group)===assessmentPosition &&
  group.parts.every(part=>part.shadowPaperId===undefined &&part.shadowOfQuestionId===undefined);
}
