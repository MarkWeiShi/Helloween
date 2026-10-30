import test from 'node:test';
import {createHash} from 'node:crypto';
const cardSha=createHash('sha256').update('GIF89a-test').digest('hex');
import assert from 'node:assert/strict';
import {createXPublisher} from '../server/x-publish.mjs';
import {createApp} from '../server/index.mjs';

function mockX({failPost=false,failMedia=false}={}) {
 const calls=[];
 const fetcher=async(url,options={})=>{
  url=String(url);calls.push({url,...options});
  if(url.endsWith('/manifest.json'))return Response.json({characters:{kappa:{gif:'/art/x-cards/kappa.en.123.gif',sha256:cardSha}}});
  if(url.endsWith('.gif'))return new Response('GIF89a-test');
  if(url.includes('/media/upload?'))return Response.json({data:{id:'123',processing_info:{state:'succeeded'}}});
  if(url.endsWith('/media/upload'))return failMedia?new Response('{}',{status:403}):Response.json({data:{id:'123',processing_info:{state:'pending',check_after_secs:1}}});
  if(url.endsWith('/tweets')){if(failPost)throw Error('network lost after send');return Response.json({data:{id:'456'}});}
  throw Error('Unexpected URL');
 };return {calls,fetcher,sleep:async()=>{}};
}
test('X publishes only after media processing and attaches the uploaded GIF',async()=>{
 const mock=mockX();let accepted=false;
 const result=await createXPublisher(mock)({cardSha,token:'private-token',spiritId:'kappa',language:'en',text:'hello',origin:'https://game.example',beforePost:()=>{accepted=true;}});
 assert.equal(accepted,true);assert.equal(result.url,'https://x.com/i/status/456');
 const post=mock.calls.find(c=>c.url.endsWith('/tweets'));
 assert.deepEqual(JSON.parse(post.body),{text:'hello',media:{media_ids:['123']}});
 assert.ok(mock.calls.filter(c=>!c.url.startsWith('https://api.x.com')).every(c=>!c.headers?.Authorization));
 const failed=mockX({failMedia:true});await assert.rejects(createXPublisher(failed)({cardSha,token:'token',spiritId:'kappa',text:'hello',origin:'https://game.example',beforePost:()=>assert.fail()}));
 assert.ok(!failed.calls.some(c=>c.url.endsWith('/tweets')));
});
for(const failPost of [false,true])test(`X HTTP confirmation, ownership and retry safety: ambiguous=${failPost}`,async()=>{
 const mock=mockX({failPost});
 const app=createApp({databasePath:':memory:',rateLimits:false,xPublisherOptions:mock,authOptions:{url:'https://identity.example',key:'public',providers:['x'],fetcher:async()=>Response.json({access_token:'supabase-private',provider_token:'x-private',user:{id:'verified'}})}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
 const call=(path,body,cookie)=>fetch(base+path,{method:body?'POST':'GET',redirect:'manual',headers:{Cookie:cookie||'',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 try {
  let r=await call('/api/session',{});let cookie=r.headers.get('set-cookie').split(';')[0];
  const guest=(await r.json()).player;
  const start=await(await call('/api/auth/start',{provider:'x'},cookie)).json();
  const callback=new URL(new URL(start.url).searchParams.get('redirect_to'));callback.searchParams.set('code','code');
  r=await call(callback.pathname+callback.search,undefined,cookie);cookie=r.headers.get('set-cookie').split(';')[0];
  assert.deepEqual(await(await call('/api/social/x/status',undefined,cookie)).json(),{connected:true});
  const invite=app.store.createInvite(guest.id,{spiritId:'kappa',channel:'x'});
  const body={cardSha,inviteId:invite.id,language:'en',text:`Try ${base}/api/share/card/${invite.id}?lang=en`,confirm:true};
  assert.equal((await call('/api/social/x/publish',{...body,confirm:false},cookie)).status,400);assert.equal(mock.calls.length,0);
  const stranger=await call('/api/session',{});const strangerCookie=stranger.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/social/x/publish',body,strangerCookie)).status,403);
  r=await call('/api/social/x/publish',body,cookie);assert.equal(r.status,failPost?500:200);
  const retried=await call('/api/social/x/publish',body,cookie);assert.equal(retried.status,failPost?409:200);
  assert.equal(mock.calls.filter(c=>c.url.endsWith('/tweets')).length,1);
  await call('/api/auth/logout',{},cookie);
 }finally{await new Promise(r=>app.server.close(r));app.close();}
});
