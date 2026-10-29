import {test,expect} from "@playwright/test";
import JSZip from "jszip";

const uid="11111111-1111-4111-8111-111111111111";
const user={id:uid,aud:"authenticated",role:"authenticated",email:"owner@example.test",app_metadata:{provider:"email",providers:["email"]},user_metadata:{},created_at:"2026-01-01T00:00:00Z"};
const base="new-paper-intake/Edexcel/GCSE-Mathematics/November-2022/1F";
const authToken=()=>{
 const b64=(v:object)=>Buffer.from(JSON.stringify(v)).toString("base64url");
 return b64({alg:"HS256",typ:"JWT"})+"."+b64({exp:4102444800,sub:uid,role:"authenticated",aud:"authenticated"})+".signature";
};
async function workbookFixture(format:string){
 const zip=new JSZip();
 const headers=["Question ID","Tier","Exam board","Series","Paper","Question","Primary strand","All strands","Searchable skills","Review recommendation","Maximum marks","Assessment objective","Specification refs","Grade 1 success percent","Grade 2 success percent","Grade 3 success percent","Grade 4 success percent","Grade 5 success percent"];
 const values=["EDX-F-NOVEMBER2022-1F-Q01","Foundation","Edexcel","November 2022","1F","Q01","Number","Number; Ratio","Addition","Mapped","2","1","N2","66","77","83","89","94"];
 const nextValues=values.map((v,i)=>i===0?"EDX-F-NOVEMBER2022-1F-Q02":i===5?"Q02":v);
 if(format==="csv")return Buffer.from([headers,values,nextValues].map(row=>row.map(v=>JSON.stringify(v)).join(",")).join("\r\n"));
 const cell=(text:string,index:number,row:number)=>{
  const col=String.fromCharCode(65+index);
  return '<c r="'+col+row+'" t="inlineStr"><is><t>'+text.replace(/&/g,"&amp;").replace(/</g,"&lt;")+'</t></is></c>';
 };
 const sheet='<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+
  '<row r="1">'+headers.map((s,i)=>cell(s,i,1)).join("")+'</row>'+
  '<row r="2">'+values.map((s,i)=>cell(s,i,2)).join("")+'</row>'+
  '<row r="3">'+nextValues.map((s,i)=>cell(s,i,3)).join("")+'</row></sheetData></worksheet>';
 zip.file("xl/workbook.xml",'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Foundation Enhanced Mapping" sheetId="1" r:id="rId1"/></sheets></workbook>');
 zip.file("xl/_rels/workbook.xml.rels",'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
 zip.file("xl/worksheets/sheet1.xml",sheet);
 return await zip.generateAsync({type:"nodebuffer"});
}
// Rotated page metadata with upright landscape text, matching the 2021 schemes.
function rotatedSchemeFixture(){
 const objects=["<< /Type /Catalog /Pages 2 0 R >>","", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
 const pages:number[]=[];
 for(let n=1;n<=9;n++){
  const id=objects.length+1;pages.push(id);
  const lines=n===6?[['Question Working Answer Mark Notes',80],['1 7 B1',110]]:n===9?[["Q1 supplemental diagram",110]]:n===8?[["Question UNRELATED CONTENT",110]]:n===7?[['Question Working Answer Mark Notes',80],['Q1 continuation: all guidance retained',110],['2 11 B1',160]]:[['General marking guidance',80]];
  const stream=lines.map(([text,y])=>`BT /F1 12 Tf ${String(text).startsWith("Question")?"1 0 0":String(text).startsWith("Q1 supplemental")?"0 0.8 0":String(text).startsWith("Q1 continuation")?"0 0 1":"0 0 0"} rg 0 1 -1 0 ${y} 60 Tm (${text}) Tj ET`).join('\n');
  objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Rotate 90 /Resources << /Font << /F1 3 0 R >> >> /Contents ${id+1} 0 R >>`);
  objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
 }
 objects[1]=`<< /Type /Pages /Count 9 /Kids [${pages.map(n=>n+' 0 R').join(' ')}] >>`;
 let pdf='%PDF-1.4\n';const offsets=[0];
 objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${object}\nendobj\n`});
 const xref=Buffer.byteLength(pdf);
 pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('');
 pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return Buffer.from(pdf);
}
for(const format of ["xlsx","csv"]){
test(`extracts ${format} mapping and preserves its saved review without invalid page requests`,async({page,browser},testInfo)=>{
 test.skip(testInfo.project.name!=="chromium","Real PDF test runs once on desktop Chromium");
 test.setTimeout(90000);
 await page.setContent("<html><body><div style='position:fixed;left:35pt;right:35pt;top:36pt;bottom:48pt;border:2pt solid #aaa;border-radius:8pt'></div><p style='margin:80px;font-size:24px'>1 Work out 3 + 4.</p><p style='margin:80px;font-size:24px'>2 Work out 5 + 6.</p></body></html>");
 const questionPdf=await page.pdf({format:"A4"});
 const intro=(text:string)=>'<section style="break-after:page;page-break-after:always;padding:75px;font-size:18px">'+text+'</section>';
 await page.setContent('<html><body>'+[
  intro("Mark Scheme (Results) November 2022"),
  intro("Qualification information"),
  intro("General marking guidance: 1 All candidates must receive the same treatment. 2 All marks are designed to be awarded."),
  intro("7 Ignoring subsequent work; 8 Probability; 9 Linear equations"),
  intro("Guidance on the use of abbreviations"),
  '<section style="padding:75px;font-size:18px"><p>Paper: 1MA1/1F</p><p>Question Answer Mark Mark scheme Additional guidance</p><p>1 7 B1 for 7</p><p>2 11 B1 for 11</p></section>'
 ].join("")+'</body></html>');
 const schemePdf=format==="csv"?rotatedSchemeFixture():await page.pdf({format:"A4"});
 const mapping=await workbookFixture(format);
 await page.addInitScript(({user,token})=>{
  localStorage.setItem("sb-ljisttslifnyrbuybfud-auth-token",JSON.stringify({access_token:token,refresh_token:"dummy",expires_at:4102444800,expires_in:999999999,token_type:"bearer",user}));
 },{user,token:authToken()});
 let storedReview:unknown=null;const downloadedMappings:string[]=[];const reviewReadNonces:string[]=[];
 const storageRoute:Parameters<typeof page.route>[1]=async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;
  if(request.method()==="GET"&&path.endsWith("/extraction-review.json"))reviewReadNonces.push(url.searchParams.get("cacheNonce")||"");
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
   if(prefix===base+"/"+uid)return json([{name:"question-paper.pdf",id:"1"},{name:"mark-scheme.pdf",id:"2"},{name:"intake.json",id:"3"},...(storedReview?[{name:"extraction-review.json",id:"6"}]:[])]);
   if(prefix==="enhanced-mapping-intake/"+uid)return json([...(storedReview?[{name:format==="xlsx"?"zzz-newer.csv":"zzz-newer.xlsx",id:"5"}]:format==="csv"?[{name:"zzz-older.xlsx",id:"5"}]:[]),{name:"fixture."+format,id:"4",created_at:"2026-10-27T20:30:00Z"}]);
   return json([]);
  }
  if(path.startsWith("/storage/v1/object/")&&!path.includes("/list/")){
   if(path.endsWith("/question-paper.pdf"))return route.fulfill({status:200,contentType:"application/pdf",body:questionPdf});
   if(path.endsWith("/mark-scheme.pdf"))return route.fulfill({status:200,contentType:"application/pdf",body:schemePdf});
   if(/\.(xlsx|csv)$/.test(path)){downloadedMappings.push(path.split("/").pop()!);return route.fulfill({status:200,contentType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",body:mapping})}
   if(path.endsWith("/extraction-review.json")){
    if(request.method()!=="GET"){
     const form=await new Request(request.url(),{method:request.method(),headers:request.headers(),body:request.postDataBuffer()!}).formData();
     const blob=[...form.values()].find(value=>typeof value!=="string") as File;
     storedReview=JSON.parse(await blob.text());return json({Key:"saved"});
    }
    return storedReview?json(storedReview):json({message:"Not found"},404);
   }
  }
  if(path.startsWith("/rest/v1/"))return json([]);
  return json({message:"No fixture for "+path},404);
 };
 await page.route("https://ljisttslifnyrbuybfud.supabase.co/**",storageRoute);
 await page.goto("/");
 await page.getByRole("button",{name:/Import Exam Papers/}).click();
 await expect(page.getByText("Edexcel · November-2022 · 1F")).toBeVisible();
 await page.getByRole("button",{name:"Extract & review"}).click();
 await page.getByRole("button",{name:"Prepare question review"}).click();
 await expect(page.getByRole("status").last()).toContainText("Prepared 2 complete questions from 2 mapped parts",{timeout:18000});
 await expect(page.getByRole("heading",{name:/Q1 · 1 part/})).toBeVisible();
 await expect(page.getByLabel("First marking-table page")).toHaveValue("6");
 await expect(page.getByLabel("mark page")).toHaveValue("6");
 await expect(page.getByText(/Marking-table header detected on PDF page 6/)).toBeVisible();
 await expect(page.getByLabel("Question image")).toBeVisible();
 await expect.poll(()=>page.getByLabel("Question image").evaluate((canvas:HTMLCanvasElement)=>canvas.width)).toBeGreaterThan(700);
 await expect.poll(()=>page.getByLabel("Question image").evaluate((canvas:HTMLCanvasElement)=>canvas.width)).toBeLessThan(800);
 await expect(page.getByLabel("Mark-scheme image")).toBeVisible();
 await expect(page.getByText("Invalid page request.",{exact:true})).toHaveCount(0);
 await expect(page.getByLabel("Remove question paper border")).toBeChecked();
 await expect(page.getByLabel("question left",{exact:true})).toHaveValue("0");
 await expect(page.getByRole("button",{name:"Publish Approved Paper"})).toBeDisabled();
 await page.getByRole("button",{name:"Approve Q1 & Next"}).click();
 await expect(page.getByRole("heading",{name:/Q2 · 1 part/})).toBeVisible();
 await expect(page.getByText("1/2").first()).toBeVisible();
 await page.getByRole("button",{name:"Approve Q2"}).click();
 await expect(page.getByText("2/2").first()).toBeVisible();
 await page.getByRole("button",{name:/Q1$/}).click();
 await expect(page.getByRole("button",{name:"Next question"})).toBeVisible();
 await page.getByRole("button",{name:"Undo approval"}).click();
 await expect(page.getByText("1/2").first()).toBeVisible();
 await page.getByRole("button",{name:"Approve Q1 & Next"}).click();
 await expect(page.getByRole("heading",{name:/Q2 · 1 part/})).toBeVisible();
 await page.getByRole("button",{name:/Q1$/}).click();
 await page.getByLabel("question top",{exact:true}).fill("8");
 await page.getByLabel("question left",{exact:true}).fill("5");
 await page.getByRole("button",{name:"Approve Q1 & Next"}).click();
 await page.getByRole("button",{name:"Save review progress to account"}).click();
 await expect(page.getByRole("status").last()).toContainText("Review progress saved privately");
 if(format==="csv"){
  const item=(storedReview as {items:{mark:{page:number;endPage?:number;top:number;bottom:number;selectedPagesOnly?:true;fragments?:{page:number;top:number;bottom:number}[]}}[]}).items[0];
  expect(item.mark.page).toBe(6);expect(item.mark.endPage).toBe(7);
  item.mark.fragments=[{page:6,top:item.mark.top,bottom:.23},{page:7,top:.16,bottom:item.mark.bottom},{page:9,top:.16,bottom:.3}];
  item.mark.selectedPagesOnly=true;item.mark.endPage=9;item.mark.bottom=.3;
 }
 await page.getByRole("button",{name:"Reload source and mapping"}).click();
 await expect(page.getByRole("status").last()).toContainText("Prepared 2 complete questions");
 await expect(page.getByLabel("question top",{exact:true})).toHaveValue("8");
 await expect(page.getByLabel("question left",{exact:true})).toHaveValue("5");
 await expect(page.getByText("2/2").first()).toBeVisible();
 if(format==="csv"){
  await expect.poll(()=>page.getByLabel("Mark-scheme image").evaluate((canvas:HTMLCanvasElement)=>{
   const pixels=canvas.getContext("2d")!.getImageData(0,0,canvas.width,canvas.height).data;let red=0,blue=0,green=0;
   for(let i=0;i<pixels.length;i+=4){if(pixels[i]>180&&pixels[i+1]<100&&pixels[i+2]<100)red++;if(pixels[i+2]>180&&pixels[i]<100&&pixels[i+1]<100)blue++;if(pixels[i+1]>150&&pixels[i]<100&&pixels[i+2]<100)green++}
   return red===0&&blue>10&&green>10&&canvas.height<350;
  })).toBe(true);
 }
 expect(downloadedMappings).toEqual(["fixture."+format,"fixture."+format]);
 // A new browser context has no review state; only mocked account Storage persists.
 const device=await browser.newContext({baseURL:"http://127.0.0.1:4173"});
 await device.addInitScript(({user,token})=>localStorage.setItem("sb-ljisttslifnyrbuybfud-auth-token",JSON.stringify({access_token:token,refresh_token:"dummy",expires_at:4102444800,expires_in:999999999,token_type:"bearer",user})),{user,token:authToken()});
 const other=await device.newPage();
 await other.route("https://ljisttslifnyrbuybfud.supabase.co/**",storageRoute);
 await other.goto("/");
 await other.getByRole("button",{name:/Import Exam Papers/}).click();
 await other.getByRole("button",{name:"Extract & review"}).click();
 await other.getByRole("button",{name:"Prepare question review"}).click();
 await expect(other.getByLabel("question top",{exact:true})).toHaveValue("8");
 await expect(other.getByLabel("question left",{exact:true})).toHaveValue("5");
 await expect(other.getByLabel("Remove question paper border")).toBeChecked();
 await expect(other.getByText("2/2").first()).toBeVisible();
 if(format==="csv"){
  await expect.poll(()=>other.getByLabel("Mark-scheme image").evaluate((canvas:HTMLCanvasElement)=>canvas.height)).toBeLessThan(350);
  await other.getByText("Page sections (6, 7, 9)").click();
  await expect(other.getByLabel("mark selected pages only")).toBeChecked();
  const beforeInvalid=JSON.stringify(storedReview);
  await other.getByLabel("mark section 3 top",{exact:true}).fill("100");
  await other.getByRole("button",{name:"Save review progress to account"}).click();
  await expect(other.getByRole("status").last()).toContainText("Previous progress retained");
  expect(JSON.stringify(storedReview)).toBe(beforeInvalid);
  await other.getByLabel("mark section 3 top",{exact:true}).fill("16");
  await other.getByLabel("mark top",{exact:true}).fill("16");
 }
 await other.getByLabel("question top",{exact:true}).fill("9");
 await other.getByRole("button",{name:"Save review progress to account"}).click();
 await expect(other.getByRole("status").last()).toContainText("Review progress saved privately");
 // The first device cannot overwrite a later save made by the second device.
 await page.getByLabel("question top",{exact:true}).fill("10");
 await page.getByRole("button",{name:"Save review progress to account"}).click();
 await expect(page.getByRole("status").last()).toContainText("changed in another tab or device");
 expect((storedReview as {items:{question:{top:number}}[]} | null)?.items[0].question.top).toBe(.09);
 if(format==="csv"){
  const mark=(storedReview as {items:{mark:{fragments:{page:number;top:number;bottom:number}[]}}[]}).items[0].mark;
  expect(mark.fragments).toHaveLength(3);expect(mark.fragments[0].top).toBe(.16);expect(mark.fragments[1].page).toBe(7);expect(mark.fragments[1].top).toBe(.16);
 }
 expect(reviewReadNonces.length).toBeGreaterThan(3);expect(reviewReadNonces.every(Boolean)).toBe(true);expect(new Set(reviewReadNonces).size).toBe(reviewReadNonces.length);
 await device.close();

});

}
