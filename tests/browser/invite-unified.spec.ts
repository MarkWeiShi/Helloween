import {test,expect,chromium} from '@playwright/test';
import {startBrowserApp} from '../helpers/nginx.mjs';
let origin:string,app:Awaited<ReturnType<typeof startBrowserApp>>;
test.beforeAll(async()=>{app=await startBrowserApp({databasePath:':memory:',rateLimits:false});origin=app.origin;});
test.afterAll(async()=>{await app.stop();});
for (const mode of ['valid','expired','denied']) test(`${mode} invitation: opens consent directly and respects confirmation`,async()=>{
 const expired=mode==='expired';
 const browser=await chromium.launch({channel:'chrome',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try {
 const sender=await browser.newContext({baseURL:origin});
 const guest=app.store.createGuest();const login=app.store.accountLogin(guest.player.id,'invite-'+guest.player.id);
 await sender.addCookies([{name:'boo_session',value:login.token,url:origin}]);
 await sender.request.post('/api/onboard',{data:{name:'你的朋友',country:'CN',spiritId:'jiangshi'}});
 const invite=await(await sender.request.post('/api/invites',{data:{spiritId:'jiangshi',channel:'copy'}})).json();
 if(expired)app.store.db.prepare('UPDATE invites SET created_at=0 WHERE id=?').run(invite.id);
 const receiver=await browser.newContext({baseURL:origin,permissions:['microphone'],viewport:{width:390,height:844}});
 const page=await receiver.newPage();await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript((deny)=>{
  (window as any).__micRequests=0;
  const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=async constraints=>{(window as any).__micRequests++;if(deny)throw new DOMException('Denied','NotAllowedError');return original(constraints);};
 },mode==='denied');
 await page.goto('/i/'+invite.id);
 if(expired)await page.getByRole('button',{name:'Enable Mic & Play',exact:true}).click();
 await expect(page.locator('dialog.unlock-consent')).toBeVisible();
 await expect(page.locator('[data-confirm-unlock]')).toBeInViewport({ratio:1});
 await expect(page.locator('dialog.character-immersive')).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).__micRequests)).toBe(0);
 if(mode==='denied'){
  await page.keyboard.press('Escape');
  await expect(page.locator('.app-shell')).toHaveAttribute('inert','');
  await expect(page.locator('dialog')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).__micRequests)).toBe(0);
  await page.getByRole('button',{name:'Enable Mic & Play',exact:true}).click();
 }
 await page.getByRole('button',{name:"Confirm and enable microphone",exact:true}).click();
 if(mode==='denied'){
  await expect(page.locator('.mic-status')).toContainText('still locked');
  await expect(page.locator('dialog.character-immersive')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).__micRequests)).toBe(1);
  return;
 }
 if(expired){
  await expect(page.locator('[data-invite-play]')).toBeDisabled();
  await expect(page.locator('dialog.character-immersive')).toHaveCount(0);
  return;
 }

 const dialog=page.locator('dialog.character-immersive');await expect(dialog).toBeVisible({timeout:5000});
 await expect(page.locator('.invitation-consent')).toHaveCount(0);
 await expect.poll(()=>dialog.locator('video[data-phase="intro"]').evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(0);
 await expect(dialog.locator('#character-focus')).toHaveAttribute('aria-label','Jiangshi');
 await expect(dialog.locator(':scope > .immersive-video-layer')).toHaveCount(1);
 await expect(page.locator('.invitation-cinema')).toHaveCount(0);
 await expect(dialog.locator('.character-info')).toBeInViewport();
 await page.screenshot({path:'artifacts/invite-unified-mobile.png'});
 await page.getByRole('button',{name:'Close character details',exact:true}).click();
 await expect(dialog).toHaveCount(0);
 }finally{await browser.close();}
});
