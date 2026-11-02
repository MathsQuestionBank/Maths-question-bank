import {test,expect} from "@playwright/test";

const uid="22222222-2222-4222-8222-222222222222";
const user={id:uid,aud:"authenticated",role:"authenticated",email:"teacher@example.test",app_metadata:{provider:"email",providers:["email"]},user_metadata:{},created_at:"2026-11-01T00:00:00Z"};
const token=()=>{
 const b64=(o:object)=>Buffer.from(JSON.stringify(o)).toString("base64url");
 return `${b64({alg:"HS256",typ:"JWT"})}.${b64({exp:4102444800,sub:uid,role:"authenticated",aud:"authenticated"})}.signature`;
};
async function signInAsFixture(page:import("@playwright/test").Page,approved:boolean,includeEdexcel=false){
 await page.addInitScript(({token,user})=>localStorage.setItem("sb-ljisttslifnyrbuybfud-auth-token",JSON.stringify({access_token:token,refresh_token:"dummy",expires_at:4102444800,expires_in:999999999,token_type:"bearer",user})),{token:token(),user});
 await page.route("https://ljisttslifnyrbuybfud.supabase.co/**",route=>{
  const url=new URL(route.request().url());
  const reply=(data:unknown)=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(data)});
  if(url.pathname==="/auth/v1/user")return reply(user);
  if(url.pathname.startsWith("/rest/v1/profiles"))return reply([{role:"member",approved}]);
  if(url.pathname.includes("/storage/v1/object/sign/")){
   const body=route.request().postDataJSON() as {paths:string[]};
   return reply(body.paths.map(path=>({path,signedURL:"/fixture-image.png"})));
  }
  if(url.pathname.startsWith("/rest/v1/questions")&&includeEdexcel)return reply(approved?[{
   id:"44444444-4444-4444-8444-444444444444",question_number:"Q07",topic:"Algebra",skill:"Solving quadratics",assessment_objective:"AO2",marks:3,
   question_storage_path:"published-papers/edexcel/june-2024/1h/sample/Q07/question.png",mark_scheme_storage_path:"published-papers/edexcel/june-2024/1h/sample/Q07/mark.png",
   exam_papers:{exam_board:"Edexcel",series:"June 2024",paper_code:"1H",tier:"Higher"},
   metadata:{id:"EDX-H-JUNE2024-1H-Q07",tier:"Higher",grade:6,calculator:false,tags:["Algebra"],g6:55}
  }]:[]);
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
 await expect(page.getByRole("heading",{name:"Find questions"})).toBeVisible({timeout:12000});
 await expect(page.locator(".pilot-explainer")).toHaveCount(0);
 await expect(page.getByText("Solve 3x + 7 = 25.")).toHaveCount(0);
 await page.getByRole("button",{name:"Preview"}).click();
 await expect(page.getByText("Solve 3x + 7 = 25.")).toBeVisible();
 await page.getByRole("button",{name:/Close/}).click();
 await page.getByRole("navigation",{name:"Main navigation"}).getByRole("button",{name:"Account"}).click();
 await expect(page.getByText("Your worksheets are saved to your individual account")).toBeVisible();
 await expect(page.getByRole("heading",{name:"Teacher access requests"})).toHaveCount(0);
 await expect(page.getByRole("button",{name:"Import exam papers"})).toHaveCount(0);
});

test("approved teacher sees eligible Edexcel question images and builds a worksheet",async({page})=>{
 const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/NVcAAAAASUVORK5CYII=","base64");
 await signInAsFixture(page,true,true);
 await page.route("**/fixture-image.png",route=>route.fulfill({status:200,contentType:"image/png",body:png}));
 await page.goto("/");
 await expect(page.getByText("1 question records match your filters")).toBeVisible({timeout:15000});
 await expect(page.locator(".v62-result-card").first()).toContainText("June 2024");
 await page.getByRole("button",{name:"Preview"}).click();
 await expect(page.getByRole("img",{name:/EDX-H-JUNE2024-1H-Q07 question/})).toBeVisible({timeout:15000});
 await page.getByRole("button",{name:"Mark scheme"}).click();
 await expect(page.getByRole("img",{name:/EDX-H-JUNE2024-1H-Q07 mark/})).toBeVisible();
 await page.getByRole("button",{name:/Close/}).click();
 await page.getByRole("button",{name:"+ Add"}).click();
 await page.getByRole("button",{name:"Open assessment builder →"}).click();
 await expect(page.getByRole("heading",{name:"Assessment preview"})).toBeVisible();
 await expect(page.locator(".paper-question")).toHaveCount(1);
 await expect(page.getByRole("button",{name:/Print .*save PDF/})).toBeEnabled();
});
