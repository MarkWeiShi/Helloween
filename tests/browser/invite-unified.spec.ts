import {test,expect} from '@playwright/test';import{startBrowserApp}from'../helpers/nginx.mjs';
let app:Awaited<ReturnType<typeof startBrowserApp>>;
test.beforeAll(async()=>{app=await startBrowserApp({databasePath:':memory:',rateLimits:false});});test.afterAll(async()=>{await app.stop();});
for(const mode of ['valid','full','expired'])test(`${mode} invitation keeps preview and sharing available after microphone refusal`,async({page})=>{
 const sender=app.store.createGuest(),invitation=app.store.createInvite(sender.player.id,{spiritId:'jiangshi',channel:'copy'});
 if(mode==='expired')app.store.db.prepare('UPDATE invites SET created_at=0 WHERE id=?').run(invitation.id);
 if(mode==='full')await page.route('**/api/invites/'+invitation.id,async route=>{const response=await route.fetch();await route.fulfill({response,json:{...await response.json(),recordingFull:true}});});
 await page.addInitScript(()=>{(window as any).__micRequests=0;navigator.mediaDevices.getUserMedia=async()=>{(window as any).__micRequests++;throw new DOMException('Denied','NotAllowedError');};});
 await page.goto(app.origin+'/i/'+invitation.id+'?lang=en');await page.locator('.play-unlock').click();
 if(mode==='expired'){await expect(page.locator('[data-invite-play]')).toBeDisabled();return;}
 const dialog=page.locator('dialog.character-immersive');await expect(dialog).toBeVisible();await expect(dialog.locator('.character-info')).not.toHaveAttribute('inert','');
 await expect.poll(()=>page.evaluate(()=>(window as any).__micRequests)).toBe(mode==='full'?0:1);expect(app.store.db.prepare('SELECT COUNT(*) n FROM reaction_audio').get().n).toBe(0);
 if(mode==='full'){await expect(dialog.locator('[data-record-reaction]')).toBeHidden();await expect(dialog.locator('.reaction-capture-controls')).toContainText('storage is full');}
 else {await expect.poll(()=>page.evaluate(()=>(window as any).__micRequests)).toBe(1);await expect(dialog).toBeVisible();}
 await dialog.locator('.character-close').click();await expect(dialog).toHaveCount(0);
});
