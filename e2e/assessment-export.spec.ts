import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const uid="11111111-1111-4111-8111-111111111111";
const user={id:uid,aud:"authenticated",role:"authenticated",email:"owner@example.test",app_metadata:{provider:"email",providers:["email"]},user_metadata:{},created_at:"2026-01-01T00:00:00Z"};
const token=()=>{
 const encode=(value:object)=>Buffer.from(JSON.stringify(value)).toString("base64url");
 return `${encode({alg:"HS256",typ:"JWT"})}.${encode({exp:4102444800,sub:uid,role:"authenticated",aud:"authenticated"})}.signature`;
};
type Row={id:string;marks:number;metadata:Record<string,unknown>;[key:string]:unknown};
const exam=(id:string,source:string,number:string,paper:string,marks:number):Row=>({
 id,question_number:number,marks,topic:"Number",skill:"Arithmetic",assessment_objective:"AO1",
 exam_papers:{exam_board:"Edexcel",series:paper==="1H"?"June 2023":"November 2022",paper_code:paper,tier:"Higher"},
 question_storage_path:`questions/${id}.svg`,mark_scheme_storage_path:`marks/${id}.svg`,
 metadata:{id:source,tier:"Higher",calculator:false,grade:6,tags:["Number"]}
});
const original=(id:string,index:number):Row=>({
 id,marks:2,topic:"Number",skill:"Arithmetic",assessment_objective:"AO1",question_number:String(index),
 metadata:{id:`ORIGINAL-PRACTICE-${index}`,content_rights:"original",demo:true,tier:"Foundation",series:"Original practice",calculator:false,prompt:`Practice item ${String(index).padStart(2,"0")}: Solve 3x + 7 = 25.`,answer:`Solution item ${String(index).padStart(2,"0")}: x = 6; award 2 marks.`,tags:["Number"]}
});

/** Every request is intercepted; tests never read or write the production bank. */
async function openSavedFixture(page:Page,rows:Row[],ids:string[],configuration:Record<string,unknown>={},failImages=false){
 const cloudId="33333333-3333-4333-8333-333333333333";
 let saved={id:cloudId,title:"Export regression assessment",created_at:"2026-11-15T10:00:00Z",revision:1,configuration:{id:"fixture-assessment",folder:"Unfiled",minutes:30,cover:false,nameBox:false,renumberStudentQuestions:false,...configuration}};
 let links=ids.map((question_id,position)=>({assessment_id:cloudId,question_id,position}));
 await page.addInitScript(({token,user})=>localStorage.setItem("sb-ljisttslifnyrbuybfud-auth-token",JSON.stringify({access_token:token,refresh_token:"dummy",expires_at:4102444800,expires_in:999999999,token_type:"bearer",user})),{token:token(),user});
 await page.route("https://ljisttslifnyrbuybfud.supabase.co/**",async route=>{
  const url=new URL(route.request().url());
  const reply=(body:unknown)=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(body)});
  if(url.pathname==="/auth/v1/user")return reply(user);
  if(url.pathname.startsWith("/rest/v1/profiles"))return reply([{role:"owner",approved:true}]);
  if(url.pathname.startsWith("/rest/v1/questions"))return reply(rows);
  if(url.pathname.startsWith("/rest/v1/assessment_folders"))return reply([]);
  if(url.pathname.startsWith("/rest/v1/assessment_questions"))return reply(links);
  if(url.pathname.startsWith("/rest/v1/assessments"))return reply([saved]);
  if(url.pathname==="/rest/v1/rpc/save_owned_assessment"){
   const payload=route.request().postDataJSON();
   saved={...saved,title:payload.p_title,configuration:payload.p_configuration,revision:saved.revision+1};
   links=payload.p_question_ids.map((question_id:string,position:number)=>({assessment_id:cloudId,question_id,position}));
   return reply([{saved_id:cloudId,saved_revision:saved.revision}]);
  }
  if(url.pathname.includes("/storage/v1/object/sign/")){
   const {paths}=route.request().postDataJSON() as {paths:string[]};
   return reply(paths.map(path=>({path,signedURL:`/export-fixture.svg?asset=${encodeURIComponent(path)}`})));
  }
  return route.fulfill({status:404,contentType:"application/json",body:"{}"});
 });
 await page.route("**/export-fixture.svg?**",async route=>{
  if(failImages)return route.fulfill({status:404,body:"Missing image"});
  const asset=decodeURIComponent(new URL(route.request().url()).searchParams.get("asset")||"");
  const text=asset.startsWith("marks/")?`Solution for ${asset}: x = 6`:`Mathematics for ${asset}: (a) 3x + 7 = 25; (b) x squared = 36`;
  return route.fulfill({status:200,contentType:"image/svg+xml",body:`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="180"><rect width="900" height="180" fill="white"/><text x="10" y="25" font-size="20">17</text><text x="90" y="55" font-size="18">${text}</text><path d="M90 110h700" stroke="black"/><text x="600" y="170" font-size="14">${asset.startsWith("marks/")?"Award 2 marks":"Total for Question 17 is 2 marks"}</text></svg>`});
 });
 await page.goto("/");
 await expect(page.getByRole("navigation",{name:"Main navigation"})).toBeVisible();
 await page.getByRole("navigation",{name:"Main navigation"}).getByRole("button",{name:"My Worksheets"}).click();
 await page.getByRole("button",{name:"Open / Edit",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Assessment preview"})).toBeVisible();
 return {getSaved:()=>saved,getIds:()=>links.map(item=>item.question_id)};
}
async function reviewAllImages(page:Page){
 const pending=page.locator(".assessment-mask-review").getByRole("button",{name:/Review original print/});
 for(let limit=0;limit<40&&await pending.count()>0;limit++){
  await pending.first().click();
  await page.getByRole("button",{name:"Confirm covers avoid question content",exact:true}).click();
 }
 await expect(pending).toHaveCount(0);
}
async function inspectPdf(page:Page,testInfo:TestInfo,name:string){
 await expect(page.getByRole("button",{name:/Print .*save PDF/})).toBeEnabled();
 await page.locator(".paper img").evaluateAll(images=>Promise.all(images.map(image=>(image as HTMLImageElement).decode())));
 const pdf=await page.pdf({format:"A4",printBackground:true,preferCSSPageSize:true});
 const path=testInfo.outputPath(`${name}.pdf`);
 await writeFile(path,pdf);
 await testInfo.attach(`${name}.pdf`,{path,contentType:"application/pdf"});
 const document=await getDocument({data:new Uint8Array(pdf)}).promise;
 const pages=[];
 for(let index=1;index<=document.numPages;index++){
  const page=await document.getPage(index),viewport=page.getViewport({scale:1});
  const content=await page.getTextContent();
  const items=content.items.filter((item):item is Extract<typeof item,{str:string}>=>"str" in item);
  expect(viewport.width).toBeCloseTo(595.28,0);
  expect(viewport.height).toBeCloseTo(841.89,0);
  const text=items.map(item=>item.str).join(" ");
  expect(text.trim().length,`page ${index} must contain visible assessment text`).toBeGreaterThan(5);
  for(const item of items.filter(item=>item.str.trim())){
   expect(item.transform[4],`left of ${item.str}`).toBeGreaterThanOrEqual(0);
   expect(item.transform[4]+item.width,`right of ${item.str}`).toBeLessThanOrEqual(viewport.width+1);
   expect(item.transform[5],`bottom of ${item.str}`).toBeGreaterThanOrEqual(0);
   expect(item.transform[5],`top of ${item.str}`).toBeLessThanOrEqual(viewport.height+1);
  }
  pages.push(text);
 }
 await document.destroy();
 return {pages,text:pages.join("\n"),pdf};
}

// Run PDF assertions once on desktop; the existing builder suite covers mobile layout.
test.beforeEach(async({},testInfo)=>test.skip(testInfo.project.name!=="chromium","PDF regression runs on desktop Chromium"));

test("matching student, teacher and marking PDFs preserve grouped content, sources and saved order",async({page},testInfo)=>{
 test.setTimeout(90000);
 const a=exam("a","EDX-H-JUNE2023-1H-Q17A","Q17a","1H",2);
 const b={...exam("b","EDX-H-JUNE2023-1H-Q17B","Q17b","1H",2),question_storage_path:"questions/a.svg"};
 const duplicate=exam("other-paper","EDX-H-NOVEMBER2022-2H-Q17","Q17","2H",3);
 const missing={...original("missing",5),question_number:undefined,metadata:{...original("missing",5).metadata,id:"CUSTOM-PRACTICE",series:undefined,tier:undefined}};
 const linked=exam("linked-original","EDX-H-JUNE2023-1H-Q21","Q21","1H",5);
 const shadow={...exam("shadow","OFFICIAL-SHADOW-Q21","Q21","1H",5),shadow_paper_id:"shadow-paper",shadow_of_question_id:"linked-original",shadow_papers:{shadow_set:"Set A",status:"reviewed"},metadata:{id:"OFFICIAL-SHADOW-Q21",crop_review:{question:"approved",mark:"approved"}}};
 const saved=await openSavedFixture(page,[a,b,duplicate,missing,linked,shadow],["a","other-paper","missing","shadow"]);
 await expect(page.locator(".paper-question")).toHaveCount(4);
 await expect(page.locator(".paper-question .assessment-question-number")).toHaveText(["Question 17","Question 17","Question Original unknown","Question 21"]);
 await expect(page.locator(".paper-question img")).toHaveCount(3); // shared multipart question once
 const originalPaper=await inspectPdf(page,testInfo,"original-paper-numbering");
 expect(originalPaper.text).toContain("Question 17");
 expect(originalPaper.text).toContain("Question 21");
 await page.getByRole("checkbox",{name:/Hide original question numbers/}).check();
 await expect(page.locator(".mqb-original-number-mask")).toHaveCount(0); // no unreviewed opaque covers
 await expect(page.getByRole("button",{name:/Print .*save PDF/})).toBeDisabled();
 await reviewAllImages(page);
 await expect(page.locator(".paper-question .assessment-question-number")).toHaveText(["Question 1","Question 2","Question 3","Question 4"]);
 const student=await inspectPdf(page,testInfo,"student-sequential");
 expect(student.text).not.toContain("Source:");
 expect(student.text).toContain("(a) 3x + 7 = 25; (b) x squared = 36");
 expect(student.text).toContain("Question 1");
 expect(student.text).toContain("Question 4");
 await page.locator(".paper").screenshot({path:testInfo.outputPath("student-numbering.png")});
 await page.getByRole("button",{name:"Teacher copy",exact:true}).click();
 await expect(page.locator(".assessment-source")).toHaveCount(4);
 await expect(page.locator(".assessment-source").first()).toContainText("Edexcel | June 2023 | Higher | Paper 1 | Original Q17");
 await expect(page.locator(".assessment-source").last()).toContainText("Shadow Set A | Based on:");
 await expect(page.locator(".assessment-source").nth(2)).toHaveText("Source: Source metadata unavailable");
 const teacher=await inspectPdf(page,testInfo,"teacher-sources-inline");
 expect(teacher.text).toContain("Original Q17");
 expect(teacher.text).toContain("Shadow Set A");
 await page.locator(".paper").screenshot({path:testInfo.outputPath("teacher-numbering.png")});
 await page.getByLabel("Teacher source references").selectOption("sheet");
 await expect(page.locator(".teacher-source-sheet")).toHaveCount(1);
 const sheet=await inspectPdf(page,testInfo,"teacher-reference-sheet");
 expect(sheet.pages.at(-1)).toContain("Source references");
 await page.getByLabel("Teacher source references").selectOption("none");
 await expect(page.locator(".assessment-source")).toHaveCount(0);
 await page.getByRole("button",{name:"Mark scheme only",exact:true}).click();
 await reviewAllImages(page);
 await expect(page.locator(".mark-scheme-item")).toHaveCount(4);
 await expect(page.locator(".mark-scheme-item img")).toHaveCount(4); // both distinct multipart marking images
 await expect(page.locator(".mark-scheme-item .assessment-question-number")).toHaveText(["Question 1","Question 2","Question 3","Question 4"]);
 const marks=await inspectPdf(page,testInfo,"matching-mark-scheme");
 expect(marks.text).toContain("Solution for marks/a.svg");
 expect(marks.text).toContain("Solution for marks/b.svg");
 expect(marks.text.split("Solution for marks/a.svg")).toHaveLength(2);
 expect(marks.text.split("Solution for marks/b.svg")).toHaveLength(2);
 expect(marks.text).not.toContain("linked-original.svg");
 expect(marks.text).toContain("Question 4");
 await page.locator(".paper").screenshot({path:testInfo.outputPath("matching-mark-scheme.png")});
 await page.getByRole("button",{name:"Questions + mark scheme",exact:true}).click();
 await page.getByRole("combobox",{name:"Move question 4 to position"}).selectOption("1");
 await page.getByRole("button",{name:/Remove question 3 from assessment/}).click(); // remove other-paper after moving shadow
 await expect(page.locator(".paper-question")).toHaveCount(3);
 await expect(page.locator(".mark-scheme-item")).toHaveCount(3);
 await page.getByRole("button",{name:"Save changes to my account",exact:true}).click();
 await expect.poll(()=>saved.getIds()).toEqual(["shadow","a","missing"]);
 expect(saved.getSaved().configuration).toMatchObject({renumberStudentQuestions:true,exportMode:"both",teacherSourceMode:"none"});
 await page.getByRole("navigation",{name:"Main navigation"}).getByRole("button",{name:"My Worksheets"}).click();
 await page.getByRole("button",{name:"Open / Edit",exact:true}).click();
 await expect(page.getByRole("checkbox",{name:/Hide original question numbers/})).toBeChecked();
 await expect(page.locator(".paper-question .assessment-question-number")).toHaveText(["Question 1","Question 2","Question 3"]);
 const reopened=await inspectPdf(page,testInfo,"reopened-reordered-combined");
 expect(reopened.text).not.toContain("other-paper.svg");
 expect(reopened.text.indexOf("questions/shadow.svg")).toBeLessThan(reopened.text.indexOf("questions/a.svg"));
 await page.screenshot({path:testInfo.outputPath("assessment-builder.png"),fullPage:true});
 await testInfo.attach("assessment-builder.png",{path:testInfo.outputPath("assessment-builder.png"),contentType:"image/png"});
 await page.getByRole("checkbox",{name:/Hide original question numbers/}).uncheck();
 await page.getByRole("button",{name:"Save changes to my account",exact:true}).click();
 await expect.poll(()=>saved.getSaved().configuration.renumberStudentQuestions).toBe(false);
 await page.getByRole("navigation",{name:"Main navigation"}).getByRole("button",{name:"My Worksheets"}).click();
 await page.getByRole("button",{name:"Open / Edit",exact:true}).click();
 await expect(page.getByRole("checkbox",{name:/Hide original question numbers/})).not.toBeChecked();
 await expect(page.locator(".paper-question .assessment-question-number")).toHaveText(["Question 21","Question 17","Question Original unknown"]);
 // Reopening the same decoded sources must never reset a cached onLoad result.
 for(let reopen=0;reopen<3;reopen++){
  await page.getByRole("navigation",{name:"Main navigation"}).getByRole("button",{name:"My Worksheets"}).click();
  await page.getByRole("button",{name:"Open / Edit",exact:true}).click();
  await expect(page.locator('.paper [data-image-state="loading"],.paper [data-image-state="error"]')).toHaveCount(0);
  await expect(page.locator('.paper [data-image-state="ready"]')).toHaveCount(5);
  await expect(page.getByRole("button",{name:/Print .*save PDF/})).toBeEnabled();
 }
});

test("single original question and long combined A4 papers have no empty pages or missing items",async({page},testInfo)=>{
 test.setTimeout(60000);
 const rows=Array.from({length:15},(_,i)=>original(`practice-${i+1}`,i+1));
 await openSavedFixture(page,rows,rows.map(row=>row.id),{renumberStudentQuestions:true,cover:true,exportMode:"both"});
 const combined=await inspectPdf(page,testInfo,"long-a4-combined");
 expect(combined.pages.length).toBeGreaterThan(3);
 expect(combined.pages[0]).toContain("Total marks: 30");
 for(let index=1;index<=15;index++){
  const id=String(index).padStart(2,"0");
  expect(combined.text.match(new RegExp(`Practice item ${id}:`,"g"))).toHaveLength(1);
  expect(combined.text.match(new RegExp(`Solution item ${id}:`,"g"))).toHaveLength(1);
  const questionPage=combined.pages.find(text=>text.includes(`Practice item ${id}:`))!;
  expect(questionPage).toContain(`Question ${index}`); // heading and question stay together
 }
 await page.getByRole("checkbox",{name:"Include cover page",exact:true}).uncheck();
 const withoutCover=await inspectPdf(page,testInfo,"long-a4-no-cover");
 expect(withoutCover.pages.length).toBe(combined.pages.length-1);
 // Leave one question to exercise removal and the smallest printable paper.
 for(let index=15;index>1;index--)await page.getByRole("button",{name:new RegExp(`^Remove question ${index} from assessment:`)}).click();
 await page.getByRole("button",{name:"Questions only",exact:true}).click();
 await page.evaluate(()=>{(window as unknown as {printCalls:number}).printCalls=0;window.print=()=>{(window as unknown as {printCalls:number}).printCalls++}});
 await page.getByRole("button",{name:/Print .*save PDF/}).click();
 await expect.poll(()=>page.evaluate(()=>(window as unknown as {printCalls:number}).printCalls)).toBe(1);
 const single=await inspectPdf(page,testInfo,"single-question");
 expect(single.pages).toHaveLength(1);
 expect(single.text).toContain("Practice item 01:");
 expect(single.text).not.toContain("Mark scheme");
 await page.getByRole("checkbox",{name:/Hide original question numbers/}).uncheck();
 const originalNumbered=await inspectPdf(page,testInfo,"single-original-numbering");
 expect(originalNumbered.text).toContain("Question 1");
});

test("failed image requests block exporting instead of printing an incomplete assessment",async({page})=>{
 const row=exam("broken","EDX-H-JUNE2023-1H-Q17","Q17","1H",3);
 await openSavedFixture(page,[row],[row.id],{},true);
 await expect(page.locator(".paper").getByRole("alert")).toContainText("Image failed to load");
 await expect(page.getByRole("button",{name:/Print .*save PDF/})).toBeDisabled();
});


test("missing saved references remain saved and block incomplete PDF exports",async({page})=>{
 const saved=await openSavedFixture(page,[original("available",1)],["available","unavailable-question"],{renumberStudentQuestions:true});
 await expect(page.getByRole("button",{name:/Print .*save PDF/})).toBeDisabled();
 await expect(page.locator(".export-warning")).toContainText("1 saved question reference(s) are unavailable");
 await page.getByRole("button",{name:"Save changes to my account",exact:true}).click();
 await expect.poll(()=>saved.getIds()).toEqual(["available","unavailable-question"]);
 await page.getByRole("navigation",{name:"Main navigation"}).getByRole("button",{name:"My Worksheets"}).click();
 await page.getByRole("button",{name:"Open / Edit",exact:true}).click();
 await expect(page.getByRole("button",{name:/Print .*save PDF/})).toBeDisabled();
 await expect(page.locator(".export-warning")).toContainText("1 saved question reference(s) are unavailable");
});

test("draft covers overlapping mathematics stay transparent and block printing until reviewed",async({page},testInfo)=>{
 const row=exam("overlap","EDX-H-JUNE2023-1H-Q17","Q17","1H",3);
 await openSavedFixture(page,[row],[row.id],{renumberStudentQuestions:true});
 await page.getByRole("button",{name:"Review original print for question 1",exact:true}).click();
 await page.getByRole("spinbutton",{name:"Number cover width for question 1",exact:true}).fill("25");
 await page.getByRole("spinbutton",{name:"Number cover depth for question 1",exact:true}).fill("12");
 await expect(page.locator(".paper .mqb-original-number-mask")).toHaveCount(0);
 await expect(page.getByRole("button",{name:/Print .*save PDF/})).toBeDisabled();
 const draftColor=await page.locator(".builder-mask-editor .mqb-original-number-mask").evaluate(node=>getComputedStyle(node).backgroundColor);
 expect(draftColor).toMatch(/^rgba\(/); // mathematics remains visible through draft guides
 await page.screenshot({path:testInfo.outputPath("manual-cover-review.png"),fullPage:true});
 await page.getByRole("button",{name:"Reset covers for this question",exact:true}).click();
 await page.getByRole("button",{name:"Confirm covers avoid question content",exact:true}).click();
 await expect(page.locator(".paper .mqb-original-number-mask")).toHaveCount(1);
 await inspectPdf(page,testInfo,"manual-covers-preserve-mathematics");
});
