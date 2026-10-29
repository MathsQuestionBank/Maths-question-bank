import {test,expect} from '@playwright/test';
const uid='11111111-1111-4111-8111-111111111111';
const user={id:uid,aud:'authenticated',role:'authenticated',email:'owner@example.test',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
test('coverage derives published counts and saved approvals, resumes reviews and fails visibly',async({page})=>{
 const b64=(v:object)=>Buffer.from(JSON.stringify(v)).toString('base64url');
 const token=b64({alg:'HS256',typ:'JWT'})+'.'+b64({exp:4102444800,sub:uid,role:'authenticated',aud:'authenticated'})+'.signature';
 await page.addInitScript(({user,token})=>localStorage.setItem('sb-ljisttslifnyrbuybfud-auth-token',JSON.stringify({access_token:token,refresh_token:'dummy',expires_at:4102444800,expires_in:999999999,token_type:'bearer',user})),{user,token});
 let fail=false;const mutations:string[]=[];
 await page.route('https://ljisttslifnyrbuybfud.supabase.co/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;
  const json=(v:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(v)});
  if(path==='/auth/v1/user')return json(user);
  if(path.startsWith('/rest/v1/profiles'))return json([{role:'owner',approved:true}]);
  if(path==='/rest/v1/rpc/is_approved_owner')return json(true);
  if(path==='/rest/v1/rpc/list_owner_exam_intake')return json(['1F','2F'].map(code=>({path:'new-paper-intake/Edexcel/GCSE-Mathematics/November-2022/'+code+'/'+uid,board:'Edexcel',qualification:'GCSE-Mathematics',series:'November-2022',code,question:true,mark:true,manifest:true,review_saved:true})));
  if(path==='/rest/v1/exam_papers')return fail?json({message:'Coverage read denied'},403):json(['h1','h2'].map(id=>({id,exam_board:'Edexcel',qualification:'GCSE Mathematics',series:'November 2022',paper_code:'1H',tier:'Higher'})));
  if(path==='/rest/v1/questions')return json(url.searchParams.get('select')==='paper_id,marks'?[{paper_id:'h1',marks:2},{paper_id:'h2',marks:3}]:[]);
  if(path.startsWith('/storage/v1/object/list/')){
   const prefix=request.postDataJSON().prefix;
   const root='new-paper-intake/Edexcel/GCSE-Mathematics/November-2022';
   const folders:Record<string,string[]>={'new-paper-intake':['Edexcel'],'new-paper-intake/Edexcel':['GCSE-Mathematics'],'new-paper-intake/Edexcel/GCSE-Mathematics':['November-2022'],[root]:['1F','2F']};
   if(folders[prefix])return json(folders[prefix].map(name=>({name,id:null})));
   if(prefix===root+'/1F/'+uid||prefix===root+'/2F/'+uid)return json(['question-paper.pdf','mark-scheme.pdf','extraction-review.json'].map(name=>({name,id:name})));
   return json([]);
  }
  if(path.endsWith('/extraction-review.json')&&request.method()==='GET')return json({version:1,mappingFile:'original.xlsx',items:Array.from({length:26},(_,i)=>({number:i+1,approved:path.includes('/1F/')||i<12}))});
  if(request.method()!=='GET')mutations.push(path);
  return json([]);
 });
 await page.goto('/');await page.getByRole('button',{name:/Import Exam Papers/}).click();
 const coverage=page.locator('section').filter({has:page.getByRole('heading',{name:'Paper coverage',exact:true})}).last();
 await expect(coverage.getByRole('cell',{name:'Review saved — open to check',exact:true})).toHaveCount(2);
 await page.getByRole('button',{name:'Check approvals'}).first().click();
 await expect(coverage.getByRole('cell',{name:'Fully approved',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Check approvals'}).last().click();
 await expect(coverage.getByRole('cell',{name:'Partially approved',exact:true})).toBeVisible();
 await expect(coverage.getByText(/Duplicate published paper identity/)).toBeVisible();
 const higher=coverage.getByRole('row').filter({has:page.getByRole('cell',{name:'1H',exact:true})}).filter({hasText:'November 2022'});
 await expect(higher.getByRole('cell',{name:'5',exact:true})).toBeVisible();
 await coverage.getByRole('button',{name:'Continue review 26/26'}).click();
 await expect(page.getByRole('heading',{name:'Extract & match — November-2022 1F'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Prepare question review'})).toBeVisible();
 expect(mutations).toEqual([]);
 fail=true;await page.getByRole('button',{name:'Refresh list'}).click();
 const refreshAlert=coverage.getByRole('alert').filter({hasText:'Showing the last verified database snapshot'});
 await expect(refreshAlert).toBeVisible();
 await expect(refreshAlert).toContainText('Coverage read denied');
 await expect(coverage.getByRole('alert').filter({hasText:'Duplicate published paper identity'})).toBeVisible();
 await expect(higher.getByRole('cell',{name:'5',exact:true})).toBeVisible();
});

test('interrupted intake retries only missing files and rejects different archived PDFs',async({page})=>{
 const b64=(v:object)=>Buffer.from(JSON.stringify(v)).toString('base64url');
 const token=b64({alg:'HS256',typ:'JWT'})+'.'+b64({exp:4102444800,sub:uid,role:'authenticated',aud:'authenticated'})+'.signature';
 await page.addInitScript(({user,token})=>localStorage.setItem('sb-ljisttslifnyrbuybfud-auth-token',JSON.stringify({access_token:token,refresh_token:'dummy',expires_at:4102444800,expires_in:999999999,token_type:'bearer',user})),{user,token});
 const question=Buffer.from('%PDF- original private source');
 const uploaded:string[]=[];let attempts=0,markArchived=false;
 await page.route('https://ljisttslifnyrbuybfud.supabase.co/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  const json=(v:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(v)});
  if(path==='/auth/v1/user')return json(user);
  if(path.startsWith('/rest/v1/profiles'))return json([{role:'owner',approved:true}]);
  if(path==='/rest/v1/rpc/is_approved_owner')return json(true);
  if(path.startsWith('/rest/v1/'))return json([]);
  if(path.startsWith('/storage/v1/object/list/')){
   const prefix=request.postDataJSON().prefix;
   return json(prefix.endsWith('/'+uid)?[{name:'question-paper.pdf',id:'q'},...(markArchived?[{name:'mark-scheme.pdf',id:'m'},{name:'intake.json',id:'i'}]:[])]:[]);
  }
  if(path.endsWith('/question-paper.pdf')&&request.method()==='GET')return route.fulfill({contentType:'application/pdf',body:question});
  if(path.startsWith('/storage/v1/object/')&&request.method()==='POST'){
   uploaded.push(path.split('/').pop()!);
   if(path.endsWith('/mark-scheme.pdf')){attempts++;if(attempts===1)return json({message:'Interrupted upload'},503);markArchived=true}
   return json({Key:'saved'});
  }
  return json({message:'Missing fixture'},404);
 });
 await page.goto('/');await page.getByRole('button',{name:/Import Exam Papers/}).click();
 await page.getByLabel('New question paper PDF').setInputFiles({name:'question.pdf',mimeType:'application/pdf',buffer:question});
 await page.getByLabel('New mark scheme PDF').setInputFiles({name:'mark.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF- mark source')});
 await page.getByLabel('New paper exam series').fill(' november   2022 ');
 await page.getByRole('button',{name:'Check paper',exact:true}).click();await page.getByRole('button',{name:'Archive PDFs for review'}).click();
 await expect(page.getByText(/Could not archive mark-scheme.pdf/)).toBeVisible();
 await page.getByRole('button',{name:'Check paper',exact:true}).click();await page.getByRole('button',{name:'Archive PDFs for review'}).click();
 await expect(page.getByText(/Source PDFs archived privately/)).toBeVisible();
 expect(uploaded).toEqual(['mark-scheme.pdf','mark-scheme.pdf','intake.json']);
 await page.getByLabel('New question paper PDF').setInputFiles({name:'different.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF- different private source')});
 await page.getByRole('button',{name:'Check paper',exact:true}).click();await page.getByRole('button',{name:'Archive PDFs for review'}).click();
 await expect(page.getByText(/A different question-paper.pdf is already archived/)).toBeVisible();
 expect(uploaded).toEqual(['mark-scheme.pdf','mark-scheme.pdf','intake.json']);
});
