import { test, expect } from "@playwright/test";

const uid="11111111-1111-4111-8111-111111111111";
const user={id:uid,aud:"authenticated",role:"authenticated",email:"owner@example.test",app_metadata:{provider:"email",providers:["email"]},user_metadata:{},created_at:"2026-01-01T00:00:00Z"};
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/NVcAAAAASUVORK5CYII=","base64");
const rows=[
 ["a","2022_1H_Q02a",2],["b","2022_1H_Q02b",2],["c","2021_2H_Q11",6],["d","2020_3H_Q07",3]
].map(([id,sourceId,marks])=>({
 id,topic:"Number",skill:"Fractions",marks,assessment_objective:"AO1",
 question_storage_path:`questions/${sourceId}.png`,mark_scheme_storage_path:`marks/${sourceId}.png`,
 metadata:{id:sourceId,tier:"Higher",calculator:false,series:"November 2022",grade:6,prompt:"Example question",answer:"Example answer",tags:["Number"],g6:55}
}));
const makeToken=()=>{
 const b64=(o:object)=>Buffer.from(JSON.stringify(o)).toString("base64url");
 return `${b64({alg:"HS256",typ:"JWT"})}.${b64({exp:4102444800,sub:uid,role:"authenticated",aud:"authenticated"})}.signature`;
};

test("owner Assessment Builder: multipart, reordering, exports and reopening saved draft",async ({page,browserName})=>{
 test.skip(browserName!=="chromium","Chromium PDF tests only");
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 const token=makeToken();
 await page.addInitScript(({token,user})=>{
  localStorage.setItem("sb-ljisttslifnyrbuybfud-auth-token",JSON.stringify({access_token:token,refresh_token:"dummy",expires_at:4102444800,expires_in:999999999,token_type:"bearer",user}));
 },{token,user});
 await page.route("https://ljisttslifnyrbuybfud.supabase.co/**", async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==="/auth/v1/user")return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(user)});
  if(url.pathname.startsWith("/rest/v1/profiles"))return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify([{role:"owner",approved:true}])});
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
 await expect(page.getByRole("button",{name:/Enhanced Skills Mapped Question Bank/})).toBeVisible({timeout:12000});
 await page.getByRole("button",{name:/Enhanced Skills Mapped Question Bank/}).click();
 await expect(page.getByText("4 question records match your filters")).toBeVisible({timeout:12000});
 await page.getByRole("button",{name:"+ Add"}).first().click();
 await page.getByRole("button",{name:"+ Add"}).first().click();
 await page.getByRole("button",{name:"+ Add"}).first().click();
 await page.getByRole("button",{name:"Open assessment builder →"}).click();
 await expect(page.getByRole("heading",{name:"Assessment preview"})).toBeVisible();
 const order=page.locator(".assessment-order-row");
 await expect(order).toHaveCount(3);
 await expect(page.locator(".paper-question")).toHaveCount(3);
 await expect(page.getByText("13 marks").first()).toBeVisible();
 await order.first().getByRole("combobox").selectOption("3");
 await expect(order.last()).toContainText("Q02");
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
 await page.getByRole("button",{name:"Save new assessment on this device"}).click();
 await page.getByRole("button",{name:"← Home"}).click();
 await page.getByRole("button",{name:/Saved Worksheets \/ Assessments/}).click();
 await page.getByLabel("New folder name").fill("Year 11");
 await page.getByRole("button",{name:"Create folder"}).click();
 await page.getByRole("button",{name:"Unfiled (1)"}).click();
 await page.getByRole("button",{name:"Edit",exact:true}).click();
 await expect(page.getByLabel("Assessment title")).toHaveValue("Test assessment");
 await expect(page.getByRole("button",{name:"Questions + mark scheme",exact:true})).toHaveAttribute("aria-pressed","true");
 await expect(page.locator(".paper-question")).toHaveCount(3);
 await page.getByLabel("Assessment title").fill("Updated assessment");
 await page.getByRole("button",{name:"Update saved assessment"}).click();
 await page.getByRole("button",{name:"← Home"}).click();
 await page.getByRole("button",{name:/Saved Worksheets \/ Assessments/}).click();
 await expect(page.getByText("Updated assessment")).toHaveCount(1);
 await page.getByRole("button",{name:"Duplicate"}).click();
 await expect(page.getByText("Updated assessment (copy)")).toBeVisible();
 expect(errors).toEqual([]);
});
