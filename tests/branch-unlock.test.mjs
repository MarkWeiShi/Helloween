import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/index.mjs';

const secret='test-webhook-secret-not-for-production-12345';
async function setup(t, options={}) {
  let clock=1800000000000;
  const app=createApp({databasePath:':memory:',rateLimits:false,now:()=>clock,branchOptions:{
    enabled:true,secret,...options}});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>app.server.close(()=>{app.store.close();resolve();})));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const send=(path,body,cookie='',headers={})=>fetch(base+path,{method:body===undefined?'GET':'POST',
    headers:{Cookie:cookie,...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
  const login=subject=>{const g=app.store.createGuest();return `boo_session=${app.store.accountLogin(g.player.id,subject).token}`;};
  const payload=()=>{const row=app.store.db.prepare('SELECT link_url FROM branch_unlock_requests LIMIT 1').get();const p=new URL(row.link_url).searchParams;return {campaign:p.get('~campaign'),feature:p.get('~feature'),channel:p.get('~channel'),data:{unlock_id:p.get('unlock_id')}};};
  const event=(overrides={})=>({id:'event-1',name:'install',timestamp:clock,user_data:{os:'iOS'},
    last_attributed_touch_data:{'~campaign':payload().campaign,'~feature':payload().feature,'~channel':payload().channel,unlock_id:payload().data.unlock_id},...overrides});
  return {app,send,login,event,advance:ms=>clock+=ms,payload,calls:()=>app.store.db.prepare("SELECT COUNT(*) AS n FROM branch_unlock_requests").get().n,
    post:body=>send('/api/branch/webhook',body,'',{Authorization:`Bearer ${secret}`})};
}

test('authenticated callback unlocks only its account; duplicate/replayed events and cookies cannot grant others',async t=>{
 const x=await setup(t), a=x.login('a'), b=x.login('b');
 assert.equal((await x.send('/api/hellotalk-unlock',{})).status,401);
 const guest=x.app.store.createGuest();
 assert.equal((await x.send('/api/hellotalk-unlock',{},`boo_session=${guest.token}`)).status,401);
 assert.equal((await x.send('/api/my-links',undefined,a)).status,200);
 assert.equal((await x.send('/api/invites/test/audio/other',undefined,a)).status,403);
 const results=await Promise.all([x.send('/api/hellotalk-unlock',{},a),x.send('/api/hellotalk-unlock',{},a)]);
 assert.ok(results.every(r=>r.status===200));assert.equal(x.calls(),1);
 const urls=await Promise.all(results.map(r=>r.json()));
 assert.equal(urls[0].url,urls[1].url);
 assert.equal(new URL(urls[0].url).pathname,'/Helloween2026');
 assert.match(new URL(urls[0].url).searchParams.get('unlock_id'),/^[A-Za-z0-9_-]{43}$/);
 assert.equal((await x.send('/api/hellotalk-unlock',{},a)).status,200);assert.equal(x.calls(),1);
 const ev=x.event();
 assert.equal((await x.send('/api/branch/webhook',ev,a)).status,401);
 assert.equal((await x.send('/api/branch/webhook',ev,'',{Authorization:'Bearer wrong'})).status,401);
 assert.equal((await x.post(x.event({name:'click'}))).status,200);
 assert.equal((await (await x.send('/api/hellotalk-unlock',undefined,a)).json()).unlocked,false);
 assert.equal((await (await x.post(ev)).json()).unlocked,true);
 assert.equal((await (await x.post(ev)).json()).duplicate,true);
 assert.equal((await (await x.send('/api/hellotalk-unlock',undefined,b)).json()).unlocked,false);
 const aAgain=x.login('a');
 assert.equal((await (await x.send('/api/hellotalk-unlock',undefined,aAgain)).json()).unlocked,true);
 assert.equal((await x.send('/api/my-links',undefined,aAgain)).status,200);
 assert.equal((await x.send('/api/invites/test/audio/other',undefined,aAgain)).status,404,'existing audio authorization still runs');
});

test('campaign, OS, timestamp, challenge expiry and event shape are checked',async t=>{
 const x=await setup(t), a=x.login('a');await x.send('/api/hellotalk-unlock',{},a);
 for(const ev of [x.event({user_data:{os:'Windows'}}),x.event({timestamp:1}),x.event({timestamp:1900000000000}),
   x.event({last_attributed_touch_data:{...x.event().last_attributed_touch_data,'~campaign':'other'}})]) {
   assert.equal((await (await x.post(ev)).json()).ignored,true);
 }
 assert.equal((await x.post(x.event({id:null}))).status,400);
 assert.equal((await x.post([])).status,400);
 assert.equal((await x.send('/api/branch/webhook',undefined)).status,405);
 x.advance(86400001);
 assert.equal((await (await x.post(x.event())).json()).ignored,true);
 assert.equal((await (await x.send('/api/hellotalk-unlock',undefined,a)).json()).pending,false);
 await x.send('/api/hellotalk-unlock',{},a);assert.equal(x.calls(),1);
 assert.equal((await (await x.post(x.event({name:'open',user_data:{os:'Android'}}))).json()).unlocked,true);
});

test('disabled rollout preserves access; enabled missing configuration fails closed',async t=>{
 const disabled=await setup(t,{enabled:false,secret:''}), a=disabled.login('a');
 assert.equal((await disabled.send('/api/my-links',undefined,a)).status,200);
 assert.equal((await disabled.send('/api/hellotalk-unlock',{},a)).status,503);
 const missing=await setup(t,{secret:''}), b=missing.login('b');
 assert.equal((await missing.send('/api/my-links',undefined,b)).status,200);
 assert.equal((await missing.send('/api/hellotalk-unlock',{},b)).status,503);
});

test('invalid link configuration fails closed and cross-origin unlock requests are rejected',async t=>{
 const x=await setup(t,{link:'https://evil.example/link'}),a=x.login('a');
 assert.equal((await x.send('/api/hellotalk-unlock',{},a,{Origin:'https://evil.example'})).status,403);
 assert.equal((await x.send('/api/hellotalk-unlock',{},a)).status,503);
 assert.equal((await (await x.send('/api/hellotalk-unlock',undefined,a)).json()).pending,false);
});

test('grant persists across server restart and oversized callbacks are rejected',async t=>{
 const {mkdtempSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const dir=mkdtempSync(join(tmpdir(),'boo-branch-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const {createBranchUnlock}=await import('../server/branch-unlock.mjs');
 const path=join(dir,'test.sqlite');let data;
 const options={enabled:true,secret};
 const first=createApp({databasePath:path,branchOptions:options});
 const g=first.store.createGuest(), account=first.store.accountLogin(g.player.id,'persist');
 const service=createBranchUnlock(first.store,options);const issued=await service.start(account.player.id);
 const params=new URL(issued.url).searchParams;data={campaign:params.get('~campaign'),feature:params.get('~feature'),channel:params.get('~channel'),data:{unlock_id:params.get('unlock_id')}};
 service.receive({id:'persistent-event',name:'reinstall',timestamp:Date.now(),user_data:{os:'iOS'},
   last_attributed_touch_data:{'~campaign':data.campaign,'~feature':data.feature,'~channel':data.channel,unlock_id:data.data.unlock_id}});
 first.close();
 const second=createApp({databasePath:path,branchOptions:options});
 assert.equal(createBranchUnlock(second.store,options).status(account.player.id).unlocked,true);second.close();
 const x=await setup(t);
 assert.equal((await x.post({padding:'x'.repeat(66000)})).status,413);
});
