import type { AssessmentGroup } from "./assessmentGroups";

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
 const match=q.sourceId?.match(/^(?:EDX-[FH]-(?:JUNE|NOVEMBER)20\d{2}-[123][FH]|20\d{2}_[123][FH])[-_]Q0*(\d{1,3})(?:[a-z])?$/i);
 if(!match)return null;
 const n=Number(match[1]);
 return Number.isInteger(n)&&n>0&&n<=100?n:null;
}

export function canReuseOriginalPrintedQuestion(group:AssessmentGroup,assessmentPosition:number):boolean {
 return originalPrintedNumber(group)===assessmentPosition &&
  group.parts.every(part=>part.shadowPaperId===undefined &&part.shadowOfQuestionId===undefined);
}
