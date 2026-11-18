// Synthetic browser integration: all Supabase traffic is intercepted, no production writes.
import {chromium} from '@playwright/test';
import JSZip from 'jszip';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const baseURL='http://127.0.0.1:5179';
const server=spawn(process.execPath,[fileURLToPath(new URL('../node_modules/vite/bin/vite.js',import.meta.url)),'--host','127.0.0.1','--port','5179','--strictPort'],{cwd:fileURLToPath(new URL('..',import.meta.url)),stdio:'pipe'});
let startupLog='';server.stdout.on('data',b=>{startupLog=(startupLog+b.toString()).slice(-2000);});server.stderr.on('data',b=>{startupLog=(startupLog+b.toString()).slice(-2000);});
let started=false;
for(let attempt=0;attempt<150;attempt++){if(server.exitCode!==null)break;try{if((await fetch(baseURL)).ok){started=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
if(!started){server.kill();throw Error('Test development server failed to start: '+startupLog);}
let browser;
try{browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox']});}catch(e){server.kill();throw e;}
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const original={id:id(1),exam_board:'Edexcel',qualification:'GCSE Mathematics',series:'November 2024',tier:'Foundation',paper_code:'1F'};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'),pdf=Buffer.from('%PDF-1.4\nsynthetic\n%%EOF');const hash=b=>createHash('sha256').update(b).digest('hex');
const z=new JSZip(),parts=[],assets=[];for(let n=1;n<=4;n++){parts.push({question:`Q0${n}`,marks:20,topic:'Number',skill:'Fractions',proposed_original_question_id:id(n+10),candidate_original_record_id:id(n+10),original_link_verification:'unverified',shadow_of_question_id:null,approved:false,ao:null,spec:null,ao_spec_status:'provisional'});for(const kind of ['question','mark']){const path=`drafts/Q0${n}/${kind}-${hash(png)}.png`;assets.push({number:n,kind,relative_storage_path:path,sha256:hash(png),approved:false,crop_review:'unreviewed',source_pages:[n]});z.file(path,png);}}
const manifest={version:1,kind:'official-shadow',status:'awaiting-review',original_paper_id:original.id,shadow_set:'Set 1',metadata:{exam_board:'Pearson Edexcel',qualification:'GCSE Mathematics (1MA1)',series:original.series,tier:original.tier,paper_code:'1MA1/1F',calculator:false,total_marks:80},parts,assets,counts:{questions:4,parts:4,marks:80,question_images:4,mark_scheme_images:4},question_source_relative_path:'question-paper.pdf',mark_scheme_source_relative_path:'mark-scheme.pdf',source_files:{question:{sha256:hash(pdf)},mark:{sha256:hash(pdf)}},original_stored_image_verification:'outstanding',publication:{selectable:false,teacher_approved:false,question_records_created:false},teacher_review:{Q7:'Physical print check',Q22b:'Inconsistent example',AO_and_specification:'Provisional'}};
z.file('question-paper.pdf',pdf);z.file('mark-scheme.pdf',pdf);z.file('intake.json',JSON.stringify(manifest));const zip=await z.generateAsync({type:'nodebuffer'});
const source=await readFile(new URL('../src/supabase.ts',import.meta.url),'utf8');const project=source.match(/https:\/\/([a-z]+)\.supabase\.co/)[1];
async function setup(allowed,width){
 const c=await browser.newContext({viewport:{width,height:900},isMobile:width<500,hasTouch:width<500});const files=new Map(),rows=[],uploads=[],requests=[];let interrupted=false;
 await c.addInitScript(({project,uid})=>localStorage.setItem('sb-'+project+'-auth-token',JSON.stringify({access_token:'synthetic-only',refresh_token:'synthetic-only',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:uid,aud:'authenticated',role:'authenticated'}})),{project,uid:id(99)});
 await c.route('https://*.supabase.co/**',async route=>{const req=route.request(),u=new URL(req.url()),method=req.method();requests.push([method,u.pathname]);const json=x=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(x)});
  if(u.pathname==='/auth/v1/user')return json({id:id(99),aud:'authenticated',role:'authenticated'});
  if(u.pathname==='/rest/v1/rpc/is_approved_owner')return json(allowed);
  if(u.pathname==='/rest/v1/exam_papers')return json(u.searchParams.has('id')?original:[original]);
  if(u.pathname==='/rest/v1/questions'){assert.equal(method,'GET');if(u.searchParams.get('select')==='skill')return json([{skill:'Fractions'}]);return json(parts.map(p=>({id:p.proposed_original_question_id,paper_id:original.id,question_number:p.question,marks:p.marks,shadow_paper_id:null})));}
  if(u.pathname==='/rest/v1/shadow_papers'){if(method==='GET')return json(rows);assert.equal(method,'POST');const row={...req.postDataJSON(),id:id(88)};assert.equal(files.size,12);assert.equal(row.status,'awaiting-review');rows.push(row);return json(row);}
  const list='/storage/v1/object/list/exam-materials-private';if(u.pathname===list){const opts=req.postDataJSON(),prefix=opts.prefix?opts.prefix+'/':'';const out=new Map();for(const name of files.keys()){if(!name.startsWith(prefix))continue;const rest=name.slice(prefix.length),folder=rest.includes('/'),leaf=rest.split('/')[0];if(opts.search&&!leaf.includes(opts.search))continue;out.set(leaf,{name:leaf,id:folder?null:id(40)});}return json([...out.values()].slice(0,opts.limit||100));}
  const base='/storage/v1/object/';if(u.pathname.startsWith(base)){const rest=decodeURIComponent(u.pathname.slice(base.length)).replace(/^authenticated\//,'');assert.ok(rest.startsWith('exam-materials-private/'));const path=rest.slice('exam-materials-private/'.length);
   if(method==='GET'){const b=files.get(path);return b?route.fulfill({status:200,contentType:path.endsWith('.json')?'application/json':path.endsWith('.pdf')?'application/pdf':'image/png',body:b}):route.fulfill({status:404,body:'missing'});}
   assert.equal(method,'POST');assert.notEqual(req.headers()['x-upsert'],'true');if(!interrupted&&path.endsWith('question-paper.pdf')){interrupted=true;return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'Synthetic interrupted upload'})});}
   assert.equal(files.has(path),false);files.set(path,req.postDataBuffer());uploads.push(path);return json({Key:path});
  }
  throw Error('Unexpected API request '+u.pathname);
 });
 await c.route('**/zip-owner-test.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">import React from "/node_modules/.vite/deps/react.js";import ReactDOM from"/node_modules/.vite/deps/react-dom_client.js";const {createRoot}=ReactDOM;import Importer from"/src/ShadowPaperImporter.tsx";import"/src/styles.css";createRoot(document.getElementById("root")).render(React.createElement(Importer));</script>'}));
 const page=await c.newPage();page.on("pageerror",e=>console.error("Synthetic browser error:",e.message));await page.goto(baseURL+'/zip-owner-test.html');return {c,page,files,rows,uploads,requests};
}
try{
 const d=await setup(false,390);try{await d.page.getByText('Only an approved owner can stage shadow resources.').waitFor({timeout:8000});}catch(e){console.log('Denied fixture DOM:',await d.page.locator('body').innerText());console.log('Mock requests:',d.requests);throw e;}assert.equal(await d.page.locator('input[type=file]').count(),0);assert.equal(d.requests.some(([,p])=>p.startsWith('/storage/')),false);await d.c.close();
 for(const width of [1280,390]){console.log('Testing viewport',width);const s=await setup(true,width),{page}=s;await page.getByLabel('Prepared shadow paper ZIP').setInputFiles({name:'synthetic.zip',mimeType:'application/zip',buffer:zip});await page.getByText(/Validated 4 questions, 4 parts, 80 marks/).waitFor();assert.equal(s.uploads.length,0);
  await page.getByRole('button',{name:'Stage or resume ZIP privately'}).click();await page.getByText(/was not verified/).waitFor();assert.equal(s.rows.length,0);const done=s.uploads.slice();await page.getByRole('button',{name:'Stage or resume ZIP privately'}).click();await page.getByText(/Remote staging verified: 4 questions, 4 parts, 80 marks; 11 files/).waitFor();assert.equal(s.rows.length,1);assert.equal(s.files.size,12);for(const path of done)assert.equal(s.uploads.filter(p=>p===path).length,1);
  const intake=JSON.parse(s.files.get(s.rows[0].intake_manifest_path).toString());assert.equal(intake.original_stored_image_verification,'outstanding');assert.deepEqual(intake.parts,parts);assert.deepEqual(intake.teacher_review,manifest.teacher_review);
  const count=s.uploads.length;await page.getByRole('button',{name:'Stage or resume ZIP privately'}).click();await page.getByText(/Remote staging verified:/).waitFor();assert.equal(s.uploads.length,count);assert.equal(s.rows.length,1);
  if(width===390)assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);
  await s.c.close();
 }
 console.log('PASS: owner denial; desktop/mobile ZIP validation, interrupted upload/retry, preserved provisional metadata, duplicate reconciliation, no original-question writes. Synthetic API only.');
}finally{await browser.close();server.kill();}
