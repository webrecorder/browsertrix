import { chromium } from 'playwright';
import { test } from '@playwright/test';

test('test', async ({}) => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('http://localhost:9870/');
  await page.locator('input[name="username"]').click();
  await page.locator('input[name="username"]').fill('dev@webrecorder.net');
  await page.locator('input[name="password"]').click();
  const mySecret = process.env.MY_SECRET;
  if (mySecret !== undefined && mySecret !== null) {
    await page.locator('input[name="password"]').fill(mySecret);
  } else {
    console.error('MY_SECRET environment variable is not defined or null.');
    // Handle the error as appropriate
  }
  const link = page.locator('a:has-text("Log in")');

  // Close the browser when the test is finished
  await browser.close();
});
