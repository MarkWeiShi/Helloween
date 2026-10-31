import {test,expect} from '@playwright/test';
test.use({launchOptions:{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']}});
const origin=process.env.WD_ACCEPTANCE_ORIGIN || 'http://127.0.0.1:8787';
test('one-step unlock persists across reloads and tabs without another confirmation',async({browser})=>{
 const context=await browser.newContext();try{
 const page=await context.newPage();
 await page.goto(origin+'/?lang=en');await page.locator('.play-unlock').click();await expect(page.locator('.play-lock')).toHaveCount(0);
 await page.reload();await expect(page.locator('.app-shell')).toBeVisible();await expect(page.locator('.play-lock')).toHaveCount(0);
 const state=await context.storageState();const restored=await browser.newContext({storageState:state});try{const p=await restored.newPage();await p.goto(origin+'/?lang=en');await expect(p.locator('.app-shell')).not.toHaveAttribute('inert','');await expect(p.locator('.play-lock,.unlock-consent')).toHaveCount(0);}finally{await restored.close();}
 }finally{await context.close();}
});
