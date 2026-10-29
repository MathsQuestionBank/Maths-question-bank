// Private, local source files only; no upload, publication, or copyrighted fixtures in Git.
// Usage: node tools/validate-real-papers.mjs question.pdf scheme.pdf [enhanced-mapping.csv paper-code "exam-series"]
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const [questionPath,schemePath,mappingPath,paperCode,series="November 2022"]=process.argv.slice(2);
if(Boolean(mappingPath)!==Boolean(paperCode))throw Error("Supply both mapping CSV and paper code.");
if(!questionPath||!schemePath)throw Error('Supply a question PDF and matching mark scheme PDF.');
const files=await Promise.all([readFile(questionPath),readFile(schemePath)]);
const mapping=mappingPath?await readFile(mappingPath,"utf8"):null;
const server=await createServer({logLevel:'error',server:{host:'127.0.0.1',port:5174,strictPort:true,hmr:false}});
await server.listen();
let browser;
try{
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
 const page=await browser.newPage();
 await page.route('https://ljisttslifnyrbuybfud.supabase.co/**',r=>r.fulfill({status:503,body:'Offline source validation'}));
 await page.route('**/private-source-*.pdf',r=>r.fulfill({contentType:'application/pdf',body:files[r.request().url().includes('question')?0:1]}));
 await page.route('**/src/main.tsx',r=>r.fulfill({contentType:'text/javascript',body:''}));
 await page.goto('http://127.0.0.1:5174');
 const result=await page.evaluate(async({mapping,paperCode,series,includeCrops})=>{
  const {loadSourcePdf,readPdfLines,drawSlice}=await import('/src/pdfExtraction.ts');
  const {makeReviewDrafts,findMarkSchemeStartPage,validSlice}=await import('/src/paperExtraction.ts');
  const q=await loadSourcePdf(await (await fetch('/private-source-question.pdf')).blob());
  const questionLines=await readPdfLines(q);
  const m=await loadSourcePdf(await (await fetch('/private-source-scheme.pdf')).blob());
  const markLines=await readPdfLines(m);
  // Printed totals independently verify boundaries; these are not enhanced mapping records.
  const totals=questionLines.flatMap(l=>{const match=l.text.match(/Total for Question (\d+) is (\d+) marks?/i);return match?[{number:Number(match[1]),marks:Number(match[2]),page:l.page}]:[]});
  let rows=totals.map(t=>({id:'source-Q'+t.number,question:'Q'+t.number,marks:t.marks,topic:'Unmapped',strands:'',skills:'',ao:'',gradePercent:{}}));
  if(mapping){
   const {inspectFoundationMap}=await import('/src/EnhancedMappingImporter.tsx');
   const audit=await inspectFoundationMap(new File([mapping],'enhanced.csv',{type:'text/csv'}));
   rows=audit.rows.filter(r=>r.series===series&&r.paper===paperCode);
   if(!rows.length)throw Error('No matching enhanced rows');
   if(new Set(rows.map(r=>r.id.toLowerCase())).size!==rows.length)throw Error('Duplicate mapping IDs in selected paper');
   if(rows.some(r=>!r.board||!r.tier||!r.question||!r.topic))throw Error('Incomplete mapping in selected paper');
  }
  if(mapping){const {validateMappedPart}=await import('/src/paperPublication.ts');rows.forEach(validateMappedPart)}
  const start=findMarkSchemeStartPage(markLines);
  const drafts=makeReviewDrafts(rows,questionLines,markLines);
  const canvas=document.createElement('canvas'),crops=[],questionWidths=[];
  for(const d of drafts){for(const kind of ['question','mark']){
   try{await drawSlice(kind==='question'?q:m,d[kind],canvas)}catch(error){throw Error('Q'+d.number+' '+kind+' '+JSON.stringify(d[kind])+': '+error.message)}
   if(kind==='question')questionWidths.push(canvas.width);
   if(includeCrops)crops.push({number:d.number,kind,data:canvas.toDataURL('image/png')});
  }}
  return {crops,questionWidths,sourceWidth:(await q.getPage(1)).getViewport({scale:1.4}).width,mappedParts:rows.length,mappedMarks:rows.reduce((n,r)=>n+r.marks,0),questionPages:q.numPages,schemePages:m.numPages,start,questions:totals.length,marks:totals.reduce((n,t)=>n+t.marks,0),drafts:drafts.map(d=>({number:d.number,partMarks:d.parts.reduce((n,r)=>n+r.marks,0),printedMarks:totals.find(t=>t.number===d.number)?.marks,question:d.question,mark:d.mark,questionDetected:d.questionDetected,questionInferred:d.questionInferred,markDetected:d.markDetected,approved:d.approved,valid:validSlice(d.question,q.numPages)&&validSlice(d.mark,m.numPages),endsAtPrintedTotal:(d.question.endPage??d.question.page)===totals.find(t=>t.number===d.number)?.page}))};
 },{mapping,paperCode,series,includeCrops:!!process.env.REVIEW_CROP_DIR});
 if(process.env.REVIEW_CROP_DIR){
  await mkdir(process.env.REVIEW_CROP_DIR,{recursive:true});
  for(const c of result.crops)await writeFile(join(process.env.REVIEW_CROP_DIR,`Q${c.number}-${c.kind}.png`),Buffer.from(c.data.split(",")[1],"base64"));
 }
 delete result.crops;
 console.log(JSON.stringify(result,null,2));
 if(mapping&&series==="November 2022")assert.ok(result.questionWidths.every(width=>width<result.sourceWidth*.95),"Real question images should exclude the detected paper border");
 assert.equal(result.marks,80);assert.equal(result.mappedMarks,80);assert.ok(result.start>1);
 assert.equal(new Set(result.drafts.map(d=>d.number)).size,result.questions);
 assert.ok(result.drafts.every(d=>d.partMarks===d.printedMarks&&d.valid&&!d.approved&&(d.questionDetected||d.questionInferred)&&d.markDetected&&d.endsAtPrintedTotal));
 console.log('PASS: printed totals, located question groups, real marking-table start, valid rendered crops; all proposals remain unapproved. Mapping classifications and visual correctness require teacher review.');
}finally{await browser?.close();await server.close()}
