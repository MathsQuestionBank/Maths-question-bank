import {test,expect} from "@playwright/test";
import JSZip from "jszip";

const uid="11111111-1111-4111-8111-111111111111";
const user={id:uid,aud:"authenticated",role:"authenticated",email:"owner@example.test",app_metadata:{provider:"email",providers:["email"]},user_metadata:{},created_at:"2026-01-01T00:00:00Z"};
const base="new-paper-intake/Edexcel/GCSE-Mathematics/November-2022/1F";
const authToken=()=>{
 const b64=(v:object)=>Buffer.from(JSON.stringify(v)).toString("base64url");
 return b64({alg:"HS256",typ:"JWT"})+"."+b64({exp:4102444800,sub:uid,role:"authenticated",aud:"authenticated"})+".signature";
};
async function workbookFixture(){
 const zip=new JSZip();
 const headers=["Question ID","Tier","Exam board","Series","Paper","Question","Primary strand","All strands","Searchable skills","Review recommendation","Maximum marks","Assessment objective","Specification refs","Grade 1 success percent","Grade 2 success percent","Grade 3 success percent","Grade 4 success percent","Grade 5 success percent"];
 const values=["EDX-F-NOVEMBER2022-1F-Q01","Foundation","Edexcel","November 2022","1F","Q01","Number","Number; Ratio","Addition","Mapped","2","1","N2","66","77","83","89","94"];
 const cell=(text:string,index:number,row:number)=>{
  const col=String.fromCharCode(65+index);
  return '<c r="'+col+row+'" t="inlineStr"><is><t>'+text.replace(/&/g,"&amp;").replace(/</g,"&lt;")+'</t></is></c>';
 };
 const sheet='<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+
  '<row r="1">'+headers.map((s,i)=>cell(s,i,1)).join("")+'</row>'+
  '<row r="2">'+values.map((s,i)=>cell(s,i,2)).join("")+'</row></sheetData></worksheet>';
 zip.file("xl/workbook.xml",'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Foundation Enhanced Mapping" sheetId="1" r:id="rId1"/></sheets></workbook>');
 zip.file("xl/_rels/workbook.xml.rels",'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
 zip.file("xl/worksheets/sheet1.xml",sheet);
 return await zip.generateAsync({type:"nodebuffer"});
}
test("extracts question paper and mark scheme in the same review without invalid page request",async({page},testInfo)=>{
 test.skip(testInfo.project.name!=="chromium","Real PDF test runs once on desktop Chromium");
 test.setTimeout(90000);
 await page.setContent("<html><body><p style='margin:80px;font-size:24px'>1 Work out 3 + 4.</p></body></html>");
 const questionPdf=await page.pdf({format:"A4"});
 await page.setContent("<html><body><p style='margin:80px;font-size:24px'>1 Accept 7 (2 marks).</p></body></html>");
 const schemePdf=await page.pdf({format:"A4"});
 const mapping=await workbookFixture();
 await page.addInitScript(({user,token})=>{
  localStorage.setItem("sb-ljisttslifnyrbuybfud-auth-token",JSON.stringify({access_token:token,refresh_token:"dummy",expires_at:4102444800,expires_in:999999999,token_type:"bearer",user}));
 },{user,token:authToken()});
 await page.route("https://ljisttslifnyrbuybfud.supabase.co/**",async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;
  const json=(v:unknown,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(v)});
  if(path==="/auth/v1/user")return json(user);
  if(path.startsWith("/rest/v1/profiles"))return json([{role:"owner",approved:true}]);
  if(path.startsWith("/rest/v1/questions"))return json([]);
  if(path.startsWith("/rest/v1/rpc/is_approved_owner"))return json(true);
  if(path.startsWith("/storage/v1/object/list/")){
   const prefix=(request.postDataJSON() as {prefix:string})?.prefix||"";
   const root="new-paper-intake/";
   if(prefix===root.slice(0,-1))return json([{name:"Edexcel",id:null}]);
   if(prefix===root+"Edexcel")return json([{name:"GCSE-Mathematics",id:null}]);
   if(prefix===root+"Edexcel/GCSE-Mathematics")return json([{name:"November-2022",id:null}]);
   if(prefix===root+"Edexcel/GCSE-Mathematics/November-2022")return json([{name:"1F",id:null}]);
   if(prefix===base+"/"+uid)return json([{name:"question-paper.pdf",id:"1"},{name:"mark-scheme.pdf",id:"2"},{name:"intake.json",id:"3"}]);
   if(prefix==="enhanced-mapping-intake/"+uid)return json([{name:"fixture.xlsx",id:"4",created_at:"2026-10-27T20:30:00Z"}]);
   return json([]);
  }
  if(path.startsWith("/storage/v1/object/authenticated/")){
   if(path.endsWith("/question-paper.pdf"))return route.fulfill({status:200,contentType:"application/pdf",body:questionPdf});
   if(path.endsWith("/mark-scheme.pdf"))return route.fulfill({status:200,contentType:"application/pdf",body:schemePdf});
   if(path.endsWith("/fixture.xlsx"))return route.fulfill({status:200,contentType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",body:mapping});
   if(path.endsWith("/extraction-review.json"))return json({message:"Not found"},404);
  }
  if(path.startsWith("/rest/v1/"))return json([]);
  return json({message:"No fixture for "+path},404);
 });
 await page.goto("/");
 await page.getByRole("button",{name:/Import Exam Papers/}).click();
 await expect(page.getByText("Edexcel · November-2022 · 1F")).toBeVisible();
 await page.getByRole("button",{name:"Extract & review"}).click();
 await page.getByRole("button",{name:"Prepare question review"}).click();
 await expect(page.getByRole("status").last()).toContainText("Prepared 1 complete questions from 1 mapped parts",{timeout:18000});
 await expect(page.getByRole("heading",{name:/Q1 · 1 part/})).toBeVisible();
 await expect(page.getByLabel("Question image")).toBeVisible();
 await expect(page.getByLabel("Mark-scheme image")).toBeVisible();
 await expect(page.getByText("Invalid page request.",{exact:true})).toHaveCount(0);
});
