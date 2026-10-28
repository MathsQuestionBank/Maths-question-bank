// Private local ZIP only. Default: validate locally. --stage requires owner credentials.
// NODE_USE_ENV_PROXY=1 node tools/stage-review-batch.mjs /private/batch.zip --stage
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
const path=process.argv[2],stage=process.argv.includes('--stage');
if(!path)throw Error('Supply the private review batch ZIP path.');
if(stage&&(!process.env.MQB_IMPORT_EMAIL||!process.env.MQB_IMPORT_PASSWORD))throw Error('Configure MQB_IMPORT_EMAIL and MQB_IMPORT_PASSWORD securely in environment settings.');
if(stage&&process.env.NODE_USE_ENV_PROXY!=='1'&&!process.execArgv.includes('--use-env-proxy'))throw Error('Use NODE_USE_ENV_PROXY=1 to retain the configured network proxy.');
const bytes=await readFile(path);
const server=await createServer({root:resolve(import.meta.dirname,'..'),logLevel:'error',server:{host:'127.0.0.1',port:5181,strictPort:true,hmr:false}});
await server.listen();let browser;
try{
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
 const page=await browser.newPage();
 // Keep authentication session storage in memory, never in a browser profile on disk.
 await page.addInitScript(()=>{const data=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key),clear:()=>data.clear(),key:n=>[...data.keys()][n]??null,get length(){return data.size}}})});
 await page.route('**/src/main.tsx',r=>r.fulfill({contentType:'text/javascript',body:''}));
 await page.route('**/private-review-batch.zip',r=>r.fulfill({contentType:'application/zip',body:bytes}));
 await page.route('https://ljisttslifnyrbuybfud.supabase.co/**',async route=>{
  if(!stage)return route.fulfill({status:503,body:'Local validation only'});
  const request=route.request(),url=new URL(request.url()),headers={...request.headers()};
  const auth=url.pathname.startsWith('/auth/v1/');
  const lookup=request.method()==='GET'&&url.pathname==='/rest/v1/exam_papers';
  const owner=request.method()==='POST'&&url.pathname==='/rest/v1/rpc/is_approved_owner';
  const storage=url.pathname.startsWith('/storage/v1/object/')&&!decodeURIComponent(url.pathname).includes('published-papers');
  if(!auth&&!lookup&&!owner&&!storage)return route.fulfill({status:403,body:'Staging runner blocks publication and question-table writes'});
  for(const key of ['host','connection','content-length','accept-encoding'])delete headers[key];
  const response=await fetch(request.url(),{method:request.method(),headers,body:['GET','HEAD'].includes(request.method())?undefined:request.postDataBuffer(),redirect:'error'});
  const responseHeaders=Object.fromEntries(response.headers);
  for(const key of ['content-encoding','content-length','transfer-encoding','connection'])delete responseHeaders[key];
  await route.fulfill({status:response.status,headers:responseHeaders,body:Buffer.from(await response.arrayBuffer())});
 });
 await page.goto('http://127.0.0.1:5181');
 const result=await page.evaluate(async({stage,email,password})=>{
  const {inspectIntakeBatch,archiveIntakeBatch}=await import('/src/batchIntake.ts');
  const file=new File([await (await fetch('/private-review-batch.zip')).blob()],'batch.zip');
  const batch=await inspectIntakeBatch(file);
  if(!stage)return {checked:batch.papers.map(p=>({series:p.series,paper:p.code,questions:p.review.items.length,approved:0})),uploaded:false};
  const {supabase}=await import('/src/supabase.ts');
  const {error}=await supabase.auth.signInWithPassword({email,password});
  if(error)throw Error('Import-account sign-in failed: '+error.message);
  try{return {results:await archiveIntakeBatch(batch,()=>{}),uploaded:true}}
  finally{await supabase.auth.signOut({scope:'local'})}
 },{stage,email:stage?process.env.MQB_IMPORT_EMAIL:undefined,password:stage?process.env.MQB_IMPORT_PASSWORD:undefined});
 console.log(JSON.stringify(result,null,2));
 if(stage&&result.results.some(text=>text.includes('needs attention')))process.exitCode=1;
}finally{await browser?.close();await server.close()}
