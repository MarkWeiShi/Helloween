import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/index.mjs';
import {createBranchUnlock} from '../server/branch-unlock.mjs';

async function setup(t, options={}) {
 const app=createApp({databasePath:':memory:',rateLimits:false,branchOptions:{enabled:true,...options}});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>app.server.close(()=>{app.store.close();resolve();})));
 const base=`http://127.0.0.1:${app.server.address().port}`;
 const send=(path,body,cookie='',headers={})=>fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
 const guest=()=>{const g=app.store.createGuest();return {...g,cookie:`boo_session=${g.token}`};};
 return {app,send,guest};
}

test('first play click grants access and returns BRC once without callback or login',async t=>{
 const x=await setup(t),a=x.guest(),b=x.guest();
 assert.equal((await x.send('/api/hellotalk-unlock',{})).status,401);
 const initial=await (await x.send('/api/hellotalk-unlock',undefined,a.cookie)).json();
 assert.equal(initial.available,true);assert.equal(initial.unlocked,false);
 assert.equal((await x.send('/api/invites/test/audio/other',undefined,a.cookie)).status,403);
 const results=await Promise.all([x.send('/api/hellotalk-unlock',{},a.cookie),x.send('/api/hellotalk-unlock',{},a.cookie)]);
 const states=await Promise.all(results.map(r=>r.json()));
 assert.ok(states.every(s=>s.unlocked));assert.equal(states.filter(s=>s.url).length,1);
 assert.equal(new URL(states.find(s=>s.url).url).pathname,'/Helloween2026');
 assert.equal((await (await x.send('/api/hellotalk-unlock',undefined,b.cookie)).json()).unlocked,false);
 assert.equal((await x.send('/api/invites/test/audio/other',undefined,a.cookie)).status,404,'recording ownership still runs after the promotional gate');
 assert.equal((await (await x.send('/api/hellotalk-unlock',{},a.cookie)).json()).url,undefined);
 assert.equal((await x.send('/api/branch/webhook',{name:'open'})).status,410);
});

test('guest grant follows sign-in to an existing account and later sessions',async t=>{
 const x=await setup(t),owner=x.guest(),visitor=x.guest();
 x.app.store.accountLogin(owner.player.id,'existing-account');
 await x.send('/api/hellotalk-unlock',{},visitor.cookie);
 const loggedIn=x.app.store.accountLogin(visitor.player.id,'existing-account');
 assert.equal((await (await x.send('/api/hellotalk-unlock',undefined,`boo_session=${loggedIn.token}`)).json()).unlocked,true);
 const next=x.app.store.accountLogin(x.guest().player.id,'existing-account');
 assert.equal((await (await x.send('/api/hellotalk-unlock',undefined,`boo_session=${next.token}`)).json()).unlocked,true);
});

test('disabled rollout and invalid links do not grant; cross-origin clicks are rejected',async t=>{
 for(const options of [{enabled:false},{link:'https://evil.example/link'}]) {
  const x=await setup(t,options),a=x.guest();
  assert.equal((await x.send('/api/hellotalk-unlock',{},a.cookie)).status,503);
  assert.equal((await (await x.send('/api/hellotalk-unlock',undefined,a.cookie)).json()).unlocked,false);
 }
 const x=await setup(t),a=x.guest();
 assert.equal((await x.send('/api/hellotalk-unlock',{},a.cookie,{Origin:'https://evil.example'})).status,403);
 assert.equal((await (await x.send('/api/hellotalk-unlock',undefined,a.cookie)).json()).unlocked,false);
});

test('click grants persist across restart and existing callback grants remain valid',async t=>{
 const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const dir=mkdtempSync(join(tmpdir(),'boo-click-unlock-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const databasePath=join(dir,'test.sqlite'),options={enabled:true};
 const first=createApp({databasePath,branchOptions:options});
 const a=first.store.createGuest(),legacy=first.store.createGuest();
 await createBranchUnlock(first.store,options).start(a.player.id);
 first.store.db.prepare('INSERT INTO branch_unlock_grants VALUES(?,?,?,?)').run(legacy.player.id,'old-event','open',Date.now());
 first.close();
 const second=createApp({databasePath,branchOptions:options});
 const service=createBranchUnlock(second.store,options);
 assert.equal(service.status(a.player.id).unlocked,true);assert.equal(service.status(legacy.player.id).unlocked,true);
 second.close();
});
