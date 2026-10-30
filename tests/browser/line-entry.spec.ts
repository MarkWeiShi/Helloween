import {test,expect} from '@playwright/test';
import {startBrowserApp} from '../helpers/nginx.mjs';
let app:Awaited<ReturnType<typeof startBrowserApp>>;
test.beforeAll(async()=>{app=await startBrowserApp();});
test.afterAll(async()=>app.stop());
test('LINE entry goes to the LIFF app URL without an intermediate website login',async({page,context})=>{
 const guest=app.store.createGuest(),login=app.store.accountLogin(guest.player.id,'line-direct-entry');
 await context.addCookies([{name:'boo_session',value:login.token,url:app.origin}]);
 await page.addInitScript(()=>sessionStorage.setItem('boo:pending-share',JSON.stringify({id:'kappa',channel:'line'})));
 await page.route('**/api/social/config',r=>r.fulfill({json:{lineLiffId:'2012290872-RIK5yg1d',origin:app.origin}}));
 await page.route('https://liff.line.me/**',r=>r.fulfill({body:'LINE app handoff — test only'}));
 await page.goto(app.origin+'/my-links?signin=success');
 await expect(page).toHaveURL(/^https:\/\/liff.line.me\/2012290872-RIK5yg1d\?invite=[\w-]+&lang=en$/,{timeout:5000});
});
