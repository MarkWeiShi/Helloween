import test from 'node:test';import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {BooStore} from '../server/store.mjs';import {loadCatalog} from '../server/content.mjs';import {createEngagement} from '../server/engagement.mjs';import {engagementSummary} from '../server/engagement-report.mjs';import {shareEnvironment} from '../shared/share-diagnostics.mjs';
const id=()=>randomBytes(16).toString('hex');
test('UA classification exports fixed categories only',()=>{
 assert.deepEqual(shareEnvironment('Mozilla Chrome/130 HelloTalk'),{browser:'chromium',appContext:'hellotalk'});
 assert.deepEqual(shareEnvironment('Safari MicroMessenger'),{browser:'safari',appContext:'wechat'});
 assert.deepEqual(shareEnvironment('Chrome Edg/100'),{browser:'edge',appContext:'browser'});
 assert.deepEqual(shareEnvironment(''),{browser:'unknown',appContext:'unknown'});
});
test('diagnostics validate bounded anonymous fields, deduplicate and filter flow cohorts',()=>{
 const store=new BooStore(':memory:',loadCatalog());try{
 const record=createEngagement(store),player=store.createGuest().player.id,flow=id(),pageId=id();
 const diagnostics={pageId,clientMs:10,browser:'safari',appContext:'hellotalk'};
 const packet={kind:'funnel',eventId:id(),flowId:flow,channel:'kakao',step:'share_clicked',diagnostics};
 assert.equal(record(player,packet).counted,true);assert.equal(record(player,packet).counted,false);
 for(const bad of [{durationMs:-1},{clientMs:Infinity},{errorCode:'https://private.example'},{browser:'raw user agent'},{httpStatus:999},{rawUA:'private'}])assert.throws(()=>record(player,{...packet,eventId:id(),diagnostics:{...diagnostics,...bad}}),{status:400});
 for(const durationMs of [10,20,80,100])record(player,{...packet,eventId:id(),step:'share_sdk_ready',diagnostics:{...diagnostics,durationMs}});
 record(player,{...packet,eventId:id(),step:'share_sdk_failed',diagnostics:{...diagnostics,errorCode:'TIMEOUT',durationMs:12000}});
 record(player,{...packet,eventId:id(),step:'share_handoff',diagnostics:{...diagnostics,clientMs:1234}});
 const analysis=engagementSummary(store.db,{browser:'safari',appContext:'hellotalk'}).shareFlows.analysis;
 assert.equal(analysis.diagnostics.rows.find(r=>r.step==='share_handoff').timingKind,'page_elapsed');assert.equal(analysis.diagnostics.rows.find(r=>r.step==='share_handoff').medianMs,1234);
 const row=analysis.diagnostics.rows.find(r=>r.step==='share_sdk_ready');assert.equal(row.samples,4);assert.equal(row.medianMs,20);assert.equal(row.p90Ms,100);
 assert.equal(analysis.people.overall.find(r=>r.channel==='kakao').startedPeople,1);
 assert.equal(analysis.people.overall.find(r=>r.channel==='kakao').sentPeople,null);
 assert.equal(engagementSummary(store.db,{browser:'chromium'}).shareFlows.rows.length,0);
 assert.equal(store.db.prepare('SELECT COUNT(*) n FROM share_diagnostics').get().n,7);
 assert.ok(!JSON.stringify(analysis).includes(player));assert.ok(!JSON.stringify(analysis).includes(pageId));
 }finally{store.close();}
});
