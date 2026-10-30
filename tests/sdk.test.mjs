import test from 'node:test';
import assert from 'node:assert/strict';
import {createGhostClient,GhostApiError} from '../dist-sdk/index.js';
test('SDK preserves credentials, encodes audio URLs and surfaces rate limits without replay',async()=>{
 let calls=0,options;
 const client=createGhostClient({baseUrl:'/custom/api/',fetch:async(url,o)=>{calls++;options=o;return Response.json({error:'Busy'},{status:429,headers:{'Retry-After':'60'}});}});
 assert.equal(client.audio.url('a/b','c?d'),'/custom/api/invites/a%2Fb/audio/c%3Fd');
 await assert.rejects(client.me(),e=>e instanceof GhostApiError && e.status===429 && e.retryAfterMs===60000);
 assert.equal(calls,1);assert.equal(options.credentials,'same-origin');
});
test('SDK retries only failed GET transport, never writes, and respects abort',async()=>{
 let calls=0;const client=createGhostClient({fetch:async()=>{if(++calls===1)throw new TypeError('offline');return Response.json({player:{id:'test'}});}});
 assert.equal((await client.me()).player.id,'test');assert.equal(calls,2);
 const write=createGhostClient({fetch:async()=>{calls++;throw new TypeError('offline');}});calls=0;
 await assert.rejects(write.session());assert.equal(calls,1);
 const c=new AbortController();c.abort();calls=0;
 const aborted=createGhostClient({fetch:async(_,o)=>{calls++;o.signal.throwIfAborted();}});
 await assert.rejects(aborted.me({signal:c.signal}),{name:'AbortError'});assert.equal(calls,1);
});
test('SDK preserves Retry-After even when an ingress returns an HTML error page',async()=>{
 const client=createGhostClient({fetch:async()=>new Response('<html>Busy</html>',{status:503,headers:{'Retry-After':'30'}})});
 await assert.rejects(client.me(),e=>e instanceof GhostApiError && e.status===503 && e.retryAfterMs===30000);
});
test('legacy WebViews without AbortSignal static helpers can start a session',async()=>{
 const any=Object.getOwnPropertyDescriptor(AbortSignal,'any'),timeout=Object.getOwnPropertyDescriptor(AbortSignal,'timeout');
 try {
  Object.defineProperty(AbortSignal,'any',{configurable:true,value:undefined});
  Object.defineProperty(AbortSignal,'timeout',{configurable:true,value:undefined});
  let calls=0;
  const client=createGhostClient({fetch:async(_,options)=>{calls++;assert.ok(options.signal instanceof AbortSignal);return Response.json({player:{id:'legacy'}});}});
  assert.equal((await client.session()).player.id,'legacy');assert.equal(calls,1);
 } finally {Object.defineProperty(AbortSignal,'any',any);Object.defineProperty(AbortSignal,'timeout',timeout);}
});
test('legacy cancellation, timeout and completion release owned resources',async()=>{
 const {requestSignal,fetchJson}=await import('../dist-sdk/request-signal.js');
 const any=Object.getOwnPropertyDescriptor(AbortSignal,'any');
 const realSet=globalThis.setTimeout,realClear=globalThis.clearTimeout;
 const timers=new Set();
 try {
  Object.defineProperty(AbortSignal,'any',{configurable:true,value:undefined});
  globalThis.setTimeout=(fn,ms,...args)=>{const id=realSet(fn,ms,...args);timers.add(id);return id;};
  globalThis.clearTimeout=id=>{timers.delete(id);return realClear(id);};
  const external=new AbortController();let added=0,removed=0;
  const add=external.signal.addEventListener.bind(external.signal),remove=external.signal.removeEventListener.bind(external.signal);
  external.signal.addEventListener=(...args)=>{added++;return add(...args);};
  external.signal.removeEventListener=(...args)=>{removed++;return remove(...args);};
  const scope=requestSignal(1000,external.signal);external.abort(new Error('cancelled'));
  assert.equal(scope.signal.aborted,true);assert.equal(scope.signal.reason.message,'cancelled');scope.dispose();
  assert.equal(added,removed);assert.equal(timers.size,0);
  const timed=requestSignal(5);await new Promise(resolve=>realSet(resolve,15));
  assert.equal(timed.signal.aborted,true);assert.equal(timed.signal.reason.name,'TimeoutError');timed.dispose();
  assert.equal(timers.size,0);
  const client=createGhostClient({fetch:async()=>Response.json({player:{id:'done'}})});
  await client.session();assert.equal(timers.size,0);
  const bad=createGhostClient({fetch:async()=>new Response('invalid')});
  await assert.rejects(bad.session(),{message:'Invalid API response'});assert.equal(timers.size,0);
  const originalFetch=globalThis.fetch;
  try {
   globalThis.fetch=async(_,init)=>({ok:true,json:()=>new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true}))});
   await assert.rejects(fetchJson('/slow-body',{},5),{name:'TimeoutError'});assert.equal(timers.size,0);
  }finally{globalThis.fetch=originalFetch;}
 }finally{Object.defineProperty(AbortSignal,'any',any);globalThis.setTimeout=realSet;globalThis.clearTimeout=realClear;}
});
test('modern engines retain native signal composition without fallback timers',async()=>{
 const {requestSignal}=await import('../dist-sdk/request-signal.js');
 const any=Object.getOwnPropertyDescriptor(AbortSignal,'any'),timeout=Object.getOwnPropertyDescriptor(AbortSignal,'timeout');
 let compositions=0,timeouts=0;
 try{
  Object.defineProperty(AbortSignal,'any',{configurable:true,value(signals){compositions++;return any.value.call(AbortSignal,signals);}});
  Object.defineProperty(AbortSignal,'timeout',{configurable:true,value(ms){timeouts++;return timeout.value.call(AbortSignal,ms);}});
  const external=new AbortController(),scope=requestSignal(1000,external.signal);
  external.abort();assert.equal(scope.signal.aborted,true);scope.dispose();
  assert.equal(compositions,1);assert.equal(timeouts,1);
 }finally{Object.defineProperty(AbortSignal,'any',any);Object.defineProperty(AbortSignal,'timeout',timeout);}
});
