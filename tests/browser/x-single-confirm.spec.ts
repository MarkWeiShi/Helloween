import {test,expect} from '@playwright/test';
import {startBrowserApp} from '../helpers/nginx.mjs';
let app:Awaited<ReturnType<typeof startBrowserApp>>;
test.beforeAll(async()=>{app=await startBrowserApp();});test.afterAll(async()=>app.stop());
for(const success of [true,false])test(`X previews before authorization and keeps one publish confirmation: success=${success}`,async({page,context},info)=>{
 const guest=app.store.createGuest(),login=app.store.accountLogin(guest.player.id,'x-one-'+success);
 await context.addCookies([{name:'boo_session',value:login.token,url:app.origin}]);
 await page.addInitScript(()=>sessionStorage.setItem('boo:pending-share',JSON.stringify({id:'kappa',channel:'x'})));
 let connected=false,started=0,posted=0;
 await context.route('**/api/social/x/status',r=>r.fulfill({json:{connected}}));
 await context.route('**/api/auth/start',r=>{started++;connected=success;expect(r.request().postDataJSON().popup).toBe(true);return r.fulfill({json:{url:app.origin+'/my-links?signin='+(success?'success':'failed')+'&sharePopup=1'}});});
 await page.route('**/api/social/x/publish',r=>{posted++;return r.fulfill({json:{url:'https://x.com/i/status/123'}});});
 await page.goto(app.origin+'/my-links?signin=success');
 const button=page.getByRole('button',{name:'Authorize X and publish',exact:true});await expect(button).toBeVisible({timeout:5000});
 expect(started).toBe(0);expect(posted).toBe(0);
 await page.locator('#share-name').fill('One confirmation');await page.locator('#share-country').selectOption('JP');
 const text=await page.locator('[data-x-text]').inputValue();
 if(success)await page.screenshot({path:`artifacts/social-share/${info.project.name}-x-authorize-and-publish.png`});
 await button.click();
 if(success){await expect(page.getByRole('link',{name:'View published post'})).toBeVisible();expect(posted).toBe(1);}
 else {await expect(page.locator('[data-x-status]')).toContainText('not completed');expect(posted).toBe(0);}
 expect(started).toBe(1);await expect(page.locator('[data-x-text]')).toHaveValue(text);
});
