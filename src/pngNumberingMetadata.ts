/** Optional numbering geometry travels with newly generated PNGs. This preserves
 * the existing image permission boundary: no PDF/source paths or text are stored. */
const signature=new Uint8Array([137,80,78,71,13,10,26,10]);
const keyword="mqb-numbering-v1";
const maxMetadataBytes=32768;
const encoder=new TextEncoder();
const decoder=new TextDecoder();
const crcTable=Uint32Array.from({length:256},(_,index)=>{
 let value=index;
 for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;
 return value>>>0;
});
function crc32(bytes:Uint8Array):number {
 let value=0xffffffff;
 for(const byte of bytes)value=crcTable[(value^byte)&255]^(value>>>8);
 return (value^0xffffffff)>>>0;
}
type Chunk={start:number;end:number;type:string;data:Uint8Array};
function pngChunks(bytes:Uint8Array):Chunk[]|undefined {
 if(bytes.length<45||bytes.length>64*1024*1024||signature.some((byte,index)=>bytes[index]!==byte))return;
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),chunks:Chunk[]=[];
 let position=8;
 while(position+12<=bytes.length&&chunks.length<100000){
  const length=view.getUint32(position),end=position+12+length;
  if(end>bytes.length)return;
  const type=decoder.decode(bytes.subarray(position+4,position+8));
  if(!/^[A-Za-z]{4}$/.test(type)||crc32(bytes.subarray(position+4,end-4))!==view.getUint32(end-4))return;
  const data=bytes.subarray(position+8,end-4);
  chunks.push({start:position,end,type,data});
  if(chunks.length===1&&(type!=="IHDR"||length!==13))return;
  if(type==="IEND")return length===0&&end===bytes.length?chunks:undefined;
  position=end;
 }
}
function isNumberingChunk(chunk:Chunk):boolean {
 return chunk.type==="tEXt"&&chunk.data.length>keyword.length&&chunk.data[keyword.length]===0&&decoder.decode(chunk.data.subarray(0,keyword.length))===keyword;
}

/** A corrupt chunk, duplicate record or oversized payload cannot certify covers. */
export function readEmbeddedNumberingLayout(input:Uint8Array|ArrayBuffer):unknown|undefined {
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 const chunks=pngChunks(bytes);
 if(!chunks)return;
 const candidates=chunks.filter(isNumberingChunk);
 if(candidates.length!==1)return;
 const payload=candidates[0].data.subarray(keyword.length+1);
 if(payload.length>maxMetadataBytes)return;
 try{return JSON.parse(decoder.decode(payload))}catch{return}
}
function cleanRect(input:unknown){
 if(!input||typeof input!=="object")return;
 const value=input as Record<string,unknown>;
 const rect={left:value.left,top:value.top,width:value.width,height:value.height};
 if(!Object.values(rect).every(n=>typeof n==="number"&&Number.isFinite(n)&&n>=0&&n<=1))return;
 const r=rect as {left:number;top:number;width:number;height:number};
 return r.width>0&&r.height>0&&r.left+r.width<=1.000001&&r.top+r.height<=1.000001?r:undefined;
}
function safeLayout(input:unknown){
 if(!input||typeof input!=="object")return;
 const value=input as Record<string,unknown>;
 if(value.version!==1||!Number.isInteger(value.originalNumber)||Number(value.originalNumber)<1||Number(value.originalNumber)>10000||!Number.isInteger(value.imageWidth)||Number(value.imageWidth)<1||Number(value.imageWidth)>30000||!Number.isInteger(value.imageHeight)||Number(value.imageHeight)<1||Number(value.imageHeight)>30000||!["pdf-text","ocr","manual"].includes(String(value.method)))return;
 if(!Array.isArray(value.numberRects)||value.numberRects.length>20||!Array.isArray(value.totalRects)||value.totalRects.length>20)return;
 const numberRects=value.numberRects.map(cleanRect);
 const totalRects=value.totalRects.map(input=>{
  if(!input||typeof input!=="object")return;
  const total=input as Record<string,unknown>,rect=cleanRect(total.rect);
  return rect&&Number.isInteger(total.marks)&&Number(total.marks)>0&&Number(total.marks)<=1000?{rect,marks:total.marks as number}:undefined;
 });
 if(numberRects.some(rect=>!rect)||totalRects.some(rect=>!rect)||!numberRects.length&&value.numberAbsent!==true)return;
 return {version:1,originalNumber:value.originalNumber,imageWidth:value.imageWidth,imageHeight:value.imageHeight,numberRects,totalRects,method:value.method,...(value.numberAbsent===true?{numberAbsent:true}:{})};
}

/** Inserts a tEXt chunk without changing any image pixels or source PNG chunks.
 * This is used only while creating NEW immutable publication images. */
export async function embedNumberingLayout(blob:Blob,layout:unknown):Promise<Blob> {
 const safe=safeLayout(layout);
 if(!safe)throw new Error("Numbering geometry is invalid.");
 const payload=encoder.encode(JSON.stringify(safe));
 if(payload.length>maxMetadataBytes)throw new Error("Numbering geometry is too large.");
 const bytes=new Uint8Array(await blob.arrayBuffer()),chunks=pngChunks(bytes);
 if(!chunks)throw new Error("Cannot add numbering geometry to an invalid PNG.");
 const dimensions=new DataView(chunks[0].data.buffer,chunks[0].data.byteOffset,chunks[0].data.byteLength);
 if(safe.imageWidth!==dimensions.getUint32(0)||safe.imageHeight!==dimensions.getUint32(4))throw new Error("Numbering geometry dimensions do not match the source PNG.");
 const data=new Uint8Array(keyword.length+1+payload.length);
 data.set(encoder.encode(keyword));data.set(payload,keyword.length+1);
 const chunk=new Uint8Array(data.length+12),view=new DataView(chunk.buffer);
 view.setUint32(0,data.length);chunk.set(encoder.encode("tEXt"),4);chunk.set(data,8);
 view.setUint32(chunk.length-4,crc32(chunk.subarray(4,chunk.length-4)));
 const kept=chunks.filter(existing=>!isNumberingChunk(existing));
 const result=new Uint8Array(8+kept.reduce((size,existing)=>size+existing.end-existing.start,0)+chunk.length);
 result.set(signature);let position=8;
 for(const existing of kept){
  if(existing.type==="IEND"){result.set(chunk,position);position+=chunk.length;}
  result.set(bytes.subarray(existing.start,existing.end),position);position+=existing.end-existing.start;
 }
 return new Blob([result],{type:"image/png"});
}
