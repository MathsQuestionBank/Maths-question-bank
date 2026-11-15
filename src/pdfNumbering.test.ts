import {describe,expect,it} from "vitest";
import type {PDFDocumentProxy} from "pdfjs-dist";
import {pdfWordsForSlice,readNumberingLayout,type NumberingPdfTextItem,type NumberingPdfViewport} from "./pdfNumbering";

const viewport:NumberingPdfViewport={width:840,height:1120,scale:1.4,transform:[1.4,0,0,-1.4,0,1120]};
const styles={serif:{ascent:.8,descent:-.2}};
const slice={page:2,top:.25,bottom:.75};
const item=(str:string,x:number,pageY:number,width:number):NumberingPdfTextItem=>({str,width,fontName:"serif",transform:[12,0,0,12,x,800-pageY]});
const items=[item("14",60,220,12),item("Work out the value of x.",90,220,220),item("(Total for Question 14 is 5 marks)",250,500,300)];
const pdf=(source=items,textStyles=styles)=>({numPages:3,getPage:async()=>({getViewport:()=>viewport,getTextContent:async()=>({items:source,styles:textStyles})})}) as unknown as PDFDocumentProxy;

describe("source PDF numbering coordinates",()=>{
 it("maps baseline/font boxes through the exact drawSlice raster origin",()=>{
  const result=pdfWordsForSlice(items,styles,viewport,slice)!;
  expect(result.width).toBe(840);expect(result.height).toBe(560);expect(result.start).toBe(280);
  expect(result.words[0].box.left).toBeCloseTo(84);
  expect(result.words[0].box.top).toBeCloseTo(14.56);
  expect(result.words[0].box.width).toBeCloseTo(16.8);
  expect(result.words[0].box.height).toBeCloseTo(16.8);
  expect(result.words[2].box.top).toBeCloseTo(406.56);
 });
 it("uses integer source dimensions for fractional extraction slices",()=>{
  const fractional={...slice,top:.123456,bottom:.612345};
  const result=pdfWordsForSlice(items,styles,{...viewport,width:840.4,height:1120.4},fractional)!;
  expect(result.width).toBe(840);
  expect(result.start).toBe(Math.floor(1120*fractional.top));
  expect(result.height).toBe(Math.floor(1120*(fractional.bottom-fractional.top)));
 });
 it("honours the page viewport rotation instead of using raw PDF y coordinates",()=>{
  const rotated:NumberingPdfViewport={width:840,height:1120,scale:1.4,transform:[0,1.4,1.4,0,0,0]};
  const rotatedItem={...items[0],transform:[0,12,-12,0,220,60]};
  const result=pdfWordsForSlice([rotatedItem],styles,rotated,slice)!;
  expect(result.words[0].box.left).toBeCloseTo(84);
  expect(result.words[0].box.top).toBeCloseTo(14.56);
  expect(result.words[0].box.width).toBeCloseTo(16.8);
 });
 it("rejects missing font metrics and invalid slices instead of guessing an opaque box",()=>{
  expect(pdfWordsForSlice(items,{serif:{}},viewport,slice)).toBeUndefined();
  expect(pdfWordsForSlice(items,styles,viewport,{...slice,bottom:.2})).toBeUndefined();
  expect(pdfWordsForSlice(items,styles,viewport,{...slice,page:0})).toBeUndefined();
 });
 it("produces normalized raw-image positions for exact source labels",async()=>{
  const layout=await readNumberingLayout(pdf(),slice,14,5,"question");
  expect(layout).toMatchObject({version:1,originalNumber:14,imageWidth:840,imageHeight:560,method:"pdf-text"});
  expect(layout?.numberRects).toHaveLength(1);expect(layout?.totalRects).toHaveLength(1);
  expect(layout!.numberRects[0].left).toBeCloseTo(83.5/840,6);
  expect(layout!.totalRects[0].marks).toBe(5);
 });
 it("keeps incorrect source mark totals unsupported",async()=>{
  expect(await readNumberingLayout(pdf(),slice,14,6,"question")).toBeUndefined();
 });
 it("records source-proven absence when the original number was trimmed just above the slice",async()=>{
  const cropped=[item("14",60,195,12),item("Work out the value of x.",90,220,220),items[2]];
  const layout=await readNumberingLayout(pdf(cropped),slice,14,5,"question");
  expect(layout?.numberAbsent).toBe(true);
  expect(layout?.numberRects).toEqual([]);
  expect(layout?.totalRects).toHaveLength(1);
 });
 it("leaves inaccessible pages or broken PDF text layers optional",async()=>{
  expect(await readNumberingLayout(pdf(),{...slice,page:4},14,5,"question")).toBeUndefined();
  const unavailable={numPages:3,getPage:async()=>{throw new Error("PDF unavailable")}} as unknown as PDFDocumentProxy;
  expect(await readNumberingLayout(unavailable,slice,14,5,"question")).toBeUndefined();
 });
});
