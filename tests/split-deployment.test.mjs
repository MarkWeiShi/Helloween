import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,cpSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fork} from 'node:child_process';
import {startBrowserApp} from './helpers/nginx.mjs';
const skip=!process.env.NGINX_BIN && process.env.REQUIRE_NGINX!=='1' ? 'Set NGINX_BIN to run real NGINX integration' : false;
test('split deployment: real NGINX routing, sessions, privacy, HTML and video Range',{skip},async()=>{
 const app=await startBrowserApp();
 try {
  for(const route of ['/','/my-links','/rankings']) {
   const response=await fetch(app.origin+route,{headers:{Cookie:'boo_session=ignored'}});
   const text=await response.text();assert.equal(response.status,200);assert.match(text,/<meta property="og:title"/);assert.doesNotMatch(text,/ignored/);
   assert.equal(response.headers.get('Set-Cookie'),null);assert.equal(response.headers.get('Cache-Control'),'no-cache');
   assert.match(response.headers.get('Content-Security-Policy'),/media-src/);
  }
  for(const route of ['/missing.js','/missing.json','/art/missing.mp4','/api/unknown','/i/unknown']) {
   const r=await fetch(app.origin+route);assert.ok(r.status>=400);assert.equal(r.headers.get('Cache-Control'),'no-store');
  }
  const send=(path,body,cookie)=>fetch(app.origin+'/api'+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json',Origin:app.origin}),...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const first=await send('/session',{});assert.equal(first.status,200);const cookie=first.headers.get('set-cookie').split(';')[0];
  const player=(await first.json()).player;assert.match(first.headers.get('Cache-Control'),/no-store/);
  const second=await send('/session',{});assert.notEqual((await second.json()).player.id,player.id);
  assert.equal((await (await send('/me',undefined,cookie)).json()).player.id,player.id);
  const owner=app.store.accountLogin(player.id,'split-owner');app.store.onboard(player.id,{name:'Owner',country:'JP',spiritId:'kappa'});
  const invite=app.store.createInvite(player.id,{spiritId:'kappa',channel:'copy'});
  const card=await fetch(app.origin+'/i/'+invite.id+'?lang=ja');assert.equal(card.status,200);assert.match(await card.text(),/kappa.ja.jpg/);assert.equal(card.headers.get('set-cookie'),null);
  const receiver=app.store.createGuest(),audio=Buffer.from([0x1a,0x45,0xdf,0xa3,1,2,3]);
  app.store.recordAudio(receiver.player.id,invite.id,{consent:true,mime:'audio/webm',audio:audio.toString('base64'),durationMs:5000});
  const path=`/invites/${invite.id}/audio/${receiver.player.id}`;
  const privateAudio=await send(path,undefined,`boo_session=${owner.token}`);assert.equal(privateAudio.status,200);assert.match(privateAudio.headers.get('Cache-Control'),/no-store/);assert.deepEqual(Buffer.from(await privateAudio.arrayBuffer()),audio);
  assert.equal((await send(path,undefined,`boo_session=${receiver.token}`)).status,404);
  assert.equal((await send('/spirits/kappa/story',undefined,`boo_session=${owner.token}`)).status,403);
  assert.equal((await fetch(app.staticOrigin+'/api/session')).status,404);
  assert.equal((await fetch(app.apiOrigin+'/')).status,404);
  const release=JSON.parse(readFileSync('dist/release.json')).release;
  const manifest=JSON.parse(readFileSync(`dist/releases/${release}/art/transformations/manifest.json`));
  const media=manifest.characters.jiangshi.loop;
  const part=await fetch(app.origin+media,{headers:{Range:'bytes=2-5'}});assert.equal(part.status,206);assert.equal((await part.arrayBuffer()).byteLength,4);assert.match(part.headers.get('Content-Type'),/video\/mp4/);assert.match(part.headers.get('Cache-Control'),/immutable/);
  const head=await fetch(app.origin+media,{method:'HEAD'});const size=Number(head.headers.get('Content-Length'));assert.ok(size>4);assert.equal(await head.text(),'');
  const tail=await fetch(app.origin+media,{headers:{Range:'bytes=-3'}});assert.equal(tail.status,206);assert.equal((await tail.arrayBuffer()).byteLength,3);
  const invalid=await fetch(app.origin+media,{headers:{Range:`bytes=${size+10}-`}});assert.equal(invalid.status,416);assert.match(invalid.headers.get('Cache-Control'),/no-store/);assert.equal(invalid.headers.get('Content-Range'),`bytes */${size}`);
  // Stop the API, keeping both static and edge nginx servers alive.
  await new Promise(r=>app.server.close(r));
  assert.equal((await fetch(app.origin+'/')).status,200);assert.equal((await fetch(app.origin+media,{method:'HEAD'})).status,200);
  const unavailable=await fetch(app.origin+'/api/me');assert.equal(unavailable.status,502);assert.equal(unavailable.headers.get('Cache-Control'),'no-store');
 }finally{await app.stop();}
});
test('split deployment: packaged API boots outside the repository without frontend files',{skip},async()=>{
 const directory=mkdtempSync(join(tmpdir(),'ghost-isolated-api-'));
 cpSync('dist-api',directory,{recursive:true,filter:path=>!path.split('/').includes('node_modules')});
 writeFileSync(join(directory,'probe.mjs'),`import {createApp} from './server/index.mjs';
 const app=createApp({databasePath:':memory:',rateLimits:false});
 app.server.listen(0,'127.0.0.1',()=>process.send({port:app.server.address().port}));
 process.on('message',()=>{app.server.close(()=>{app.close();process.disconnect();});});`);
 const child=fork(join(directory,'probe.mjs'),{cwd:directory,stdio:['ignore','ignore','inherit','ipc']});
 try {
  const ready=await new Promise((resolve,reject)=>{child.once('message',resolve);child.once('error',reject);child.once('exit',()=>reject(new Error('Isolated API exited before ready')));});
  const base=`http://127.0.0.1:${ready.port}`;
  const health=await (await fetch(base+'/healthz')).json();assert.equal(health.ok,true);assert.ok(health.release);
  const catalog=await (await fetch(base+'/api/catalog')).json();assert.ok(catalog.spirits.length>=40);assert.equal(catalog.spirits[0].story,undefined);
  assert.equal((await fetch(base+'/index.html')).status,404);
 }finally{
  if(child.connected){const ended=new Promise(r=>child.once('exit',r));child.send('stop');await ended;}
  rmSync(directory,{recursive:true,force:true});
 }
});
