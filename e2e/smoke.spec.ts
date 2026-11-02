import { test, expect } from "@playwright/test";

test("built application renders an authentication screen without a blank page", async ({ page }) => {
 const runtimeErrors:string[]=[];
 page.on("pageerror",error=>runtimeErrors.push(error.message));
 await page.goto("/",{waitUntil:"domcontentloaded"});
 await expect(page.getByRole("heading",{name:"Maths Question Bank"})).toBeVisible({timeout:15000});
 await expect(page.getByLabel("Email address")).toBeVisible();
 await expect(page.getByLabel("Password")).toBeVisible();
 await expect(page.locator(".auth-masthead")).toHaveCSS("background-color","rgb(246, 229, 237)");
 await expect(page.locator(".auth-brand-wrap")).toHaveCSS("background-color","rgb(246, 229, 237)");
 await expect(page.locator(".auth-page")).toHaveCSS("background-color","rgba(0, 0, 0, 0)");
 await expect(page.getByRole("heading",{name:"Welcome back"})).toBeVisible();
 await expect(page.getByRole("navigation",{name:"Main navigation"})).toHaveCount(0);
 expect(runtimeErrors).toEqual([]);
});

test("new authentication page is usable on small mobile screens",async({page})=>{
 await page.setViewportSize({width:360,height:720});
 await page.goto("/");
 await expect(page.getByRole("heading",{name:"Maths Question Bank"})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Welcome back"})).toBeVisible();
 await expect(page.getByLabel("Email address")).toBeVisible();
 await expect(page.getByLabel("Password")).toBeVisible();
 await expect(page.getByRole("button",{name:"Sign in"})).toBeVisible();
 const widths=await page.evaluate(()=>({page:document.documentElement.scrollWidth,screen:window.innerWidth}));
 expect(widths.page).toBeLessThanOrEqual(widths.screen);
 await page.getByRole("button",{name:"New teacher? Create an account"}).click();
 await expect(page.getByRole("heading",{name:"Create your account"})).toBeVisible();
 await expect(page.getByLabel("Confirm password")).toBeVisible();
});
