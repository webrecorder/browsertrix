import { chromium } from 'playwright';
import { test, expect } from '@playwright/test';

test('test', async ({}) => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('http://localhost:9870/');
    await page.waitForLoadState('load');
    await page.waitForSelector('input[name="username"]');
    await page.click('input[name="username"]');
    await page.fill('input[name="username"]', 'dev@webrecorder.net');
    await page.click('input[name="password"]');
    const devPassword = process.env.DEV_PASSWORD;
    if (!devPassword) {
      throw new Error('DEV_PASSWORD environment variable is not defined or null.');
    }
    await page.fill('input[name="password"]', devPassword);
    await page.click('a:has-text("Log In")');


  } finally {
    await browser.close();
  }
});

