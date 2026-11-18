import {describe,it,expect} from "vitest";
import {croppedImageSize,imageBlankBands,paginateAssessmentImage,assessmentPrintWidthMm,assessmentImagePageMm} from "./assessmentImagePagination";
const pixels=(width:number,height:number)=>new Uint8ClampedArray(width*height*4).fill(255);
function ink(data:Uint8ClampedArray,width:number,x:number,y:number){const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=0;}
describe("readable A4 image pagination",()=>{
 it("keeps a short question at full width, without a new page or image resampling",()=>{
  expect(paginateAssessmentImage(1000,800,[])).toEqual({width:1000,height:800,slices:[{top:0,bottom:800}]});
  expect(paginateAssessmentImage(1000,1190,[]).slices).toHaveLength(1);
 });
 it("uses the retained crop dimensions rather than the uncropped source aspect ratio",()=>{
  expect(croppedImageSize(600,1800,{top:10,bottom:10,left:10,right:10})).toEqual({width:480,height:1440});
 });
 it("preserves every source row exactly once at the same width across a tall scan",()=>{
  const plan=paginateAssessmentImage(1000,3400,[{top:1000,bottom:1100},{top:2100,bottom:2300}]);
  expect(plan.slices).toHaveLength(3);expect(plan.warning).toBeUndefined();
  expect(plan.slices[0].top).toBe(0);expect(plan.slices[plan.slices.length-1]?.bottom).toBe(3400);
  plan.slices.forEach((s,i)=>{expect(s.bottom).toBeGreaterThan(s.top);expect((s.bottom-s.top)/plan.width*assessmentPrintWidthMm).toBeLessThanOrEqual(assessmentImagePageMm+.001);if(i)expect(s.top).toBe(plan.slices[i-1].bottom)});
 });
 it("breaks before a graph to retain its grid and table on a single continuation page",()=>{
  const plan=paginateAssessmentImage(1000,3000,[{top:400,bottom:600},{top:2000,bottom:2200},{top:2400,bottom:2600}]);
  // Graph occupies 600..2000: never put a seam inside it merely to fill a page.
  expect(plan.slices.slice(0,-1).every(s=>s.bottom<=600||s.bottom>=2000)).toBe(true);
  expect(plan.warning).toBeUndefined();
 });
 it("recognises actual blank bands, not low-ink gaps between graph grid lines",()=>{
  const w=100,h=400,data=pixels(w,h);
  for(let y=80;y<280;y++)for(let x=10;x<90;x+=10)ink(data,w,x,y);
  for(let y=80;y<280;y+=20)for(let x=10;x<90;x++)ink(data,w,x,y);
  const bands=imageBlankBands(data,w,h);expect(bands).toEqual([{top:0,bottom:80},{top:280,bottom:400}]);
 });
 it("retains table rules, faint graph lines, labels and mathematical content as occupied",()=>{
  const w=100,h=100,data=pixels(w,h);
  for(let y=20;y<80;y++)for(const x of [20,50,80]){const i=(y*w+x)*4;data[i]=data[i+1]=data[i+2]=250;}
  expect(imageBlankBands(data,w,h)).toEqual([{top:0,bottom:20},{top:80,bottom:100}]);
 });
 it("can ignore continuous scan-edge rules while retaining short edge labels",()=>{
  const w=200,h=200,data=pixels(w,h);
  for(let y=0;y<h;y++){ink(data,w,0,y);ink(data,w,w-1,y);}
  for(let y=40;y<60;y++)ink(data,w,1,y);
  expect(imageBlankBands(data,w,h)).toEqual([{top:0,bottom:40},{top:60,bottom:200}]);
 });
 it("does not drop or trim long blank working spaces at page boundaries",()=>{
  const plan=paginateAssessmentImage(1000,6000,[{top:100,bottom:5900}]);
  expect(plan.slices[0].top).toBe(0);expect(plan.slices[plan.slices.length-1]?.bottom).toBe(6000);expect(plan.slices.reduce((n,s)=>n+s.bottom-s.top,0)).toBeCloseTo(6000,8);
 });
 it("keeps oversized continuous regions at readable scale and reports the unavoidable split",()=>{
  const plan=paginateAssessmentImage(1000,4000,[]);
  expect(plan.slices.length).toBeGreaterThan(1);expect(plan.warning).toContain("continuous image region");expect(plan.width).toBe(1000);
 });
 it("explains unavailable pixel analysis rather than silently reverting to fit-to-page",()=>{
  const plan=paginateAssessmentImage(1000,3000,[],false);expect(plan.warning).toContain("Whitespace could not be checked");expect(plan.slices.length).toBeGreaterThan(1);
 });
 it("reserves real heading space even when the image alone would fit one A4 page",()=>{
  const plan=paginateAssessmentImage(1000,1400,[{top:1100,bottom:1200}],true,220);
  expect(plan.slices).toHaveLength(2);expect(plan.slices[0].bottom/1000*180).toBeLessThanOrEqual(220);
  expect(plan.warning).toBeUndefined();
  expect(paginateAssessmentImage(1000,1400,[],true,255).slices).toHaveLength(1);
 });
 it("keeps an unbroken graphic intact when it can fit a fresh page",()=>{
  const plan=paginateAssessmentImage(1000,1400,[],true,220);expect(plan.slices).toHaveLength(1);expect(plan.warning).toBeUndefined();
 });
 it("rejects invalid first-page allowances rather than producing empty slices",()=>{
  for(const height of [0,-1,NaN,Infinity,256])expect(()=>paginateAssessmentImage(1000,3000,[],true,height)).toThrow();
 });
 it("rejects invalid dimensions and buffers",()=>{
  for(const [w,h] of [[0,3],[3,0],[-1,3],[NaN,3],[3,Infinity]])expect(()=>paginateAssessmentImage(w,h,[])).toThrow();
  expect(()=>imageBlankBands(new Uint8ClampedArray(4),10,10)).toThrow();
 });
});
