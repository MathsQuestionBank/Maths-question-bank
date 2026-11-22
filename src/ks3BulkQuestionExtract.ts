import JSZip from "jszip";

export type ExtractedPair = {
  sourceQuestionSlide: number;
  suggestedAnswerSlide: number | null;
  questionText: string;
  suggestedAnswerText: string;
  visualCheckRequired: true;
  pairingConfidence: "candidate";
};

function slideText(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Invalid PowerPoint slide XML.");
  const paragraphs = Array.from(doc.getElementsByTagName("*")).filter(el => el.localName === "p");
  return paragraphs.map(p => Array.from(p.getElementsByTagName("*"))
    .filter(el => el.localName === "t").map(el => el.textContent ?? "").join("").trim()
  ).filter(Boolean).join("\n");
}
export async function extractAllSlides(file: Blob): Promise<string[]> {
  if(file.size>22*1024*1024)throw new Error("PowerPoint exceeds the extraction size limit.");
  const zip=await JSZip.loadAsync(file);
  const paths=Object.keys(zip.files).map(path=>{
    const match=/^ppt\/slides\/slide(\d+)\.xml$/.exec(path);
    return match?{number:Number(match[1]),path}:null;
  }).filter((v):v is {number:number,path:string}=>v!==null).sort((a,b)=>a.number-b.number);
  if(!paths.length || paths.length>350 || paths.some((p,i)=>p.number!==i+1))
    throw new Error("PowerPoint slides could not be numbered reliably.");
  const slides:string[]=[];
  for(const {path} of paths){
    slides.push(slideText(await zip.file(path)!.async("string")));
  }
  return slides;
}
/** A starting point only: the uploaded resources are not universally alternating.
 * Odd slide counts often have a cover then question/answer pairs; even counts
 * may finish with a question or contain independent slides. All pairs need review.
 */
export function proposePairs(slides:string[]):ExtractedPair[]{
  const candidates:ExtractedPair[]=[];
  for(let question=2;question<=slides.length;question+=2){
    const answer=question+1<=slides.length?question+1:null;
    candidates.push({
      sourceQuestionSlide:question,
      suggestedAnswerSlide:answer,
      questionText:slides[question-1]??"",
      suggestedAnswerText:answer?slides[answer-1]??"":"",
      visualCheckRequired:true,
      pairingConfidence:"candidate"
    });
  }
  return candidates;
}
export type ReviewedDraft = ExtractedPair & {
  id: string;
  answerSlide: number | null;
  answerText: string;
  stepLabel: string;
  difficulty: "Accessible" | "Developing" | "Challenge";
  support: "None" | "Concrete resources" | "Visual scaffold" | "Guided";
  answerStatus: "source-unverified" | "missing" | "teacher-written" | "teacher-verified";
  review: "needs-review" | "approved" | "excluded";
};
export function makeReviewDrafts(slides:string[]):ReviewedDraft[]{
  return proposePairs(slides).map(p=>({
    ...p,id:crypto.randomUUID(),answerSlide:p.suggestedAnswerSlide,
    answerText:p.suggestedAnswerText,stepLabel:"Needs curriculum step review",
    difficulty:"Developing",support:"None",
    answerStatus:p.suggestedAnswerText?"source-unverified":"missing",
    review:"needs-review"
  }));
}
