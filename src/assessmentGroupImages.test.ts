import {describe,expect,it} from "vitest";
import {assessmentGroupImages,buildAssessmentGroups,checkAssessmentExport} from "./assessmentGroups";
import type {BankQuestion} from "./questionData";

const part=(id:string):BankQuestion=>({
 id,sourceId:`2022_1H_Q02${id}`,questionNumber:`Q02${id}`,marks:2,
 topic:"Algebra",skill:"Substitution",tier:"Higher",grade:6,calculator:false,
 series:"June 2022",ao:"AO1",challenge:"Standard",prompt:"Question",answer:"Answer",
 tags:[],gradePerformance:{},
 imageCrops:{question:{top:0,right:0,bottom:0,left:0},mark:{top:0,right:0,bottom:0,left:0}},
 cropReview:{question:"unreviewed",mark:"unreviewed"}
});
const group=(parts:BankQuestion[])=>buildAssessmentGroups(parts,[parts[parts.length-1].id])[0];

describe("multipart export images",()=>{
 it("groups nested part suffixes and keeps their marks associated with the parent",()=>{
  const parts=["a","bi","bii"].map(id=>({...part(id),questionPath:"whole.png",questionUrl:"whole.png",markSchemePath:"whole-mark.png",markSchemeUrl:"whole-mark.png"}));
  const question=group(parts);
  expect(question.parts.map(part=>part.id)).toEqual(["a","bi","bii"]);
  expect(question.marks).toBe(6);
  expect(assessmentGroupImages(question,"question")).toHaveLength(1);
 });
 it("deduplicates the documented V6.2 whole-image copies stored under different part paths",()=>{
  const parts=["a","bi","bii"].map(id=>({...part(id),questionPath:`v6.2/2020/2H/Q02${id}/question.png`,questionUrl:`https://images.test/v6.2/2020/2H/Q02${id}/question.png`,markSchemePath:`v6.2/2020/2H/Q02${id}/mark.png`,markSchemeUrl:`https://images.test/v6.2/2020/2H/Q02${id}/mark.png`}));
  const question=group(parts);
  expect(assessmentGroupImages(question,"question")).toHaveLength(1);
  expect(assessmentGroupImages(question,"mark")).toHaveLength(1);
  const differentlyCropped=group([parts[0],{...parts[1],imageCrops:{...parts[1].imageCrops,question:{top:50,right:0,bottom:0,left:0}}}]);
  expect(assessmentGroupImages(differentlyCropped,"question")).toHaveLength(2);
 });
 it("exports distinct question and marking images in part order once each",()=>{
  const parts=["a","b","c"].map(id=>({...part(id),questionPath:`q/${id}.png`,questionUrl:`https://images.test/q/${id}.png?token=1`,markSchemePath:`m/${id}.png`,markSchemeUrl:`https://images.test/m/${id}.png?token=1`}));
  const question=group(parts);
  expect(assessmentGroupImages(question,"question").map(image=>image.question.id)).toEqual(["a","b","c"]);
  expect(assessmentGroupImages(question,"mark").map(image=>image.question.id)).toEqual(["a","b","c"]);
  expect(checkAssessmentExport([question],"both").ready).toBe(true);
 });
 it("exports a shared complete-question image only once despite different signed tokens",()=>{
  const a={...part("a"),questionUrl:"https://images.test/whole-question.png?token=1",markSchemePath:"marks/whole.png",markSchemeUrl:"https://images.test/whole-mark.png?token=1"};
  const b={...part("b"),questionUrl:"https://images.test/whole-question.png?token=2",markSchemePath:"marks/whole.png",markSchemeUrl:"https://images.test/whole-mark.png?token=2"};
  const question=group([a,b]);
  expect(assessmentGroupImages(question,"question")).toHaveLength(1);
  expect(assessmentGroupImages(question,"mark")).toHaveLength(1);
  expect(checkAssessmentExport([question],"both").ready).toBe(true);
 });
 it("preserves meaningful URL query parameters when no storage path is available",()=>{
  const a={...part("a"),questionUrl:"https://images.test/page.svg?page=1&token=old"};
  const b={...part("b"),questionUrl:"https://images.test/page.svg?token=new&page=2"};
  const c={...part("c"),questionUrl:"https://images.test/page.svg?token=new&page=1"};
  expect(assessmentGroupImages(group([a,b,c]),"question").map(image=>image.question.id)).toEqual(["a","b"]);
 });
 it("compares complete data URLs without discarding any image content",()=>{
  const a={...part("a"),questionUrl:"data:image/svg+xml,%3Csvg%3Epart?one%3C/svg%3E"};
  const b={...part("b"),questionUrl:"data:image/svg+xml,%3Csvg%3Epart?two%3C/svg%3E"};
  expect(assessmentGroupImages(group([a,b]),"question")).toHaveLength(2);
 });
 it("chooses the mark scheme independently from the question-image representative",()=>{
  const a={...part("a"),questionUrl:"question.png"};
  const b={...part("b"),markSchemeUrl:"mark.png"};
  const question=group([a,b]);
  expect(question.question.id).toBe("a");
  expect(assessmentGroupImages(question,"mark")[0].question.id).toBe("b");
  expect(checkAssessmentExport([question],"both").ready).toBe(true);
 });
 it("blocks a distinct part whose stored image has not obtained a signed URL",()=>{
  const a={...part("a"),questionPath:"q/a.png",questionUrl:"a.png",markSchemeUrl:"whole-mark.png"};
  const b={...part("b"),questionPath:"q/b.png",markSchemeUrl:"whole-mark.png"};
  const question=group([a,b]);
  expect(checkAssessmentExport([question],"questions").ready).toBe(false);
  expect(checkAssessmentExport([question],"teacher").missingQuestions).toEqual([question.label]);
  expect(checkAssessmentExport([question],"marks").ready).toBe(true);
  const loaded=group([a,{...b,questionUrl:"b.png"}]);
  expect(checkAssessmentExport([loaded],"both").ready).toBe(true);
 });
 it("blocks missing distinct mark schemes even when the question has one available scheme",()=>{
  const a={...part("a"),questionUrl:"whole-question.png",markSchemePath:"m/a.png",markSchemeUrl:"mark-a.png"};
  const b={...part("b"),questionUrl:"whole-question.png",markSchemePath:"m/b.png"};
  const question=group([a,b]);
  expect(checkAssessmentExport([question],"questions").ready).toBe(true);
  expect(checkAssessmentExport([question],"teacher").ready).toBe(true);
  expect(checkAssessmentExport([question],"both").missingMarks).toEqual([question.label]);
 });
 it("keeps different crops of a shared page and deduplicates equal crops",()=>{
  const a={...part("a"),markSchemePath:"page.png",markSchemeUrl:"page.png"};
  const b={...part("b"),markSchemePath:"page.png",markSchemeUrl:"page.png",imageCrops:{...part("b").imageCrops,mark:{top:50,right:0,bottom:0,left:0}}};
  const c={...part("c"),markSchemePath:"page.png",markSchemeUrl:"page.png",imageCrops:b.imageCrops};
  expect(assessmentGroupImages(group([a,b,c]),"mark").map(image=>image.question.id)).toEqual(["a","b"]);
 });
});
