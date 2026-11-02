import { test, expect } from "@playwright/test";

const uid="11111111-1111-4111-8111-111111111111";
const user={id:uid,aud:"authenticated",role:"authenticated",email:"owner@example.test",app_metadata:{provider:"email",providers:["email"]},user_metadata:{},created_at:"2026-01-01T00:00:00Z"};
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/NVcAAAAASUVORK5CYII=","base64");
const rows=[
 ["a","EDX-H-JUNE2022-1H-Q02A",2],["b","EDX-H-JUNE2022-1H-Q02B",2],["c","2021_2H_Q11",6],["d","2020_3H_Q07",3]
].map(([id,sourceId,marks])=>({
 id,topic:"Number",skill:"Fractions",marks,assessment_objective:"AO1",
 question_storage_path:`questions/${sourceId}.png`,mark_scheme_storage_path:`marks/${sourceId}.png`,
 metadata:{id:sourceId,tier:"Higher",calculator:false,series:"November 2022",grade:6,prompt:"Example question",answer:"Example answer",tags:["Number"],g6:55,g8:id==="a"?40:id==="b"?80:id==="c"?30:70}
}));
const makeToken=()=>{
 const b64=(o:object)=>Buffer.from(JSON.stringify(o)).toString("base64url");
 return `${b64({alg:"HS256",typ:"JWT"})}.${b64({exp:4102444800,sub:uid,role:"authenticated",aud:"authenticated"})}.signature`;
};

test("owner Assessment Builder: multipart, reordering, exports and reopening account assessment",async ({page,browserName})=>{
 test.setTimeout(90000); // image masks, PDF rendering and save/reopen are all verified in this extended end-to-end flow
 test.skip(browserName!=="chromium","Chromium PDF tests only");
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 const token=makeToken();
 let storedAssessment:any=null;let storedQuestions:any[]=[];
 await page.addInitScript(({token,user})=>{
  localStorage.setItem("sb-ljisttslifnyrbuybfud-auth-token",JSON.stringify({access_token:token,refresh_token:"dummy",expires_at:4102444800,expires_in:999999999,token_type:"bearer",user}));
 },{token,user});
 await page.route("https://ljisttslifnyrbuybfud.supabase.co/**", async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==="/auth/v1/user")return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(user)});
  if(url.pathname.startsWith("/rest/v1/profiles"))return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify([{role:"owner",approved:true}])});
  if(url.pathname.startsWith("/rest/v1/assessment_folders"))return route.fulfill({status:200,contentType:"application/json",body:"[]"});
  if(url.pathname.startsWith("/rest/v1/assessments"))return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(storedAssessment?[storedAssessment]:[])});
  if(url.pathname.startsWith("/rest/v1/assessment_questions"))return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(storedQuestions)});
  if(url.pathname==="/rest/v1/rpc/save_owned_assessment"){
   const payload=route.request().postDataJSON();const id="33333333-3333-4333-8333-333333333333";
   const revision=storedAssessment?storedAssessment.revision+1:1;
   storedAssessment={id,created_by:uid,title:payload.p_title,configuration:payload.p_configuration,created_at:"2026-10-27T00:00:00Z",revision};
   storedQuestions=payload.p_question_ids.map((question_id:string,position:number)=>({assessment_id:id,question_id,position}));
   return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify([{saved_id:id,saved_revision:revision}])});
  }
  if(url.pathname.startsWith("/rest/v1/questions"))return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(rows)});
  if(url.pathname.includes("/storage/v1/object/sign/")){
   const body=route.request().postDataJSON();
   const paths=body.paths as string[];
   return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(paths.map(path=>({path,signedURL:`/fixture-image.png?path=${encodeURIComponent(path)}`})) )});
  }
  return route.fulfill({status:404,contentType:"application/json",body:"{}"});
 });
 await page.route("**/fixture-image.png**",route=>route.fulfill({status:200,contentType:"image/png",body:png}));
 await page.goto("/");
 await expect(page.locator(".owner-banner")).toHaveCount(0);
 await expect(page.locator(".site-masthead .brand")).toHaveCSS("background-color","rgb(246, 229, 237)");
 await expect(page.getByRole("navigation",{name:"Main navigation"}).getByRole("button",{name:"Question Bank"})).toHaveAttribute("aria-current","page",{timeout:12000});
 await expect(page.getByText("4 question records match your filters")).toBeVisible({timeout:12000});
 await page.getByRole("button",{name:"Add all filtered results"}).click();
 await page.getByRole("button",{name:"Add all filtered results"}).click(); // idempotent, never duplicates multipart groups
 await page.getByRole("button",{name:"Open assessment builder →"}).click();
 await expect(page.getByRole("heading",{name:"Assessment preview"})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Put your assessment together"})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Configure your paper"})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Save your work"})).toBeVisible();
 await expect(page.getByRole("button",{name:"Save to my account",exact:true})).toHaveCount(1);
 await expect(page.locator(".builder-overview-stats")).toContainText("13");
 const order=page.locator(".assessment-order-row");
 await expect(order).toHaveCount(3);
 await expect(page.locator(".paper-question")).toHaveCount(3);
 await expect(page.locator(".teacher-stats-question").first()).toContainText("Q02");
 await expect(page.locator(".teacher-stats-question").first()).toContainText("Combined:");
 await expect(page.locator(".teacher-stats-question").first()).toContainText("Q02A: 40%");
 await expect(page.locator(".teacher-stats-question").first()).toContainText("Q02B: 80%");
 await expect(page.locator(".teacher-stats-question").first()).toContainText("Combined: 60%");
 // Opt-in paper renumbering keeps original source references available to teachers.
 await expect(page.getByRole("checkbox",{name:/Hide original question numbers/})).not.toBeChecked();
 await expect(page.locator(".mqb-original-number-mask")).toHaveCount(0);
 await page.getByRole("checkbox",{name:/Hide original question numbers/}).check();
 await expect(page.locator(".mqb-original-number-mask")).toHaveCount(3);
 await expect(page.locator(".mqb-original-total-mask")).toHaveCount(3);
 await expect(page.locator(".assessment-renumber-total")).toHaveCount(3);
 await expect(page.locator(".assessment-renumber-total").first()).toHaveText("Total for Question 1 is 4 marks");
 await expect(page.locator(".paper-question").first()).toContainText("EDX-H-JUNE2022-1H-Q02");
 await page.locator(".builder-mask-adjust").first().locator("summary").click();
 await page.getByRole("spinbutton",{name:"Footer cover height for question 1"}).fill("12");
 await expect(page.locator(".mqb-original-total-mask").first()).toHaveCSS("height",/\d+px/);
 await page.getByRole("checkbox",{name:/Replace original total lines/}).uncheck();
 await expect(page.locator(".mqb-original-total-mask")).toHaveCount(0);
 await expect(page.locator(".assessment-renumber-total")).toHaveCount(0);
 await page.getByRole("checkbox",{name:/Replace original total lines/}).check();
 await expect(page.locator(".assessment-renumber-total")).toHaveCount(3);

 await expect(page.getByText("13 marks").first()).toBeVisible();
 await order.first().getByRole("combobox").selectOption("3");
 await expect(order.last()).toContainText("Q02");
 await expect(page.locator(".builder-config")).toBeVisible();
 const panelCoordinates=await page.evaluate(()=>{
  const config=document.querySelector(".builder-config")!.getBoundingClientRect();
  const preview=document.querySelector(".builder-preview-section")!.getBoundingClientRect();
  const sidebar=document.querySelector(".builder-order-sidebar")!.getBoundingClientRect();
  return {configBottom:config.bottom,previewTop:preview.top,previewRight:preview.right,sidebarLeft:sidebar.left,sidebarTop:sidebar.top,sidebarBottom:sidebar.bottom};
 });
 expect(panelCoordinates.configBottom).toBeLessThanOrEqual(panelCoordinates.previewTop);
 if((page.viewportSize()?.width||0)>780){
  expect(panelCoordinates.previewRight).toBeLessThanOrEqual(panelCoordinates.sidebarLeft);
 }else{
  expect(panelCoordinates.configBottom).toBeLessThanOrEqual(panelCoordinates.sidebarTop);
  expect(panelCoordinates.sidebarBottom).toBeLessThanOrEqual(panelCoordinates.previewTop);
 }
 await page.getByRole("combobox",{name:"Sort questions by grade"}).selectOption("8");
 await page.getByRole("button",{name:"Sort questions",exact:true}).click();
 await expect(order.nth(0)).toContainText("Q11");
 await expect(order.nth(1)).toContainText("Q02");
 await expect(order.nth(2)).toContainText("Q07");
 await page.getByRole("combobox",{name:"Sort assessment questions by"}).selectOption("grade-highest");
 await page.getByRole("button",{name:"Sort questions",exact:true}).click();
 await expect(order.first()).toContainText("Q07");
 await page.getByRole("combobox",{name:"Sort assessment questions by"}).selectOption("average-lowest");
 await page.getByRole("button",{name:"Sort questions",exact:true}).click();
 await expect(order.first()).toContainText("Q11");
 await page.getByRole("combobox",{name:"Sort assessment questions by"}).selectOption("average-highest");
 await page.getByRole("button",{name:"Sort questions",exact:true}).click();
 await expect(order.first()).toContainText("Q07");
 await page.getByRole("combobox",{name:"Sort assessment questions by"}).selectOption("marks-highest");
 await page.getByRole("button",{name:"Sort questions",exact:true}).click();
 await expect(order.first()).toContainText("Q11");
 await expect(page.locator(".builder-order-scroll")).toHaveCSS("overflow-y","auto");
 await page.getByLabel("Assessment title").fill("Test assessment");
 for(const [label,expectQuestions,expectMarks] of [
  ["Questions only",3,0],["Mark scheme only",0,3],["Questions + mark scheme",3,3]
 ] as const){
  await page.getByRole("button",{name:label,exact:true}).click();
  await expect(page.locator(".paper-question")).toHaveCount(expectQuestions);
  await expect(page.locator(".mark-scheme-item")).toHaveCount(expectMarks);
  const printButton=page.getByRole("button",{name:/Print .*save PDF/});
  await expect(printButton).toBeEnabled({timeout:12000});
  const pdf=await page.pdf({format:"A4",printBackground:true,preferCSSPageSize:true});
  expect(pdf.subarray(0,4).toString()).toBe("%PDF");
  expect(pdf.length).toBeGreaterThan(900);
  if(label==="Mark scheme only")await expect(page.locator(".cover")).toHaveCount(0);
 }
 await page.setViewportSize({width:390,height:844});
 await expect(page.getByRole("link",{name:/View preview/})).toBeVisible();
 await expect(page.getByRole("complementary",{name:"Question order"})).toBeVisible();
 await expect(page.getByRole("combobox",{name:"Sort questions by grade"})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Configure your paper"})).toBeVisible();
 const mobileSizing=await page.evaluate(()=>({page:document.documentElement.scrollWidth,screen:window.innerWidth}));
 expect(mobileSizing.page).toBeLessThanOrEqual(mobileSizing.screen);
 await page.setViewportSize({width:1280,height:900});
 await page.getByRole("button",{name:"Save to my account",exact:true}).click();
 await page.getByRole("button",{name:"← Question Bank"}).click();
 await page.getByRole("navigation",{name:"Main navigation"}).getByRole("button",{name:"My Worksheets"}).click();
 await page.getByRole("button",{name:"Open / Edit",exact:true}).click();
 await expect(page.getByLabel("Assessment title")).toHaveValue("Test assessment");
 await expect(page.getByRole("button",{name:"Questions + mark scheme",exact:true})).toHaveAttribute("aria-pressed","true");
 await expect(page.getByRole("checkbox",{name:/Hide original question numbers/})).toBeChecked();
 await expect(page.getByRole("checkbox",{name:/Replace original total lines/})).toBeChecked();
 await expect(page.locator(".assessment-renumber-total")).toHaveCount(3);
 await expect(page.locator(".mqb-original-total-mask").first()).toHaveCSS("height",/\d+px/);

 await expect(page.locator(".paper-question")).toHaveCount(3);
 // Removing one multipart question from the compact sidebar updates preview,
 // mark scheme and total immediately, and is persisted on the next cloud save.
 await page.setViewportSize({width:390,height:844});
 const multipartRow=page.locator(".builder-order-sidebar .assessment-order-row").filter({hasText:"Q02"});
 await expect(multipartRow).toHaveCount(1);
 await multipartRow.getByRole("button",{name:/Remove question .* from assessment/}).click();
 await expect(page.locator(".builder-order-sidebar .assessment-order-row")).toHaveCount(2);
 await expect(page.locator(".paper-question")).toHaveCount(2);
 await expect(page.locator(".mark-scheme-item")).toHaveCount(2);
 await expect(page.locator(".builder-overview-stats")).toContainText("9");
 await expect(page.locator(".cover")).toContainText("Total marks: 9");
 await expect(page.locator(".builder-order-sidebar .assessment-order-row").filter({hasText:"Q02"})).toHaveCount(0);
 await page.getByRole("button",{name:"Save changes to my account"}).click();
 await expect.poll(()=>storedQuestions.length).toBe(2);
 expect(storedQuestions.map(entry=>entry.question_id)).not.toContain("a");
 expect(storedQuestions.map(entry=>entry.question_id)).not.toContain("b");
 await page.getByRole("navigation",{name:"Main navigation"}).getByRole("button",{name:"My Worksheets"}).click();
 await page.getByRole("button",{name:"Open / Edit",exact:true}).click();
 await expect(page.locator(".builder-order-sidebar .assessment-order-row")).toHaveCount(2);
 await expect(page.locator(".cover")).toContainText("Total marks: 9");
 expect(errors).toEqual([]);
});
