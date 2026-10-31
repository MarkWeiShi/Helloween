import test from 'node:test';import assert from 'node:assert/strict';
import {VisibleTime} from '../shared/visible-time.mjs';import {BooStore} from '../server/store.mjs';import {loadCatalog} from '../server/content.mjs';import {createEngagement} from '../server/engagement.mjs';import {engagementSummary} from '../server/engagement-report.mjs';
test('visible time excludes background, splits hour boundaries, caps suspended intervals',()=>{
 const start=Date.UTC(2026,9,31,7,59,55),h=Math.floor(start/3600000),c=new VisibleTime(true,start,0);
 c.sample(true,start+15000,15000);assert.equal(c.hours.get(h),5000);assert.equal(c.hours.get(h+1),10000);
 c.sample(false,start+20000,20000);c.sample(true,start+80000,80000);assert.equal([...c.hours.values()].reduce((a,b)=>a+b),20000);
 c.sample(true,start+180000,180000);assert.equal([...c.hours.values()].reduce((a,b)=>a+b),50000);
});
test('samples are idempotent and ordered snapshots cannot inflate duration or card UV',()=>{
 let now=Date.UTC(2026,9,31,8);const store=new BooStore(':memory:',loadCatalog(),{now:()=>now});try{
 const record=createEngagement(store),a=store.createGuest().player.id,b=store.createGuest().player.id,h=now/3600000,id='a'.repeat(32),openedAt=now;
 record(a,{kind:'dwell',visitId:id,openedAt,hours:[[h,0]]});now+=30000;
 const packet={kind:'dwell',visitId:id,openedAt,hours:[[h,30000]]};record(a,packet);record(a,packet);record(a,{...packet,hours:[[h,15000]]});
 record(b,{kind:'dwell',visitId:'b'.repeat(32),openedAt,hours:[[h,10000]]});
 for(const [player,view,spirit] of [[a,'1','jiangshi'],[a,'1','jiangshi'],[a,'2','jiangshi'],[b,'3','jiangshi'],[a,'4','kappa']])record(player,{kind:'card',viewId:view.repeat(32),spiritId:spirit});
 const report=engagementSummary(store.db);assert.equal(report.total.samples,2);assert.equal(report.total.totalMs,40000);assert.equal(report.total.averageMs,20000);assert.equal(report.total.medianMs,20000);assert.equal(report.total.cards,4);assert.equal(report.total.cardVisitors,2);assert.equal(report.hours[0].cards,4);assert.equal(report.cards.find(r=>r.spiritId==='jiangshi').views,3);assert.equal(report.cards.find(r=>r.spiritId==='jiangshi').visitors,2);
 assert.throws(()=>record(a,{...packet,hours:[[h,30000],[h,30000]]}),{status:400});assert.throws(()=>record(a,{kind:'card',viewId:'5'.repeat(32),spiritId:'unknown'}),{status:400});assert.equal(engagementSummary(store.db).total.totalMs,40000);
 // A page spanning multiple hours remains one overall duration sample.
 now+=3600000;record(a,{...packet,hours:[[h,30000],[h+1,5000]]});const next=engagementSummary(store.db);assert.equal(next.total.samples,2);assert.equal(next.hours.length,2);assert.equal(next.total.totalMs,45000);
 }finally{store.close();}
});

// Exercise the report against the same constructor used by the application.
import {analyticsReport} from '../server/analytics-report.mjs';
import {funnelEvents} from '../shared/funnel-events.mjs';
test('fresh application installs hourly triggers and exposes zero-valued funnel columns',()=>{
 const store=new BooStore(':memory:',loadCatalog());try{
  createEngagement(store);store.event('entered');store.event('entered');
  const report=analyticsReport(store.db,engagementSummary(store.db),funnelEvents);
  assert.equal(report.totals.entered,2);assert.equal(report.rows[0].values.entered,2);
  assert.equal(report.totals['event:mic_requested'],0);
  assert.ok(report.columns.some(c=>c.key==='event:mic_requested'));
  store.db.exec('DROP TABLE funnel_events');assert.deepEqual(engagementSummary(store.db).funnel,[]);
 }finally{store.close();}
});
