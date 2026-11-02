import {test,expect} from "@playwright/test";

const uid="22222222-2222-4222-8222-222222222222";
const user={id:uid,aud:"authenticated",role:"authenticated",email:"teacher@example.test",app_metadata:{provider:"email",providers:["email"]},user_metadata:{},created_at:"2026-11-01T00:00:00Z"};
const token=()=>{
 const b64=(o:object)=>Buffer.from(JSON.stringify(o)).toString("base64url");
 return `${b64({alg:"HS256",typ:"JWT"})}.${b64({exp:4102444800,sub:uid,role:"authenticated",aud:"authenticated"})}.signature`;
};
async function signInAsFixture(page:import("@playwright/test").Page,approved:boolean){
 await page.addInitScript(({token,user})=>localStorage.setItem("sb-ljisttslifnyrbuybfud-auth-token",JSON.stringify({access_token:token,refresh_token:"dummy",expires_at:4102444800,expires_in:999999999,token_type:"bearer",user})),{token:token(),user});
 await page.route("https://ljisttslifnyrbuybfud.supabase.co/**",route=>{
  const url=new URL(route.request().url());
  const reply=(data:unknown)=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(data)});
  if(url.pathname==="/auth/v1/user")return reply(user);
  if(url.pathname.startsWith("/rest/v1/profiles"))return reply([{role:"member",approved}]);
  if(url.pathname.startsWith("/rest/v1/questions"))return reply(approved?[{
   id:"33333333-3333-4333-8333-333333333333",question_number:"1",topic:"Algebra",skill:"Solving linear equations",assessment_objective:"AO1",marks:2,question_storage_path:null,mark_scheme_storage_path:null,
   metadata:{content_rights:"original",demo:true,id:"ORIGINAL-PRACTICE-01",tier:"Foundation",series:"Original practice",prompt:"Solve 3x + 7 = 25.",answer:"x = 6",calculator:false,tags:["Algebra"]}
  }]:[]);
  return reply([]);
 });
}
test("signed-out teacher can request an account without opening the question bank",async({page})=>{
 await page.goto("/");
 await page.getByRole("button",{name:"New teacher? Create an account"}).click();
 await expect(page.getByLabel("Confirm password")).toBeVisible();
 await expect(page.getByRole("button",{name:"Create teacher account"})).toBeVisible();
 await expect(page.getByRole("navigation",{name:"Main navigation"})).toHaveCount(0);
});
test("unapproved teacher cannot see questions or owner tools",async({page})=>{
 await signInAsFixture(page,false);
 await page.goto("/");
 await expect(page.getByRole("heading",{name:"Account awaiting approval"})).toBeVisible();
 await expect(page.getByText("Find questions",{exact:true})).toHaveCount(0);
 await expect(page.getByRole("navigation",{name:"Main navigation"})).toHaveCount(0);
});
test("approved teacher sees original practice and personal Account, not owner approvals",async({page})=>{
 await signInAsFixture(page,true);
 await page.goto("/");
 await expect(page.getByText("Departmental pilot: original practice questions",{})).toBeVisible({timeout:12000}).catch(async()=>{
  await expect(page.locator(".pilot-explainer")).toContainText("original practice questions");
 });
 await expect(page.getByText("Solve 3x + 7 = 25.")).toHaveCount(0);
 await page.getByRole("button",{name:"Preview"}).click();
 await expect(page.getByText("Solve 3x + 7 = 25.")).toBeVisible();
 await page.getByRole("button",{name:/Close/}).click();
 await page.getByRole("navigation",{name:"Main navigation"}).getByRole("button",{name:"Account"}).click();
 await expect(page.getByText("Your worksheets are saved to your individual account")).toBeVisible();
 await expect(page.getByRole("heading",{name:"Teacher access requests"})).toHaveCount(0);
 await expect(page.getByRole("button",{name:"Import exam papers"})).toHaveCount(0);
});
