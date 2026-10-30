import test from 'node:test';
import assert from 'node:assert/strict';
import {BooStore} from '../server/store.mjs';
import {loadCatalog} from '../server/content.mjs';
import {createApp} from '../server/index.mjs';
const body={consent:true,mime:'audio/webm',durationMs:2000,audio:Buffer.from([0x1a,0x45,0xdf,0xa3,1,2,3]).toString('base64'),score:null,meanHz:null,peakHz:null,frames:0};
test('fifty recordings across links, deletion, retries, privacy and pagination',()=>{
 const store=new BooStore(':memory:',loadCatalog());
 try{
 const sender=store.createGuest().player.id;store.onboard(sender,{name:'Owner',country:'JP',spiritId:'kappa'});
 const link=store.createInvite(sender,{spiritId:'kappa',channel:'copy'}),friends=Array.from({length:51},()=>store.createGuest().player.id);
 for(const friend of friends.slice(0,50))store.recordAudio(friend,link.id,body);
 assert.equal(store.recordAudio(friends[0],link.id,body).alreadySent,true);
 assert.equal(store.recordAudio(friends[50],link.id,body).full,true);
 assert.equal(store.invite(link.id).recordingFull,true);
 assert.deepEqual(store.ghostLinks(sender).links[0].recordings.map(r=>r.receiverId),friends.slice(0,50));
 assert.equal(store.friendVoices(sender).total,50);
 const other=store.createInvite(sender,{spiritId:'jiangshi',channel:'copy'});
 assert.equal(store.recordAudio(friends[50],other.id,body).full,true);
 assert.throws(()=>store.deleteRecording(friends[1],link.id,friends[0]),{status:404});
 store.deleteRecording(sender,link.id,friends[0]);
 assert.equal(store.invite(other.id).recordingFull,false);
 assert.throws(()=>store.reactionAudio(sender,link.id,friends[0]),{status:404});
 store.onboard(friends[50],{name:'New friend',country:'JP',spiritId:'kappa'});
 assert.deepEqual(store.recordAudio(friends[50],other.id,{...body,language:'en',amplitudeRms:.4}),{ok:true});
 assert.equal(store.friendVoices(sender).total,50);
 assert.equal(store.friendVoices(sender).recordings[0].country,'JP');
 assert.equal(store.friendVoices(sender).recordings[0].spiritId,'jiangshi');
 store.deleteRecording(sender,other.id,friends[50]);
 assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM reaction_intensity').get().n,0);
 assert.deepEqual(store.recordAudio(friends[50],other.id,body),{ok:true});
 assert.equal(store.ghostLinks(friends[0]).links.length,0);
 assert.throws(()=>store.reactionAudio(friends[0],link.id,friends[1]),{status:404});
 for(let i=0;i<21;i++)store.createInvite(sender,{spiritId:'jiangshi',channel:'copy'});
 assert.equal(store.ghostLinks(sender).links.length,20);assert.equal(store.ghostLinks(sender).hasMore,true);assert.equal(store.ghostLinks(sender,20).links.length,3);
 assert.equal(store.ghostLinks(sender,0,'kappa').links.length,1);assert.equal(store.ghostLinks(sender,0,'jiangshi').hasMore,true);
 }finally{store.close();}
});
test('account upgrade rotates guest credential and cross-device login restores links',()=>{
 const store=new BooStore(':memory:',loadCatalog());
 try{
 const guest=store.createGuest();store.onboard(guest.player.id,{name:'Owner',country:'JP',spiritId:'kappa'});
 const link=store.createInvite(guest.player.id,{spiritId:'kappa',channel:'copy'});
 const login=store.accountLogin(guest.player.id,'verified-subject');assert.equal(store.authenticate(guest.token),null);assert.equal(login.player.account,true);
 const other=store.createGuest();store.onboard(other.player.id,{name:'New browser',country:'CN',spiritId:'jiangshi'});
 const second=store.createInvite(other.player.id,{spiritId:'jiangshi',channel:'copy'});
 store.award(other.player.id,'earned-before-login','test',120);store.gift(other.player.id,'jiangshi','complete','account-merge-gift');
 const restored=store.accountLogin(other.player.id,'verified-subject');assert.equal(restored.player.id,login.player.id);assert.equal(store.authenticate(other.token),null);
 assert.deepEqual(new Set(store.ghostLinks(restored.player.id).links.map(l=>l.inviteId)),new Set([link.id,second.id]));
 assert.throws(()=>store.accountLogin(restored.player.id,'different-subject'),{status:409});
 const ledger=store.db.prepare('SELECT SUM(delta) AS balance,SUM(CASE WHEN delta>0 THEN delta ELSE 0 END) AS earned FROM ledger WHERE player_id=?').get(restored.player.id);assert.equal(ledger.balance,restored.player.wallet);assert.equal(ledger.earned,restored.player.candies);
 store.logout(restored.token);assert.equal(store.authenticate(restored.token),null);
 }finally{store.close();}
});
test('HTTP account boundary, OTP and PKCE session binding with a simulated identity provider',async()=>{
 const requests=[];
 const app=createApp({databasePath:':memory:',rateLimits:false,authOptions:{url:'https://identity.example',key:'test-public-key',fetcher:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return Response.json(url.endsWith('/otp')?{}:{access_token:'server-only',user:{id:'verified-user',is_anonymous:false}});}}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
 const call=(path,data,cookie='')=>fetch(base+path,{method:data===undefined?'GET':'POST',headers:{Cookie:cookie,...(data===undefined?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data),redirect:'manual'});
 try{
 const session=await call('/api/session',{});let cookie=session.headers.get('set-cookie').split(';')[0];const stale=cookie;
 await call('/api/onboard',{name:'Owner',country:'JP',spiritId:'kappa'},cookie);
 assert.equal((await call('/api/invites',{spiritId:'kappa',channel:'copy'},cookie)).status,401);
 const start=await(await call('/api/auth/start',{provider:'google'},cookie)).json();const authUrl=new URL(start.url);assert.equal(authUrl.searchParams.get('code_challenge_method'),'s256');
 const callback=new URL(authUrl.searchParams.get('redirect_to'));callback.searchParams.set('code','code-123');
 const attacker=await call(callback.pathname+callback.search,undefined,'');assert.equal(attacker.headers.get('location'),'/my-links?signin=failed');
 const completed=await call(callback.pathname+callback.search,undefined,cookie);assert.equal(completed.headers.get('location'),'/my-links?signin=success');cookie=completed.headers.get('set-cookie').split(';')[0];
 assert.equal((await call('/api/me',undefined,stale)).status,401);assert.equal((await call('/api/invites',{spiritId:'kappa',channel:'copy'},cookie)).status,200);
 assert.equal((await call(callback.pathname+callback.search,undefined,cookie)).headers.get('location'),'/my-links?signin=failed');
 const next=await call('/api/session',{});const nextCookie=next.headers.get('set-cookie').split(';')[0];
 const email=await(await call('/api/auth/start',{provider:'email',email:'friend@example.com'},nextCookie)).json();
 const verified=await call('/api/auth/verify',{state:email.state,code:'123456'},nextCookie);assert.equal(verified.status,200);const data=await verified.json();assert.equal(data.player.account,true);assert.equal(data.player.shareCount,1);assert.equal(data.access_token,undefined);
 assert.equal(requests.find(r=>r.url.includes('grant_type=pkce')).body.code_verifier.length,64);
 }finally{await new Promise(r=>app.server.close(r));app.close();}
});
