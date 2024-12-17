import { test } from "@playwright/test";
import { chromium } from "playwright";

test("test", async ({ baseURL }) => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(baseURL!);
    await page.waitForLoadState("load");
    await page.waitForSelector('input[name="username"]');
    await page.click('input[name="username"]');

    const e2eEmail = process.env.E2E_USER_EMAIL;
    if (!e2eEmail) {
      throw new Error(
        "E2E_USER_EMAIL environment variable is not defined or null.",
      );
    }
    await page.fill('input[name="username"]', e2eEmail);
    await page.click('input[name="password"]');
    const e2ePassword = process.env.E2E_USER_PASSWORD;
    if (!e2ePassword) {
      throw new Error(
        "E2E_USER_PASSWORD environment variable is not defined or null.",
      );
    }
    await page.fill('input[name="password"]', e2ePassword);
    await page.click('sl-button:has-text("Log In")');
  } finally {
    await browser.close();
  }
});
