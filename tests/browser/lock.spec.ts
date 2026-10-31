import {test,expect} from '@playwright/test';
test.use({launchOptions:{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']},permissions:['microphone'],baseURL:process.env.WD_ACCEPTANCE_ORIGIN || 'http://127.0.0.1:8787'});
for(const denied of [false,true])test(`one homepage click confirms terms and requests microphone; denied=${denied}`,async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(denied=>{(window as any).__micRequests=0;const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async c=>{(window as any).__micRequests++;if(denied)throw new DOMException('Denied','NotAllowedError');return original(c);};},denied);
 await page.goto('/?lang=en');await expect(page.locator('.app-shell')).toHaveAttribute('inert','');
 const unlock=page.getByRole('button',{name:'Agree and unlock',exact:true});
 await expect(unlock).toContainText('ordinary play uploads scores only');
 await expect(unlock).toContainText('six-second recording');
 await expect(page.locator('.unlock-consent,[data-confirm-unlock]')).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).__micRequests)).toBe(0);
 await unlock.click();await expect.poll(()=>page.evaluate(()=>(window as any).__micRequests)).toBe(1);
 if(denied){
  await expect(page.locator('.mic-status')).toContainText('still locked');
  await expect(page.locator('.app-shell')).toHaveAttribute('inert','');
  expect(await page.evaluate(()=>localStorage.getItem('boo:play-unlocked:v2'))).toBeNull();
  await unlock.click();await expect.poll(()=>page.evaluate(()=>(window as any).__micRequests)).toBe(2);return;
 }
 await expect(page.locator('.play-lock,.unlock-consent')).toHaveCount(0);
 await expect(page.locator('.app-shell')).not.toHaveAttribute('inert','');
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('boo:microphone-choice:v1'))).toBe('granted');
 await page.locator('.globe-pin[data-spirit="jiangshi"]').click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__micRequests)).toBe(2);
 await expect(page.locator('[data-record-reaction]')).toBeHidden();
 await page.locator('.character-close').click();await page.locator('.globe-pin[data-spirit="kappa"]').click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__micRequests)).toBe(3);
 await page.locator('.character-pumpkin').click();await page.locator('[data-action=send-share][data-channel=copy]').click();
 await expect(page.locator('[data-copy-confirm]')).toBeVisible();await expect(page.locator('#share-name,#share-country,#join-form,.account-panel')).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).__micRequests)).toBe(3);
});
test('an earlier exploration-only unlock cannot bypass the combined voice notice',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('boo:play-unlocked:v1','true'));
 await page.goto('/?lang=en');
 await expect(page.getByRole('button',{name:'Agree and unlock',exact:true})).toBeVisible();
 await expect(page.locator('.app-shell')).toHaveAttribute('inert','');
});
