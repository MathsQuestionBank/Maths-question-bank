import {test,expect,type Page} from "@playwright/test";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import JSZip from "jszip";
import {createCanvas} from "@napi-rs/canvas";
const host="https://ljisttslifnyrbuybfud.supabase.co",uid="11111111-1111-4111-8111-111111111111";
const paper={id:"22222222-2222-4222-8222-222222222222",exam_board:"Edexcel",qualification:"GCSE Mathematics",series:"November 2022",paper_code:"3H",tier:"Higher"};
const foundation={...paper,id:"33333333-3333-4333-8333-333333333333",series:"June 2022",paper_code:"1F",tier:"Foundation"};
const user={id:uid,aud:"authenticated",role:"authenticated",email:"owner@example.test",app_metadata:{provider:"email"},user_metadata:{role:"owner"},created_at:"2026-01-01T00:00:00Z"};
const token=()=>{const enc=(v:object)=>Buffer.from(JSON.stringify(v)).toString("base64url");return `${enc({alg:"HS256",typ:"JWT"})}.${enc({exp:4102444800,sub:uid,role:"authenticated",aud:"authenticated"})}.signature`};
function image(){const canvas=createCanvas(900,1100),c=canvas.getContext("2d");c.fillStyle="white";c.fillRect(0,0,900,1100);c.fillStyle="black";c.font="26px sans-serif";c.fillText("SYNTHETIC AUDIT EXPORT FIXTURE ONLY",30,70);c.fillText("(a) Example part   (b) Example part",30,130);return canvas.toBuffer("image/png")}
function fixtureParts(){return [14,17,20].flatMap(n=>["a","b"].map((suffix,i)=>({id:`fixture-${n}${suffix}`,paper_id:paper.id,question_number:`Q${n}${suffix}`,marks:i?3:2,topic:"Algebra",skill:"Fixture only",assessment_objective:"AO1",question_storage_path:n===20&&i?null:`private-publisher/questions/${n}.png`,mark_scheme_storage_path:`private-publisher/marks/${n}${n===17?suffix:""}.png`,exam_papers:paper,metadata:{id:`FIXTURE-NOV2022-3H-Q${n}${suffix}`,image_crops:{question:{top:1,right:2,bottom:3,left:4}},crop_review:{question:"approved",mark:"unreviewed"},privateExtra:"NOT_FOR_MANIFEST",questionUrl:"https://expired.example/?token=NEVER_EXPORT"}})))}
async function setup(page:Page,options:{owner?:boolean;approved?:boolean;signedIn?:boolean;failDownloads?:boolean;holdDownload?:boolean;rejectDownloadOwner?:boolean}={}){
 const rows=fixtureParts(),png=image();let owner=options.owner!==false,writes=0,downloads=0,paperReads=0,roleChecks=0,downloadsStarted=false;
 const fetched:string[]=[];let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>release=resolve);
 if(options.signedIn!==false)await page.addInitScript(({user,token})=>localStorage.setItem("sb-ljisttslifnyrbuybfud-auth-token",JSON.stringify({user,access_token:token,refresh_token:"fixture",expires_at:4102444800,expires_in:999999999,token_type:"bearer"})),{user,token:token()});
 await page.route(`${host}/**`,async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;
  const reply=(data:unknown,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(data)});
  const readPost=req.method()==="POST"&&(path==="/rest/v1/rpc/is_approved_owner"||path.includes("/storage/v1/object/sign/"));
  if(!["GET","HEAD","OPTIONS"].includes(req.method())&&!readPost){writes++;return reply({message:"Unexpected mutation blocked by fixture"},405);}
  if(path==="/auth/v1/user")return options.signedIn===false?reply({error:"not authenticated"},401):reply(user);
  if(path==="/rest/v1/profiles")return reply([{role:options.owner===false?"member":"owner",approved:options.approved!==false}]);
  if(path==="/rest/v1/rpc/is_approved_owner"){roleChecks++;return reply(owner)}
  if(path==="/rest/v1/exam_papers"){
   paperReads++;const filtered=[paper,foundation].filter(p=>!url.searchParams.get("id")||url.searchParams.get("id")===`eq.${p.id}`);return reply(req.headers().accept?.includes("object+json")?filtered[0]:filtered);
  }
  if(path==="/rest/v1/questions")return reply(url.searchParams.get("paper_id")==='eq.'+foundation.id?[]:rows);
  if(path.includes("/storage/v1/object/sign/"))return reply([]); // Expired/unavailable previews are irrelevant to export.
  if(path.startsWith("/storage/v1/object/exam-materials-private/")){
   downloads++;downloadsStarted=true;fetched.push(path);expect(req.headers().authorization).toContain("Bearer ");
   if(options.holdDownload)await gate;
   if(options.rejectDownloadOwner)owner=false;
   if(options.failDownloads)return reply({message:"private-path?token=SECRET"},503);
   return route.fulfill({status:200,contentType:"image/png",body:png});
  }
  return reply([]);
 });
 await page.goto("/");
 const open=async()=>{await expect(page.getByRole("heading",{name:"Find questions",exact:true})).toBeVisible();await page.getByRole("navigation",{name:"Main navigation"}).getByRole("button",{name:"Account",exact:true}).click();await page.getByRole("button",{name:"Export multipart audit images",exact:true}).click();await expect(page.getByRole("combobox",{name:"Examination paper",exact:true})).toBeEnabled();await page.getByRole("combobox",{name:"Examination paper",exact:true}).selectOption(paper.id);await expect(page.locator('.multipart-audit-export[aria-busy="false"]')).toBeVisible()};
 return {rows,png,open,release,started:()=>downloadsStarted,revoke:()=>{owner=false},counts:()=>({writes,downloads,paperReads,roleChecks}),fetched};
}

test("owner exports a complete original-byte multipart ZIP with a correct private manifest",async({page},testInfo)=>{
 const state=await setup(page);await state.open();const panel=page.locator(".multipart-audit-export");expect(state.counts().downloads).toBe(0);
 await expect(panel.getByRole("checkbox")).toHaveCount(3);await expect(panel.getByRole("checkbox").nth(2)).toBeDisabled();await panel.getByRole("checkbox").first().check();await panel.getByRole("checkbox").nth(1).check();await expect(panel).toContainText("2 / 10 questions selected · 10 marks · 4 parts");
 const screenshot=testInfo.outputPath(`${testInfo.project.name}-multipart-audit-selection.png`);await panel.screenshot({path:screenshot});await testInfo.attach("owner audit selection — synthetic records",{path:screenshot,contentType:"image/png"});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const downloaded=page.waitForEvent("download");await panel.getByRole("button",{name:"Download audit ZIP",exact:true}).click();const file=await downloaded;
 const zip=await JSZip.loadAsync(await readFile((await file.path())!));const manifest=JSON.parse(await zip.file("manifest.json")!.async("string"));
 expect(manifest).toMatchObject({format:"mathsquestionbank.multipart-audit-export",complete:true,question_count:2,part_count:4,asset_count:5,review_status:"unreviewed_not_teacher_approved"});expect(manifest.paper).toMatchObject({paper_id:paper.id,series:paper.series,paper_code:"3H"});
 expect(manifest.groups.flatMap((g:any)=>g.parts.map((p:any)=>p.database_record_id))).toEqual(["fixture-14a","fixture-14b","fixture-17a","fixture-17b"]);
 expect(manifest.groups[0].parts[0]).toMatchObject({source_question_id:state.rows[0].metadata.id,marks:2,existing_image_crops:state.rows[0].metadata.image_crops});
 expect(manifest.groups[1].parts[0].mark_scheme_asset).not.toBe(manifest.groups[1].parts[1].mark_scheme_asset);
 for(const asset of manifest.assets){expect(await zip.file(asset.file)!.async("nodebuffer")).toEqual(state.png);expect(asset).toMatchObject({width:900,height:1100,sha256:createHash("sha256").update(state.png).digest("hex")})}
 expect(manifest.assets[0].source_path_sha256).toBe(createHash("sha256").update(state.rows[0].question_storage_path!).digest("hex"));
 const text=await zip.file("manifest.json")!.async("string");for(const forbidden of ["private-publisher","token=","NEVER_EXPORT","NOT_FOR_MANIFEST","access_token","refresh_token"])expect(text).not.toContain(forbidden);
 await expect(panel.getByRole("status")).toContainText("ZIP ready: 2 questions, 4 parts and 5 original images");expect(state.counts().writes).toBe(0);expect(state.counts().downloads).toBe(5);
 await panel.getByRole("combobox",{name:"Examination paper",exact:true}).selectOption(foundation.id);await expect(panel.getByText(/No mapped multipart/)).toBeVisible();await expect(panel.getByRole("button",{name:"Download audit ZIP",exact:true})).toBeDisabled();
});

test("approved teachers cannot open the owner export, even with forged owner user_metadata",async({page})=>{
 const state=await setup(page,{owner:false});await expect(page.getByRole("heading",{name:"Find questions",exact:true})).toBeVisible();await page.getByRole("navigation",{name:"Main navigation"}).getByRole("button",{name:"Account",exact:true}).click();await expect(page.getByRole("button",{name:"Export multipart audit images",exact:true})).toHaveCount(0);await expect(page.locator(".multipart-audit-export")).toHaveCount(0);expect(state.counts().paperReads).toBe(0);expect(state.counts().downloads).toBe(0);
});

test("signed-out accounts have no audit export controls",async({page})=>{
 const state=await setup(page,{signedIn:false});await expect(page.getByRole("heading",{name:"Welcome back",exact:true})).toBeVisible();await expect(page.locator(".multipart-audit-export")).toHaveCount(0);expect(state.counts().paperReads).toBe(0);expect(state.counts().downloads).toBe(0);
});

test("unapproved accounts have no audit controls",async({page})=>{
 const state=await setup(page,{approved:false});await expect(page.getByRole("heading",{name:"Account awaiting approval",exact:true})).toBeVisible();await expect(page.locator(".multipart-audit-export")).toHaveCount(0);expect(state.counts().paperReads).toBe(0);expect(state.counts().downloads).toBe(0);
});

test("a stale owner UI cannot load export records when the live owner check fails",async({page})=>{
 const state=await setup(page);state.revoke();await expect(page.getByRole("heading",{name:"Find questions",exact:true})).toBeVisible();await page.getByRole("navigation",{name:"Main navigation"}).getByRole("button",{name:"Account",exact:true}).click();await page.getByRole("button",{name:"Export multipart audit images",exact:true}).click();await expect(page.locator(".multipart-audit-export").getByRole("alert")).toContainText("approved owner session");expect(state.counts().paperReads).toBe(0);expect(state.counts().downloads).toBe(0);
});

test("failed downloads are retried once and never produce a partial ZIP or expose raw errors",async({page})=>{
 const state=await setup(page,{failDownloads:true});await state.open();const panel=page.locator(".multipart-audit-export");const files:string[]=[];page.on("download",d=>files.push(d.suggestedFilename()));await panel.getByRole("checkbox").first().check();await panel.getByRole("button",{name:"Download audit ZIP",exact:true}).click();await expect(panel.getByRole("alert")).toContainText("No ZIP was created");await expect(panel.getByRole("alert")).not.toContainText("SECRET");expect(state.counts().downloads).toBe(2);expect(files).toEqual([]);expect(state.counts().writes).toBe(0);
});

test("live owner revocation prevents archive release after a download has started",async({page})=>{
 const state=await setup(page,{rejectDownloadOwner:true});await state.open();const panel=page.locator(".multipart-audit-export");const files:string[]=[];page.on("download",d=>files.push(d.suggestedFilename()));await panel.getByRole("checkbox").first().check();await panel.getByRole("button",{name:"Download audit ZIP",exact:true}).click();await expect(panel.getByRole("alert")).toContainText("approved owner session");expect(state.counts().downloads).toBe(1);expect(files).toEqual([]);
});

test("owner can cancel a pending private download safely",async({page})=>{
 const state=await setup(page,{holdDownload:true});await state.open();const panel=page.locator(".multipart-audit-export"),files:string[]=[];page.on("download",d=>files.push(d.suggestedFilename()));await panel.getByRole("checkbox").first().check();await panel.getByRole("button",{name:"Download audit ZIP",exact:true}).click();await expect.poll(state.started).toBe(true);await panel.getByRole("button",{name:"Cancel export",exact:true}).click();state.release();await expect(panel.getByRole("alert")).toContainText("Export cancelled");expect(files).toEqual([]);expect(state.counts().downloads).toBe(1);
});
