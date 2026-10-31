import {test,expect} from '@playwright/test';
import {randomBytes} from 'node:crypto';
import {startBrowserApp} from '../helpers/nginx.mjs';
import {createEngagement} from '../../server/engagement.mjs';
import {engagementSummary} from '../../server/engagement-report.mjs';
let app:Awaited<ReturnType<typeof startBrowserApp>>;
test.beforeAll(async()=>{app=await startBrowserApp();});test.afterAll(async()=>{await app.stop();});
for(const [channel,fail] of [['copy',false],['copy',true],['whatsapp',false]] as const)test(`${channel} clipboard ${fail?'failure':'success'} is attributed to one flow`,async({page})=>{
 await page.addInitScript(fail=>{
  localStorage.setItem('boo:play-unlocked:v2','true');localStorage.setItem('boo:microphone-choice:v1','denied');
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{if(fail)throw Error('clipboard denied')}}});
 },fail);
 await page.goto(app.origin+'/?lang=en');await page.locator('.globe-pin[data-spirit="jiangshi"]').click();
 if(channel==='copy')await page.locator('.character-pumpkin').click();
 await page.locator(`[data-action="send-share"][data-channel="${channel}"]`).click();
 const button=page.locator(channel==='copy'?'[data-copy-confirm]':'[data-copy-invite]');await button.click();
 const player=(await (await page.request.get(app.origin+'/api/me')).json()).player.id;
 const flows=()=>app.store.db.prepare('SELECT id FROM share_flows WHERE player_id=? AND channel=?').all(player,channel);
 await expect.poll(()=>flows().length).toBe(1);const flow=flows()[0].id;
 const packets=()=>app.store.db.prepare('SELECT e.step FROM share_flow_events b JOIN funnel_events e ON e.player_id=b.player_id AND e.event_id=b.event_id WHERE b.flow_id=?').all(flow);
 await expect.poll(()=>packets().some(b=>b.step===(fail?'share_copy_failed':'share_copied'))).toBe(true);
 await expect.poll(()=>engagementSummary(app.store.db).shareFlows.stages.some(r=>r.channel===channel&&r.step===(fail?'share_copy_failed':'share_copied'))).toBe(true);
 if(!fail){await button.click();await expect.poll(()=>packets().filter(b=>b.step==='share_copied').length).toBe(2);}
 if(channel==='copy'){
  await page.getByLabel('Invitation link',{exact:true}).evaluate(input=>input.dispatchEvent(new Event('copy',{bubbles:true})));
  await expect.poll(()=>packets().some(b=>b.step==='share_copy_manual')).toBe(true);
 }
 expect(packets().some(b=>b.step==='share_send_confirmed')).toBe(false);
});
for(const loggedIn of [true,false])test(`LINE preserves flow through ${loggedIn?'SDK completion':'login redirect'} in another session`,async({page})=>{
 const owner=app.store.createGuest().player.id,invite=app.store.createInvite(owner,{channel:'line',spiritId:'jiangshi'}),flow=randomBytes(16).toString('hex');
 createEngagement(app.store)(owner,{kind:'funnel',eventId:randomBytes(16).toString('hex'),flowId:flow,inviteId:invite.id,step:'share_invite_created'});
 await page.route('**/api/social/config',r=>r.fulfill({json:{origin:app.origin,lineLiffId:'test-liff'}}));
 await page.route('https://static.line-scdn.net/**',r=>r.fulfill({contentType:'application/javascript',body:`window.liff={init:async()=>{},isLoggedIn:()=>${loggedIn},isApiAvailable:()=>true,login:x=>window.redirect=x.redirectUri,shareTargetPicker:async()=>({status:'success'})};`}));
 await page.goto(app.origin+'/line-share.html?invite='+invite.id+'&lang=en&flow='+flow);
 if(!loggedIn){await page.locator('#web-login').click();await expect.poll(()=>page.evaluate(()=>(window as any).redirect)).toContain('&flow='+flow);return;}
 await page.locator('#choose').click();await expect(page.locator('[role=status]')).toContainText('Card sent.');
 await expect.poll(()=>app.store.db.prepare("SELECT COUNT(*) n FROM share_flow_events b JOIN funnel_events e ON e.player_id=b.player_id AND e.event_id=b.event_id WHERE b.flow_id=? AND e.step='share_send_confirmed'").get(flow).n).toBe(1);
 expect(app.store.db.prepare('SELECT player_id FROM share_flows WHERE id=?').get(flow).player_id).toBe(owner);
});
