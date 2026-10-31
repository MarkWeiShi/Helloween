import {test,expect} from '@playwright/test';
const origin=process.env.WD_ACCEPTANCE_ORIGIN || 'http://127.0.0.1:8787';
test('exploration choice persists across reloads and tabs without granting microphone consent',async({browser})=>{
 const context=await browser.newContext();try{
 const page=await context.newPage();await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw Error('Exploration must not request a microphone');};});
 await page.goto(origin+'/?lang=en');await page.locator('.play-unlock').click();await expect(page.locator('.play-lock')).toHaveCount(0);
 await page.reload();await expect(page.locator('.app-shell')).toBeVisible();await expect(page.locator('.play-lock')).toHaveCount(0);
 const state=await context.storageState();const restored=await browser.newContext({storageState:state});try{const p=await restored.newPage();await p.goto(origin+'/?lang=en');await expect(p.locator('.app-shell')).not.toHaveAttribute('inert','');await expect(p.locator('.play-lock,.unlock-consent')).toHaveCount(0);}finally{await restored.close();}
 }finally{await context.close();}
});
