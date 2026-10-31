import test from 'node:test';import assert from 'node:assert/strict';
import {BooStore} from '../server/store.mjs';import {loadCatalog} from '../server/content.mjs';import {createEngagement} from '../server/engagement.mjs';import {engagementSummary} from '../server/engagement-report.mjs';import {installCountryAnalytics,withCountry} from '../server/country-analytics.mjs';import {countryReport} from '../server/country-report.mjs';import {analyticsReport} from '../server/analytics-report.mjs';
function fixture(){let now=Date.now(),n=0;const store=new BooStore(':memory:',loadCatalog(),{now:()=>now});const record=createEngagement(store);installCountryAnalytics(store.db);return {store,record,next:()=> (++n).toString(16).padStart(32,'0'),tick:()=>{now+=1000},report:()=>engagementSummary(store.db).shareFlows};}
test('separate attempts, idempotency, late events and failures preserve furthest completed step and rates',()=>{
 const f=fixture();try{
 const p=f.store.createGuest().player.id,flow=f.next();
 const emit=(step,extra={})=>{f.tick();return f.record(p,{kind:'funnel',eventId:f.next(),channel:'copy',flowId:flow,step,...extra})};
 withCountry('CN',()=>emit('share_clicked'));
 const invite=f.store.createInvite(p,{channel:'copy',spiritId:'jiangshi'});
 emit('share_invite_created',{inviteId:invite.id});emit('share_ready');
 const packet={kind:'funnel',eventId:f.next(),channel:'copy',flowId:flow,step:'share_copied'};
 withCountry('US',()=>{assert.equal(f.record(p,packet).counted,true);assert.equal(f.record(p,packet).counted,false)});
 emit('share_copy_failed');emit('share_ready');
 const friend=f.store.createGuest().player.id;f.store.recordInviteVisit(friend,invite.id);f.store.recordInviteVisit(friend,invite.id);f.store.recordInviteVisit(p,invite.id);
 const another=f.next();emit('share_clicked',{flowId:another});emit('share_invite_created',{flowId:another,inviteId:f.store.createInvite(p,{channel:'copy',spiritId:'jiangshi'}).id});
 const report=f.report(),completed=report.rows.find(r=>r.furthest==='share_copied');assert.equal(completed.flows,1);assert.equal(completed.lastEvent,'share_ready');assert.equal(completed.friendVisits,1);assert.equal(completed.visitedFlows,1);
 const stage=report.stages.find(r=>r.step==='share_copied');assert.equal(stage.flows,1);assert.equal(stage.totalFlows,2);assert.equal(stage.visitors,1);
 const cn=countryReport(f.store.db,analyticsReport,engagementSummary,'CN');assert.equal(cn.shareFlows.rows[0].furthest,'share_copied');assert.equal(cn.shareFlows.rows[0].friendVisits,1);assert.equal(cn.shareFlows.rows[0].lastEvent,'share_ready');
 assert.equal(countryReport(f.store.db,analyticsReport,engagementSummary,'US').shareFlows.rows.length,0);
 assert.ok(!JSON.stringify(report).includes(flow));assert.ok(!JSON.stringify(report).includes(p));
 }finally{f.store.close()}
});
test('LINE editor continues across sessions; foreign invites, channels and malformed IDs cannot hijack flows',()=>{
 const f=fixture();try{
 const p=f.store.createGuest().player.id,other=f.store.createGuest().player.id,flow=f.next();
 const invite=f.store.createInvite(p,{channel:'line',spiritId:'jiangshi'});
 const emit=(player,step,extra={})=>f.record(player,{kind:'funnel',eventId:f.next(),flowId:flow,channel:'line',inviteId:invite.id,step,...extra});
 emit(p,'share_invite_created');emit(other,'share_ready');emit(other,'share_handoff');emit(other,'share_send_confirmed');
 assert.equal(f.report().rows[0].furthest,'share_send_confirmed');assert.equal(f.report().rows[0].visitors,1);assert.equal(f.report().rows[0].flows,1);
 assert.throws(()=>emit(other,'share_clicked',{inviteId:undefined}),{status:400});
 const unrelated=f.store.createInvite(other,{channel:'line',spiritId:'jiangshi'});assert.throws(()=>emit(other,'share_ready',{inviteId:unrelated.id}),{status:400});
 assert.throws(()=>emit(p,'share_clicked',{flowId:'bad'}),{status:400});assert.throws(()=>emit(p,'mic_requested'),{status:400});
 const copy=f.next();f.record(p,{kind:'funnel',eventId:f.next(),flowId:copy,channel:'copy',step:'share_clicked'});assert.throws(()=>emit(p,'share_clicked',{flowId:copy,inviteId:undefined}),{status:400});
 }finally{f.store.close()}
});
test('old events stay unassigned, manual copy is not successful copy, migrations preserve coverage and rollback',()=>{
 const f=fixture();try{
 const p=f.store.createGuest().player.id;f.record(p,{kind:'funnel',eventId:f.next(),step:'share_clicked',channel:'copy'});assert.equal(f.report().rows.length,0);
 const started=f.report().startedAt;f.tick();createEngagement(f.store);assert.equal(f.report().startedAt,started);
 const flow=f.next();f.record(p,{kind:'funnel',eventId:f.next(),flowId:flow,step:'share_copy_manual',channel:'copy'});
 assert.equal(f.report().rows[0].furthest,'not_recorded');assert.equal(f.report().stages.some(r=>r.step==='share_copied'),false);
 const bad=f.next();assert.throws(()=>f.record(p,{kind:'funnel',eventId:f.next(),flowId:bad,step:'share_send_confirmed',channel:'copy'}));assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM share_flows WHERE id=?').get(bad).n,0);
 }finally{f.store.close()}
});

test('account linking keeps the original flow and permits its new account session to continue',()=>{
 const f=fixture();try{
 const owner=f.store.createGuest().player.id;f.store.accountLogin(owner,'flow-owner');
 const guest=f.store.createGuest().player.id,invite=f.store.createInvite(guest,{channel:'line',spiritId:'jiangshi'}),flow=f.next();
 f.record(guest,{kind:'funnel',eventId:f.next(),step:'share_invite_created',flowId:flow,inviteId:invite.id});
 f.store.accountLogin(guest,'flow-owner');
 f.record(owner,{kind:'funnel',eventId:f.next(),step:'share_send_confirmed',flowId:flow,inviteId:invite.id});
 assert.equal(f.report().rows[0].furthest,'share_send_confirmed');assert.equal(f.report().rows[0].flows,1);
 }finally{f.store.close()}
});
