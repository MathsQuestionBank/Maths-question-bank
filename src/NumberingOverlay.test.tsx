import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import NumberingOverlay from "./NumberingOverlay";
import type { AutomaticNumberingLayout } from "./automaticNumbering";

const layout:AutomaticNumberingLayout={version:1,originalNumber:14,imageWidth:1000,imageHeight:500,method:"pdf-text",numberRects:[{left:.2,top:.2,width:.04,height:.06}],totalRects:[{rect:{left:.5,top:.8,width:.35,height:.06},marks:5}]};
const crop={left:0,right:0,top:0,bottom:0};
const textTag=(html:string,cls:string)=>html.match(new RegExp(`<text class="${cls}"[^>]*>`))?.[0]||"";

describe("source-coordinate numbering overlays",()=>{
 afterEach(()=>vi.unstubAllGlobals());
 it("uses the raw source crop as its viewBox and retains exact source mask positions",()=>{
  const html=renderToStaticMarkup(<NumberingOverlay layout={layout} crop={{left:10,right:20,top:10,bottom:10}} number="1" marks={5}/>);
  expect(html).toContain('viewBox="100 50 700 400"');
  expect(html).toContain('class="mqb-auto-number-mask" x="199.5" y="99.5" width="41" height="31"');
  expect(html).toContain("(Total for Question 1 is 5 marks)");
  expect(textTag(html,"mqb-auto-total-text")).toContain('x="850"');
  expect(textTag(html,"mqb-auto-total-text")).toContain('text-anchor="end"');
 });
 it("covers source total glyphs that extend above an imperfect PDF-text box",()=>{
  const html=renderToStaticMarkup(<NumberingOverlay layout={layout} crop={crop} number="1" marks={5}/>);
  const total=html.match(/<rect class="mqb-auto-total-mask"[^>]*>/)?.[0]||"";
  const y=Number(total.match(/ y="([\\d.-]+)"/)?.[1]);
  const h=Number(total.match(/ height="([\\d.-]+)"/)?.[1]);
  expect(y).toBeLessThan(400-50); // protect more than three printed text lines above the detected box
  expect(y+h).toBeGreaterThan(430); // retain coverage through the detected footer
  expect(html).toContain('class="mqb-auto-number-mask" x="199.5" y="99.5"');
  expect(html).toContain("(Total for Question 1 is 5 marks)");
 });
 it("does not extend a footer cover beyond the cropped source bounds",()=>{
  const nearTop={...layout,totalRects:[{rect:{left:.5,top:.02,width:.35,height:.03},marks:5}]};
  const html=renderToStaticMarkup(<NumberingOverlay layout={nearTop} crop={{...crop,top:1}} number="1" marks={5}/>);
  const total=html.match(/<rect class="mqb-auto-total-mask"[^>]*>/)?.[0]||"";
  expect(Number(total.match(/ y="([\\d.-]+)"/)?.[1])).toBeGreaterThanOrEqual(8);
 });
 it("can cover an earlier compact source viewport without duplicating the replacement text",()=>{
  const html=renderToStaticMarkup(<NumberingOverlay layout={layout} crop={crop} number="1" marks={5} maskOnlyTotalIndices={[0]}/>);
  expect(html).toContain('mqb-auto-total-mask');
  expect(html).not.toContain('mqb-auto-total-text');
  expect(html).toContain('mqb-auto-number-text');
 });
 it("does not stretch a shorter replacement number or total statement",()=>{
  const context={font:"",measureText(text:string){return {width:text.length*6,actualBoundingBoxAscent:10,actualBoundingBoxDescent:2,actualBoundingBoxLeft:0,actualBoundingBoxRight:text.length*6}}};
  vi.stubGlobal("document",{createElement:()=>({getContext:()=>context})});
  const html=renderToStaticMarkup(<NumberingOverlay layout={layout} crop={crop} number="1" marks={5}/>);
  expect(textTag(html,"mqb-auto-number-text")).not.toContain("textLength");
  expect(textTag(html,"mqb-auto-total-text")).not.toContain("textLength");
 });
 it("constrains a wider number to its detected region instead of overlapping adjacent content",()=>{
  const narrow={...layout,originalNumber:1,numberRects:[{left:.2,top:.2,width:.012,height:.06}]};
  const html=renderToStaticMarkup(<NumberingOverlay layout={narrow} crop={crop} number="100" marks={5}/>);
  expect(textTag(html,"mqb-auto-number-text")).toContain('textLength="12"');
 });
 it("omits completely cropped-out original print and clips partial masks without moving their source origin",()=>{
  const partlyCropped={...layout,numberRects:[{left:.095,top:.2,width:.02,height:.06},{left:.01,top:.2,width:.02,height:.06}]};
  const html=renderToStaticMarkup(<NumberingOverlay layout={partlyCropped} crop={{...crop,left:10}} number="1" replaceTotals={false}/>);
  expect(html.split('class="mqb-auto-number-mask"')).toHaveLength(2);
  expect(html).toContain('x="94.5"');
  expect(html).not.toContain("mqb-auto-total-mask");
 });
 it("uses the assessment marks and handles the singular mark label",()=>{
  const html=renderToStaticMarkup(<NumberingOverlay layout={layout} crop={crop} number="2" marks={1}/>);
  expect(html).toContain("(Total for Question 2 is 1 mark)");
  expect(html).not.toContain("5 marks");
 });
 it("measures the actual font and keeps OCR replacement ink inside its source text box",()=>{
  const context={font:"",measureText(text:string){const size=Number(this.font.match(/([\d.]+)px/)?.[1]);return {width:size*.6*text.length,actualBoundingBoxAscent:size*.9,actualBoundingBoxDescent:size*.3,actualBoundingBoxLeft:0,actualBoundingBoxRight:size*.6*text.length}}};
  vi.stubGlobal("document",{createElement:()=>({getContext:()=>context})});
  const tight={...layout,method:"ocr" as const,totalRects:[{rect:{left:.5,top:.8,width:.2,height:.034},marks:5}]};
  const html=renderToStaticMarkup(<NumberingOverlay layout={tight} crop={crop} number="1" marks={5}/>);
  const tag=textTag(html,"mqb-auto-total-text");
  const size=Number(tag.match(/font-size="([\d.]+)"/)?.[1]),baseline=Number(tag.match(/ y="([\d.]+)"/)?.[1]);
  expect(size*1.2).toBeLessThanOrEqual(17.0001);
  expect(baseline-size*.9).toBeGreaterThanOrEqual(400);
  expect(baseline+size*.3).toBeLessThanOrEqual(417.0001);
  expect(tag).toContain('textLength="200"');
  expect(html).toContain('viewBox="500 400 200 17" overflow="hidden"');
 });
});
