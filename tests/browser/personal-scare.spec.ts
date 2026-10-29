import { test, expect, chromium } from '@playwright/test';
test('first real transformation measures locally, stays dismissible, and persists per character', async () => {
 const browser = await chromium.launch({channel:'chrome',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try {
  const context = await browser.newContext({permissions:['microphone']});
  const page = await context.newPage();
  await page.goto((process.env.WD_ACCEPTANCE_ORIGIN || 'http://127.0.0.1:8787'));
  await page.getByRole('button',{name:'Enable Mic & Play',exact:true}).click();await page.getByRole('button',{name:"Confirm and enable microphone",exact:true}).click();
  await expect(page.locator('.play-lock')).toHaveCount(0);
  const pin = page.locator('.globe-pin[data-spirit]:visible').first();
  const id = await pin.getAttribute('data-spirit');
  await pin.click();
  await expect(page.locator('[data-personal-scare]')).toContainText("Recording for 5 seconds");
  await expect(page.locator('.character-close')).toBeEnabled();
  await expect(page.locator('[data-personal-scare]')).toContainText(/My Scariness Score|No Voice Detected/,{timeout:15000});
  await expect(page.locator('.transformation-player video[data-phase=loop]')).toHaveJSProperty('loop',true,{timeout:10000});
  await expect(page.locator('.character-close')).toBeEnabled();
  const result = await page.locator('[data-personal-scare]').textContent();
  expect(result).toMatch(/My Scariness Score|No Voice Detected/);
  await page.locator('.character-close').click();
  await page.locator(`.globe-pin[data-spirit="${id}"]`).click();
  await expect(page.locator('[data-personal-scare]')).toHaveText(result!);
  await expect(page.locator('.character-close')).toBeEnabled();
  await page.locator('[data-play-transform]').click();
  await expect(page.locator('.character-close')).toBeEnabled();
  await expect(page.locator('.character-close')).toBeEnabled({timeout:10000});
  await expect(page.locator('[data-personal-scare]')).toHaveText(result!);
  await page.locator('.character-next').click();
  await expect(page.locator('[data-personal-scare]')).toContainText("Recording for 5 seconds");
  await expect(page.locator('.character-close')).toBeEnabled();
  await expect(page.locator('[data-personal-scare]')).toContainText(/My Scariness Score|No Voice Detected/,{timeout:15000});
  await page.reload();
  await page.getByRole('button',{name:'Enable Mic & Play',exact:true}).click();await page.getByRole('button',{name:"Confirm and enable microphone",exact:true}).click();
  await expect(page.locator('.play-lock')).toHaveCount(0);
  await page.locator(`.globe-pin[data-spirit="${id}"]`).click();
  await expect(page.locator('[data-personal-scare]')).toHaveText(result!);
  await expect(page.locator('.character-close')).toBeEnabled();
 } finally { await browser.close(); }
});
