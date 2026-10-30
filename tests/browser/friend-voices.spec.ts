import {test,expect} from '@playwright/test';
import {startBrowserApp} from '../helpers/nginx.mjs';

test('timeline sorts across links, combines filters, and deletes only on confirmation',async({page,context})=>{
 const app=await startBrowserApp({databasePath:':memory:',rateLimits:false});
 const origin=app.origin;
 try {
  const owner=app.store.createGuest();app.store.onboard(owner.player.id,{name:'Owner',country:'CN',spiritId:'jiangshi'});
  const links=['jiangshi','kappa'].map(spiritId=>app.store.createInvite(owner.player.id,{spiritId,channel:'copy'}));
  const audio={consent:true,mime:'audio/webm',durationMs:5000,audio:Buffer.from([0x1a,0x45,0xdf,0xa3,1,2,3]).toString('base64')};
  for(let i=0;i<50;i++) {
   const friend=app.store.createGuest();app.store.onboard(friend.player.id,{name:`Friend ${i}`,country:i%3?'JP':'CN',spiritId:'kappa'});
   app.store.recordAudio(friend.player.id,links[i%2].id,audio);
   app.store.db.prepare('UPDATE reaction_audio SET created_at=? WHERE player_id=?').run(1700000000000+i*60000,friend.player.id);
  }
  const extra=app.store.createGuest();
  expect(app.store.recordAudio(extra.player.id,links[0].id,audio).full).toBe(true);
  await context.addCookies([{name:'boo_session',value:owner.token,url:origin}]);
  await page.goto(origin+'/my-links?lang=en');
  await expect(page.locator('.ghost-link-card')).toHaveCount(50);
  await expect(page.locator('.ghost-link-card h2').first()).toHaveText('Friend 49');
  await expect(page.locator('[data-voice-capacity]')).toContainText('Storage full');
  await page.locator('[data-ghost-filter]').selectOption('kappa');
  await expect(page.locator('.ghost-link-card')).toHaveCount(25);
  await page.locator('[data-country-filter]').selectOption('CN');
  await expect(page.locator('.ghost-link-card')).toHaveCount(8);
  await expect(page.locator('.ghost-link-card h2').first()).toHaveText('Friend 45');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  page.once('dialog',dialog=>dialog.dismiss());
  await page.getByRole('button',{name:'Delete voice',exact:true}).first().click();
  await expect(page.locator('.ghost-link-card')).toHaveCount(8);
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Delete voice',exact:true}).first().click();
  await expect(page.locator('.ghost-link-card')).toHaveCount(7);
  await expect(page.locator('[data-voice-capacity]')).toContainText('49 / 50');
  expect(app.store.recordAudio(extra.player.id,links[0].id,audio)).toEqual({ok:true});
  await page.locator('[data-ghost-filter]').selectOption('');await page.locator('[data-country-filter]').selectOption('');
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await expect(page.locator('.ghost-link-card')).toHaveCount(50);
  await expect(page.locator('.ghost-link-card h2').first()).toHaveText(extra.player.name);
 } finally {await app.stop();}
});
