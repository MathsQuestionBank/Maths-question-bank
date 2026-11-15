import {describe,expect,it} from "vitest";
import {detectAutomaticNumbering,projectNumberingRect,type NumberingWord,type NumberingDetectionOptions} from "./automaticNumbering";

const options:NumberingDetectionOptions={width:1000,height:800,originalNumber:14,marks:5,kind:"question"};
const word=(text:string,left:number,top:number,width=text.length*8,confidence=96,height=16):NumberingWord=>({text,confidence,box:{left,top,width,height}});
const header=[word("14",70,25,16),word("Here",110,25,32),word("is",149,25,12),word("a",169,25,7),word("cuboid.",183,25,54)];
const footer=[word("(Total",590,700,45),word("for",641,700,20),word("Question",667,700,62),word("14",735,700,16),word("is",757,700,12),word("5",775,700,8),word("marks)",789,700,47)];
const ready=(words:NumberingWord[],settings=options)=>{
 const result=detectAutomaticNumbering(words,settings);expect(result.status).toBe("ready");if(result.status!=="ready")throw Error(result.reason);return result.layout;
};
describe("source-derived assessment numbering",()=>{
 it("locates the exact original number and total, without relying on image edges",()=>{
  const layout=ready([...header,word("(a)",95,100),word("Work",120,100),word("out",158,100),...footer]);
  expect(layout.numberRects).toHaveLength(1);expect(layout.totalRects).toHaveLength(1);
  expect(layout.numberRects[0].left).toBeCloseTo(.069);expect(layout.numberRects[0].top).toBeCloseTo(.03);
  expect(layout.totalRects[0].rect.top).toBeCloseTo(699/800);expect(layout.totalRects[0].marks).toBe(5);
  expect(layout.totalRects[0].rect.height).toBeLessThan(.025);
 });
 it("accepts high confidence complete PDF text items and source-proven cropped-out numbers",()=>{
  const layout=ready([word("(Total for Question 14 is 5 marks)",490,600,320,100)],{...options,method:"pdf-text",numberAbsent:true});
  expect(layout.numberAbsent).toBe(true);expect(layout.numberRects).toHaveLength(0);expect(layout.totalRects).toHaveLength(1);
 });
 it("requires evidence before treating a missing OCR numeral as already cropped out",()=>{
  expect(detectAutomaticNumbering([...header.slice(1),...footer],{...options,numberAbsent:true}).status).toBe("unsupported");
 });
 it("rejects totals with mismatched question number or marks",()=>{
  for(const changed of [[...header,...footer.map(w=>w.text==="14"?{...w,text:"13"}:w)],[...header,...footer.map(w=>w.text==="5"?{...w,text:"4"}:w)]])expect(detectAutomaticNumbering(changed,options).status).toBe("unsupported");
 });
 it("rejects uncertain and partially recognised footer text",()=>{
  expect(detectAutomaticNumbering([...header,...footer.map(w=>({...w,confidence:60}))],options).status).toBe("unsupported");
  expect(detectAutomaticNumbering([...header,...footer.filter(w=>w.text!=="Question")],options).status).toBe("unsupported");
 });
 it("never erases a PDF item containing both a footer and unrelated mathematical content",()=>{
  expect(detectAutomaticNumbering([...header,word("x = 14 (Total for Question 14 is 5 marks)",400,700,500,100)],{...options,method:"pdf-text"}).status).toBe("unsupported");
 });
 it("rejects mathematical digits, diagram labels and answer options as parent numbers",()=>{
  const text=[word("Work",110,25),word("out",150,25),word("the",180,25),word("value",210,25),word("14",70,200,16),word("+",110,200,9),word("3",130,200,8),...footer];
  expect(detectAutomaticNumbering(text,options).status).toBe("unsupported");
  expect(detectAutomaticNumbering([word("14",70,25,16),word("+",94,25,8),word("3",108,25,8),word("=",122,25,8),...footer],options).status).toBe("unsupported");
 });
 it("rejects a leading quantity in ordinary body prose using the source gutter",()=>{
  const text=[word("14",110,25,16),word("students",132,25,60),word("are",198,25,24),word("present",228,25,56),word("Calculate",110,70,70),word("the",186,70,24),word("total",216,70,38),...footer];
  expect(detectAutomaticNumbering(text,options).status).toBe("unsupported");
 });
 it("preserves multipart labels when a combined token supplies exact digit symbols",()=>{
  const number=word("14(a)",70,25,45);number.symbols=[{text:"1",box:{left:70,top:25,width:7,height:16}},{text:"4",box:{left:78,top:25,width:8,height:16}},{text:"(",box:{left:88,top:25,width:4,height:16}},{text:"a",box:{left:92,top:25,width:7,height:16}}];
  const layout=ready([number,word("Work",125,25,32),...footer]);
  expect(layout.numberRects[0].left+layout.numberRects[0].width).toBeLessThan(.088);
  expect(detectAutomaticNumbering([{...number,symbols:undefined},word("Work",125,25,32),...footer],options).status).toBe("unsupported");
 });
 it("accepts a multipart heading whose label gap is smaller than later prose/formula gaps",()=>{
  const tight=[word("14",16.4,53.8,22.3,95,17.7),word("(a)",52.5,55.1,24.9,95,19.7),word("Simplify",89.25,54.5,82.7,95,22.3),word("fully",179.8,54.5,44,92,21.7),word("(3x^5y^6)^4",238.9,53.2,68.9,20,23),word("(b)",52.5,356.3,27,93,21),word("Expand",88.6,356.3,72.8,96,22.3),...footer];
  const layout=ready(tight);
  expect(layout.numberRects[0].left+layout.numberRects[0].width).toBeLessThan(52.5/options.width);
  expect(layout.totalRects[0].marks).toBe(5);
  expect(detectAutomaticNumbering(tight.map(w=>w.text==="(a)"?{...w,confidence:20}:w),options).status).toBe("unsupported");
 });
 it("supports narrow single-digit labels despite their tall aspect ratio",()=>{
  const words=[word("1",70,25,5,60),word("Write",110,25,40),...footer.map(w=>w.text==="14"?{...w,text:"1"}:w)];
  expect(ready(words,{...options,originalNumber:1}).numberRects).toHaveLength(1);
 });
 it("rejects a mark-scheme answer number when no parent-column evidence exists",()=>{
  expect(detectAutomaticNumbering([word("14",80,20,16),word("B1",220,20,16)],{...options,kind:"mark"}).status).toBe("unsupported");
 });
 it("supports a source mark-table label while leaving the answer and marks untouched",()=>{
  const layout=ready([word("Question",70,10,64),word("Answer",190,10,48),word("14",70,70,16),word("x",190,70,8),word("=",205,70,8),word("14",220,70,16),word("B1",350,70,16)],{...options,kind:"mark",method:"pdf-text"});
  expect(layout.numberRects).toHaveLength(1);expect(layout.numberRects[0].left).toBeLessThan(.1);
 });
});
describe("original-image crop projection",()=>{
 it("uses separate horizontal and vertical crop fractions for different aspect ratios",()=>{
  const rect=projectNumberingRect({left:.2,top:.3,width:.2,height:.1},{left:10,right:10,top:20,bottom:30})!;
  expect(rect.left).toBeCloseTo(.125);expect(rect.top).toBeCloseTo(.2);expect(rect.width).toBeCloseTo(.25);expect(rect.height).toBeCloseTo(.2);
 });
 it("omits a source number that is entirely outside the chosen crop",()=>{
  expect(projectNumberingRect({left:.02,top:.02,width:.02,height:.02},{left:10,right:0,top:0,bottom:0})).toBeNull();
 });
 it("clips an intersecting source rectangle without moving other source content",()=>{
  const rect=projectNumberingRect({left:.05,top:.1,width:.1,height:.1},{left:10,right:0,top:0,bottom:0})!;
  expect(rect.left).toBe(0);expect(rect.width).toBeCloseTo(.05/.9);
 });
});
