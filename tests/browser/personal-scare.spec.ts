import {test,expect,chromium} from '@playwright/test';
test('first card automatically measures, stays numeric-only and reacquires granted streams without a recording action',async()=>{
 const browser=await chromium.launch({channel:'chrome',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});try{
 const ctx=await browser.newContext({permissions:['microphone']});const page=await ctx.newPage();const base=process.env.WD_ACCEPTANCE_ORIGIN||'http://127.0.0.1:8787';
 await page.addInitScript(()=>{(window as any).__mic=0;const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async c=>{(window as any).__mic++;return original(c);};});
 await page.goto(base+'/?lang=en');await page.locator('.play-unlock').click();expect(await page.evaluate(()=>(window as any).__mic)).toBe(0);
 const sample=page.waitForRequest(r=>r.method()==='POST'&&r.url().endsWith('/spirits/jiangshi/scare'));await page.locator('[data-globe-spirit="jiangshi"]').click();const body=(await sample).postDataJSON();expect(body).not.toHaveProperty('audio');expect(body.consent).toBe(true);
 await expect(page.locator('[data-personal-scare]')).toContainText(/You \d+\/100|My Scariness Score|No Voice Detected|No voice/,{timeout:15000});const calls=await page.evaluate(()=>(window as any).__mic);expect(calls).toBe(1);
 await page.locator('.character-close').click();await page.locator('[data-globe-spirit="jiangshi"]').click();expect(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('boo:personal-scare:')))).toBe(true);await expect.poll(()=>page.evaluate(()=>(window as any).__mic)).toBe(calls+1);
 await page.locator('.character-close').click();await page.locator('[data-globe-spirit="kappa"]').click();await expect.poll(()=>page.evaluate(()=>(window as any).__mic)).toBe(calls+2);await expect(page.locator('[data-record-reaction]')).toBeHidden();
 }finally{await browser.close();}
});
