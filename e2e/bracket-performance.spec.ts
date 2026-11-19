import {test,expect,type Page,type TestInfo} from "@playwright/test";
import {readFileSync} from "node:fs";
import type reviewData from "../src/bracketSkillReview.json";
const review:typeof reviewData=JSON.parse(readFileSync(new URL("../src/bracketSkillReview.json",import.meta.url),"utf8"));

// Source identities exercise the curated overlay. Performance and assets below
// are explicitly synthetic; no private examination images or URLs are used.
const uid="11111111-1111-4111-8111-111111111111";
const user={id:uid,aud:"authenticated",role:"authenticated",email:"owner@example.test",app_metadata:{provider:"email",providers:["email"]},user_metadata:{},created_at:"2026-01-01T00:00:00Z"};
const rows=review.reviews.filter(r=>r.status==="source_verified").map((r,i)=>{
 const q=r.identity,h=q.sourceTier==="Higher";
 return {id:q.id,paper_id:q.paperId,question_number:q.questionNumber,skill:q.skill,topic:"Algebra",marks:q.marks,assessment_objective:"AO1",question_storage_path:`fixture-only/${q.id}/q.png`,mark_scheme_storage_path:`fixture-only/${q.id}/m.png`,exam_papers:{exam_board:q.examBoard,series:q.series,paper_code:q.paperCode,tier:q.sourceTier},metadata:{id:q.sourceId,tier:q.sourceTier,calculator:false,grade:h?7:3,crop_review:{question:"approved",mark:"approved"},g1:h?null:20,g2:h?null:38,g3:h?(i%2?null:8):56,g4:h?17:72,g5:h?35:85,g6:h?52:null,g7:h?68:null,g8:h?82:null,g9:h?93:null}};
});
const pending={...structuredClone(rows[0]),id:"unverified-bracket-fixture",paper_id:"unverified-fixture-paper",question_number:"99",skill:"Expand and simplify two brackets",metadata:{...rows[0].metadata,id:"FIXTURE-Q99"}};
export async function openBracketFixture(page:Page,insights=true){
 let writes=0,queries=0;
 const enc=(v:object)=>Buffer.from(JSON.stringify(v)).toString("base64url"),token=`${enc({alg:"HS256",typ:"JWT"})}.${enc({exp:4102444800,sub:uid,role:"authenticated",aud:"authenticated"})}.signature`;
 await page.addInitScript(({user,token})=>localStorage.setItem("sb-ljisttslifnyrbuybfud-auth-token",JSON.stringify({user,access_token:token,refresh_token:"fixture",expires_at:4102444800,expires_in:999999999,token_type:"bearer"})),{user,token});
 await page.route("https://ljisttslifnyrbuybfud.supabase.co/**",async route=>{
  const path=new URL(route.request().url()).pathname;
  const reply=(x:unknown)=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(x)});
  if(path==="/auth/v1/user")return reply(user);
  if(path.startsWith("/rest/v1/profiles"))return reply([{role:"owner",approved:true}]);
  if(path.startsWith("/rest/v1/questions")){queries++;return reply([...rows,pending]);}
  if(path.includes("/storage/v1/object/sign/")){const {paths}=route.request().postDataJSON();return reply(paths.map((path:string)=>({path,signedURL:"/synthetic-bracket-fixture.png"})));}
  if(route.request().method()!=="GET")writes++;
  return reply([]);
 });
 await page.route("**/synthetic-bracket-fixture.png",route=>route.fulfill({status:200,contentType:"image/png",body:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/NVcAAAAASUVORK5CYII=","base64")}));
 await page.goto("/");await expect(page.getByRole("heading",{name:"Find questions",exact:true})).toBeVisible();
 if(insights){await page.getByRole("navigation",{name:"Main navigation"}).getByRole("button",{name:"Account",exact:true}).click();await page.getByRole("button",{name:"View Insights",exact:true}).click();await expect(page.locator('.insights-dashboard[aria-busy="false"]')).toBeVisible();}
 return ()=>({writes,queries});
}
async function screenshot(page:Page,info:TestInfo,name:string,selector:string){
 await page.locator(selector).evaluate(node=>{const p=document.createElement('p');p.id='fixture-note';p.textContent='UI TEST FIXTURE — synthetic performance; source identities only; no examination images';p.style.cssText='background:#fff5bf;color:#222;padding:8px;font:12px sans-serif';node.prepend(p)});
 const path=info.outputPath(name+'.png');await page.locator(selector).screenshot({path});await page.locator('#fixture-note').evaluate(node=>node.remove());await info.attach(name,{path,contentType:"image/png"});
}

test("source-backed bracket filters agree between bank and Insights, without changing whole-question basket selection",async({page},info)=>{
 if(info.project.name==='chromium')await page.setViewportSize({width:1440,height:1050});
 const counts=await openBracketFixture(page,false),cards=page.locator('.v62-result-card');
 await expect(cards).toHaveCount(23);
 await page.getByRole('combobox',{name:'Tier',exact:true}).selectOption('Foundation');
 await page.getByRole('combobox',{name:'Skill',exact:true}).selectOption('Expand double brackets and simplify');await expect(cards).toHaveCount(5);
 await expect(cards.filter({hasText:'Algebraic manipulation'})).toHaveCount(1); // stored title preserved
 await expect(cards.first()).toContainText('bracket source content checked');
 await cards.first().getByRole('button',{name:'+ Add',exact:true}).click();await expect(page.locator('.v62-basket .count')).toHaveText('1');
 await page.getByRole('combobox',{name:'Skill',exact:true}).selectOption('All');
 await page.getByRole('textbox',{name:'Search skills',exact:true}).fill('double brackets');await expect(cards).toHaveCount(5);
 await expect(cards.locator('.v62-canonical-skills').filter({hasText:'Expand 2 single'})).toHaveCount(0);
 await screenshot(page,info,`${info.project.name}-bank-double-brackets`,'.v62-results');
 await page.getByRole('textbox',{name:'Search skills',exact:true}).fill('');await page.getByRole('combobox',{name:'Skill',exact:true}).selectOption('Expand 2 single brackets and simplify');await expect(cards).toHaveCount(3);
 await page.getByRole('combobox',{name:'Skill',exact:true}).selectOption('Expand single bracket');await expect(cards).toHaveCount(8);
 await page.getByRole('combobox',{name:'Skill',exact:true}).selectOption('original:Expand and simplify two brackets');await expect(cards).toHaveCount(3);await expect(cards.filter({hasText:'needs teacher review'})).toHaveCount(1);
 await expect(page.locator('.v62-basket .count')).toHaveText('1');
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Account',exact:true}).click();await page.getByRole('button',{name:'View Insights',exact:true}).click();
 const dashboard=page.locator('.insights-dashboard'),table=dashboard.getByRole('table',{name:'Filtered enhanced skill resource coverage',exact:true});
 await dashboard.getByRole('combobox',{name:'Tier',exact:true}).selectOption('Foundation');await dashboard.getByLabel('Enhanced skill',{exact:true}).fill('Expand double brackets and simplify');
 const row=table.getByRole('row').filter({has:page.getByRole('rowheader',{name:'Expand double brackets and simplify',exact:true})});await expect(row.locator('td[data-label="Complete usable"] strong')).toHaveText('5');
 await row.getByText('Original labels (4)',{exact:true}).click();await expect(row).toContainText('Expand and simplify two linear brackets');
 await screenshot(page,info,`${info.project.name}-canonical-brackets`,'section[aria-labelledby="insights-skills-title"]');
 await dashboard.getByLabel('Enhanced skill',{exact:true}).fill('Expand');await dashboard.getByRole('combobox',{name:'Rows per page',exact:true}).selectOption('10');
 await screenshot(page,info,`${info.project.name}-bracket-overview`,'section[aria-labelledby="insights-skills-title"]');
 expect(counts().writes).toBe(0);
});

test("tier and same-question historical comparisons show real populations, missing grades and responsive exact values",async({page},info)=>{
 if(info.project.name==='chromium')await page.setViewportSize({width:1440,height:1050});
 const counts=await openBracketFixture(page),chart=page.locator('section[aria-labelledby="insights-grade-title"]');
 await expect(chart.getByRole('table')).toHaveAccessibleName('Original available-question historical performance calculation');const beforeCounts=counts();
 await expect(chart.getByRole('row').filter({has:page.getByRole('rowheader',{name:'G5',exact:true})})).toContainText('85%');
 await expect(chart.getByRole('row').filter({has:page.getByRole('rowheader',{name:'G6',exact:true})})).toContainText('52%');
 await screenshot(page,info,`${info.project.name}-all-original-populations`,'section[aria-labelledby="insights-grade-title"]');
 await chart.getByRole('checkbox',{name:'Compare the same questions',exact:true}).check();
 await expect(chart.getByRole('alert')).toContainText('No whole questions have complete data');await expect(chart.getByRole('img')).toHaveCount(0);
 await chart.getByRole('button',{name:'Use grades with data in every selected tier (3, 4, 5)',exact:true}).click();
 await expect(chart.getByRole('table')).toHaveAccessibleName('Same-question historical performance comparison');
 let included=await chart.locator('tbody tr td:nth-child(3)').allTextContents();expect(new Set(included).size).toBe(1);expect(Number(included[0])).toBeGreaterThan(0);
 await chart.getByRole('combobox',{name:'Chart tier',exact:true}).selectOption('Foundation');
 await expect(chart.locator('tbody tr')).toHaveCount(5);await expect(chart.locator('.historical-comparison-toggle')).toHaveCSS('flex-direction','row');await expect(chart.locator('.historical-grade-selection label').first()).toHaveCSS('flex-direction','row');await expect(chart.getByRole('checkbox',{name:'Include final Grade 6',exact:true})).toBeDisabled();
 await expect(chart.getByRole('row').filter({has:page.getByRole('rowheader',{name:'G3',exact:true})})).toContainText('56%');
 await screenshot(page,info,`${info.project.name}-foundation-same-questions`,'section[aria-labelledby="insights-grade-title"]');
 await chart.getByRole('combobox',{name:'Chart tier',exact:true}).selectOption('Higher');await expect(chart.locator('tbody tr')).toHaveCount(7);
 included=await chart.locator('tbody tr td:nth-child(3)').allTextContents();expect(new Set(included).size).toBe(1);const before=Number(included[0]);
 await chart.getByRole('checkbox',{name:'Include final Grade 3',exact:true}).uncheck();const after=Number(await chart.locator('tbody tr td:nth-child(3)').first().textContent());expect(after).toBeGreaterThan(before);
 await chart.getByRole('checkbox',{name:'Compare the same questions',exact:true}).uncheck();await expect(chart.locator('tbody tr')).toHaveCount(9);await expect(chart.getByRole('row').filter({has:page.getByRole('rowheader',{name:'G1',exact:true})})).toContainText('No data');
 if(info.project.name==='mobile-chromium')await page.setViewportSize({width:320,height:800});else await page.setViewportSize({width:1440,height:1050});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await screenshot(page,info,`${info.project.name}-higher-historical-performance`,'section[aria-labelledby="insights-grade-title"]');
 expect(counts()).toEqual(beforeCounts);expect(counts().writes).toBe(0);
});
