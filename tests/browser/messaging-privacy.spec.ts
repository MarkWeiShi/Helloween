import {test,expect} from '@playwright/test';
import {startBrowserApp} from '../helpers/nginx.mjs';
let app:any;
test.beforeAll(async()=>{app=await startBrowserApp();});
test.afterAll(async()=>{await app.stop();});
test('legal pages are public and unlock links add no confirmation requirement',async({page})=>{
 await page.goto(app.origin+'/?lang=en');
 await page.locator('.play-unlock').click();
 await expect(page.locator('.play-lock,.unlock-consent')).toHaveCount(0);
 await expect(page.locator('.unlock-consent input[type=checkbox]')).toHaveCount(0);
 for(const path of ['privacy.html','data-deletion.html']){
  const response=await page.goto(app.origin+'/'+path);expect(response?.status()).toBe(200);
  await expect(page.locator('a[href^="mailto:support@hellotalk.com"]')).toHaveCount(2);
 }
});
test('direct WhatsApp and Messenger channels preserve ownership and native share passes invitation',async({page},info)=>{
 await page.addInitScript(()=>{
  localStorage.setItem('boo:play-unlocked:v2','true');
  Object.defineProperty(navigator,'share',{configurable:true,value:async(data:ShareData)=>{document.body.dataset.sharedUrl=data.url;}});
 });
 await page.route('**/api/social/config',r=>r.fulfill({json:{origin:app.origin,facebookAppId:'1125720033691224'}}));
 await page.request.post(app.origin+'/api/session',{data:{}});
 await page.request.post(app.origin+'/api/onboard',{data:{name:'Messaging owner',country:'CN',spiritId:'jiangshi'}});
 const before=await(await page.request.get(app.origin+'/api/me')).json();
 await page.goto(app.origin+'/?lang=en');
 await page.locator('[data-globe-spirit="jiangshi"]').dispatchEvent('click');
 const buttons=page.locator('.character-sns');
 await expect(buttons.locator('[data-channel=facebook]')).toHaveCount(1);
 await expect(buttons.locator('[data-channel=messenger] img')).toBeVisible();
 await expect(buttons.locator('[data-channel=whatsapp] .social-logo')).toBeVisible();
 await buttons.locator('[data-channel=whatsapp]').click();
 const link=page.getByRole('link',{name:'Continue to WhatsApp',exact:true});await expect(link).toBeVisible();
 const url=await page.getByLabel('Invitation link').inputValue();
 expect(new URL((await link.getAttribute('href'))!).searchParams.get('text')).toContain(url);
 await page.locator('[data-back-game]').click();
 await page.locator('[data-globe-spirit="jiangshi"]').dispatchEvent('click');
 await page.locator('.character-sns [data-channel=messenger]').click();
 await expect(page.locator('[data-device-share]')).toBeVisible();
 const invitation=await page.getByLabel('Invitation link').inputValue();
 if(info.project.name==='chromium-desktop'){
  const target=new URL((await page.getByRole('link',{name:'Continue to Messenger',exact:true}).getAttribute('href'))!);
  expect(target.searchParams.get('link')).toBe(invitation);expect(target.searchParams.get('app_id')).toBe('1125720033691224');
 }
 await page.locator('[data-device-share]').click();
 expect(await page.locator('body').getAttribute('data-shared-url')).toBe(invitation);
 const after=await(await page.request.get(app.origin+'/api/me')).json();expect(after.player.id).toBe(before.player.id);
 const links=app.store.db.prepare('SELECT sender_id,channel FROM invites WHERE sender_id=?').all(before.player.id);
 expect(links.map((l:any)=>l.channel).sort()).toEqual(['messenger','whatsapp']);
});
