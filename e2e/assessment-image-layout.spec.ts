import {test,expect} from "@playwright/test";
import {writeFile} from "node:fs/promises";
import {createCanvas} from "@napi-rs/canvas";
import {getDocument} from "pdfjs-dist/legacy/build/pdf.mjs";
import {numberingFixture} from "./numbering-fixture";

test("tall cropped question and marking images retain both ends on A4",async({page},testInfo)=>{
 test.skip(testInfo.project.name!=="chromium","Actual PDF layout runs once on desktop Chromium");
 const uid="11111111-1111-4111-8111-111111111111";
 const user={id:uid,aud:"authenticated",role:"authenticated",email:"owner@example.test",app_metadata:{provider:"email",providers:["email"]},user_metadata:{},created_at:"2026-01-01T00:00:00Z"};
 const encode=(value:object)=>Buffer.from(JSON.stringify(value)).toString("base64url");
 const token=`${encode({alg:"HS256",typ:"JWT"})}.${encode({exp:4102444800,sub:uid,role:"authenticated",aud:"authenticated"})}.signature`;
 const crop={top:10,right:10,bottom:10,left:10};
 const row={id:"tall-question",question_number:"Q01",marks:4,topic:"Algebra",skill:"Equations",assessment_objective:"AO1",question_storage_path:"questions/tall.svg",mark_scheme_storage_path:"marks/tall.svg",exam_papers:{exam_board:"Edexcel",series:"June 2023",paper_code:"1H",tier:"Higher"},metadata:{id:"EDX-H-JUNE2023-1H-Q01",tier:"Higher",numbering_positions:{question:numberingFixture(600,1800,1,null),mark:numberingFixture(600,1800,1,null)},image_crops:{question:crop,mark:crop}}};
 await page.addInitScript(({token,user})=>localStorage.setItem("sb-ljisttslifnyrbuybfud-auth-token",JSON.stringify({access_token:token,refresh_token:"dummy",expires_at:4102444800,expires_in:999999999,token_type:"bearer",user})),{token,user});
 await page.route("https://ljisttslifnyrbuybfud.supabase.co/**",async route=>{
  const url=new URL(route.request().url());
  const reply=(body:unknown)=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(body)});
  if(url.pathname==="/auth/v1/user")return reply(user);
  if(url.pathname.startsWith("/rest/v1/profiles"))return reply([{role:"owner",approved:true}]);
  if(url.pathname.startsWith("/rest/v1/questions"))return reply([row]);
  if(url.pathname.startsWith("/rest/v1/assessment_folders"))return reply([]);
  if(url.pathname.startsWith("/rest/v1/assessment_questions"))return reply([{assessment_id:"saved-tall",question_id:row.id,position:0}]);
  if(url.pathname.startsWith("/rest/v1/assessments"))return reply([{id:"saved-tall",title:"Tall image regression",created_at:"2026-11-15T10:00:00Z",revision:1,configuration:{id:"tall",folder:"Unfiled",minutes:15,cover:false,nameBox:false,exportMode:"both",renumberStudentQuestions:true}}]);
  if(url.pathname.includes("/storage/v1/object/sign/"))return reply((route.request().postDataJSON().paths as string[]).map(path=>({path,signedURL:`/tall-fixture.svg?asset=${encodeURIComponent(path)}`})));
  return route.fulfill({status:404,contentType:"application/json",body:"{}"});
 });
 await page.route("**/tall-fixture.svg?**",route=>{
  const marking=decodeURIComponent(new URL(route.request().url()).searchParams.get("asset")||"").startsWith("marks/");
  // Magenta is entirely outside the crop. Green and blue mark the first and
  // last retained content, so raster assertions catch clipping at either end.
  return route.fulfill({status:200,contentType:"image/svg+xml",body:`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1800"><rect width="600" height="1800" fill="#ff00ff"/><rect x="59" y="179" width="482" height="1442" fill="white"/><rect x="80" y="210" width="100" height="80" fill="#00c800"/><text x="90" y="330" font-size="26">${marking?"Marking guidance: x = 6":"Solve 3x + 7 = 25"}</text><text x="90" y="380" font-size="24">Part (a), then part (b)</text><path d="M90 500h380M90 700h380M90 900h380M90 1100h380" stroke="black"/><rect x="80" y="1500" width="100" height="80" fill="#0000ff"/><text x="200" y="1545" font-size="22">End of retained content</text></svg>`});
 });
 await page.goto("/");
 await page.getByRole("navigation",{name:"Main navigation"}).getByRole("button",{name:"My Worksheets"}).click();
 await page.getByRole("button",{name:"Open / Edit",exact:true}).click();
 await expect(page.locator(".paper .assessment-paged-image")).toHaveCount(2);
 await expect(page.getByRole("button",{name:/Print .*save PDF/})).toBeEnabled();
 await page.locator(".paper img").evaluateAll(images=>Promise.all(images.map(image=>(image as HTMLImageElement).decode())));
 await page.setViewportSize({width:680,height:1000});await page.emulateMedia({media:"print"});
 const metrics=await page.locator('.paper').evaluate(paper=>Array.from(paper.querySelectorAll('.paper-inline-fields,.paper-question,.mark-scheme,.mark-scheme-item,.assessment-question-heading,.assessment-image-page,.assessment-image-viewport')).map(el=>({class:el.className,top:el.getBoundingClientRect().top,height:el.getBoundingClientRect().height,break:getComputedStyle(el).breakInside})));
 await writeFile(testInfo.outputPath('geometry.json'),JSON.stringify(metrics,null,2));await testInfo.attach('geometry',{path:testInfo.outputPath('geometry.json'),contentType:'application/json'});
 const pdf=await page.pdf({format:"A4",printBackground:true,preferCSSPageSize:true});
 const path=testInfo.outputPath("tall-cropped-combined.pdf");
 await writeFile(path,pdf);
 await testInfo.attach("tall-cropped-combined.pdf",{path,contentType:"application/pdf"});
 const document=await getDocument({data:new Uint8Array(pdf)}).promise;
 expect(document.numPages).toBe(6);
 let pagesWithGreen=0,pagesWithBlue=0;
 const pageTexts:string[]=[];
 for(let index=1;index<=document.numPages;index++){
  const pdfPage=await document.getPage(index),viewport=pdfPage.getViewport({scale:1.5});
  const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
  await pdfPage.render({canvas:canvas as any,canvasContext:canvas.getContext("2d") as any,viewport}).promise;
  const pixels=canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data;
  let green=0,blue=0,magenta=0;
  for(let offset=0;offset<pixels.length;offset+=4){
   const [r,g,b]=[pixels[offset],pixels[offset+1],pixels[offset+2]];
   if(g>150&&r<50&&b<50)green++;
   if(b>200&&r<50&&g<50)blue++;
   if(r>200&&b>200&&g<50)magenta++;
  }
  if(green>100)pagesWithGreen++;
  if(blue>100)pagesWithBlue++;
  expect(magenta,`cropped-out borders on PDF page ${index}`).toBe(0);
  const content=(await pdfPage.getTextContent()).items.map(item=>"str" in item?item.str:"").join(" ");
  pageTexts.push(content);
  expect(content).toMatch(/(?:Question|Mark scheme) 1/);
  expect(pdfPage.view[2]).toBeCloseTo(595,0);expect(pdfPage.view[3]).toBeCloseTo(842,0);
 }
 expect(pagesWithGreen).toBe(2);expect(pagesWithBlue).toBe(2);
 expect(pageTexts.join(" ").match(/End of retained content/g)).toHaveLength(2);
 expect(pageTexts.join(" ")).toContain("Marking guidance: x = 6");
 await document.destroy();
});
