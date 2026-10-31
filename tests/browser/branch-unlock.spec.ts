import {test,expect} from '@playwright/test';
import {startBrowserApp} from '../helpers/nginx.mjs';

test('first play redirects once and returning unlocks playback without a callback',async({page,context})=>{
 let linkData:any;
 const app=await startBrowserApp({databasePath:':memory:',rateLimits:false,branchOptions:{enabled:true}});
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
  const returnUrl=page.url();
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.locator('[data-unlock-play]').click();
  await expect(page.locator('#toast')).toHaveText('You’ll be redirected to the app store. Download HelloTalk to hear your friends’ screams.');
  await expect(page.locator('#toast')).toHaveClass('visible');
  await expect(page.locator('[data-unlock-play]')).toBeDisabled();
  await page.clock.runFor(3999);
  expect(linkData).toBeUndefined();
  await expect(page).toHaveURL(returnUrl);
  await page.clock.runFor(1);
  await expect(page).toHaveURL(/https:\/\/brc\.hellotalk\.com\/Helloween2026\?/);
  await page.clock.resume();
  await page.goBack();
  await expect(page.locator('audio')).toBeVisible({timeout:12000});
  expect((await page.request.get(audioPath)).status()).toBe(200);
  await expect(page.locator('[data-unlock-play]')).toBeHidden();
  expect((await page.request.get(base+'/api/my-links')).status()).toBe(200);
  await page.reload();await expect(page.locator('audio')).toBeVisible();
  await expect(page.locator('[data-unlock-play]')).toBeHidden();
  await page.goto(base+'/my-links?lang=en');await expect(page.locator('audio')).toBeVisible();
 } finally {await app.stop();}
});
