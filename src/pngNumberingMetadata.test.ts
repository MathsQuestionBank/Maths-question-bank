import { describe, expect, it } from "vitest";
import { embedNumberingLayout, readEmbeddedNumberingLayout } from "./pngNumberingMetadata";

// Actual 1px PNG payload; tests assert IDAT remains byte-identical, so adding
// position provenance cannot lower image quality or alter mathematical pixels.
const png=Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII="),character=>character.charCodeAt(0));
const rect={left:.05,top:.1,width:.04,height:.08};
const layout={version:1,originalNumber:14,imageWidth:1,imageHeight:1,numberRects:[rect],totalRects:[{rect:{left:.55,top:.8,width:.4,height:.06},marks:5}],method:"pdf-text"};
function idat(bytes:Uint8Array){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let position=8;
 while(position+12<=bytes.length){
  const length=view.getUint32(position),type=String.fromCharCode(...bytes.subarray(position+4,position+8));
  if(type==="IDAT")return [...bytes.subarray(position,position+length+12)];
  position+=length+12;
 }
}
describe("embedded source numbering positions",()=>{
 it("round-trips safe positions while preserving original PNG image bytes",async()=>{
  const embedded=new Uint8Array(await (await embedNumberingLayout(new Blob([png]),layout)).arrayBuffer());
  expect(readEmbeddedNumberingLayout(embedded)).toEqual(layout);
  expect(idat(embedded)).toEqual(idat(png));
  expect(readEmbeddedNumberingLayout(png)).toBeUndefined();
 });
 it("updates an existing record instead of creating duplicate positions",async()=>{
  const first=await embedNumberingLayout(new Blob([png]),layout);
  const updated=new Uint8Array(await (await embedNumberingLayout(first,{...layout,originalNumber:8})).arrayBuffer());
  expect(readEmbeddedNumberingLayout(updated)).toEqual({...layout,originalNumber:8});
 });
 it("excludes archive paths, source text and other unrelated metadata",async()=>{
  const embedded=await embedNumberingLayout(new Blob([png]),{...layout,source:"private/pdf.pdf",text:"private question text"});
  const bytes=new Uint8Array(await embedded.arrayBuffer());
  expect(new TextDecoder().decode(bytes)).not.toContain("private");
  expect(readEmbeddedNumberingLayout(bytes)).toEqual(layout);
 });
 it("refuses a CRC-corrupted geometry record",async()=>{
  const embedded=new Uint8Array(await (await embedNumberingLayout(new Blob([png]),layout)).arrayBuffer());
  const keywordIndex=new TextDecoder().decode(embedded).indexOf("mqb-numbering-v1");
  embedded[keywordIndex+20]^=1;
  expect(readEmbeddedNumberingLayout(embedded)).toBeUndefined();
 });
 it("rejects non-PNG, truncated PNG and invalid rectangle coordinates",async()=>{
  expect(readEmbeddedNumberingLayout(new Uint8Array([1,2,3]))).toBeUndefined();
  expect(readEmbeddedNumberingLayout(png.subarray(0,png.length-3))).toBeUndefined();
  await expect(embedNumberingLayout(new Blob(["not png"]),layout)).rejects.toThrow("invalid PNG");
  await expect(embedNumberingLayout(new Blob([png]),{...layout,imageWidth:900})).rejects.toThrow("dimensions");
  await expect(embedNumberingLayout(new Blob([png]),{...layout,numberRects:[{...rect,width:2}]})).rejects.toThrow("invalid");
 });
});
