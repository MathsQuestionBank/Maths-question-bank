import JSZip from "jszip";

export type KS3ImportDraft = {
  id: string;
  questionSlide: number;
  answerSlide: number;
  questionText: string;
  answerText: string;
  stepId: string;
  difficulty: "Accessible" | "Developing" | "Challenge";
  support: "None" | "Concrete resources" | "Visual scaffold" | "Guided";
  marks: number | null;
  review: "needs-review" | "approved" | "excluded";
  visualReviewRequired: boolean;
};
export type KS3SlidePair = Pick<KS3ImportDraft, "questionSlide" | "answerSlide" | "questionText" | "answerText">;

function getSlideText(xml: string): string {
  // PowerPoint puts text in DrawingML runs. Preserve distinct paragraphs, avoiding
  // flattening all the slide into one string. It does NOT capture drawn diagrams.
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Invalid slide XML");
  const paragraphs = Array.from(doc.getElementsByTagName("*")).filter(el => el.localName === "p");
  return paragraphs.map(p => Array.from(p.getElementsByTagName("*"))
    .filter(el => el.localName === "t")
    .map(el => el.textContent || "").join("").trim())
    .filter(Boolean).join("\n").trim();
}

/**
 * White Rose Year 7 Sequences exemplar has one cover slide and then alternating
 * question/answer slides. This layout is verified for the supplied 51-slide file,
 * and must not be inferred for other PowerPoints.
 */
export async function inspectSequencesExemplar(file: File): Promise<KS3SlidePair[]> {
  if (!/\.pptx$/i.test(file.name)) throw new Error("Please select a .pptx PowerPoint");
  if (file.size > 40 * 1024 * 1024) throw new Error("PowerPoint exceeds the 40 MB review limit");
  const zip = await JSZip.loadAsync(file);
  const numbered = Object.keys(zip.files).map(path => {
    const match = /^ppt\/slides\/slide(\d+)\.xml$/.exec(path);
    return match ? Number(match[1]) : null;
  }).filter((n): n is number => n !== null).sort((a, b) => a - b);
  if (numbered.length !== 51 || numbered.some((n, i) => n !== i + 1)) {
    throw new Error("This importer currently requires the verified 51-slide Year 7 Sequences exemplar. Other formats need a separate layout review.");
  }
  const pairs: KS3SlidePair[] = [];
  for (let q = 2; q <= 50; q += 2) {
    const question = zip.file(`ppt/slides/slide${q}.xml`);
    const answer = zip.file(`ppt/slides/slide${q + 1}.xml`);
    if (!question || !answer) throw new Error(`Slide ${q} or ${q + 1} is missing`);
    pairs.push({
      questionSlide: q, answerSlide: q + 1,
      questionText: getSlideText(await question.async("string")),
      answerText: getSlideText(await answer.async("string")),
    });
  }
  return pairs;
}

export function suggestedStepId(slide: number): string {
  if (slide <= 13) return "y7-7.1-01";
  if (slide <= 15) return "y7-7.1-03";
  if (slide <= 25) return "y7-7.1-04";
  if (slide <= 33) return "y7-7.1-05";
  if (slide <= 39) return "y7-7.1-06";
  if (slide <= 47) return "y7-7.1-07";
  return "y7-7.1-08";
}
export function makeDrafts(pairs: KS3SlidePair[]): KS3ImportDraft[] {
  return pairs.map(p => ({
    ...p, id: `WRM-V2-Y7-7.1-S${String(p.questionSlide).padStart(2, "0")}`,
    stepId: suggestedStepId(p.questionSlide), difficulty: "Developing",
    support: "None", marks: null, review: "needs-review",
    // PPTX slides contain editable shapes, charts, diagrams and images that a
    // text-only XML extractor cannot faithfully render.
    visualReviewRequired: true,
  }));
}
