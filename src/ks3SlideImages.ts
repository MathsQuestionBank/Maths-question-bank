import * as pdfjs from "pdfjs-dist";
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

export type SlideImages = { question: Blob; answer: Blob; questionUrl: string; answerUrl: string };
export type SlidesPdf = Awaited<ReturnType<typeof pdfjs.getDocument>>["promise"] extends Promise<infer T> ? T : never;

export async function loadSlidePdf(file: File): Promise<SlidesPdf> {
  if (file.size > 80 * 1024 * 1024) throw new Error("PDF exceeds the 80 MB limit.");
  if (!/\.pdf$/i.test(file.name)) throw new Error("Export the original presentation as a PDF.");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  if (pdf.numPages !== 51) { await pdf.destroy(); throw new Error("The slide PDF must contain exactly 51 pages, one per original PowerPoint slide."); }
  return pdf;
}
async function imageFor(pdf: SlidesPdf, pageNumber: number): Promise<Blob> {
  const page = await pdf.getPage(pageNumber);
  // 1600px width for 16:9, while respecting the source aspect ratio.
  const raw = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(2.5, 1600 / raw.width) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser cannot create the slide preview canvas.");
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(new Error("Could not create image.")), "image/png"));
  page.cleanup();
  return blob;
}
export async function renderSlidePair(pdf: SlidesPdf, questionSlide: number, answerSlide: number): Promise<SlideImages> {
  const [question, answer] = await Promise.all([imageFor(pdf, questionSlide), imageFor(pdf, answerSlide)]);
  return { question, answer, questionUrl: URL.createObjectURL(question), answerUrl: URL.createObjectURL(answer) };
}
export function releaseSlidePair(pair: SlideImages | null): void {
  if (!pair) return;
  URL.revokeObjectURL(pair.questionUrl); URL.revokeObjectURL(pair.answerUrl);
}
