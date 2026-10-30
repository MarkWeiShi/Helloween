import {test, expect, chromium} from '@playwright/test';
import {createApp} from '../../server/index.mjs';

let app: ReturnType<typeof createApp>, origin: string;
test.beforeAll(async () => {
  app = createApp({databasePath: ':memory:', rateLimits: false});
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(app.server.address() as {port: number}).port}`;
});
test.afterAll(async () => {
  await new Promise<void>(resolve => app.server.close(() => resolve()));
  app.close();
});

test('successful first unlock survives reload, new tabs and a restored browser session', async () => {
  const browser = await chromium.launch({channel: 'chrome', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']});
  try {
    const context = await browser.newContext({permissions: ['microphone']});
    const page = await context.newPage();
    await page.goto(origin);
    await page.locator('[data-action="enter"]').click();
    await expect(page.locator('.unlock-consent')).toBeVisible();
    await page.locator('[data-confirm-unlock]').click();
    await expect(page.locator('.play-lock')).toHaveCount(0);
    await page.reload();
    const checkUnlocked = async (target: typeof page) => {
      await expect(target.locator('.app-shell')).toBeVisible();
      await expect(target.locator('.app-shell')).toHaveJSProperty('inert', false);
      await expect(target.locator('.play-lock, .unlock-consent')).toHaveCount(0);
    };
    await checkUnlocked(page);
    const newTab = await context.newPage();
    await newTab.goto(origin);
    await checkUnlocked(newTab);
    const savedState = await context.storageState();
    await context.close();
    const restored = await browser.newContext({storageState: savedState});
    const reopened = await restored.newPage();
    await reopened.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => { throw new Error('Reopening must not request microphone access'); };
    });
    await reopened.goto(origin + '/my-links');
    await reopened.locator('[data-page="map"]:visible').click();
    await checkUnlocked(reopened);
    await reopened.goto(origin);
    await checkUnlocked(reopened);
  } finally { await browser.close(); }
});

test('failed microphone authorization does not save an unlock', async () => {
  const browser = await chromium.launch({channel: 'chrome'});
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); };
    });
    await page.goto(origin);
    await page.locator('[data-action="enter"]').click();
    await page.locator('[data-confirm-unlock]').click();
    await expect(page.locator('.mic-status')).not.toBeEmpty();
    await page.reload();
    await expect(page.locator('.play-lock')).toBeVisible();
  } finally { await browser.close(); }
});
