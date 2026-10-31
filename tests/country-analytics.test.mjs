import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { installHourlyAnalytics } from '../server/hourly-analytics.mjs';
import { installCountryAnalytics, withCountry, requestCountry } from '../server/country-analytics.mjs';
import { countryReport } from '../server/country-report.mjs';
import { analyticsReport } from '../server/analytics-report.mjs';
import { engagementSummary } from '../server/engagement-report.mjs';
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE players(id TEXT PRIMARY KEY,country TEXT,initialized INTEGER,created_at INTEGER);
 CREATE TABLE accounts(subject TEXT PRIMARY KEY,player_id TEXT,created_at INTEGER);
 CREATE TABLE invites(id TEXT PRIMARY KEY,sender_id TEXT,created_at INTEGER);
 CREATE TABLE invite_visits(invite_id TEXT,player_id TEXT,created_at INTEGER,PRIMARY KEY(invite_id,player_id));
 CREATE TABLE reaction_audio(invite_id TEXT,player_id TEXT,created_at INTEGER,PRIMARY KEY(invite_id,player_id));
 CREATE TABLE analytics(day TEXT,event TEXT,detail TEXT,count INTEGER,PRIMARY KEY(day,event,detail));`);
 installHourlyAnalytics(db);return db;
}
const report=(db,country='all')=>countryReport(db,analyticsReport,engagementSummary,country);
const enter=db=>db.exec("INSERT INTO analytics VALUES('today','entered','',1) ON CONFLICT(day,event,detail) DO UPDATE SET count=count+1");
test('legacy data stays unknown; country is request IP, not selected nationality; totals reconcile',()=>{
 const db=fixture();try{
 const now=Date.now();db.prepare('INSERT INTO players VALUES(?,?,?,?)').run('old','JP',1,now);enter(db);
 assert.equal(report(db).countryStartedAt,null);assert.equal(report(db,'ZZ').totals.entered,1);
 installCountryAnalytics(db);const started=report(db).countryStartedAt;installCountryAnalytics(db);assert.equal(report(db).countryStartedAt,started);
 withCountry('CN',()=>{db.prepare('INSERT INTO players VALUES(?,?,?,?)').run('new','US',0,now);enter(db);db.exec("UPDATE players SET initialized=1 WHERE id='new'");db.prepare('INSERT INTO invites VALUES(?,?,?)').run('i','new',now)});
 withCountry('US',()=>{enter(db);db.prepare('INSERT INTO invite_visits VALUES(?,?,?)').run('i','old',now);db.prepare('INSERT INTO reaction_audio VALUES(?,?,?)').run('i','old',now)});
 const cn=report(db,'CN'),us=report(db,'US'),unknown=report(db,'ZZ'),all=report(db);
 assert.equal(cn.totals.visitors,1);assert.equal(cn.totals.participants,1);assert.equal(unknown.totals.participants,1);
 assert.equal(cn.totals.invitations,1);assert.equal(us.totals.invitationVisits,1);assert.equal(us.totals.recordings,1);
 for(const key of ['entered','visitors','participants','accounts','invitations','invitationVisits','recordings'])assert.equal(all.totals[key],cn.totals[key]+us.totals[key]+unknown.totals[key],key);
 assert.equal(cn.rows[0].values.entered,1);assert.equal(cn.rows[0].values.participants,1);
 assert.equal(JSON.stringify(all).includes('new'),false);
 db.exec("DELETE FROM reaction_audio");assert.equal(report(db,'US').totals.recordings,0);
 }finally{db.close()}
});
test('rollback, deduplication and concurrent async request contexts preserve exact attribution',async()=>{
 const db=fixture();try{installCountryAnalytics(db);
 await Promise.all(['CN','JP'].map(code=>withCountry(code,async()=>{await new Promise(r=>setTimeout(r,code==='CN'?10:1));enter(db)})));
 withCountry('US',()=>{db.exec('BEGIN');enter(db);db.exec('ROLLBACK')});
 assert.equal(report(db,'CN').totals.entered,1);assert.equal(report(db,'JP').totals.entered,1);assert.equal(report(db,'US').totals.entered,0);
 withCountry('JP',()=>db.exec("INSERT OR IGNORE INTO players VALUES('p','CN',0,0); INSERT OR IGNORE INTO players VALUES('p','CN',0,0)"));
 assert.equal(db.prepare("SELECT COUNT(*) n FROM analytics_country_records WHERE kind='players'").get().n,1);
 assert.throws(()=>report(db,"CN'; DROP TABLE players"));
 }finally{db.close()}
});
test('IP resolution uses only explicitly trusted Fly proxy, handles IPv4/IPv6 and fails closed',()=>{
 const req={headers:{'fly-client-ip':'8.8.8.8','cf-ipcountry':'CN'},socket:{remoteAddress:'127.0.0.1'}};
 assert.equal(requestCountry(req,{trustedFlyProxy:false}),'ZZ');
 assert.equal(requestCountry(req,{trustedFlyProxy:true}),'US');
 assert.equal(requestCountry({...req,headers:{'fly-client-ip':'2001:4860:4860::8888'}},{trustedFlyProxy:true}),'US');
 assert.equal(requestCountry({...req,headers:{'fly-client-ip':'::ffff:8.8.8.8'}},{trustedFlyProxy:true}),'US');
 assert.equal(requestCountry({...req,headers:{'fly-client-ip':'8.8.8.8, 1.1.1.1'}},{trustedFlyProxy:true}),'ZZ');
 assert.equal(requestCountry(req,{trustedFlyProxy:true,lookup(){throw Error('bad db')}}),'ZZ');
 assert.equal(requestCountry({...req,socket:{remoteAddress:'192.168.1.1'}},{trustedFlyProxy:true}),'ZZ');
});
test('optional engagement records keep duration statistics and distinct counts scoped',()=>{
 const db=fixture();try{
 db.exec(`CREATE TABLE engagement_metadata(key TEXT PRIMARY KEY,value INTEGER);INSERT INTO engagement_metadata VALUES('started_at',0);
 CREATE TABLE page_dwell(player_id TEXT,visit_id TEXT,hour INTEGER,visible_ms INTEGER,PRIMARY KEY(visit_id,hour));
 CREATE TABLE card_views(player_id TEXT,view_id TEXT,spirit_id TEXT,created_at INTEGER,PRIMARY KEY(player_id,view_id));`);
 installCountryAnalytics(db);
 const now=Date.now(),hour=Math.floor(now/3600000);
 for(const [code,ms] of [['CN',10000],['US',30000]])withCountry(code,()=>{
 db.prepare('INSERT INTO page_dwell VALUES(?,?,?,?)').run('p',code,hour,ms);
 db.prepare('INSERT INTO card_views VALUES(?,?,?,?)').run('p',code,'kappa',now);
 });
 const cn=report(db,'CN'),us=report(db,'US'),all=report(db);
 assert.equal(cn.totals.dwellMedian,10000);assert.equal(us.totals.dwellMedian,30000);assert.equal(all.totals.dwellMedian,20000);
 assert.equal(cn.cards[0].views,1);assert.equal(cn.totals.cardVisitors,1);assert.equal(all.totals.cardVisitors,1);
 }finally{db.close()}
});

test('funnel steps and labels are scoped, including historical unknown and coverage boundary',async()=>{
 const {funnelEvents}=await import('../shared/funnel-events.mjs');
 const db=fixture();try{
 db.exec(`CREATE TABLE engagement_metadata(key TEXT PRIMARY KEY,value INTEGER);INSERT INTO engagement_metadata VALUES('started_at',0);
 CREATE TABLE page_dwell(player_id TEXT,visit_id TEXT,hour INTEGER,visible_ms INTEGER,PRIMARY KEY(visit_id,hour));
 CREATE TABLE card_views(player_id TEXT,view_id TEXT,spirit_id TEXT,created_at INTEGER,PRIMARY KEY(player_id,view_id));
 CREATE TABLE funnel_events(player_id TEXT,event_id TEXT,step TEXT,channel TEXT,created_at INTEGER,PRIMARY KEY(player_id,event_id));`);
 const now=Date.now();db.prepare('INSERT INTO funnel_events VALUES(?,?,?,?,?)').run('p','old','share_clicked','x',now);
 installCountryAnalytics(db);
 for(const code of ['CN','JP'])withCountry(code,()=>{db.prepare('INSERT INTO funnel_events VALUES(?,?,?,?,?)').run('p',code,'share_clicked','x',now);db.exec("INSERT INTO analytics VALUES('today','share_clicked','x',1) ON CONFLICT(day,event,detail) DO UPDATE SET count=count+1")});
 const run=country=>countryReport(db,(d,e)=>analyticsReport(d,e,funnelEvents),engagementSummary,country);
 assert.equal(run('CN').funnel[0].count,1);assert.equal(run('JP').funnel[0].count,1);assert.equal(run('ZZ').funnel[0].count,1);assert.equal(run('all').funnel[0].count,3);
 assert.equal(run('CN').totals['event:share_clicked'],1);assert.ok(run('CN').columns.some(c=>c.key==='event:share_ready'));
 assert.equal(run('CN').rows[0].partial,true);
 db.prepare('INSERT INTO players VALUES(?,?,?,?)').run('legacy','CN',0,now-86400000);
 const prior=run('CN').rows.find(r=>r.hour===Math.floor((now-86400000)/3600000));if(prior)assert.equal(prior.values.visitors,null);
 }finally{db.close()}
});

test('application installs optional table triggers and resolves country on real HTTP requests',async()=>{
 const {createApp}=await import('../server/index.mjs');
 const original=process.env.FLY_APP_NAME;process.env.FLY_APP_NAME='country-test';
 const app=createApp({databasePath:':memory:',rateLimits:false});
 try{
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+app.server.address().port;
  const request=async(path,body,cookie)=>fetch(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','Fly-Client-IP':'8.8.8.8',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
  const session=await request('/api/session',{});assert.equal(session.status,200);const cookie=session.headers.get('set-cookie').split(';')[0];
  const card=await request('/api/engagement',{kind:'card',viewId:'a'.repeat(32),spiritId:'jiangshi'},cookie);assert.equal(card.status,200);
  const step=await request('/api/engagement',{kind:'funnel',eventId:'b'.repeat(32),step:'share_clicked',channel:'x'},cookie);assert.equal(step.status,200);
  const us=report(app.store.db,'US');assert.equal(us.totals.visitors,1);assert.equal(us.totals.cardOpens,1);assert.equal(us.funnel[0].count,1);
  assert.equal(report(app.store.db,'ZZ').totals.visitors,0);
 }finally{await new Promise(resolve=>app.server.close(resolve));app.store.close();if(original===undefined)delete process.env.FLY_APP_NAME;else process.env.FLY_APP_NAME=original}
});
