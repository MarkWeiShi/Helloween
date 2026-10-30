import {test,expect} from '@playwright/test';
import {startBrowserApp} from '../helpers/nginx.mjs';
let app:Awaited<ReturnType<typeof startBrowserApp>>;
test.beforeAll(async()=>{app=await startBrowserApp();});
test.afterAll(async()=>{await app.stop();});
for(const channel of ['line','kakao','facebook','copy'])test(`explicit account sign-in preserves the pending ${channel} destination`,async({page})=>{
 await page.addInitScript(channel=>{sessionStorage.setItem('boo:pending-share',JSON.stringify({id:'jiangshi',channel}));},channel);
 let invitations=0;page.on('request',r=>{if(r.method()==='POST' && r.url().endsWith('/api/invites'))invitations++;});
 await page.goto(app.origin+'/my-links?shareLogin=1');
 await expect(page.getByRole('heading',{name:'Keep every little Boo'})).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('boo:pending-share')!))).toEqual({id:'jiangshi',channel});
 expect(invitations).toBe(0);
 await expect(page.locator('[data-action=send-share]')).toHaveCount(0);
});
