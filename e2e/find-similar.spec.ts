import {test,expect,type Page,type TestInfo} from "@playwright/test";
import {numberingFixture} from "./numbering-fixture";

// Synthetic examination-style fixtures only. All Supabase and asset traffic is
// intercepted; no test reads or writes production questions or assessments.
const uid="11111111-1111-4111-8111-111111111111";
const user={id:uid,aud:"authenticated",role:"authenticated",email:"teacher@example.test",app_metadata:{provider:"email",providers:["email"]},user_metadata:{},created_at:"2026-01-01T00:00:00Z"};
const token=()=>{const enc=(v:object)=>Buffer.from(JSON.stringify(v)).toString("base64url");return `${enc({alg:"HS256",typ:"JWT"})}.${enc({exp:4102444800,sub:uid,role:"authenticated",aud:"authenticated"})}.signature`};
const skill="Solving simultaneous equations";
function row(id:string,number:string,percent:number|null=72,marks=5,questionAsset=id){return {
 id,question_number:number,marks,topic:"Algebra",skill,assessment_objective:"AO1",
 exam_papers:{exam_board:"Edexcel",series:id.startsWith("o")?"June 2022":"June 2023",paper_code:"3H",tier:"Higher" as string|undefined},
 question_storage_path:`questions/${questionAsset}.svg`,mark_scheme_storage_path:`marks/${id}.svg`,
 metadata:{id:`${id.startsWith("o")?"2022":"2023"}_3H_Q${number}`,tier:"Higher" as string|undefined,calculator:true as boolean|undefined,grade:7,g1:null,g2:5,g3:15,g4:32 as number|null,g5:50,g6:percent,g7:85,g8:94,g9:98,
 numbering_positions:{question:numberingFixture(900,170,Number(number.match(/\d+/)![0]),{left:8,top:7,width:26,height:22},{left:570,top:140,width:320,height:23},number.startsWith("14")||number.startsWith("8")?5:marks),mark:numberingFixture(900,170,Number(number.match(/\d+/)![0]),{left:8,top:7,width:26,height:22})}}
}}
function bank(){
 const all=[row("oa","14a",60,2,"original"),row("ob","14b",80,3,"original"),row("r1a","8a",65,2),row("r1b","8b",75,3),row("r2","9",74),row("r3","10",70),row("r4","11",82),row("r5","12",62),row("r6","13",76),row("missing","15",null)];
 all[2].metadata.g4=42;all[3].metadata.g4=42;
 const tier=row("foundation","16");tier.exam_papers.tier="Foundation";tier.metadata.tier="Foundation";
 const calc=row("noncalc","17");calc.metadata.calculator=false;
 const broad=row("broad","18");broad.skill="Algebra";
 const other=row("other","19");other.skill="Expanding double brackets";
 const unavailable=row("unavailable","20");
 const unreviewed={...row("shadow","21"),shadow_paper_id:"unreviewed",shadow_of_question_id:"oa",shadow_papers:{shadow_set:"A",status:"awaiting-review"}};
 return [...all,tier,calc,broad,other,unavailable,unreviewed];
}
async function fixture(page:Page,{delay=false,unknown=false,long=false}={}){
 const rows=bank();if(long)for(const row of rows)if(row.skill===skill)row.skill="Solving pairs of simultaneous linear equations using substitution or elimination with positive and negative coefficients";if(unknown)rows[0].metadata.calculator=undefined;
 const requested=new Set<string>(),writes:string[]=[];
 let release=()=>{};const gate=new Promise<void>(resolve=>release=resolve);
 await page.addInitScript(({user,token})=>localStorage.setItem("sb-ljisttslifnyrbuybfud-auth-token",JSON.stringify({user,access_token:token,refresh_token:"fixture",expires_at:4102444800,expires_in:999999999,token_type:"bearer"})),{user,token:token()});
 await page.route("https://ljisttslifnyrbuybfud.supabase.co/**",async route=>{
  const path=new URL(route.request().url()).pathname,method=route.request().method();
  const reply=(value:unknown)=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(value)});
  if(path==="/auth/v1/user")return reply(user);
  if(path.startsWith("/rest/v1/profiles"))return reply([{role:"member",approved:true}]);
  if(path.startsWith("/rest/v1/questions")){if(method!=="GET")writes.push(path);return reply(rows)}
  if(path.includes("/storage/v1/object/sign/")){
   if(delay)await gate;
   const {paths}=route.request().postDataJSON();return reply(paths.map((path:string)=>path==="marks/unavailable.svg"?{path,error:"Fixture missing link"}:{path,signedURL:`/similar-fixture.svg?asset=${encodeURIComponent(path)}`}));
  }
  if(method!=="GET")writes.push(path);
  return reply([]);
 });
 await page.route("**/similar-fixture.svg?**",async route=>{
  const asset=decodeURIComponent(new URL(route.request().url()).searchParams.get("asset")!);requested.add(asset);
  const mark=asset.startsWith("marks/"),record=rows.find(r=>(mark?r.mark_scheme_storage_path:r.question_storage_path)===asset)!;
  const number=record.question_number.match(/\d+/)![0],text=mark?`Fixture solution ${record.id}: x = 4, y = 3. Award ${record.marks} marks.`:asset.includes("original")?"Fixture original: (a) Solve 2x + y = 11 and x - y = 1. (b) Check the solution.":`Fixture ${record.id}: ${record.question_number.endsWith("b")?"(b) Check the solution.":"(a) Solve 2x + y = 11 and x - y = 1."}`;
  return route.fulfill({contentType:"image/svg+xml",body:`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="170"><rect width="900" height="170" fill="white"/><text x="10" y="25" font-size="20">${number}</text><text x="60" y="60" font-size="18">${text}</text><path d="M60 100h780 M60 130h780" stroke="#999"/><text x="575" y="158" font-size="15">${mark?"":`(Total for Question ${number} is ${record.metadata.numbering_positions.question.totalRects[0].marks} marks)`}</text></svg>`});
 });
 await page.goto("/");await expect(page.getByRole("heading",{name:"Find questions",exact:true})).toBeVisible();await expect(page.locator(".v62-result-card")).toHaveCount(rows.length-1); // default hides unreviewed shadow
 const original=page.locator(".v62-result-card").filter({hasText:"Q14a"});
 return {original,rows,requested,writes,release};
}
const dialog=(page:Page)=>page.getByRole("dialog",{name:"Find Similar Questions",exact:true});
async function open(page:Page,original:ReturnType<Page["locator"]>){await original.getByRole("button",{name:"Find Similar",exact:true}).click();await expect(dialog(page)).toBeVisible()}
async function screenshot(page:Page,info:TestInfo,name:string){const path=info.outputPath(name+".png");await page.screenshot({path});await info.attach(name,{path,contentType:"image/png"})}

test("empty-basket comparison previews whole questions, pages beyond three and adds to the existing worksheet",async({page},info)=>{
 test.setTimeout(60000);const state=await fixture(page),basket=page.locator(".v62-basket");
 await expect(basket.locator(".count")).toHaveText("0");await open(page,state.original);
 const panel=dialog(page);await expect(panel.getByRole("button",{name:"Close similar questions",exact:true})).toBeFocused();
 await expect(panel).toContainText("Choose a target student grade");
 await panel.getByRole("combobox",{name:"Similar questions target student grade",exact:true}).selectOption("6");
 await expect(panel).toContainText("Showing 3 of 7 ranked whole questions");
 const source=panel.getByRole("region",{name:"Original complete question",exact:true});await expect(source).toContainText("5 marks");await expect(source).toContainText("2 mapped parts");await expect(source).toContainText("72% average available marks");
 await source.getByText("Preview original question and mark scheme",{exact:true}).click();await expect(source.locator("img")).toHaveCount(1);
 await source.getByRole("button",{name:"Mark scheme image",exact:true}).click();await expect(source.locator("img")).toHaveCount(2);expect(decodeURIComponent(new URL((await source.locator("img").first().getAttribute("src"))!).searchParams.get("asset")!)).toBe("marks/oa.svg");expect(decodeURIComponent(new URL((await source.locator("img").last().getAttribute("src"))!).searchParams.get("asset")!)).toBe("marks/ob.svg");
 await source.getByRole("button",{name:"Enlarge preview",exact:true}).click();const enlarged=page.getByRole("dialog",{name:"Enlarged replacement preview",exact:true});await expect(enlarged.locator("img")).toHaveCount(2);await page.keyboard.press("Escape");await expect(enlarged).toBeHidden();await expect(panel).toBeVisible();
 await source.getByText("Preview original question and mark scheme",{exact:true}).click();
 const cards=panel.locator(".targeted-suggestion"),first=cards.first();await expect(cards).toHaveCount(3);await expect(first.locator("img")).toHaveCount(2);await expect(first.locator(".targeted-history dd")).toHaveText(["72%","71%"]);
 await expect(first).toContainText("Original Q8");await expect(first.locator(".targeted-reasons")).not.toHaveAttribute("open","");await first.getByText("Why this question?",{exact:true}).click();await expect(first).toContainText("Same enhanced skill coverage.");await first.getByText("Why this question?",{exact:true}).click();
 await first.getByRole("button",{name:"Mark scheme image",exact:true}).click();await expect(first.locator("img")).toHaveCount(2);expect(decodeURIComponent(new URL((await first.locator("img").first().getAttribute("src"))!).searchParams.get("asset")!)).toBe("marks/r1a.svg");expect(decodeURIComponent(new URL((await first.locator("img").last().getAttribute("src"))!).searchParams.get("asset")!)).toBe("marks/r1b.svg");
 await first.getByRole("button",{name:"Question image",exact:true}).click();
 expect([...state.requested].some(path=>/r[456]/.test(path))).toBe(false); // no images for unrevealed matches
 await first.getByRole("button",{name:"+ Add to worksheet",exact:true}).click();await expect(first.getByRole("button",{name:"✓ Added to worksheet",exact:true})).toBeDisabled();await expect(panel).toContainText("Worksheet basket: 1 question · 5 marks");
 if(info.project.name==="chromium")await page.setViewportSize({width:1440,height:1100});
 await panel.getByRole("combobox",{name:"Practice level",exact:true}).scrollIntoViewIfNeeded();await screenshot(page,info,`${info.project.name}-similar-controls`);
 await first.locator(".targeted-preview-tabs").scrollIntoViewIfNeeded();await screenshot(page,info,`${info.project.name}-similar-previews`);
 const mobile=info.project.name==="mobile-chromium";
 if(mobile){await expect(cards.filter({visible:true})).toHaveCount(1);await panel.getByRole("button",{name:"Next alternative",exact:true}).click();await expect(first).toBeHidden();await expect(cards.nth(1).locator("img")).toHaveCount(1)}
 await cards.nth(1).getByRole("button",{name:"+ Add to worksheet",exact:true}).click();await expect(panel).toContainText("Worksheet basket: 2 questions · 10 marks");
 await panel.getByRole("button",{name:"Show more similar questions",exact:true}).click();await expect(cards).toHaveCount(6);await expect(panel).toContainText("Showing 6 of 7");
 await panel.getByRole("button",{name:"Show more similar questions",exact:true}).click();await expect(cards).toHaveCount(7);await expect(panel.getByText("No further matches available for these settings.",{exact:true})).toBeVisible();
 expect(await cards.locator(".targeted-source").allTextContents()).toHaveLength(7);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await panel.getByRole("button",{name:"Return to Question Bank",exact:true}).click();await expect(panel).toHaveCount(0);await expect(state.original.getByRole("button",{name:"Find Similar",exact:true})).toBeFocused();await expect(basket.locator(".count")).toHaveText("2");await expect(state.original.getByRole("button",{name:"+ Add",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Open assessment builder →",exact:true}).click();await expect(page.locator(".paper-question")).toHaveCount(2);await expect(page.locator(".paper-question").first()).toContainText("Included parts:");await expect(page.locator(".paper-question").first()).toContainText("2023_3H_Q8b");
 await page.getByRole("button",{name:"Questions + mark scheme",exact:true}).click();await expect(page.locator(".mark-scheme-item img")).toHaveCount(3);expect(state.writes).toEqual([]);
});

test("target student grade and practice level refresh recommendations and expose missing historical data safely",async({page})=>{
 const state=await fixture(page);await open(page,state.original);const panel=dialog(page),grade=panel.getByRole("combobox",{name:"Similar questions target student grade",exact:true}),level=panel.getByRole("combobox",{name:"Practice level",exact:true});
 await grade.selectOption("6");await level.selectOption("easier");await expect(panel.locator(".targeted-suggestion")).toHaveCount(1);await expect(panel.locator(".targeted-history dd")).toHaveText(["72%","82%"]);
 await level.selectOption("harder");await expect(panel.locator(".targeted-suggestion")).toHaveCount(1);await expect(panel.locator(".targeted-history dd")).toHaveText(["72%","62%"]);
 await grade.selectOption("1");await expect(panel.locator(".targeted-suggestion")).toHaveCount(0);await expect(panel).toContainText("Complete historical performance is missing");
 await level.selectOption("same");await expect(panel.locator(".targeted-suggestion")).toHaveCount(3);await expect(panel.locator(".targeted-suggestion").first().locator(".targeted-warnings")).toContainText("skill-led");await expect(panel.locator(".targeted-suggestion").first().locator(".targeted-history dd")).toHaveText(["No data","No data"]);
 await grade.selectOption("4");await level.selectOption("easier");await expect(panel.locator(".targeted-suggestion")).toHaveCount(1);await expect(panel.locator(".targeted-history dd")).toHaveText(["32%","42%"]);await expect(panel).toContainText("not definitive difficulty or mathematical equivalence");
 await page.keyboard.press("Escape");await expect(panel).toHaveCount(0);await expect(state.original.getByRole("button",{name:"Find Similar",exact:true})).toBeFocused();expect(state.writes).toEqual([]);
});

test("sibling entry points show the same whole question and preserve pre-existing basket selections",async({page})=>{
 const state=await fixture(page),basket=page.locator(".v62-basket");await state.original.getByRole("button",{name:"+ Add",exact:true}).click();
 const other=page.locator(".v62-result-card").filter({hasText:"Q19"});await other.getByRole("button",{name:"+ Add",exact:true}).click();await expect(basket.locator(".count")).toHaveText("2");
 const before=await basket.locator(".v62-basket-item").allTextContents();
 await open(page,state.original);let panel=dialog(page);await panel.getByRole("combobox",{name:"Similar questions target student grade",exact:true}).selectOption("6");const original=await panel.getByRole("region",{name:"Original complete question",exact:true}).innerText();const sources=await panel.locator(".targeted-source").allTextContents();await panel.getByRole("button",{name:"Close similar questions",exact:true}).click();
 const sibling=page.locator(".v62-result-card").filter({hasText:"Q14b"});await open(page,sibling);panel=dialog(page);await panel.getByRole("combobox",{name:"Similar questions target student grade",exact:true}).selectOption("6");expect(await panel.getByRole("region",{name:"Original complete question",exact:true}).innerText()).toBe(original);expect(await panel.locator(".targeted-source").allTextContents()).toEqual(sources);
 await panel.locator(".targeted-suggestion").first().getByRole("button",{name:"+ Add to worksheet",exact:true}).click();await panel.getByRole("button",{name:"Return to Question Bank",exact:true}).click();await expect(basket.locator(".count")).toHaveText("3");expect((await basket.locator(".v62-basket-item").allTextContents()).slice(0,2)).toEqual(before);
 await open(page,sibling);panel=dialog(page);await panel.getByRole("combobox",{name:"Similar questions target student grade",exact:true}).selectOption("6");await expect(panel.locator(".targeted-suggestion").first().getByRole("button",{name:"✓ Added to worksheet",exact:true})).toBeDisabled();expect(state.writes).toEqual([]);
});

test("pending links update in place; missing compatibility never silently weakens the match; keyboard stays in the modal",async({page})=>{
 const state=await fixture(page,{delay:true});await open(page,state.original);const panel=dialog(page);await panel.getByRole("combobox",{name:"Similar questions target student grade",exact:true}).selectOption("6");await expect(panel).toContainText("private image links are loading or unavailable");await expect(panel.locator(".targeted-suggestion")).toHaveCount(0);state.release();await expect(panel.locator(".targeted-suggestion")).toHaveCount(3);
 for(let i=0;i<8;i++){await page.keyboard.press("Tab");expect(await panel.evaluate(node=>node.contains(document.activeElement))).toBe(true)}
 await page.keyboard.press("Escape");await expect(panel).toHaveCount(0);
});

test("unknown calculator metadata explains no match without relaxing compatibility",async({page})=>{
 const state=await fixture(page,{unknown:true});await open(page,state.original);const panel=dialog(page);await panel.getByRole("combobox",{name:"Similar questions target student grade",exact:true}).selectOption("6");await expect(panel).toContainText("Original tier or calculator metadata is missing");await expect(panel.locator(".targeted-suggestion")).toHaveCount(0);await expect(panel.getByRole("button",{name:"Show more similar questions",exact:true})).toHaveCount(0);expect(state.writes).toEqual([]);
});

test("comparison cards stay readable on desktop tablet and small mobile, retaining explicit bank grade preference",async({page},info)=>{
 const state=await fixture(page,{long:true});await page.getByRole("combobox",{name:"Target student grade",exact:true}).selectOption("6");await open(page,state.original);const panel=dialog(page);await expect(panel.getByRole("combobox",{name:"Similar questions target student grade",exact:true})).toHaveValue("6");
 const sizes=info.project.name==="chromium"?[{width:1440,height:1100},{width:900,height:1100}]:[{width:393,height:851},{width:320,height:800}];
 for(const size of sizes){
  await page.setViewportSize(size);const cards=panel.locator(".targeted-suggestion"),first=cards.first();await expect(cards).toHaveCount(3);await expect(panel.locator(".targeted-suggestion:visible")).toHaveCount(size.width<720?1:3);
  await first.locator("img").first().evaluate(image=>(image as HTMLImageElement).decode());
  const bounds=await first.locator(".mqb-cropped-image").first().boundingBox();expect(bounds!.width).toBeGreaterThan(size.width*(size.width<720?.75:.3));
  expect(await panel.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await first.locator(".targeted-preview-tabs").scrollIntoViewIfNeeded();await screenshot(page,info,`similar-${size.width}px-preview`);
 }
});
