import {test,expect} from '@playwright/test';import {randomBytes} from 'node:crypto';
import {startBrowserApp} from '../helpers/nginx.mjs';import {createEngagement} from '../../server/engagement.mjs';
let app:Awaited<ReturnType<typeof startBrowserApp>>;
test.beforeAll(async()=>{app=await startBrowserApp({kakaoOptions:{enabled:true,adminKey:'local-browser-test'}});});test.afterAll(async()=>{await app.stop();});
const diagnostics=(flow:string)=>app.store.db.prepare('SELECT e.step,d.duration_ms,d.error_code FROM share_flow_events b JOIN funnel_events e ON e.player_id=b.player_id AND e.event_id=b.event_id LEFT JOIN share_diagnostics d ON d.player_id=e.player_id AND d.event_id=e.event_id WHERE b.flow_id=?').all(flow);
test('Kakao slow SDK offers working copy fallback and later sends signed callback arguments',async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('boo:play-unlocked:v2','true');localStorage.setItem('boo:microphone-choice:v1','denied');Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{}},configurable:true});});
 await page.route('**/api/social/config',r=>r.fulfill({json:{origin:app.origin,kakaoKey:'local-key'}}));
 let release:()=>void;const gate=new Promise<void>(r=>release=r);
 await page.route('https://t1.kakaocdn.net/**',async r=>{await gate;await r.fulfill({contentType:'application/javascript',body:'window.Kakao={isInitialized:()=>false,init:()=>{},Share:{scrapImage:async()=>({infos:{original:{url:"https://k.kakaocdn.net/test.jpg"}}}),sendDefault:data=>window.shared=data}}'});});
 await page.goto(app.origin+'/?lang=en');await page.locator('.globe-pin[data-spirit="jiangshi"]').click();await page.locator('[data-action="send-share"][data-channel="kakao"]').click();
 await expect(page.locator('[data-copy-ready]')).toContainText('Copy link and share now');await expect(page.locator('[data-open-kakao]')).toBeDisabled();await page.locator('[data-copy-ready]').click();
 release!();await expect(page.locator('[data-open-kakao]')).toBeEnabled();
 const player=(await (await page.request.get(app.origin+'/api/me')).json()).player.id;
 const flow=app.store.db.prepare("SELECT id FROM share_flows WHERE player_id=? AND channel='kakao'").get(player).id;
 await expect.poll(()=>diagnostics(flow).some(r=>r.step==='share_sdk_ready'&&r.duration_ms>=0)).toBe(true);
 for(const step of ['share_invite_api_ready','share_config_ready','share_sdk_loaded','share_fallback_offered','share_copied'])expect(diagnostics(flow).some(r=>r.step===step)).toBe(true);
 await page.locator('[data-open-kakao]').click();const shared=await page.evaluate(()=>(window as any).shared);expect(shared.serverCallbackArgs.flow_id).toBe(flow);expect(shared.serverCallbackArgs.proof).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(shared)).not.toContain('local-browser-test');expect(diagnostics(flow).some(r=>r.step==='share_send_confirmed')).toBe(false);
});
for(const result of ['success','cancel','sdk-failure'])test('LINE diagnostic stages: '+result,async({page})=>{
 const owner=app.store.createGuest().player.id,invite=app.store.createInvite(owner,{channel:'line',spiritId:'jiangshi'}),flow=randomBytes(16).toString('hex');
 createEngagement(app.store)(owner,{kind:'funnel',eventId:randomBytes(16).toString('hex'),step:'share_clicked',flowId:flow,channel:'line'});
 createEngagement(app.store)(owner,{kind:'funnel',eventId:randomBytes(16).toString('hex'),step:'share_invite_created',flowId:flow,inviteId:invite.id,channel:'line'});
 await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{}},configurable:true}));
 await page.route('**/api/social/config',r=>r.fulfill({json:{origin:app.origin,lineLiffId:'test'}}));
 await page.route('https://static.line-scdn.net/**',r=>result==='sdk-failure'?r.abort():r.fulfill({contentType:'application/javascript',body:`window.liff={init:async()=>{},isLoggedIn:()=>true,isApiAvailable:()=>true,shareTargetPicker:async()=>${result==='success'?"({status:'success'})":'undefined'}};`}));
 await page.goto(app.origin+'/line-share.html?lang=en&invite='+invite.id+'&flow='+flow);
 if(result==='sdk-failure'){await page.locator('#fallback-copy').click();await expect.poll(()=>diagnostics(flow).some(r=>r.step==='share_copied')).toBe(true);expect(diagnostics(flow).some(r=>r.step==='share_send_confirmed')).toBe(false);return;}
 await page.locator('#choose').click();await expect.poll(()=>diagnostics(flow).some(r=>r.step==='share_picker_returned'&&r.duration_ms>=0)).toBe(true);
 for(const step of ['share_config_ready','share_sdk_loaded','share_sdk_ready','share_picker_opened'])expect(diagnostics(flow).some(r=>r.step===step)).toBe(true);
 await expect.poll(()=>diagnostics(flow).some(r=>r.step===(result==='success'?'share_send_confirmed':'share_cancelled'))).toBe(true);
});
