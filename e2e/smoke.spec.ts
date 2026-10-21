import { test, expect } from "@playwright/test";

test("built application renders an authentication screen without a blank page", async ({ page }) => {
 const runtimeErrors:string[]=[];
 page.on("pageerror",error=>runtimeErrors.push(error.message));
 await page.goto("/",{waitUntil:"domcontentloaded"});
 await expect(page.getByRole("heading",{name:"Maths Question Bank"})).toBeVisible({timeout:15000});
 await expect(page.getByLabel("Email address")).toBeVisible();
 await expect(page.getByLabel("Password")).toBeVisible();
 expect(runtimeErrors).toEqual([]);
});
