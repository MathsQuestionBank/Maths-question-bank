import {test,expect,type Page,type TestInfo} from "@playwright/test";
import {readFile,writeFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {createCanvas,loadImage} from "@napi-rs/canvas";
import {getDocument,OPS,Util} from "pdfjs-dist/legacy/build/pdf.mjs";
import {embedNumberingLayout} from "../src/pngNumberingMetadata";

const fixtureDirectory=fileURLToPath(new URL("./fixtures/edexcel-numbering/",import.meta.url));
type Rect={left:number;top:number;width:number;height:number};
type Layout={version:number;originalNumber:number;imageWidth:number;imageHeight:number;numberRects:Rect[];totalRects:{rect:Rect;marks:number}[];method:string};
type Fixture={id:string;image:string;series:string;paper:string;tier:string;originalNumber:number;marks:number;layout:Layout};
const fixtures:Fixture[]=JSON.parse(await readFile(fixtureDirectory+"layouts.json","utf8"));
const reported=fixtures.find(fixture=>fixture.id==="november-2024-1f-q14")!;
const ordered=[reported,...fixtures.filter(fixture=>fixture!==reported)];
const uid="11111111-1111-4111-8111-111111111111";
const user={id:uid,aud:"authenticated",role:"authenticated",email:"owner@example.test",app_metadata:{provider:"email",providers:["email"]},user_metadata:{},created_at:"2026-01-01T00:00:00Z"};
const emptyCrop={left:0,right:0,top:0,bottom:0};
const token=()=>{
 const encode=(value:object)=>Buffer.from(JSON.stringify(value)).toString("base64url");
 return `${encode({alg:"HS256",typ:"JWT"})}.${encode({exp:4102444800,sub:uid,role:"authenticated",aud:"authenticated"})}.signature`;
};
function row(fixture:Fixture,sourcePositions:boolean,crop=emptyCrop,suffix="",marks=fixture.marks){
 const year=fixture.series.slice(-4),series=fixture.series.split(" ")[0].toUpperCase(),tier=fixture.tier==="Foundation"?"F":"H";
 return {id:fixture.id+suffix,question_number:`Q${fixture.originalNumber}${suffix}`,topic:"Number",skill:"Real examination layout",marks,assessment_objective:"AO1",
  exam_papers:{exam_board:"Edexcel",series:fixture.series,paper_code:fixture.paper,tier:fixture.tier},
  question_storage_path:`numbering-fixtures/${fixture.image}`,
  metadata:{id:`EDX-${tier}-${series}${year}-${fixture.paper}-Q${String(fixture.originalNumber).padStart(2,"0")}${suffix.toUpperCase()}`,tier:fixture.tier,calculator:false,grade:3,tags:[],image_crops:{question:crop},...(sourcePositions?{numbering_positions:{question:fixture.layout}}:{})}
 };
}
async function openAssessment(page:Page,chosen:Fixture[],sourcePositions:boolean|"embedded",extraCrops:Record<string,typeof emptyCrop>={}){
 let ocrRequests=0;
 page.on("request",request=>{if(new URL(request.url()).pathname.includes("/ocr/"))ocrRequests++});
 const rows=chosen.flatMap(fixture=>fixture===reported?[row(fixture,sourcePositions===true,extraCrops[fixture.id],"a",2),row(fixture,sourcePositions===true,extraCrops[fixture.id],"b",3)]:[row(fixture,sourcePositions===true,extraCrops[fixture.id])]);
 const ids=chosen.map(fixture=>fixture.id+(fixture===reported?"a":""));
 const cloudId="33333333-3333-4333-8333-333333333333";
 let saved={id:cloudId,title:"Real Edexcel automatic numbering",revision:1,created_at:"2026-11-15T12:00:00Z",configuration:{id:"real-numbering",folder:"Unfiled",minutes:45,nameBox:false,classBox:false,cover:false,renumberStudentQuestions:false,replaceSourceTotals:true,exportMode:"questions"}};
 await page.addInitScript(({token,user})=>localStorage.setItem("sb-ljisttslifnyrbuybfud-auth-token",JSON.stringify({access_token:token,refresh_token:"dummy",expires_at:4102444800,expires_in:999999999,token_type:"bearer",user})),{token:token(),user});
 await page.route("https://ljisttslifnyrbuybfud.supabase.co/**",async route=>{
  const url=new URL(route.request().url()),reply=(body:unknown)=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(body)});
  if(url.pathname==="/auth/v1/user")return reply(user);
  if(url.pathname.startsWith("/rest/v1/profiles"))return reply([{role:"owner",approved:true}]);
  if(url.pathname.startsWith("/rest/v1/questions"))return reply(rows);
  if(url.pathname.startsWith("/rest/v1/assessment_folders"))return reply([]);
  if(url.pathname.startsWith("/rest/v1/assessment_questions"))return reply(ids.map((question_id,position)=>({assessment_id:cloudId,question_id,position})));
  if(url.pathname.startsWith("/rest/v1/assessments"))return reply([saved]);
  if(url.pathname==="/rest/v1/rpc/save_owned_assessment"){
   const payload=route.request().postDataJSON();saved={...saved,title:payload.p_title,configuration:payload.p_configuration,revision:saved.revision+1};
   return reply([{saved_id:cloudId,saved_revision:saved.revision}]);
  }
  if(url.pathname.includes("/storage/v1/object/sign/"))return reply((route.request().postDataJSON().paths as string[]).map(path=>({path,signedURL:`/real-edexcel-numbering/${path.split("/").pop()}`})));
  return route.fulfill({status:404,contentType:"application/json",body:"{}"});
 });
 await page.route("**/real-edexcel-numbering/*.png",async route=>{
  const image=new URL(route.request().url()).pathname.split("/").pop()!;
  let body=await readFile(fixtureDirectory+image);
  if(sourcePositions==="embedded"){
   const fixture=fixtures.find(fixture=>fixture.image===image)!;
   const numbered=await embedNumberingLayout(new Blob([new Uint8Array(body)],{type:"image/png"}),fixture.layout);
   body=Buffer.from(await numbered.arrayBuffer());
  }
  return route.fulfill({status:200,contentType:"image/png",headers:{"access-control-allow-origin":"*"},body});
 });
 const open=async()=>{
  await page.getByRole("navigation",{name:"Main navigation"}).getByRole("button",{name:"My Worksheets"}).click();
  await page.getByRole("button",{name:"Open / Edit",exact:true}).click();
  await expect(page.locator(".paper-question")).toHaveCount(chosen.length);
 };
 await page.goto("/");await open();
 return {open,ocrRequests:()=>ocrRequests};
}
const printButton=(page:Page)=>page.getByRole("button",{name:/Print .*save PDF/});
async function ready(page:Page){
 await expect(printButton(page)).toBeEnabled({timeout:120000});
 await expect(page.locator(".assessment-mask-review")).toHaveCount(0);
 await expect(page.getByRole("button",{name:"Confirm covers avoid question content",exact:true})).toHaveCount(0);
 await expect(page.locator(".automatic-numbering-status")).toContainText("Automatic numbering ready");
}
async function savePdf(page:Page,testInfo:TestInfo,name:string){
 await expect(printButton(page)).toBeEnabled({timeout:120000});
 const pdf=await page.pdf({format:"A4",printBackground:true,preferCSSPageSize:true});
 const path=testInfo.outputPath(name+".pdf");await writeFile(path,pdf);await testInfo.attach(name+".pdf",{path,contentType:"application/pdf"});return pdf;
}
async function saveImage(testInfo:TestInfo,name:string,body:Buffer){
 const path=testInfo.outputPath(name);await writeFile(path,body);await testInfo.attach(name,{path,contentType:"image/png"});
}
async function pixelData(png:Buffer){
 const image=await loadImage(png),canvas=createCanvas(image.width,image.height),context=canvas.getContext("2d");
 context.drawImage(image,0,0);return {width:canvas.width,height:canvas.height,pixels:context.getImageData(0,0,canvas.width,canvas.height).data};
}
function compareOutsideTargets(before:{width:number;height:number;pixels:Uint8ClampedArray},after:typeof before,targets:Rect[],margin=4){
 expect(after.width).toBe(before.width);expect(after.height).toBe(before.height);
 let changedOutside=0,changedInside=0;
 const allowed=targets.map(rect=>({left:rect.left*before.width-margin,top:rect.top*before.height-margin,right:(rect.left+rect.width)*before.width+margin,bottom:(rect.top+rect.height)*before.height+margin}));
 for(let y=1;y<before.height-1;y++)for(let x=1;x<before.width-1;x++){
  const offset=(y*before.width+x)*4;
  const changed=Math.max(...[0,1,2].map(channel=>Math.abs(before.pixels[offset+channel]-after.pixels[offset+channel])))>12;
  if(!changed)continue;
  if(allowed.some(rect=>x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom))changedInside++;else changedOutside++;
 }
 expect(changedInside,"Original marker ink must actually be changed").toBeGreaterThan(20);
 expect(changedOutside,"Mathematics, parts, diagrams, rules and working area outside detected print must be unchanged").toBeLessThanOrEqual(8);
 return {changedOutside,changedInside,width:before.width,height:before.height};
}
async function renderPdfFirstImage(pdf:Buffer,fixture:Fixture){
 const document=await getDocument({data:new Uint8Array(pdf)}).promise;
 const page=await document.getPage(1),viewport=page.getViewport({scale:2}),operators=await page.getOperatorList();
 let transform=[1,0,0,1,0,0],stack:number[][]=[],bounds:number[]|undefined;
 for(let index=0;index<operators.fnArray.length;index++){
  const fn=operators.fnArray[index],args=operators.argsArray[index];
  if(fn===OPS.save)stack.push([...transform]);
  else if(fn===OPS.restore)transform=stack.pop()||[1,0,0,1,0,0];
  else if(fn===OPS.transform)transform=Util.transform(transform,args);
  else if(fn===OPS.paintImageXObject&&args[1]===fixture.layout.imageWidth&&args[2]===fixture.layout.imageHeight&&!bounds){
   const a=[transform[4],transform[5]],b=[transform[0]+transform[2]+transform[4],transform[1]+transform[3]+transform[5]];
   const rect=viewport.convertToViewportRectangle([a[0],a[1],b[0],b[1]]);
   bounds=[Math.min(rect[0],rect[2]),Math.min(rect[1],rect[3]),Math.abs(rect[2]-rect[0]),Math.abs(rect[3]-rect[1])];
  }
 }
 expect(bounds,"Actual PDF must contain the original full-resolution examination bitmap").toBeTruthy();
 const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height)),context=canvas.getContext("2d");
 await page.render({canvas:canvas as any,canvasContext:context as any,viewport}).promise;
 const [left,top,width,height]=bounds!,x=Math.round(left),y=Math.round(top),w=Math.round(width),h=Math.round(height);
 const image=createCanvas(w,h);image.getContext("2d").drawImage(canvas,x,y,w,h,0,0,w,h);
 const text=(await page.getTextContent()).items.map(item=>"str" in item?item.str:"").join(" ");
 const pixels=image.getContext("2d").getImageData(0,0,w,h).data,png=image.toBuffer("image/png");
 await document.destroy();return {width:w,height:h,pixels,png,text};
}

test.beforeEach(async({},testInfo)=>test.skip(testInfo.project.name!=="chromium","Real OCR/PDF raster regression runs once on desktop Chromium"));

test("source coordinates automatically replace real Edexcel numbers and totals across 16 layouts",async({page},testInfo)=>{
 test.setTimeout(180000);await page.setViewportSize({width:1600,height:1800});
 const runtime=await openAssessment(page,ordered,true);
 const frame=page.locator(".paper-question .mqb-cropped-image").first();
 await expect(frame).toHaveAttribute("data-image-state","ready");
 await frame.evaluate((element,width)=>(element as HTMLElement).style.width=width+"px",reported.layout.imageWidth);
 const before=await frame.screenshot();await saveImage(testInfo,"q14-original-preview.png",before);
 const originalPdf=await savePdf(page,testInfo,"real-edexcel-original");
 await page.getByRole("checkbox",{name:/Hide original question numbers/}).check();await ready(page);
 await expect(page.locator(".paper-question .assessment-question-number")).toHaveText(ordered.map((_,index)=>`Question ${index+1}`));
 await expect(page.locator(".mqb-auto-total-text")).toHaveText(ordered.map((fixture,index)=>`(Total for Question ${index+1} is ${fixture.marks} ${fixture.marks===1?"mark":"marks"})`));
 await expect(frame.locator(".mqb-auto-number-text")).toHaveText("1");
 const after=await frame.screenshot();await saveImage(testInfo,"q14-renumbered-preview.png",after);
 const targets=[...reported.layout.numberRects,...reported.layout.totalRects.map(total=>total.rect)];
 const previewComparison=compareOutsideTargets(await pixelData(before),await pixelData(after),targets);
 const automaticPdf=await savePdf(page,testInfo,"real-edexcel-automatic-16-layouts");
 const originalRaster=await renderPdfFirstImage(originalPdf,reported),automaticRaster=await renderPdfFirstImage(automaticPdf,reported);
 const pdfComparison=compareOutsideTargets(originalRaster,automaticRaster,targets,5);
 await writeFile(testInfo.outputPath("q14-pixel-comparison.json"),JSON.stringify({preview:previewComparison,pdf:pdfComparison,sourceRegions:targets},null,2));
 expect(automaticRaster.text).toContain("Question 1");expect(automaticRaster.text).toContain("(Total for Question 1 is 5 marks)");
 expect(automaticRaster.text).not.toContain("Total for Question 14 is 5 marks");
 await saveImage(testInfo,"q14-original-pdf-image.png",originalRaster.png);
 await saveImage(testInfo,"q14-renumbered-pdf-image.png",automaticRaster.png);
 expect(runtime.ocrRequests(),"Stored PDF-derived positions must avoid OCR").toBe(0);
});

test("all 16 real legacy Foundation and Higher images are OCR-renumbered without review and reused",async({page},testInfo)=>{
 test.setTimeout(180000);await page.setViewportSize({width:1600,height:1800});
 const legacy=ordered;
 const runtime=await openAssessment(page,legacy,false);
 await page.getByRole("checkbox",{name:/Hide original question numbers/}).check();await ready(page);
 await expect(page.locator(".mqb-auto-number-text")).toHaveText(legacy.map((_,index)=>String(index+1)));
 const statements=legacy.map((fixture,index)=>`(Total for Question ${index+1} is ${fixture.marks} ${fixture.marks===1?"mark":"marks"})`);
 await expect(page.locator(".mqb-auto-total-text")).toHaveText(statements);
 expect(runtime.ocrRequests(),"A real legacy bitmap must exercise self-hosted OCR").toBeGreaterThan(0);
 const pdf=await savePdf(page,testInfo,"real-legacy-q14-automatic");
 const raster=await renderPdfFirstImage(pdf,reported);
 expect(raster.text).toContain("(Total for Question 1 is 5 marks)");
 await saveImage(testInfo,"real-legacy-q14-pdf.png",raster.png);
 const cached=await page.evaluate(()=>JSON.parse(localStorage.getItem("mqb-numbering-layouts-v1")||"{}"));
 expect(Object.keys(cached).length).toBeGreaterThanOrEqual(legacy.length);
 await page.getByRole("button",{name:"Save changes to my account",exact:true}).click();
 const requests=runtime.ocrRequests();await page.reload();await runtime.open();await ready(page);
 expect(runtime.ocrRequests(),"Successful image processing should be reused without starting OCR again").toBe(requests);
 await expect(page.locator(".mqb-auto-total-text")).toHaveText(statements);
});

test("additional crops keep source positions aligned and accept an already-cropped-out number",async({page},testInfo)=>{
 test.setTimeout(120000);
 const short=fixtures.find(fixture=>fixture.id==="june-2022-1f-q01")!;
 await openAssessment(page,[reported,short],true,{[reported.id]:{left:10,right:3,top:0,bottom:2},[short.id]:{left:0,right:4,top:5,bottom:2}});
 await page.getByRole("checkbox",{name:/Hide original question numbers/}).check();await ready(page);
 const questions=page.locator(".paper-question");
 await expect(questions.first().locator(".mqb-auto-number-mask")).toHaveCount(0);
 await expect(questions.first().locator(".mqb-auto-total-text")).toHaveText("(Total for Question 1 is 5 marks)");
 await expect(questions.nth(1).locator(".mqb-auto-number-text")).toHaveText("2");
 const coverage=await questions.nth(1).evaluate(node=>{
  const frame=node.querySelector(".mqb-cropped-image")!.getBoundingClientRect(),cover=node.querySelector(".mqb-auto-number-mask")!.getBoundingClientRect();
  return {left:(cover.left-frame.left)/frame.width,top:(cover.top-frame.top)/frame.height};
 });
 expect(coverage.left).toBeCloseTo(short.layout.numberRects[0].left/.96,2);
 expect(coverage.top).toBeCloseTo((short.layout.numberRects[0].top-.05)/.93,2);
 await savePdf(page,testInfo,"real-edexcel-extra-crop-boundaries");
 await saveImage(testInfo,"real-edexcel-crop-boundaries.png",await page.locator(".paper").screenshot());
});

test("new publication PNG positions work automatically without database metadata or OCR",async({page},testInfo)=>{
 test.setTimeout(120000);
 const runtime=await openAssessment(page,[reported],"embedded");
 await page.getByRole("checkbox",{name:/Hide original question numbers/}).check();await ready(page);
 await expect(page.locator(".mqb-auto-number-text")).toHaveText("1");
 await expect(page.locator(".mqb-auto-total-text")).toHaveText("(Total for Question 1 is 5 marks)");
 expect(runtime.ocrRequests(),"Source positions inside a new PNG should avoid OCR and a schema migration").toBe(0);
 await savePdf(page,testInfo,"real-edexcel-png-embedded-source-positions");
});
