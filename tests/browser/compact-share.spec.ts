import {test,expect} from '@playwright/test';
import {startBrowserApp} from '../helpers/nginx.mjs';
let app:Awaited<ReturnType<typeof startBrowserApp>>;
test.beforeAll(async()=>{app=await startBrowserApp({databasePath:':memory:',rateLimits:false});});
test.afterAll(async()=>{await app.stop();});
test('X game login resumes to a prefilled composer without publishing authorization or profile setup',async({page,context},info)=>{
 const guest=app.store.createGuest(),login=app.store.accountLogin(guest.player.id,'compact-'+info.project.name);
 await context.addCookies([{name:'boo_session',value:login.token,url:app.origin}]);
 await page.addInitScript(()=>sessionStorage.setItem('boo:pending-share',JSON.stringify({id:'kappa',channel:'x'})));
 const paid:string[]=[];page.on('request',r=>{if(r.url().includes('/api/social/x/')||r.url().includes('/api/auth/start'))paid.push(r.url());});
 await context.route('https://x.com/**',r=>r.fulfill({body:'X composer fixture'}));
 await page.goto(app.origin+'/my-links?signin=success');
 const link=page.locator('[data-open-x]');await expect(link).toBeVisible();
 await expect(page.locator('#share-name, #share-country, [data-publish-x]')).toHaveCount(0);
 const target=new URL((await link.getAttribute('href'))!);
 expect(target.pathname).toBe('/intent/post');expect(target.searchParams.get('text')).toContain('Kappa');
 expect(target.searchParams.get('url')).toContain('/api/share/card/');
 const popup=page.waitForEvent('popup');await link.click();const composer=await popup;
 await expect(composer).toHaveURL(target.href);expect(paid).toEqual([]);await composer.close();
});
test('existing invitation returns specific metadata and continues to the same invite',async({page})=>{
 const sender=app.store.createGuest();const invite=app.store.createInvite(sender.player.id,{spiritId:'kappa',channel:'line'});
 const response=await page.request.get(app.origin+'/i/'+invite.id+'?lang=ja');
 expect(await response.text()).toContain('/art/x-cards/kappa.ja.jpg');
 expect(await response.text()).not.toContain('Boo Around the World');
 await page.goto(app.origin+'/i/'+invite.id+'?lang=ja');
 await expect(page).toHaveURL(new RegExp('/\\?invite='+invite.id+'&lang=ja'));
});
for(const channel of ['facebook','kakao'])test(`${channel} resumes into one compact profile and confirmation page`,async({page,context},info)=>{
 const guest=app.store.createGuest(),login=app.store.accountLogin(guest.player.id,channel+'-'+info.project.name);
 await context.addCookies([{name:'boo_session',value:login.token,url:app.origin}]);
 await page.addInitScript(channel=>sessionStorage.setItem('boo:pending-share',JSON.stringify({id:'kappa',channel})),channel);
 await page.route('**/api/social/config',r=>r.fulfill({json:{origin:app.origin,kakaoKey:'test',facebookAppId:''}}));
 await page.route('https://t1.kakaocdn.net/**',r=>r.fulfill({contentType:'application/javascript',body:`window.Kakao={isInitialized:()=>true,Share:{scrapImage:async()=>({infos:{original:{url:'https://k.kakaocdn.net/compact-test.jpg'}}}),sendDefault:p=>window.sent=p}};`}));
 await page.route('https://k.kakaocdn.net/compact-test.jpg',r=>r.fulfill({path:'public/art/x-cards/kappa.en.jpg',contentType:'image/jpeg'}));
 await page.goto(app.origin+'/my-links?signin=success');
 const dialog=page.locator('dialog');
 const action=channel==='facebook'?page.getByRole('link',{name:'Continue to Facebook',exact:true}):page.getByRole('button',{name:'Continue to KakaoTalk',exact:true});
 await expect(action).toBeVisible();
 await expect(page.locator('#share-name')).toBeVisible();await expect(page.locator('#share-country')).toBeVisible();
 await expect(page.locator('[data-action=send-share]')).toHaveCount(0);
 await expect(page.locator('.share-more')).not.toHaveAttribute('open');
 await expect(page.getByLabel('Invitation link')).not.toBeVisible();
 const rect=await action.boundingBox();expect(rect!.y+rect!.height).toBeLessThan(page.viewportSize()!.height);
 await page.locator('#share-name').fill('Card tester');await page.locator('#share-country').selectOption('JP');
 await page.screenshot({path:`artifacts/social-share/${info.project.name}-compact-${channel}.png`});
 if(channel==='kakao'){expect(await page.evaluate(()=>(window as any).sent)).toBeUndefined();await action.click();await expect(page.locator('[data-kakao-status]')).toContainText('Profile saved');await action.click();await expect.poll(()=>page.evaluate(()=>(window as any).sent?.objectType)).toBe('feed');}
 else {await context.route('https://www.facebook.com/**',r=>r.fulfill({body:'Test share window'}));const popup=context.waitForEvent('page');await action.click();const target=await popup;await expect.poll(()=>app.store.state(login.player.id).country).toBe('JP');await target.close();}
 expect(app.store.state(login.player.id).country).toBe('JP');
 await expect(dialog).not.toContainText(/cand(y|ies)|bonus/);
});
