import {afterEach,describe,expect,it,vi} from "vitest";
import type {Worker} from "tesseract.js";
import {refineNumberingOcr} from "./refineNumberingOcr";
import {detectAutomaticNumbering,type NumberingWord} from "./automaticNumbering";
const width=400,height=320;
const word=(text:string,left:number,top:number,w=text.length*6):NumberingWord=>({text,confidence:96,box:{left,top,width:w,height:14}});
const words=[word("pressure",220,70,60),word("Work",80,150,30),word("out",116,150,20),word("(Total for Question 7 is 2 marks)",170,270,210)];
function fixture(extra?:(ink:(x:number,y:number)=>void)=>void){
 const pixels=new Uint8ClampedArray(width*height*4).fill(255);
 const ink=(x:number,y:number)=>{const offset=(y*width+x)*4;pixels[offset]=0;pixels[offset+1]=0;pixels[offset+2]=0;pixels[offset+3]=255};
 // A long frame and separate margin letters must never become number covers.
 for(let y=0;y<height;y++){ink(45,y);ink(46,y)}
 for(const top of [60,80,100])for(let y=top;y<top+8;y++)for(let x=15;x<24;x++)ink(x,y);
 const seven=(left:number,top:number)=>{for(let x=left;x<left+8;x++)ink(x,top);for(let y=1;y<14;y++)ink(left+7-Math.floor(y/3),top+y)};
 seven(62,30);extra?.(ink);
 const context={getImageData:(left:number,top:number,w:number,h:number)=>{const data=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const source=((top+y)*width+left+x)*4,target=(y*w+x)*4;data.set(pixels.subarray(source,source+4),target)}return{data}},drawImage:vi.fn(),fillRect:vi.fn(),fillStyle:""};
 const canvas={width,height,getContext:()=>context} as unknown as HTMLCanvasElement;
 const patch={width:0,height:0,getContext:()=>({fillRect:vi.fn(),drawImage:vi.fn(),fillStyle:""})};
 vi.stubGlobal("document",{createElement:()=>patch});
 const recognition=vi.fn().mockResolvedValue({data:{text:"7\n",confidence:88}});
 const setParameters=vi.fn().mockResolvedValue({});
 return{canvas,worker:{recognize:recognition,setParameters} as unknown as Worker,recognition,setParameters,seven,ink};
}
afterEach(()=>vi.unstubAllGlobals());
describe("isolated source numeral refinement",()=>{
 it("uses actual isolated gutter ink and excludes the frame and margin lettering",async()=>{
  const f=fixture();const output=await refineNumberingOcr(f.worker,f.canvas,words,7);
  expect(output).toHaveLength(words.length+1);
  const found=output[output.length-1]!;expect(found.text).toBe("7");expect(found.isolatedParent).toBe(true);expect(found.box.left).toBe(62);expect(found.box.width).toBe(8);
  expect(detectAutomaticNumbering(output,{width,height,originalNumber:7,marks:2,kind:"question"}).status).toBe("ready");
  expect(f.setParameters).toHaveBeenLastCalledWith({tessedit_pageseg_mode:"3",tessedit_char_whitelist:""});
 });
 it("does not infer source labels without the exact matching total",async()=>{
  const f=fixture();expect(await refineNumberingOcr(f.worker,f.canvas,words.slice(0,-1),7)).toEqual(words.slice(0,-1));expect(f.recognition).not.toHaveBeenCalled();
 });
 it("rejects a possible diagram label beside a shape instead of covering it",async()=>{
  const f=fixture(ink=>{for(let y=25;y<50;y++)ink(90,y)});
  expect(await refineNumberingOcr(f.worker,f.canvas,words,7)).toEqual(words);expect(f.recognition).not.toHaveBeenCalled();
 });
 it("rejects several possible number components in the source gutter",async()=>{
  const f=fixture();f.seven(62,60);
  expect(await refineNumberingOcr(f.worker,f.canvas,words,7)).toEqual(words);expect(f.recognition).not.toHaveBeenCalled();
 });
 it("rejects a different recognised number or uncertain recognition",async()=>{
  for(const data of [{text:"2\n",confidence:97},{text:"7\n",confidence:30}]){
   const f=fixture();f.recognition.mockResolvedValue({data});
   expect(await refineNumberingOcr(f.worker,f.canvas,words,7)).toEqual(words);
  }
 });
});
