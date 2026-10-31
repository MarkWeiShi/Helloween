import {test,expect} from '@playwright/test';
import {startBrowserApp} from '../helpers/nginx.mjs';
let app:Awaited<ReturnType<typeof startBrowserApp>>,token:string,invite:string;
test.beforeAll(async()=>{
 app=await startBrowserApp({rateLimits:false});
 const owner=app.store.createGuest();app.store.onboard(owner.player.id,{name:'Latency owner',country:'JP',spiritId:'jiangshi'});token=owner.token;
 invite=app.store.createInvite(owner.player.id,{spiritId:'jiangshi',channel:'copy'}).id;
 addVoice();
});
function addVoice(){app.store.recordAudio(app.store.createGuest().player.id,invite,{consent:true,mime:'audio/webm',audio:Buffer.from([0x1a,0x45,0xdf,0xa3,1,2,3]).toString('base64'),durationMs:2000,language:"en",amplitudeRms:.4,score:null,meanHz:null,peakHz:null,frames:0});}
test.afterAll(async()=>{await app.stop();});
test.beforeEach(async({context})=>{await context.addCookies([{name:'boo_session',value:token,url:app.origin}]);});
test('slow voices do not block the tab or override a later navigation',async({page})=>{
 await page.goto(app.origin+'/rankings?lang=en');await expect(page.locator('.board-row').first()).toBeVisible();
 let me=0;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/me')me++;});
 let release!:()=>void;const held=new Promise<void>(r=>release=r);
 await page.route('**/api/friend-voices',async route=>{await held;await route.continue();});
 await page.locator('[data-page=links]:visible').click();
 await expect(page.locator('.ghost-links-page')).toBeVisible({timeout:500});
 await expect(page).toHaveURL(/\/my-links$/);expect(me).toBe(0);
 await page.locator('[data-page=boards]:visible').click();const response=page.waitForResponse('**/api/friend-voices');release();
 await response;
 await expect(page).toHaveURL(/\/rankings$/);await expect(page.locator('.scream-rankings')).toBeVisible();
});
test('return shows cached voices while refreshing; authorization failure clears them',async({page})=>{
 await page.goto(app.origin+'/my-links?lang=en');await expect(page.locator('.ghost-link-card')).toHaveCount(1);
 await page.locator('[data-page=boards]:visible').click();
 let release!:()=>void;const held=new Promise<void>(r=>release=r);
 await page.route('**/api/friend-voices',async route=>{await held;await route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'Please refresh to start a new visit.'})});});
 await page.locator('[data-page=links]:visible').click();
 await expect(page.locator('.ghost-link-card')).toHaveCount(1,{timeout:500});
 release();await expect(page.locator('.ghost-link-card')).toHaveCount(0);
 await expect(page.locator('[data-links-status]')).not.toBeEmpty();
});
test('cached terrain avoids a half-second navigation task on return to the globe',async({page})=>{
 await page.goto(app.origin+'/?lang=en');await expect(page.locator('.play-lock')).toBeVisible();
 await page.waitForTimeout(2500);
 await page.locator('[data-page=boards]:visible').click();
 await page.evaluate(()=>{(window as any).tasks=[];new PerformanceObserver(list=>{(window as any).tasks.push(...list.getEntries().map(e=>e.duration));}).observe({type:'longtask'});});
 await page.locator('[data-page=map]:visible').click();await expect(page.locator('.play-lock')).toBeVisible();await page.waitForTimeout(500);
 const tasks=await page.evaluate(()=>(window as any).tasks as number[]);
 expect(Math.max(0,...tasks)).toBeLessThan(200);
});
test('background refresh adds new voices and deletion updates the memory snapshot',async({page})=>{
 await page.goto(app.origin+'/my-links?lang=en');await expect(page.locator('.ghost-link-card')).toHaveCount(1);
 await page.locator('[data-page=boards]:visible').click();
 let release!:()=>void;const held=new Promise<void>(r=>release=r);
 await page.route('**/api/friend-voices',async route=>{await held;await route.continue();});
 addVoice();await page.locator('[data-page=links]:visible').click();
 await expect(page.locator('.ghost-link-card')).toHaveCount(1,{timeout:500});release();
 await expect(page.locator('.ghost-link-card')).toHaveCount(2);
 page.on('dialog',d=>void d.accept());await page.locator('[data-delete-invite]').first().click();
 await expect(page.locator('.ghost-link-card')).toHaveCount(1);
 await page.locator('[data-page=boards]:visible').click();await page.locator('[data-page=links]:visible').click();
 await expect(page.locator('.ghost-link-card')).toHaveCount(1);
});
