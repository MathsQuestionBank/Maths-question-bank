export type PaperFrame={left:number;right:number;top:number;bottom:number};
/** Detect a continuous outer exam-paper frame, not short rules or diagram edges. */
export function detectPaperFrame(pixels:Uint8ClampedArray,width:number,height:number):PaperFrame|null{
 const dark=(x:number,y:number)=>{const i=(y*width+x)*4;return (pixels[i]+pixels[i+1]+pixels[i+2])/3<225};
 const vertical=(x:number)=>{let hits=0,total=0;for(let y=Math.ceil(height*.1);y<height*.9;y++){total++;if(dark(x,y))hits++}return hits/total>.88};
 const horizontal=(y:number)=>{let hits=0,total=0;for(let x=Math.ceil(width*.15);x<width*.85;x++){total++;if(dark(x,y))hits++}return hits/total>.88};
 const find=(start:number,end:number,predicate:(n:number)=>boolean)=>{const found:number[]=[];for(let n=Math.ceil(start);n<end;n++)if(predicate(n))found.push(n);return found};
 const left=find(width*.03,width*.10,vertical),right=find(width*.90,width*.97,vertical);
 const top=find(height*.02,height*.08,horizontal),bottom=find(height*.91,height*.98,horizontal);
 if(!left.length||!right.length||!top.length||!bottom.length)return null;
 return {left:(Math.max(...left)+2)/width,right:(Math.min(...right)-2)/width,
  top:(Math.max(...top)+2)/height,bottom:(Math.min(...bottom)-2)/height};
}
