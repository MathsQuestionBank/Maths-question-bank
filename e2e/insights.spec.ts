import {test,expect,type Page,type TestInfo} from "@playwright/test";
import {readFile} from "node:fs/promises";

const uid="11111111-1111-4111-8111-111111111111";
const user={id:uid,aud:"authenticated",role:"authenticated",email:"owner@example.test",app_metadata:{provider:"email",providers:["email"]},user_metadata:{role:"owner"},created_at:"2026-01-01T00:00:00Z"};
const token=()=>{const enc=(x:object)=>Buffer.from(JSON.stringify(x)).toString("base64url");return `${enc({alg:"HS256",typ:"JWT"})}.${enc({exp:4102444800,sub:uid,role:"authenticated",aud:"authenticated"})}.signature`};
function fixtureRows(){
 let n=0;
 const make=(skill:string,grade=4,tier="Foundation",calculator=false)=>{const id=String(++n),paper=`${calculator?2:1}${tier==="Higher"?"H":"F"}`;return {id,paper_id:`edexcel-${tier}-${paper}`,question_number:id,topic:/Angles|Circle/.test(skill)?"Geometry":/Ratio/.test(skill)?"Ratio":/Expanding|Simultaneous/.test(skill)?"Algebra":"Number",skill,assessment_objective:"AO1",marks:2,question_storage_path:`questions/${id}.png` as string|undefined,mark_scheme_storage_path:`marks/${id}.png` as string|undefined,exam_papers:{exam_board:"Edexcel",series:tier==="Higher"?"November 2023":"June 2022",paper_code:paper,tier:tier as string|undefined},metadata:{id:`2022_${paper}_Q${id}`,tier:tier as string|undefined,calculator:calculator as boolean|undefined,grade,g4:88,crop_review:{question:"approved",mark:"approved"}}};};
 const all=Array.from({length:10},(_,i)=>make("Expanding brackets",4,"Foundation",i%2===1));
 // Two rows share one complete question; its question image is shared and marking images differ.
 const sibling=structuredClone(all[0]);sibling.id="part-b";sibling.question_number="1b";sibling.metadata.id="2022_1F_Q1b";sibling.mark_scheme_storage_path="marks/part-b.png";all[0].question_number="1a";all[0].metadata.id="2022_1F_Q1a";all.push(sibling);
 all[0].metadata.crop_review.question="unreviewed";
 all.push(...Array.from({length:3},()=>make("Percentages")),...Array.from({length:6},()=>make("Angles in parallel lines")));
 const missing=make("Fractions");missing.mark_scheme_storage_path=undefined;all.push(missing);
 const fix=make("Circle measures");fix.metadata.crop_review.question="needs-fix";all.push(fix);
 const h=make("Simultaneous equations",6,"Higher",true),hb=structuredClone(h);h.question_number="21a";h.metadata.id="2023_2H_Q21a";hb.id="higher-b";hb.question_number="21b";hb.metadata.id="2023_2H_Q21b";hb.metadata.grade=7;hb.mark_scheme_storage_path="marks/higher-b.png";all.push(h,hb);
 const aqa=make("Ratio and proportion");aqa.paper_id="aqa-june-2024-1f";aqa.exam_papers.exam_board="AQA";aqa.exam_papers.series="June 2024";aqa.metadata.id="AQA-F-JUNE2024-1F-Q24";all.push(aqa);
 const unknown=make("Unmapped",0);unknown.paper_id="unknown-paper-source";unknown.topic="Unmapped";unknown.assessment_objective="";unknown.exam_papers.tier=undefined;unknown.exam_papers.series="Unspecified";unknown.metadata.tier=undefined;unknown.metadata.calculator=undefined;all.push(unknown);
 return all;
}
async function openFixture(page:Page,owner=true,delaySigning=false,sparseGrades=false){
 const rows=fixtureRows();if(sparseGrades)for(const row of rows)row.metadata.grade=row.metadata.grade===0||row.exam_papers.exam_board==="AQA"?0:row.exam_papers.tier==="Higher"?7:3;let imageRequests=0,questionQueries=0,signingCalls=0,writes=0,hold=delaySigning;
 let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>release=resolve);
 await page.addInitScript(({user,token})=>localStorage.setItem("sb-ljisttslifnyrbuybfud-auth-token",JSON.stringify({user,access_token:token,refresh_token:"fixture",expires_at:4102444800,expires_in:999999999,token_type:"bearer"})),{user,token:token()});
 await page.route("https://ljisttslifnyrbuybfud.supabase.co/**",async route=>{
  const path=new URL(route.request().url()).pathname,method=route.request().method();
  const reply=(data:unknown)=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(data)});
  if(path==="/auth/v1/user")return reply(user);
  if(path.startsWith("/rest/v1/profiles"))return reply([{role:owner?"owner":"member",approved:true}]);
  if(path.startsWith("/rest/v1/questions")){questionQueries++;if(method!=="GET")writes++;return reply(rows)}
  if(path.includes("/storage/v1/object/sign/")){
   signingCalls++;if(hold)await gate;
   const {paths}=route.request().postDataJSON();return reply(paths.map((path:string)=>({path,signedURL:`/insights-fixture.png?asset=${encodeURIComponent(path)}`})));
  }
  if(method!=="GET"&&!path.includes("/rpc/"))writes++;
  return reply([]);
 });
 await page.route("**/insights-fixture.png?**",route=>{imageRequests++;return route.fulfill({status:200,contentType:"image/png",body:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/NVcAAAAASUVORK5CYII=","base64")})});
 await page.goto("/");await expect(page.getByRole("heading",{name:"Find questions",exact:true})).toBeVisible();
 const open=async()=>{await page.getByRole("navigation",{name:"Main navigation"}).getByRole("button",{name:"Account",exact:true}).click();await page.getByRole("button",{name:"View Insights",exact:true}).click();await expect(page.locator('.insights-dashboard[aria-busy="false"]')).toBeVisible()};
 if(owner)await open();
 return {rows,open,release:()=>{hold=false;release()},counts:()=>({imageRequests,questionQueries,signingCalls,writes})};
}
async function capture(page:Page,testInfo:TestInfo,name:string,selector?:string){
 const path=testInfo.outputPath(name+".png");if(selector)await page.locator(selector).screenshot({path});else await page.screenshot({path,fullPage:true});await testInfo.attach(name,{path,contentType:"image/png"});
}

test("owner filters Foundation Grade 4, adjusts quantity thresholds and exports the exact filtered CSV",async({page},testInfo)=>{
 test.setTimeout(60000);const state=await openFixture(page);
 const dashboard=page.locator(".insights-dashboard");
 await expect(page.locator(".insights-stats>div").nth(1).locator("strong")).toHaveText("5");
 await dashboard.getByRole("combobox",{name:"Tier",exact:true}).selectOption("Foundation");await dashboard.getByRole("combobox",{name:"GCSE grade",exact:true}).selectOption("4");await dashboard.getByRole("combobox",{name:"Rows per page",exact:true}).selectOption("10");
 const table=dashboard.getByRole("table",{name:"Filtered enhanced skill resource coverage",exact:true});
 const expanding=table.getByRole("row").filter({has:page.getByRole("rowheader",{name:"Expanding brackets",exact:true})});
 await expect(expanding).toContainText("Good coverage");await expect(expanding.locator('td[data-label="Complete usable"] strong')).toHaveText("10");await expect(expanding).toContainText("11 mapped records · 10 whole");
 const percentages=table.getByRole("row").filter({has:page.getByRole("rowheader",{name:"Percentages",exact:true})});await expect(percentages).toContainText("Limited coverage");
 await expect(table.getByRole("row").filter({has:page.getByRole("rowheader",{name:"Angles in parallel lines",exact:true})})).toContainText("Developing coverage");
 await expect(table.getByRole("row").filter({has:page.getByRole("rowheader",{name:"Fractions",exact:true})})).toContainText("No coverage");
 await expect(dashboard).toContainText("No authoritative expected-skill list");
 const before=state.counts();
 await dashboard.getByRole("combobox",{name:"Topic",exact:true}).selectOption("Geometry");await expect(table.getByRole("rowheader")).toHaveCount(2);await dashboard.getByRole("combobox",{name:"Topic",exact:true}).selectOption("All");
 await dashboard.getByRole("combobox",{name:"Exam board",exact:true}).selectOption("AQA");await expect(table.getByRole("rowheader")).toHaveCount(1);await expect(table.getByRole("rowheader")).toHaveAccessibleName("Ratio and proportion");await dashboard.getByRole("combobox",{name:"Exam board",exact:true}).selectOption("All");
 await dashboard.getByRole("combobox",{name:"Calculator requirement",exact:true}).selectOption("Non-calculator");await expect(expanding.locator('td[data-label="Complete usable"] strong')).toHaveText("5");await expect(expanding).toContainText("Developing coverage");
 await dashboard.getByRole("combobox",{name:"Calculator requirement",exact:true}).selectOption("All");
 await dashboard.getByText("Coverage thresholds",{exact:true}).click();await dashboard.getByLabel("Developing starts at",{exact:true}).fill("3");await dashboard.getByLabel("Good starts at",{exact:true}).fill("7");await dashboard.getByRole("button",{name:"Apply thresholds",exact:true}).click();await expect(percentages).toContainText("Developing coverage");
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("mqb-insights-quantity-thresholds-v1")||"{}"))).toEqual({developing:3,good:7});
 await dashboard.getByLabel("Good starts at",{exact:true}).fill("2");await dashboard.getByRole("button",{name:"Apply thresholds",exact:true}).click();await expect(dashboard.getByRole("alert")).toContainText("good must start above developing");
 await dashboard.getByRole("button",{name:"Reset thresholds",exact:true}).click();await expect(percentages).toContainText("Limited coverage");
 await dashboard.getByText("Coverage thresholds",{exact:true}).click();
 await dashboard.getByRole("combobox",{name:"Sort skills",exact:true}).selectOption("most");await expect(table.getByRole("rowheader").first()).toHaveAccessibleName("Expanding brackets");
 expect(state.counts()).toEqual(before); // Local filters/settings do not reload records, sign links or fetch images.
 if(testInfo.project.name==="chromium")await page.setViewportSize({width:1440,height:1050});
 await capture(page,testInfo,`${testInfo.project.name}-foundation-grade-4`, 'section[aria-labelledby="insights-skills-title"]');
 if(testInfo.project.name==="chromium"){await page.setViewportSize({width:900,height:1100});await capture(page,testInfo,"tablet-foundation-grade-4",'section[aria-labelledby="insights-skills-title"]');await page.setViewportSize({width:1440,height:1050})}
 else {await page.setViewportSize({width:320,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.setViewportSize({width:393,height:851})}
 await dashboard.getByRole("combobox",{name:"Rows per page",exact:true}).selectOption("5");await expect(table.getByRole("rowheader")).toHaveCount(5);
 const allDownloadPromise=page.waitForEvent("download");await dashboard.getByRole("button",{name:"Export filtered CSV (6 rows)",exact:true}).click();const allDownload=await allDownloadPromise;const allCsv=await readFile((await allDownload.path())!,"utf8");expect(allCsv.trim().split("\r\n")).toHaveLength(7);expect(allCsv).toContain("Fractions");
 await dashboard.getByLabel("Enhanced skill",{exact:true}).fill("Percentages");await expect(table.getByRole("rowheader")).toHaveCount(1);await expect(table.getByRole("rowheader")).toHaveAccessibleName("Percentages");
 const downloadPromise=page.waitForEvent("download");await dashboard.getByRole("button",{name:"Export filtered CSV (1 rows)",exact:true}).click();const download=await downloadPromise;const csv=await readFile((await download.path())!,"utf8");
 expect(csv).toContain('"Complete usable questions"');expect(csv).toContain('"Percentages","Foundation","4","3","3","3","3"');expect(csv).not.toContain("Expanding brackets");expect(csv.trim().split("\r\n")).toHaveLength(2);
 await testInfo.attach("foundation-grade-4-filtered.csv",{path:(await download.path())!,contentType:"text/csv"});
 await dashboard.getByLabel("Enhanced skill",{exact:true}).fill("NoSuchSkill");await expect(dashboard.getByText(/No observed skill mappings match/)).toBeVisible();await expect(dashboard.getByRole("button",{name:"Export filtered CSV (0 rows)",exact:true})).toBeDisabled();
 await dashboard.getByRole("button",{name:"Reset coverage filters",exact:true}).click();await dashboard.getByRole("combobox",{name:"Chart tier",exact:true}).selectOption("Higher");await dashboard.getByRole("button",{name:"Show Grade 7 skills for Higher tiers: 1 usable questions",exact:true}).click();await expect(dashboard.getByRole("combobox",{name:"Tier",exact:true})).toHaveValue("Higher");await expect(dashboard.getByRole("combobox",{name:"GCSE grade",exact:true})).toHaveValue("7");await expect(table.getByRole("rowheader")).toHaveCount(1);await expect(table.getByRole("rowheader")).toHaveAccessibleName("Simultaneous equations");
 await dashboard.getByRole("button",{name:"Find Foundation coverage gaps",exact:true}).click();await expect(dashboard.getByRole("combobox",{name:"Tier",exact:true})).toHaveValue("Foundation");await expect(dashboard.getByRole("combobox",{name:"Sort skills",exact:true})).toHaveValue("least");
 await dashboard.getByText(/Resource readiness ·/).click();await expect(dashboard.getByText("Missing mark scheme path",{exact:true})).toBeVisible();await expect(dashboard.getByText("Outstanding crop review (where assets exist)",{exact:true})).toBeVisible();
 await dashboard.getByText(/Exam series and paper coverage ·/).click();await expect(dashboard.getByRole("table",{name:"Stored examination series and paper coverage",exact:true})).toContainText("November 2023");await expect(dashboard.getByRole("table",{name:"Stored examination series and paper coverage",exact:true})).toContainText("AQA");
 await capture(page,testInfo,`${testInfo.project.name}-insights-dashboard`);
 expect(state.counts().writes).toBe(0);expect(state.counts().imageRequests).toBe(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("stored readiness remains stable while signing links are pending",async({page})=>{
 const state=await openFixture(page,true,true),dashboard=page.locator(".insights-dashboard");
 const before=await dashboard.locator(".insights-summary").innerText();
 await expect(page.locator(".insights-stats>div").last().locator("strong")).toHaveText(`0 / ${state.rows.length}`);
 await dashboard.getByText(/Resource readiness ·/).click();const ready=await dashboard.locator(".insights-readiness").innerText();expect(ready).toContain("Missing mark scheme path");
 state.release();const withBoth=state.rows.filter(r=>r.question_storage_path&&r.mark_scheme_storage_path).length;
 await expect(page.locator(".insights-stats>div").last().locator("strong")).toHaveText(`${withBoth} / ${state.rows.length}`);expect(await dashboard.locator(".insights-summary").innerText()).toBe(before);expect(state.counts().imageRequests).toBe(0);
});

test("approved teacher has no owner Insights entry or dashboard, even with owner user_metadata",async({page})=>{
 await openFixture(page,false);await page.getByRole("navigation",{name:"Main navigation"}).getByRole("button",{name:"Account",exact:true}).click();await expect(page.getByRole("button",{name:"View Insights",exact:true})).toHaveCount(0);await expect(page.locator(".insights-dashboard")).toHaveCount(0);await expect(page.getByRole("heading",{name:"Question bank overview",exact:true})).toHaveCount(0);
});


test("missing Grade 4 classifications offer an honest empty state and unclassified resources",async({page},testInfo)=>{
 await openFixture(page,true,false,true);const dashboard=page.locator(".insights-dashboard");
 await expect(dashboard.locator(".insights-classification-note")).toContainText("3, 7");
 await dashboard.getByRole("combobox",{name:"Tier",exact:true}).selectOption("Foundation");await dashboard.getByRole("combobox",{name:"GCSE grade",exact:true}).selectOption("4");
 await expect(dashboard.getByText(/No observed skill mappings match/)).toBeVisible();await expect(dashboard.getByRole("button",{name:"Export filtered CSV (0 rows)",exact:true})).toBeDisabled();
 await capture(page,testInfo,`${testInfo.project.name}-stored-grade-limit`,'section[aria-labelledby="insights-skills-title"]');
 await dashboard.getByRole("button",{name:"Show all stored grades",exact:true}).click();await expect(dashboard.getByRole("combobox",{name:"GCSE grade",exact:true})).toHaveValue("All");
 await dashboard.getByRole("combobox",{name:"GCSE grade",exact:true}).selectOption("4");await dashboard.getByRole("button",{name:"Show unclassified grades",exact:true}).click();
 await expect(dashboard.getByRole("combobox",{name:"GCSE grade",exact:true})).toHaveValue("Unclassified");await expect(dashboard.getByRole("table",{name:"Filtered enhanced skill resource coverage",exact:true}).getByRole("rowheader")).toHaveAccessibleName("Ratio and proportion");
});
