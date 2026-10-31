import {test,expect} from '@playwright/test';
test.use({launchOptions:{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']},permissions:['microphone'],baseURL:process.env.WD_ACCEPTANCE_ORIGIN || 'http://127.0.0.1:8787'});
for(const denied of [false,true])test(`first card requests microphone, subsequent cards reuse the decision; denied=${denied}`,async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(denied=>{(window as any).__micRequests=0;const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async c=>{(window as any).__micRequests++;if(denied)throw new DOMException('Denied','NotAllowedError');return original(c);};},denied);
 await page.goto('/?lang=en');await expect(page.locator('.app-shell')).toHaveAttribute('inert','');
 await page.getByRole('button',{name:'Start exploring',exact:true}).click();await expect(page.locator('.play-lock,.unlock-consent')).toHaveCount(0);
 await expect(page.locator('.app-shell')).not.toHaveAttribute('inert','');
 expect(await page.evaluate(()=>(window as any).__micRequests)).toBe(0);
 await page.locator('.globe-pin[data-spirit="jiangshi"]').click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__micRequests)).toBe(1);
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('boo:microphone-choice:v1'))).toBe(denied?'denied':'granted');
 await page.locator('.character-close').click();await page.locator('.globe-pin[data-spirit="kappa"]').click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__micRequests)).toBe(denied?1:2);
 if(denied)await expect(page.locator('[data-record-reaction]')).toBeVisible();else await expect(page.locator('[data-record-reaction]')).toBeHidden();
 await page.locator('.character-pumpkin').click();await page.locator('[data-action=send-share][data-channel=copy]').click();
 await expect(page.locator('[data-copy-confirm]')).toBeVisible();await expect(page.locator('#share-name,#share-country,#join-form,.account-panel')).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).__micRequests)).toBe(denied?1:2);
});
