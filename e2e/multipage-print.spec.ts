import {test,expect,type Page,type TestInfo} from "@playwright/test";
import {writeFile} from "node:fs/promises";
import {createCanvas} from "@napi-rs/canvas";
import {getDocument,OPS} from "pdfjs-dist/legacy/build/pdf.mjs";
import {openMultipageFixture} from "./multipage-print-fixture";

async function inspectPdf(page:Page,info:TestInfo,name:string){
 await page.emulateMedia({media:'print'});
 const pdf=await page.pdf({format:'A4',printBackground:false,preferCSSPageSize:true});
 const path=info.outputPath(name+'.pdf');await writeFile(path,pdf);await info.attach(name,{path,contentType:'application/pdf'});
 const document=await getDocument({data:new Uint8Array(pdf)}).promise;
 const pages=[];
 for(let i=1;i<=document.numPages;i++){
  const p=await document.getPage(i),text=await p.getTextContent();
  const strings=text.items.flatMap(item=>'str' in item?[{text:item.str,font:item.height,x:item.transform[4],y:item.transform[5]}]:[]);
  const viewport=p.getViewport({scale:1}),canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height)),ctx=canvas.getContext('2d');
  await p.render({canvas:canvas as any,canvasContext:ctx as any,viewport}).promise;
  const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  let black=0,cyan=0,blue=0,minX=canvas.width,maxX=0,minY=canvas.height,maxY=0;
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
   const k=(y*canvas.width+x)*4,r=data[k],g=data[k+1],b=data[k+2];
   if(r<150&&g<150&&b<150)black++;
   if(b>245&&g>230&&r>195&&r<230){cyan++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
   if(b>200&&r<50&&g<50)blue++;
  }
  expect(Math.abs(p.view[2]-595.28)).toBeLessThan(1);expect(Math.abs(p.view[3]-841.89)).toBeLessThan(1);
  expect(black,`PDF page ${i} has real ink, not an accidental blank/heading-only page`).toBeGreaterThan(500);
  const imagePath=info.outputPath(`${name}-page-${i}.png`);await writeFile(imagePath,canvas.toBuffer('image/png'));await info.attach(`${name}-page-${i}`,{path:imagePath,contentType:'image/png'});
  pages.push({text:strings.map(s=>s.text).join(' '),strings,cyan,blue,bounds:{minX,maxX,minY,maxY}});
 }
 await document.destroy();await page.emulateMedia({media:'screen'});return pages;
}

test('short and tall cumulative frequency images print at the same readable scale with intact grids and complete multipart marking',async({page},info)=>{
 test.skip(info.project.name!=='chromium','Chrome desktop PDF regression');test.setTimeout(60000);
 const state=await openMultipageFixture(page);
 await expect(page.locator('.paper-question')).toHaveCount(2);await expect(page.locator('.paper-question .assessment-paged-image')).toHaveCount(2);
 await expect(page.locator('.paper-question .assessment-image-page')).toHaveCount(2);
 await expect(page.locator('.assessment-pagination-warning')).toHaveCount(0);
 await expect(page.locator('.paper-question').last()).toContainText('FIXTURE-2019-2H-Q11a, FIXTURE-2019-2H-Q11b, FIXTURE-2019-2H-Q11c');
 // Print preview and actual PDF use 180 mm for every slice, independent of height.
 await page.emulateMedia({media:'print'});
 const widths=await page.locator('.paper-question .assessment-source-image').first().evaluate(el=>el.getBoundingClientRect().width);
 const sliceWidths=await page.locator('.paper-question .assessment-image-viewport').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().width));
 expect(sliceWidths.every(w=>Math.abs(w-widths)<1)).toBe(true);
 await page.emulateMedia({media:'screen'});
 await page.locator('#assessment-preview').screenshot({path:info.outputPath('readable-preview.png')});await info.attach('readable-preview',{path:info.outputPath('readable-preview.png'),contentType:'image/png'});
 await page.evaluate(()=>{(window as unknown as {prints:number}).prints=0;window.print=()=>{(window as unknown as {prints:number}).prints++}});
 await page.getByRole('button',{name:/Print .*save PDF/}).click();await expect.poll(()=>page.evaluate(()=>(window as unknown as {prints:number}).prints)).toBe(1);
 const pages=await inspectPdf(page,info,'cumulative-frequency-combined');
 expect(pages).toHaveLength(6);
 const all=pages.flatMap(p=>p.strings),short=all.find(s=>s.text.includes('Read the cumulative'))!,long=all.find(s=>s.text.includes('Grouped travel'))!;
 expect(short.font).toBeGreaterThan(12);expect(Math.abs(short.font-long.font)).toBeLessThan(.1);
 expect(pages.filter(p=>p.text.includes('Frequency table'))).toHaveLength(2);
 expect(pages.filter(p=>p.text.includes('Long marking guidance'))).toHaveLength(1);
 const longGraphPages=pages.filter(p=>p.cyan>10000&&p.blue>100);
 expect(longGraphPages).toHaveLength(2); // question and corresponding marking page
 for(const p of longGraphPages){expect(p.bounds.maxX-p.bounds.minX).toBeGreaterThan(350);expect(p.bounds.maxY-p.bounds.minY).toBeGreaterThan(340);expect(p.bounds.minX).toBeGreaterThan(40);expect(p.bounds.maxX).toBeLessThan(555);}
 const again=await inspectPdf(page,info,'cumulative-frequency-repeated');expect(again.map(p=>p.text)).toEqual(pages.map(p=>p.text));
 await page.getByRole('button',{name:'Mark scheme only',exact:true}).click();await expect(page.getByRole('button',{name:/Print .*save PDF/})).toBeEnabled();
 const marking=await inspectPdf(page,info,'cumulative-frequency-marking');expect(marking).toHaveLength(3);expect(marking.map(p=>p.text).join(' ')).toContain('Long marking guidance');
 expect(state.writes()).toBe(0);
});

test('multiple source images keep their order, marks and numbering when a tall multipart question continues',async({page},info)=>{
 test.skip(info.project.name!=='chromium','Chrome desktop PDF regression');
 await openMultipageFixture(page,{mode:'questions',extra:true});
 await expect(page.locator('.paper-question').last().locator('.assessment-image-block')).toHaveCount(2);
 await expect(page.getByRole('button',{name:/Print .*save PDF/})).toBeEnabled();
 const pages=await inspectPdf(page,info,'multiple-source-images'),text=pages.map(p=>p.text).join(' ');
 expect(text.match(/Additional source image: part \(d\)/g)).toHaveLength(1);
 expect(text.indexOf('(c) Estimate')).toBeLessThan(text.indexOf('Additional source image'));
 expect(text).toContain('Total for Question 2 is 6 marks');
});

test('multi-page preview remains responsive on mobile and does not require manual crop changes',async({page},info)=>{
 test.skip(info.project.name!=='mobile-chromium','Mobile preview regression');
 const state=await openMultipageFixture(page,{mode:'questions'});
 await page.setViewportSize({width:320,height:800});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.locator('.paper-question .assessment-image-page')).toHaveCount(2);
 await expect(page.getByRole('button',{name:/Print .*save PDF/})).toBeEnabled();expect(state.writes()).toBe(0);
});


test('raster question images retain their native pixels in the exported multi-page PDF',async({page},info)=>{
 test.skip(info.project.name!=='chromium','Chrome desktop raster PDF regression');
 await openMultipageFixture(page,{mode:'questions',raster:true});
 await expect(page.locator('.paper-question .assessment-image-page')).toHaveCount(2);
 await page.emulateMedia({media:'print'});
 const pdf=await page.pdf({format:'A4',printBackground:false,preferCSSPageSize:true});
 const path=info.outputPath('native-raster-multipage.pdf');await writeFile(path,pdf);await info.attach('native-raster-multipage',{path,contentType:'application/pdf'});
 const document=await getDocument({data:new Uint8Array(pdf)}).promise;expect(document.numPages).toBe(3);
 const sizes:number[][]=[];
 for(let i=1;i<=document.numPages;i++){const p=await document.getPage(i),ops=await p.getOperatorList();ops.fnArray.forEach((fn,index)=>{if(fn===OPS.paintImageXObject)sizes.push(ops.argsArray[index].slice(1));});}
 expect(sizes).toContainEqual([1000,2600]);expect(sizes.filter(s=>s[0]===1000&&s[1]===2600)).toHaveLength(2);
 await document.destroy();
});


test('teacher sources, cover page and original numbering preserve readable multi-page output',async({page},info)=>{
 test.skip(info.project.name!=='chromium','Chrome desktop teacher PDF regression');
 await openMultipageFixture(page,{mode:'teacher'});
 const inline=await inspectPdf(page,info,'cumulative-frequency-teacher');expect(inline).toHaveLength(3);
 expect(inline.map(p=>p.text).join(' ').match(/Source: Edexcel/g)).toHaveLength(2);
 await page.getByRole('checkbox',{name:'Include cover page',exact:true}).check();
 await expect(page.getByRole('button',{name:/Print .*save PDF/})).toBeEnabled();
 const covered=await inspectPdf(page,info,'cumulative-frequency-cover');expect(covered).toHaveLength(4);
 await page.getByRole('checkbox',{name:/Hide original question numbers/}).uncheck();
 await expect(page.getByRole('button',{name:/Print .*save PDF/})).toBeEnabled();
 const original=await inspectPdf(page,info,'cumulative-frequency-original-numbers');
 expect(original.map(p=>p.text).join(' ')).toContain('Question 11');
 expect(original.map(p=>p.text).join(' ')).toContain('Total for Question 11 is 6 marks');
});
