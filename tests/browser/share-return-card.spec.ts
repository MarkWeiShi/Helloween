import {test,expect} from '@playwright/test';
import {startBrowserApp} from '../helpers/nginx.mjs';
let app:Awaited<ReturnType<typeof startBrowserApp>>;
test.beforeAll(async()=>{app=await startBrowserApp();});
test.afterAll(async()=>{await app.stop();});
for(const exit of ['close','escape','return'])test(`LINE ${exit} returns to the originating video card`,async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('boo:play-unlocked:v1','true'));
 await page.route('**/api/social/config',r=>r.fulfill({json:{origin:app.origin,lineLiffId:'test-liff'}}));
 await page.goto(app.origin+'/?lang=en');
 await page.locator('.globe-pin[data-spirit="jiangshi"]').dispatchEvent('click');
 await page.locator('.character-sns [data-channel="line"]').click();
 await expect(page.locator('[data-line-app]')).toBeVisible();
 if(exit==='close')await page.locator('.modal-close').click();
 else if(exit==='escape')await page.keyboard.press('Escape');
 else await page.evaluate(()=>document.dispatchEvent(new Event('boo:share-return')));
 await expect(page.locator('.character-dialog #character-focus')).toBeVisible({timeout:3000});
 await expect(page.locator('.character-sns [data-channel="line"]')).toHaveAttribute('data-id','jiangshi');
 await page.locator('.character-close').click();
 await expect(page.locator('.character-dialog')).toHaveCount(0);
});
for(const channel of ['x','kakao','facebook'])test(`${channel} cancel restores the selected card`,async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('boo:play-unlocked:v1','true'));
 await page.route('**/api/social/config',r=>r.fulfill({json:{origin:app.origin,kakaoKey:'',facebookAppId:''}}));
 await page.goto(app.origin+'/?lang=en');
 await page.locator('.globe-pin[data-spirit="jiangshi"]').dispatchEvent('click');
 await page.locator(`.character-sns [data-channel="${channel}"]`).click();
 if(channel==='x')await expect(page.locator('.account-panel')).toBeVisible();
 else await expect(page.locator('[data-back-game]')).toBeVisible();
 if(channel==='kakao')await page.locator('[data-back-game]').click();
 else await page.locator('.modal-close').click();
 await expect(page.locator('.character-sns [data-channel="line"]')).toHaveAttribute('data-id','jiangshi');
});
test('reloading after a share handoff restores and consumes the source card',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('boo:play-unlocked:v1','true'));
 await page.route('**/api/social/config',r=>r.fulfill({json:{origin:app.origin,lineLiffId:'test-liff'}}));
 await page.goto(app.origin+'/?lang=en');
 await page.locator('.globe-pin[data-spirit="jiangshi"]').dispatchEvent('click');
 await page.locator('.character-sns [data-channel="line"]').click();
 await expect(page.locator('[data-line-app]')).toBeVisible();
 await page.reload();
 await expect(page.locator('.character-sns [data-channel="line"]')).toHaveAttribute('data-id','jiangshi');
 await page.locator('.character-close').click();await page.reload();
 await expect(page.locator('.globe-viewport')).toBeVisible();
 await expect(page.locator('.character-dialog')).toHaveCount(0);
});
for(const channel of ['x','facebook'])test(`${channel} external popup keeps the original video card mounted`,async({page,context},info)=>{
 const guest=app.store.createGuest(),login=app.store.accountLogin(guest.player.id,`${channel}-return-${info.project.name}`);
 app.store.onboard(login.player.id,{name:'Tester',country:'CN',spiritId:'jiangshi'});
 await context.addCookies([{name:'boo_session',value:login.token,url:app.origin}]);
 await page.addInitScript(()=>localStorage.setItem('boo:play-unlocked:v1','true'));
 await context.route(channel==='x'?'https://x.com/**':'https://www.facebook.com/**',r=>r.fulfill({body:'Provider fixture'}));
 await page.goto(app.origin+'/?lang=en');
 await page.locator('.globe-pin[data-spirit="jiangshi"]').dispatchEvent('click');
 await page.locator('.character-dialog').evaluate(el=>el.setAttribute('data-original-player','true'));
 const popupPromise=page.waitForEvent('popup');
 await page.locator(`.character-sns [data-channel="${channel}"]`).click();
 const popup=await popupPromise;
 await expect(popup).toHaveURL(channel==='x'?/^https:\/\/x.com\/intent\/post/:/^https:\/\/www.facebook.com\/sharer/);
 await page.evaluate(()=>{
  Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
  document.dispatchEvent(new Event('visibilitychange'));
 });
 await popup.close();
 await page.evaluate(()=>{
  Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
  document.dispatchEvent(new Event('visibilitychange'));
 });
 await expect(page.locator('.character-dialog')).toHaveAttribute('data-original-player','true');
 await expect(page.locator('.character-sns [data-channel="line"]')).toHaveAttribute('data-id','jiangshi');
});
test('login redirect resumes sharing and cancel returns to its source card',async({page,context},info)=>{
 const guest=app.store.createGuest(),login=app.store.accountLogin(guest.player.id,'return-login-'+info.project.name);
 await context.addCookies([{name:'boo_session',value:login.token,url:app.origin}]);
 await page.addInitScript(()=>{
  localStorage.setItem('boo:play-unlocked:v1','true');
  sessionStorage.setItem('boo:share-return-card','jiangshi');
  sessionStorage.setItem('boo:pending-share',JSON.stringify({id:'jiangshi',channel:'x'}));
 });
 await page.goto(app.origin+'/my-links?signin=success');
 await expect(page.locator('[data-open-x]')).toBeVisible();
 await page.locator('.modal-close').click();
 await expect(page.locator('.character-sns [data-channel="x"]')).toHaveAttribute('data-id','jiangshi');
 await expect(page).toHaveURL(/\/\?lang=en$/);
});
