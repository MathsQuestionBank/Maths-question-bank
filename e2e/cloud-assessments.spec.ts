import { test, expect } from "@playwright/test";

const uid="11111111-1111-4111-8111-111111111111";
const questionId="22222222-2222-4222-8222-222222222222";
const user={id:uid,aud:"authenticated",role:"authenticated",email:"owner@example.test",app_metadata:{provider:"email",providers:["email"]},user_metadata:{},created_at:"2026-01-01T00:00:00Z"};
const old={id:"browser-original",name:"My existing assessment",ids:[questionId],minutes:45,folder:"Unfiled"};
const token=()=>{const b64=(x:object)=>Buffer.from(JSON.stringify(x)).toString("base64url");return `${b64({alg:"HS256",typ:"JWT"})}.${b64({exp:4102444800,sub:uid,role:"authenticated",aud:"authenticated"})}.signature`;};

test("cloud copy is opt-in and leaves browser assessments untouched",async({page})=>{
 let inserts=0;
 const cloudRows:Array<{id:string;created_by:string;title:string;configuration:object;created_at:string}>=[];
 const links:Array<{assessment_id:string;question_id:string;position:number}>=[];
 await page.addInitScript(({user,token,old})=>{
  localStorage.setItem("sb-ljisttslifnyrbuybfud-auth-token",JSON.stringify({access_token:token,refresh_token:"dummy",expires_at:4102444800,expires_in:999999999,token_type:"bearer",user}));
  localStorage.setItem("mqb-draft-assessments",JSON.stringify([old]));
 },{user,token:token(),old});
 await page.route("https://ljisttslifnyrbuybfud.supabase.co/**",async route=>{
  const request=route.request();const url=new URL(request.url());const path=url.pathname;
  const reply=(data:unknown,status=200,headers:Record<string,string>={})=>route.fulfill({status,contentType:"application/json",headers,body:JSON.stringify(data)});
  if(path==="/auth/v1/user")return reply(user);
  if(path.startsWith("/rest/v1/profiles"))return reply([{role:"owner",approved:true}]);
  if(path.startsWith("/rest/v1/questions"))return reply([]);
  if(path.startsWith("/rest/v1/assessments")){
   if(request.method()==="POST"){
    inserts++;const body=request.postDataJSON();const record={...body,id:"33333333-3333-4333-8333-333333333333",created_at:"2026-10-27T15:00:00Z",revision:1};
    cloudRows.push(record);return reply(record,201);
   }
   return reply(cloudRows);
  }
  if(path.startsWith("/rest/v1/assessment_questions")){
   if(request.method()==="POST"){links.push(...request.postDataJSON());return reply([],201)}
   return reply(links);
  }
  if(path.startsWith("/rpc/")||path.includes("/rest/v1/rpc/"))return reply(true);
  return reply({},404);
 });
 await page.goto("/");
 await page.getByRole("button",{name:/Saved Worksheets \/ Assessments/}).click();
 await expect(page.getByText("My existing assessment")).toBeVisible();
 expect(inserts).toBe(0);
 page.once("dialog",dialog=>dialog.accept());
 await page.getByRole("button",{name:"Save new cloud copy"}).click();
 await expect(page.getByText(/Cloud copy saved successfully/)).toBeVisible();
 expect(inserts).toBe(1);
 expect(links).toEqual([{assessment_id:"33333333-3333-4333-8333-333333333333",question_id:questionId,position:0}]);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("mqb-draft-assessments")||"[]"))).toEqual([old]);
 await page.getByRole("button",{name:"Load my cloud assessments"}).click();
 await expect(page.getByRole("button",{name:"Open / Edit cloud assessment"})).toBeVisible();
 await page.getByRole("button",{name:"Open / Edit cloud assessment"}).click();
 await expect(page.getByLabel("Assessment title")).toHaveValue("My existing assessment");
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem("mqb-draft-assessments")||"[]"));
 expect(stored).toEqual([old]);
 expect(inserts).toBe(1);
});
