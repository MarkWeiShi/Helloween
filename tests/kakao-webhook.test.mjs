import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';
import {createApp} from '../server/index.mjs';import {createKakaoWebhook} from '../server/kakao-webhook.mjs';import {createEngagement} from '../server/engagement.mjs';import {engagementSummary} from '../server/engagement-report.mjs';
const id=()=>randomBytes(16).toString('hex');
test('Kakao authenticated callbacks correlate signed invites and count one send per flow',async t=>{
 const adminKey='local-test-secret',app=createApp({databasePath:':memory:',rateLimits:false,kakaoOptions:{adminKey,enabled:true}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.server.close(()=>{app.close();r()})));
 const origin='http://127.0.0.1:'+app.server.address().port,guest=app.store.createGuest(),flow=id(),record=createEngagement(app.store);
 record(guest.player.id,{kind:'funnel',eventId:id(),flowId:flow,channel:'kakao',step:'share_clicked',diagnostics:{pageId:id(),clientMs:0,browser:'safari',appContext:'kakao'}});
 const response=await fetch(origin+'/api/invites',{method:'POST',headers:{cookie:'boo_session='+guest.token,'content-type':'application/json'},body:JSON.stringify({channel:'kakao',spiritId:'jiangshi',flowId:flow})});
 assert.equal(response.status,200);const invite=await response.json();assert.ok(invite.kakaoCallback.proof);assert.ok(!JSON.stringify(invite).includes(adminKey));
 const url=origin+'/api/kakao/share-webhook',headers={authorization:'KakaoAK '+adminKey,'x-kakao-resource-id':'resource1','content-type':'application/json'};
 assert.equal((await fetch(url,{method:'POST',headers:{...headers,authorization:'bad'},body:JSON.stringify(invite.kakaoCallback)})).status,403);
 assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({...invite.kakaoCallback,flow_id:id()})})).status,400);
 const send=()=>fetch(url,{method:'POST',headers,body:JSON.stringify({...invite.kakaoCallback,HASH_CHAT_ID:'must-not-store'})});
 assert.equal((await (await send()).json()).counted,true);assert.equal((await (await send()).json()).counted,false);
 const params=new URLSearchParams(invite.kakaoCallback);
 assert.equal((await (await fetch(url+'?'+params,{headers:{...headers,'x-kakao-resource-id':'resource2'}})).json()).counted,false);
 assert.equal((await (await fetch(url,{method:'POST',headers:{...headers,'content-type':'application/x-www-form-urlencoded','x-kakao-resource-id':'resource3'},body:params})).json()).counted,false);
 assert.throws(()=>record(guest.player.id,{kind:'funnel',eventId:id(),flowId:flow,channel:'kakao',inviteId:invite.id,step:'share_send_confirmed'}),{status:400});
 const row=engagementSummary(app.store.db).shareFlows.analysis.people.overall.find(r=>r.channel==='kakao');assert.equal(row.sentPeople,1);assert.equal(row.sentRate,1);
 assert.equal(app.store.db.prepare("SELECT COUNT(*) n FROM funnel_events WHERE step='share_send_confirmed'").get().n,1);
 const hook=createKakaoWebhook(app.store,{adminKey,enabled:true});const wrong=app.store.createInvite(guest.player.id,{channel:'copy',spiritId:'jiangshi'});assert.throws(()=>hook.receive(hook.callbackArgs(id(),wrong.id),'resource4'),{status:400});
 const foreign=app.store.createGuest(),foreignFlow=id();record(foreign.player.id,{kind:'funnel',eventId:id(),flowId:foreignFlow,channel:'kakao',step:'share_clicked',diagnostics:{pageId:id(),clientMs:0,browser:'safari',appContext:'kakao'}});assert.throws(()=>hook.receive(hook.callbackArgs(foreignFlow,invite.id),'resource5'),{status:400});
});
test('Kakao callback remains disabled without both server configuration values',async t=>{
 const app=createApp({databasePath:':memory:',rateLimits:false,kakaoOptions:{adminKey:'',enabled:true}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.server.close(()=>{app.close();r()})));
 const response=await fetch('http://127.0.0.1:'+app.server.address().port+'/api/kakao/share-webhook');assert.equal(response.status,503);
 assert.equal(engagementSummary(app.store.db).shareFlows.analysis.kakaoWebhookActive,false);
});
