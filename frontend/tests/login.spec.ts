import { test } from "@playwright/test";
import { chromium } from "playwright";

test("test", async ({ baseURL }) => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log({ baseURL });
    await page.goto(baseURL!);
    await page.waitForLoadState("load");
    await page.waitForSelector('input[name="username"]');
    await page.click('input[name="username"]');
    await page.fill('input[name="username"]', "dev@webrecorder.net");
    await page.click('input[name="password"]');
    const devPassword = process.env.DEV_PASSWORD;
    if (!devPassword) {
      throw new Error(
        "DEV_PASSWORD environment variable is not defined or null.",
      );
    }
    await page.fill('input[name="password"]', devPassword);
    await page.click('sl-button:has-text("Log In")');
  } finally {
    await browser.close();
  }
});
