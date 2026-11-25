import {describe,it,expect} from "vitest";
import {validAutomaticLayout,requireVerifiedPrintedTotal,type NumberingResult} from "./numberingProcessing";
const layout={version:1,originalNumber:14,imageWidth:834,imageHeight:1082,numberRects:[{left:.07,top:.03,width:.02,height:.015}],totalRects:[{rect:{left:.56,top:.94,width:.3,height:.02},marks:5}],method:"pdf-text"};
describe("numbering layout validation before applying automatic covers",()=>{
 it("accepts complete source positions only for the matching image, reference and marks",()=>{
  expect(validAutomaticLayout(layout,14,5,834,1082)).toBe(true);
  expect(validAutomaticLayout(layout,17,5,834,1082)).toBe(false);
  expect(validAutomaticLayout(layout,14,6,834,1082)).toBe(false);
  expect(validAutomaticLayout(layout,14,5,834,1100)).toBe(false);
 });
 it("rejects malformed, out-of-image and unbounded rectangles",()=>{
  for(const rect of [{left:-.01,top:0,width:.02,height:.02},{left:.99,top:0,width:.2,height:.02},{left:0,top:NaN,width:.02,height:.02},{left:0,top:0,width:0,height:.02}])expect(validAutomaticLayout({...layout,numberRects:[rect]},14,5)).toBe(false);
  expect(validAutomaticLayout({...layout,version:2},14,5)).toBe(false);
  expect(validAutomaticLayout({...layout,numberRects:Array.from({length:100},()=>layout.numberRects[0])},14,5)).toBe(false);
 });
 it("requires explicit source proof before treating the original number as cropped out",()=>{
  expect(validAutomaticLayout({...layout,numberRects:[]},14,5)).toBe(false);
  expect(validAutomaticLayout({...layout,numberRects:[],numberAbsent:true},14,5)).toBe(true);
 });
 it("blocks a second printed total when the original footer has not been located",()=>{
  const missing={status:"ready",layout:{...layout,totalRects:[]},reused:false} as NumberingResult;
  expect(requireVerifiedPrintedTotal(missing,true).status).toBe("unsupported");
  expect(requireVerifiedPrintedTotal(missing,false).status).toBe("ready");
  const complete={status:"ready",layout,reused:false} as NumberingResult;
  expect(requireVerifiedPrintedTotal(complete,true).status).toBe("ready");
 });
});
