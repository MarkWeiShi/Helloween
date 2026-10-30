import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createXTokens} from '../server/x-tokens.mjs';
const key=randomBytes(32).toString('base64');
test('encrypted credentials survive database reopen, are subject-bound and remain server-side',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'x-vault-')),path=join(dir,'tokens.sqlite');let db=new DatabaseSync(path);
 try{
  createXTokens({db,key}).save('alice','private-access','private-refresh');
  const ciphertext=db.prepare('SELECT encrypted FROM x_credentials').get().encrypted;
  assert.ok(!ciphertext.includes('private-'));
  db.close();db=new DatabaseSync(path);
  const vault=createXTokens({db,key});assert.equal(await vault.token('alice'),'private-access');assert.equal(await vault.token('bob'),null);
  db.prepare('INSERT INTO x_credentials VALUES(?,?)').run('bob',ciphertext);
  await assert.rejects(vault.token('bob'),{status:503});
  await assert.rejects(createXTokens({db,key:randomBytes(32).toString('base64')}).token('alice'),{status:503});
  vault.forget('alice');assert.equal(await vault.token('alice'),null);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('refresh coalesces concurrent requests, uses X expiry and persists rotated refresh token',async()=>{
 const db=new DatabaseSync(':memory:');let clock=0;const calls=[];
 const options={db,key,now:()=>clock,clientId:'client',clientSecret:'secret',fetcher:async(url,request)=>{calls.push({url,request});await new Promise(r=>setTimeout(r,5));return Response.json({access_token:'new-'+calls.length,refresh_token:'rotated-'+calls.length,expires_in:7200});}};
 try{
  let vault=createXTokens(options);vault.save('alice','old','refresh');clock=3600000;
  assert.deepEqual(await Promise.all([vault.token('alice'),vault.token('alice')]),['new-1','new-1']);assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://api.x.com/2/oauth2/token');assert.equal(new URLSearchParams(calls[0].request.body).get('refresh_token'),'refresh');
  assert.equal(calls[0].request.headers.Authorization,'Basic '+Buffer.from('client:secret').toString('base64'));
  vault=createXTokens(options);clock+=3600000;assert.equal(await vault.token('alice'),'new-1');assert.equal(calls.length,1);
  clock+=3600000;assert.equal(await vault.token('alice'),'new-2');assert.equal(new URLSearchParams(calls[1].request.body).get('refresh_token'),'rotated-1');
 }finally{db.close();}
});
test('temporary refresh errors preserve credentials; revoked refresh is removed',async()=>{
 const db=new DatabaseSync(':memory:');let clock=0,status=503;
 const vault=createXTokens({db,key,now:()=>clock,clientId:'client',fetcher:async()=>Response.json({error:status===400?'invalid_grant':'temporarily_unavailable'},{status})});
 try{vault.save('alice','a','r');clock=3600000;await assert.rejects(vault.token('alice'),{status:503});assert.equal(db.prepare('SELECT count(*) n FROM x_credentials').get().n,1);status=400;assert.equal(await vault.token('alice'),null);assert.equal(db.prepare('SELECT count(*) n FROM x_credentials').get().n,0);}finally{db.close();}
});
test('logout during renewal cannot resurrect authorization',async()=>{
 let clock=0,complete;const vault=createXTokens({now:()=>clock,clientId:'client',fetcher:()=>new Promise(r=>complete=r)});
 vault.save('alice','a','r');clock=3600000;const renewal=vault.token('alice');vault.forget('alice');complete(Response.json({access_token:'new',refresh_token:'new-r',expires_in:7200}));assert.equal(await renewal,null);assert.equal(await vault.token('alice'),null);
});
test('login during renewal cannot be overwritten by older credentials',async()=>{
 let clock=0,complete;const vault=createXTokens({now:()=>clock,clientId:'client',fetcher:()=>new Promise(r=>complete=r)});
 vault.save('alice','a','r');clock=3600000;const renewal=vault.token('alice');vault.save('alice','fresh-login','fresh-refresh');complete(Response.json({access_token:'stale',expires_in:7200}));assert.equal(await renewal,null);assert.equal(await vault.token('alice'),'fresh-login');
});
test('without encryption key credentials never persist, and missing refresh requires login',async()=>{
 const db=new DatabaseSync(':memory:');let clock=0;const vault=createXTokens({db,key:'',now:()=>clock});
 try{vault.save('a','secret');assert.equal(await vault.token('a'),'secret');assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='x_credentials'").get().n,0);clock=3600000;assert.equal(await vault.token('a'),null);}finally{db.close();}
});
test('Supabase callback captures provider refresh token, not the Supabase session token',async()=>{
 const {createAuth}=await import('../server/auth.mjs');const db=new DatabaseSync(':memory:');let clock=0;const renewals=[];
 const options={db,url:'https://identity.example',key:'public-key',providers:['x'],fetcher:async()=>Response.json({access_token:'supabase-session',refresh_token:'supabase-refresh',expires_in:999999,provider_token:'x-access',provider_refresh_token:'x-refresh',user:{id:'verified-user'}}),xTokenOptions:{key,now:()=>clock,clientId:'client',fetcher:async(url,request)=>{renewals.push(new URLSearchParams(request.body));return Response.json({access_token:'renewed-x',refresh_token:'rotated-x',expires_in:7200});}}};
 try{
  const auth=createAuth(options);const start=await auth.start('session',{provider:'x'},'https://game.example');const state=new URL(new URL(start.url).searchParams.get('redirect_to')).searchParams.get('state');
  assert.equal(await auth.finish('session',state,'code'),'verified-user');assert.equal(await auth.xToken('verified-user'),'x-access');
  clock=3600000;const restarted=createAuth(options);assert.equal(await restarted.xToken('verified-user'),'renewed-x');assert.equal(renewals[0].get('refresh_token'),'x-refresh');
  restarted.forget('verified-user');assert.equal(await restarted.xToken('verified-user'),null);
 }finally{db.close();}
});
