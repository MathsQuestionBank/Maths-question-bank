import { test, expect } from "@playwright/test";

test("loads the application without browser exceptions", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
  await expect(page.locator("body")).not.toBeEmpty();
  await expect(page).toHaveTitle(/.+/);
  expect(errors).toEqual([]);
});

test("does not overflow horizontally on initial load", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  expect(overflow).toBe(false);
});

test("captures the initial page for visual review", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("initial-page.png"), fullPage: true });
});

test("owner-only dashboard is not exposed to an anonymous visitor", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /import exam papers/i })).toHaveCount(0);
});
