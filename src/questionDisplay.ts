/** A human-readable label is separate from the stable mapping ID used by imports/assessments. */
export type QuestionDisplayInfo = {
  series:string; skill:string; sourceId?:string; paperCode?:string;
};

export function formatQuestionTitle(q:QuestionDisplayInfo):string {
  const source=(q.sourceId??"").trim();
  // Historic question IDs: 2022_3H_Q23a
  const legacy=source.match(/^20\d{2}_([123][FH])_(Q\d+[a-z0-9]*)$/i);
  // Enhanced Mapping IDs: EDX-F-NOVEMBER2022-1F-Q09B (and future exam boards)
  const enhanced=source.match(/^[a-z]+-[FH]-[a-z]+20\d{2}-([123][FH])-(Q\d+[a-z0-9]*)$/i);
  const paper=q.paperCode?.trim()||legacy?.[1]||enhanced?.[1]||"";
  const rawQuestion=legacy?.[2]||enhanced?.[2]||source;
  const normalQuestion=rawQuestion.replace(/^Q0*(\d+)([a-z0-9]*)$/i,(_,number:string,suffix:string)=>`Q${String(Number(number)).padStart(2,"0")}${suffix.toLowerCase()}`);
  const reference=[q.series?.trim(),paper.toUpperCase()].filter(Boolean).join(" ");
  const displayReference=reference&&normalQuestion?`${reference} - ${normalQuestion}`:reference||normalQuestion||"Question";
  const skill=q.skill.replace(/\b[a-z]/g,letter=>letter.toUpperCase());
  return skill?`${displayReference} - ${skill}`:displayReference;
}
