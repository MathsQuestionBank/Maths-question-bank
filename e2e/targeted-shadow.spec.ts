import {test,expect,type Page,type TestInfo} from "@playwright/test";
import {writeFile} from "node:fs/promises";
import {getDocument} from "pdfjs-dist/legacy/build/pdf.mjs";
import {numberingFixture} from "./numbering-fixture";

// Isolated, synthetic examination-style records: every Supabase request and
// asset is intercepted. These demonstrate the workflow without production writes.
const uid="11111111-1111-4111-8111-111111111111",sourceId="33333333-3333-4333-8333-333333333333",newId="44444444-4444-4444-8444-444444444444";
const user={id:uid,aud:"authenticated",role:"authenticated",email:"teacher@example.test",app_metadata:{provider:"email",providers:["email"]},user_metadata:{},created_at:"2026-01-01T00:00:00Z"};
const token=()=>{const enc=(v:object)=>Buffer.from(JSON.stringify(v)).toString("base64url");return `${enc({alg:"HS256",typ:"JWT"})}.${enc({exp:4102444800,sub:uid,role:"authenticated",aud:"authenticated"})}.signature`};
function row(id:string,number:string,skill:string,marks=4,grade=6,paper="3H",total=marks,questionAsset=id){return {
 id,question_number:number,marks,topic:"Algebra",skill,assessment_objective:"AO1",
 exam_papers:{exam_board:"Edexcel",series:id.startsWith("o")?"June 2022":"June 2023",paper_code:paper,tier:"Higher"},
 question_storage_path:`questions/${questionAsset}.svg`,mark_scheme_storage_path:`marks/${id}.svg`,
 metadata:{id:`${id.startsWith("o")?"2022":"2023"}_${paper}_Q${number}`,tier:"Higher",calculator:true,grade,g4:30,g6:id==="easy"?78:id==="hard"?62:70,g7:85,
 numbering_positions:{question:numberingFixture(900,210,Number(number.match(/\d+/)![0]),{left:8,top:7,width:26,height:22},{left:570,top:180,width:320,height:23},total),mark:numberingFixture(900,210,Number(number.match(/\d+/)![0]),{left:8,top:7,width:26,height:22})}}
 }}
const skills=["Expanding double brackets","Solving simultaneous equations","Circle theorems","Reverse percentages","Conditional probability"];
const bank=()=>[
 row("o1a","14a",skills[0],2,6,"3H",5),row("o1b","14b",skills[0],3,6,"3H",5,"o1a"),
 ...skills.slice(1).map((skill,i)=>row(`o${i+2}`,String(i+15),skill)),
 row("r1a","8a",skills[0],2,6,"2H",5),row("r1b","8b",skills[0],3,6,"2H",5,"r1a"),
 row("r2","9",skills[1]),row("r3","10",skills[2]),
 row("easy","11",skills[0],3,5),row("hard","12",skills[0],5,7)
];
async function fixture(page:Page,configure?:(rows:ReturnType<typeof bank>)=>void){
 const rows=bank();configure?.(rows);
 const original={id:sourceId,title:"Year 10 five-question check",revision:3,created_at:"2026-11-16T10:00:00Z",configuration:{id:"original-draft",folder:"Unfiled",minutes:30,cover:false,nameBox:false,renumberStudentQuestions:false,exportMode:"questions"}};
 const saved=[structuredClone(original)];
 let links=["o1a","o2","o3","o4","o5"].map((question_id,position)=>({assessment_id:sourceId,question_id,position}));
 const writes:Record<string,any>[]=[];
 await page.addInitScript(({user,token})=>localStorage.setItem("sb-ljisttslifnyrbuybfud-auth-token",JSON.stringify({user,access_token:token,refresh_token:"fixture",expires_at:4102444800,expires_in:999999999,token_type:"bearer"})),{user,token:token()});
 await page.route("https://ljisttslifnyrbuybfud.supabase.co/**",async route=>{
  const path=new URL(route.request().url()).pathname;
  const reply=(body:unknown)=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(body)});
  if(path==="/auth/v1/user")return reply(user);
  if(path.startsWith("/rest/v1/profiles"))return reply([{role:"member",approved:true}]);
  if(path.startsWith("/rest/v1/questions"))return reply(rows);
  if(path.startsWith("/rest/v1/assessment_folders"))return reply([]);
  if(path.startsWith("/rest/v1/assessment_questions"))return reply(links);
  if(path.startsWith("/rest/v1/assessments"))return reply(saved);
  if(path==="/rest/v1/rpc/save_owned_assessment"){
   const payload=route.request().postDataJSON();writes.push(payload);
   const id=payload.p_id||newId,previous=saved.find(s=>s.id===id);
   const next={id,title:payload.p_title,revision:(previous?.revision||0)+1,created_at:original.created_at,configuration:payload.p_configuration};
   if(previous)Object.assign(previous,next);else saved.push(next);
   links=links.filter(link=>link.assessment_id!==id).concat(payload.p_question_ids.map((question_id:string,position:number)=>({assessment_id:id,question_id,position})));
   return reply([{saved_id:id,saved_revision:next.revision}]);
  }
  if(path.includes("/storage/v1/object/sign/")){const {paths}=route.request().postDataJSON();return reply(paths.map((path:string)=>({path,signedURL:`/targeted-fixture.svg?asset=${encodeURIComponent(path)}`})))}
  return route.fulfill({status:404,body:"{}"});
 });
 await page.route("**/targeted-fixture.svg?**",async route=>{
  const asset=decodeURIComponent(new URL(route.request().url()).searchParams.get("asset")!),mark=asset.startsWith("marks/"),r=rows.find(r=>(mark?r.mark_scheme_storage_path:r.question_storage_path)===asset)!;
  const n=r.question_number.match(/\d+/)![0],total=r.metadata.numbering_positions.question.totalRects[0].marks;
  const text=mark?`Solution ${r.id}: ${r.skill}. Award ${r.marks} marks.`:/^(?:o1[ab]|r1[ab]|easy|hard)$/.test(r.id)?`Practice ${r.id}: (a) Expand (x + 2)(x + 3). (b) Expand (2x + 1)(x - 4).`:`Practice ${r.id}: ${r.skill}.`;
  await route.fulfill({contentType:"image/svg+xml",body:`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="210"><rect width="900" height="210" fill="white"/><text x="10" y="25" font-size="20">${n}</text><text x="60" y="60" font-size="17">${text}</text><path d="M60 120h780 M60 155h780" stroke="#999"/><text x="575" y="198" font-size="15">${mark?`Award ${r.marks} marks`:`(Total for Question ${n} is ${total} marks)`}</text></svg>`});
 });
 await page.goto("/");
 await page.getByRole("navigation",{name:"Main navigation"}).getByRole("button",{name:"My Worksheets"}).click();
 await page.getByRole("button",{name:"Open / Edit",exact:true}).click();
 await expect(page.locator(".paper-question")).toHaveCount(5);
 await page.getByRole("button",{name:"Create Targeted Shadow Assessment",exact:true}).click();
 await page.getByRole("combobox",{name:"Targeted shadow target student grade",exact:true}).selectOption("6");
 return {saved,links:()=>links,writes,original};
}
async function screenshot(page:Page,testInfo:TestInfo,name:string,selector:string){
 // Full-component captures keep the sticky bar in its initial position; the
 // phone test separately verifies it stays in the viewport while scrolling.
 const path=testInfo.outputPath(`${name}.png`);await page.locator(selector).screenshot({path,style:".targeted-alternative-nav{position:static!important}"});await testInfo.attach(name,{path,contentType:"image/png"});
}
async function pdf(page:Page,testInfo:TestInfo,name:string){
 const data=await page.pdf({format:"A4",printBackground:true,preferCSSPageSize:true}),path=testInfo.outputPath(`${name}.pdf`);await writeFile(path,data);await testInfo.attach(name,{path,contentType:"application/pdf"});
 const doc=await getDocument({data:new Uint8Array(data)}).promise,pages:string[]=[];
 for(let i=1;i<=doc.numPages;i++){const p=await doc.getPage(i);const text=(await p.getTextContent()).items.map(item=>"str" in item?item.str:"").join(" ");expect(text.trim().length).toBeGreaterThan(5);pages.push(text)}
 await doc.destroy();return pages.join("\n");
}

test("teacher targets three of five questions, previews, generates and saves a separate sequential paper with matching marks",async({page},testInfo)=>{
 test.setTimeout(90000);
 const state=await fixture(page),panel=page.getByRole("region",{name:"Targeted shadow assessment"});
 await panel.getByRole("button",{name:"Select all incorrect questions"}).click();
 await expect(panel.getByRole("status").last()).toHaveText("5 questions selected · 21 marks selected");
 await panel.getByRole("button",{name:"Clear selection",exact:true}).click();
 await expect(panel.getByRole("status").last()).toHaveText("0 questions selected · 0 marks selected");
 for(let i=1;i<=3;i++)await panel.getByRole("checkbox",{name:`Target question ${i}`,exact:true}).check();
 await expect(panel.getByRole("status").last()).toHaveText("3 questions selected · 13 marks selected");
 await expect(page.locator(".paper-question")).toHaveCount(5); // original untouched during review
 await expect(panel.getByRole("button",{name:"Generate Shadow Assessment",exact:true})).toBeDisabled();
 for(let i=1;i<=3;i++){
  const article=panel.getByRole("article",{name:`Replacements for question ${i}`,exact:true}),card=article.locator(".targeted-suggestion").first();
  await expect(card).toContainText("Smart alternative");await expect(card).toContainText("Strong metadata match");
  await expect(card.locator(".targeted-preview")).toHaveAttribute("open","");
  await expect(card.locator("img")).toHaveCount(1);
  await card.getByRole("button",{name:"Mark scheme image",exact:true}).click();
  await expect(card.locator("img")).toHaveCount(i===1?2:1);
  await card.getByRole("button",{name:"Question image",exact:true}).click();
  if(i===1){await card.getByRole("button",{name:"Enlarge preview",exact:true}).click();await expect(page.getByRole("dialog",{name:"Enlarged replacement preview"})).toBeVisible();await page.getByRole("button",{name:"Close enlarged preview",exact:true}).click()}
  await card.getByRole("button",{name:"Choose this replacement",exact:true}).click();
 }
 await screenshot(page,testInfo,"targeted-selection-and-suggestions",".targeted-shadow-panel");
 await panel.getByRole("button",{name:"Generate Shadow Assessment",exact:true}).click();
 await expect(page.locator(".targeted-origin-banner")).toContainText("3 replacement questions");
 await expect(page.locator(".paper-question .assessment-question-number")).toHaveText(["Question 1","Question 2","Question 3"]);
 await expect(page.locator(".mark-scheme-item .assessment-question-number")).toHaveText(["Question 1","Question 2","Question 3"]);
 await expect(page.locator(".paper-question .mqb-auto-total-text")).toHaveText(["(Total for Question 1 is 5 marks)","(Total for Question 2 is 4 marks)","(Total for Question 3 is 4 marks)"]);
 await expect(page.locator(".mark-scheme-item img")).toHaveCount(4); // both multipart solutions retained
 await expect(page.getByRole("button",{name:/Print .*save PDF/})).toBeEnabled();
 await screenshot(page,testInfo,"targeted-assessment-and-mark-scheme",".paper");
 if(testInfo.project.name==="chromium"){
  const text=await pdf(page,testInfo,"targeted-shadow-student-and-mark-scheme");
  for(const id of ["r1a","r1b","r2","r3"])expect(text).toContain(`Solution ${id}:`);
  expect(text).toContain("Practice r1a: (a) Expand");expect(text).not.toContain("Practice o");
  for(let n=1;n<=3;n++)expect(text).toContain(`Question ${n}`);
  expect(text).toContain("Total for Question 1 is 5 marks");
  await page.getByRole("button",{name:"Teacher copy",exact:true}).click();
  const teacher=await pdf(page,testInfo,"targeted-shadow-teacher-sources");expect(teacher).toContain("Original Q8");expect(teacher).toContain("June 2023");
  await page.getByRole("button",{name:"Questions + mark scheme",exact:true}).click();
 }
 await page.getByRole("button",{name:"Save to my account",exact:true}).click();
 await expect.poll(()=>state.writes.length).toBe(1);
 expect(state.writes[0]).toMatchObject({p_id:null,p_expected_revision:null,p_question_ids:["r1a","r2","r3"],p_configuration:{linkedOriginalAssessmentId:sourceId,renumberStudentQuestions:true,replaceSourceTotals:true,exportMode:"both",targetedShadow:{originalTitle:state.original.title,difficulty:"same",targetStudentGrade:6,matchingBasis:"student-grade-performance-v1",replacements:[{originalIds:["o1a","o1b"],replacementIds:["r1a","r1b"]},{originalIds:["o2"],replacementIds:["r2"]},{originalIds:["o3"],replacementIds:["r3"]}]}}});
 expect(state.saved[0]).toEqual(state.original);expect(state.links().filter(l=>l.assessment_id===sourceId).map(l=>l.question_id)).toEqual(["o1a","o2","o3","o4","o5"]);
 await page.getByRole("button",{name:"Return to original assessment",exact:true}).click();
 await expect(page.locator(".paper-question")).toHaveCount(5);await expect(page.getByRole("checkbox",{name:/Hide original question numbers/})).not.toBeChecked();
 await page.getByRole("navigation",{name:"Main navigation"}).getByRole("button",{name:"My Worksheets"}).click();
 await page.locator(".library-item").filter({hasText:"Year 10 five-question check — Targeted Shadow"}).getByRole("button",{name:"Open / Edit",exact:true}).click();
 await expect(page.locator(".paper-question")).toHaveCount(3);await expect(page.locator(".targeted-origin-banner")).toContainText("Linked to the original assessment");
 await expect(page.locator(".mark-scheme-item img")).toHaveCount(4);await expect(page.getByRole("button",{name:/Print .*save PDF/})).toBeEnabled();
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);expect(overflow).toBe(false);
});

test("difficulty changes require fresh choices; unmatched questions and cancellation remain explicit",async({page})=>{
 await fixture(page);const panel=page.getByRole("region",{name:"Targeted shadow assessment"});
 await panel.getByRole("checkbox",{name:"Target question 1",exact:true}).check();
 const article=panel.getByRole("article",{name:"Replacements for question 1",exact:true});
 await article.getByRole("button",{name:"Choose this replacement",exact:true}).first().click();
 await panel.getByRole("combobox",{name:"Targeted shadow difficulty"}).selectOption("easier");
 await expect(article.locator(".targeted-suggestion")).toHaveCount(1);await expect(article.locator(".targeted-history dd")).toHaveText(["70%","78%"]);
 await expect(panel.getByRole("button",{name:"Generate Shadow Assessment",exact:true})).toBeDisabled();
 await article.getByRole("button",{name:"Choose this replacement",exact:true}).click();
 await article.getByRole("button",{name:"Reject chosen replacement",exact:true}).click();
 await expect(panel.getByRole("button",{name:"Generate Shadow Assessment",exact:true})).toBeDisabled();
 await panel.getByRole("combobox",{name:"Targeted shadow difficulty"}).selectOption("harder");await expect(article.locator(".targeted-history dd")).toHaveText(["70%","62%"]);
 await panel.getByRole("combobox",{name:"Targeted shadow difficulty"}).selectOption("same");
 await article.getByRole("button",{name:"Choose this replacement",exact:true}).first().click();
 await panel.getByRole("checkbox",{name:"Target question 5",exact:true}).check();
 const missing=panel.getByRole("article",{name:"Replacements for question 5",exact:true});await expect(missing).toContainText("No suitable match");
 await expect(panel.getByRole("button",{name:"Generate Shadow Assessment",exact:true})).toBeDisabled();
 await missing.getByRole("radio",{name:"Leave this question unmatched"}).check();await expect(panel.getByRole("button",{name:"Generate Shadow Assessment",exact:true})).toBeEnabled();
 await panel.getByRole("button",{name:"Cancel targeted shadow",exact:true}).click();await expect(page.locator(".paper-question")).toHaveCount(5);await expect(page.locator(".targeted-origin-banner")).toHaveCount(0);
});


test("replacement cards remain readable across desktop tablet and mobile",async({page},testInfo)=>{
 await fixture(page,rows=>{
  const longSkill="Expanding and simplifying products of two binomial expressions with positive and negative integer coefficients";
  for(const r of rows){
   if(r.skill===skills[0])r.skill=longSkill;
   if(r.id==="o1a"||r.id==="o1b")r.metadata.g6=82.7;
   if(r.id==="r1a"||r.id==="r1b")r.metadata.g6=88.5;
   if(r.id==="easy")r.metadata.g6=89;
   if(r.id==="hard"){r.metadata.g6=75;r.assessment_objective="AO2";}
   if(r.id==="r2"){r.metadata.grade=0;r.assessment_objective="";Reflect.deleteProperty(r.metadata,"g6");r.exam_papers.series="Unspecified";}
  }
 });
 const panel=page.getByRole("region",{name:"Targeted shadow assessment"});
 for(const i of [1,2,5])await panel.getByRole("checkbox",{name:`Target question ${i}`,exact:true}).check();
 const article=panel.getByRole("article",{name:"Replacements for question 1",exact:true});
 await article.locator(".targeted-preview").first().evaluate(node=>(node as HTMLDetailsElement).open=true);
 const sizes=testInfo.project.name==="chromium"?[{name:"desktop",width:1440,height:1000},{name:"tablet",width:900,height:1100}]:[{name:"mobile",width:393,height:851},{name:"small-mobile",width:320,height:800}];
 for(const size of sizes){
  await page.setViewportSize(size);
  await article.locator("img").first().evaluate(image=>(image as HTMLImageElement).decode());
  const mobile=size.width<720,cards=article.locator(".targeted-suggestion"),first=cards.first(),nav=article.getByRole("group",{name:"Browse alternatives",exact:true});
  await expect(cards).toHaveCount(3);
  await expect(article.locator(".targeted-suggestion:visible")).toHaveCount(mobile?1:3);
  if(mobile)await expect(nav).toBeVisible();else await expect(nav).toBeHidden();
  const boxes=await cards.evaluateAll(nodes=>nodes.map(node=>{const b=node.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width}}));
  if(!mobile){expect(boxes[1].x).toBeGreaterThan(boxes[0].x+boxes[0].width);expect(boxes[1].y).toBeCloseTo(boxes[0].y,0);expect(boxes[2].y).toBeGreaterThan(boxes[0].y)}
  const imageBox=await first.locator(".mqb-cropped-image").first().boundingBox();
  expect(imageBox!.width).toBeGreaterThan(size.width*(mobile?.78:.35));expect(imageBox!.x).toBeGreaterThanOrEqual(0);expect(imageBox!.x+imageBox!.width).toBeLessThanOrEqual(size.width);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await expect(first.locator(".targeted-history dd")).toHaveText(["82.7%","88.5%"]);
  await expect(first.locator(".targeted-history")).toContainText("final GCSE grade 6");await expect(first.locator(".targeted-history")).toContainText("not proof that a question is easier or harder");
  await expect(first.locator(".targeted-reasons")).not.toHaveAttribute("open","");
  await expect(first.getByText("Same enhanced skill coverage.",{exact:true})).toBeHidden();
  await first.getByText("Why this question?",{exact:true}).click();await expect(first.getByText("Same enhanced skill coverage.",{exact:true})).toBeVisible();
  await first.getByText("Why this question?",{exact:true}).click();
  await screenshot(page,testInfo,`after-${size.name}-replacement-cards`,'.targeted-question[aria-label="Replacements for question 1"]');
  if(mobile){
   await expect(nav.getByRole("button",{name:"Previous alternative",exact:true})).toBeDisabled();
   await first.getByRole("button",{name:"Choose this replacement",exact:true}).click();
   await expect(nav.getByRole("button",{name:"Next alternative",exact:true})).toBeInViewport();
   await nav.getByRole("button",{name:"Next alternative",exact:true}).click();await expect(nav.locator("span")).toHaveText("Alternative 2 of 3");
   await expect(cards.nth(1)).toBeVisible();await expect(first).toBeHidden();
   await expect(cards.nth(1).getByRole("button",{name:"Choose this replacement",exact:true})).toHaveAttribute("aria-pressed","false");
   await expect(cards.nth(1).locator(".targeted-fact-difference").filter({hasText:"Marks"})).toContainText("Original: 5");
   await expect(cards.nth(1).locator(".targeted-warnings")).toBeVisible();
   await nav.getByRole("button",{name:"Next alternative",exact:true}).click();await expect(nav.locator("span")).toHaveText("Alternative 3 of 3");
   await expect(nav.getByRole("button",{name:"Next alternative",exact:true})).toBeDisabled();
   await expect(cards.nth(2).locator(".targeted-warnings")).toContainText("Assessment objective coverage differs");await expect(cards.nth(2).locator(".targeted-warnings")).toBeVisible();
   await expect(cards.nth(2).locator(".targeted-reasons")).not.toHaveAttribute("open","");
   await expect(cards.nth(2).locator(".targeted-fact-difference").filter({hasText:"Mapped parts"})).toContainText("Original: 2");
   await nav.getByRole("button",{name:"Previous alternative",exact:true}).click();await expect(nav.locator("span")).toHaveText("Alternative 2 of 3");
   await article.getByRole("button",{name:"View chosen replacement",exact:true}).click();await expect(first).toBeVisible();
   await expect(first.getByRole("button",{name:"Replacement chosen",exact:true})).toHaveAttribute("aria-pressed","true");
   await article.getByRole("button",{name:"Reject chosen replacement",exact:true}).click();
  }
  await first.getByRole("button",{name:"Mark scheme image",exact:true}).click();await expect(first.locator(".targeted-preview> .mqb-cropped-image")).toHaveCount(2);
  await first.getByRole("button",{name:"Enlarge preview",exact:true}).click();const dialog=page.getByRole("dialog",{name:"Enlarged replacement preview"});await expect(dialog.locator("img")).toHaveCount(2);
  await page.keyboard.press("Escape");await expect(dialog).toBeHidden();
  await first.getByRole("button",{name:"Question image",exact:true}).click();
  const missing=panel.getByRole("article",{name:"Replacements for question 2",exact:true}).locator(".targeted-suggestion");
  await expect(missing).toContainText("Possible match — teacher review recommended");await expect(missing.locator(".targeted-summary-facts")).toContainText("Unavailable");
  await expect(missing.locator(".targeted-history dd")).toHaveText(["70%","No data"]);await expect(missing.locator(".targeted-warnings")).toBeVisible();
  const empty=panel.getByRole("article",{name:"Replacements for question 5",exact:true});await expect(empty).toContainText("No suitable match");await expect(empty.locator(".targeted-suggestion")).toHaveCount(0);await expect(empty.getByRole("group",{name:"Browse alternatives",exact:true})).toHaveCount(0);
 }
});

test("target student grade is explicit and a change invalidates approvals without inferring a question grade",async({page})=>{
 await fixture(page);const panel=page.getByRole("region",{name:"Targeted shadow assessment"}),grade=panel.getByRole("combobox",{name:"Targeted shadow target student grade",exact:true});
 await grade.selectOption("");await panel.getByRole("checkbox",{name:"Target question 1",exact:true}).check();
 const article=panel.getByRole("article",{name:"Replacements for question 1",exact:true});
 await expect(article).toContainText("Choose a target student grade");await expect(article.locator(".targeted-suggestion")).toHaveCount(0);
 await grade.selectOption("6");await panel.getByRole("combobox",{name:"Targeted shadow difficulty"}).selectOption("easier");
 await expect(article.locator(".targeted-history dd")).toHaveText(["70%","78%"]);await article.getByRole("button",{name:"Choose this replacement",exact:true}).click();
 await expect(panel.getByRole("button",{name:"Generate Shadow Assessment",exact:true})).toBeEnabled();
 await grade.selectOption("7");await expect(article).toContainText("No suitable match");await expect(panel.getByRole("button",{name:"Generate Shadow Assessment",exact:true})).toBeDisabled();
 await grade.selectOption("6");await expect(article.locator(".targeted-suggestion")).toHaveCount(1);await expect(panel.getByRole("button",{name:"Generate Shadow Assessment",exact:true})).toBeDisabled();
});
