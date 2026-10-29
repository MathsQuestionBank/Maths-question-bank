import {test,expect} from '@playwright/test';
import JSZip from 'jszip';
const uid='11111111-1111-4111-8111-111111111111';
const user={id:uid,aud:'authenticated',role:'authenticated',email:'owner@example.test',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
test('one batch prepares new papers but retains an existing review and published paper',async({page},info)=>{
 test.skip(info.project.name!=='chromium','PDF fixture is generated once on desktop');
 await page.setContent('<p>Private synthetic paper source</p>');const pdf=await page.pdf({format:'A4'});
 const zip=new JSZip(),papers=[];
 const headers=['Question ID','Exam board','Tier','Series','Paper','Question','Primary strand','All strands','Searchable skills','Review recommendation','Maximum marks','Assessment objective'];
 const rows=[headers];
 for(const code of ['1F','2F','3F']){
  for(let n=1;n<=4;n++)rows.push([code+'-Q'+n,'Edexcel','Foundation','November 2021',code,'Q'+n,'Number','Number; Algebra','Arithmetic','Check','20','1']);
  const root=code+'/';zip.file(root+'q.pdf',pdf);zip.file(root+'m.pdf',pdf);
  zip.file(root+'review.json',JSON.stringify({version:1,markSchemeStartPage:1,items:Array.from({length:4},(_,i)=>({number:i+1,question:{page:1,top:.1,bottom:.8,trimBorder:true},mark:{page:1,top:.1,bottom:.8},approved:false}))}));
  papers.push({board:'Edexcel',qualification:'GCSE Mathematics',tier:'Foundation',series:'November 2021',code,question:root+'q.pdf',mark:root+'m.pdf',review:root+'review.json'});
 }
 zip.file('mapping.csv',rows.map(row=>row.join(',')).join('\n'));zip.file('batch.json',JSON.stringify({version:1,mapping:'mapping.csv',papers}));
 const token=[{alg:'HS256',typ:'JWT'},{exp:4102444800,sub:uid,role:'authenticated',aud:'authenticated'}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.')+'.signature';
 await page.addInitScript(({user,token})=>localStorage.setItem('sb-ljisttslifnyrbuybfud-auth-token',JSON.stringify({access_token:token,refresh_token:'dummy',expires_at:4102444800,expires_in:99999999,token_type:'bearer',user})),{user,token});
 const writes:string[]=[],reviews:unknown[]=[];let published=0;
 await page.route('https://ljisttslifnyrbuybfud.supabase.co/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;
  const json=(data:unknown)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  if(path==='/auth/v1/user')return json(user);
  if(path.startsWith('/rest/v1/profiles'))return json([{role:'owner',approved:true}]);
  if(path.endsWith('/rpc/is_approved_owner'))return json(true);
  if(path.includes('/rpc/publish_')){published++;return json('unexpected')}
  if(path.startsWith('/rest/v1/exam_papers'))return json(url.searchParams.get('paper_code')==='eq.2F'?[{id:'already-published'}]:[]);
  if(path.startsWith('/rest/v1/'))return json([]);
  if(path.includes('/object/list/')){const prefix=request.postDataJSON().prefix;return json(prefix.includes('/1F/')?[{name:'extraction-review.json',id:'old'}]:[])}
  if(path.includes('/object/')&&request.method()==='POST'){
   writes.push(path);
   if(path.endsWith('/extraction-review.json')){const form=await new Request(request.url(),{method:'POST',headers:request.headers(),body:request.postDataBuffer()!}).formData();const blob=[...form.values()].find(x=>typeof x!=='string') as File;reviews.push(JSON.parse(await blob.text()))}
   return json({Key:'saved'});
  }
  return json([]);
 });
 await page.goto('/');await page.getByRole('button',{name:/Import Exam Papers/}).click();
 await page.getByLabel('Prepared review batch ZIP').setInputFiles({name:'review-batch.zip',mimeType:'application/zip',buffer:await zip.generateAsync({type:'nodebuffer'})});
 await expect(page.getByText('3 papers checked and ready for batch preparation.')).toBeVisible({timeout:30000});
 await page.getByRole('button',{name:'Prepare all papers for review'}).click();
 const results=page.getByRole('list',{name:'Batch preparation results'});
 await expect(results).toContainText('1F: existing review retained; skipped');
 await expect(results).toContainText('2F: already published; skipped');
 await expect(results).toContainText('3F: prepared for review; 0 approved');
 expect(writes).toHaveLength(5);expect(writes.some(p=>p.includes('/1F/')||p.includes('/2F/'))).toBe(false);expect(published).toBe(0);
 expect(reviews).toHaveLength(1);expect((reviews[0] as {items:{approved:boolean}[]}).items.every(x=>x.approved===false)).toBe(true);
});
