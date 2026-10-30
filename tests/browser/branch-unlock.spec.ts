import {test,expect} from '@playwright/test';
import {startBrowserApp} from '../helpers/nginx.mjs';

test('friends screams unlocks on verified callback without navigating into the app webview',async({page,context})=>{
 let linkData:any;
 const secret='browser-test-webhook-secret-not-production';
 const app=await startBrowserApp({databasePath:':memory:',rateLimits:false,branchOptions:{enabled:true,secret}});
 const base=app.origin;
 try {
  const guest=app.store.createGuest();const login=app.store.accountLogin(guest.player.id,'browser-unlock');
  app.store.onboard(login.player.id,{name:'Owner',country:'JP',spiritId:'kappa'});
  const invite=app.store.createInvite(login.player.id,{spiritId:'kappa',channel:'copy'});
  const friend=app.store.createGuest().player.id;
  app.store.recordAudio(friend,invite.id,{consent:true,mime:'audio/webm',durationMs:2000,audio:Buffer.from([0x1a,0x45,0xdf,0xa3,1,2,3]).toString('base64'),score:null,meanHz:null,peakHz:null,frames:0});
  const audioPath=base+`/api/invites/${invite.id}/audio/${friend}`;
  await context.addCookies([{name:'boo_session',value:login.token,url:base}]);
  await page.route('https://brc.hellotalk.com/Helloween2026?*',route=>{const p=new URL(route.request().url()).searchParams;linkData={campaign:p.get('~campaign'),feature:p.get('~feature'),channel:p.get('~channel'),data:{unlock_id:p.get('unlock_id')}};return route.fulfill({contentType:'text/html',body:'App/store routing test stub'});});
  await page.goto(base+'/my-links?lang=en');
  await expect(page.locator('[data-unlock-play]')).toBeEnabled();
  await expect(page.locator('.ghost-links-toolbar')).toBeVisible();
  expect(linkData).toBeUndefined();
  expect((await page.request.get(base+'/api/my-links')).status()).toBe(200);
  expect((await page.request.get(audioPath)).status()).toBe(403);
  await expect(page.locator('audio')).not.toHaveAttribute('src');
  await page.locator('[data-unlock-play]').click();
  await expect(page).toHaveURL(/https:\/\/brc\.hellotalk\.com\/Helloween2026\?/);
  await page.goBack();
  await expect(page.locator('[data-unlock-play]')).toBeVisible();
  const response=await page.request.post(base+'/api/branch/webhook',{headers:{Authorization:`Bearer ${secret}`},data:{
   id:'browser-event',name:'open',timestamp:Date.now(),user_data:{os:'Android'},last_attributed_touch_data:{
    '~campaign':linkData.campaign,'~feature':linkData.feature,'~channel':linkData.channel,unlock_id:linkData.data.unlock_id}}});
  expect(response.status()).toBe(200);
  await expect(page.locator('audio')).toBeVisible({timeout:12000});
  expect((await page.request.get(audioPath)).status()).toBe(200);
  await expect(page.locator('[data-unlock-play]')).toBeHidden();
  expect((await page.request.get(base+'/api/my-links')).status()).toBe(200);
  await page.reload();await expect(page.locator('audio')).toBeVisible();
 } finally {await app.stop();}
});
