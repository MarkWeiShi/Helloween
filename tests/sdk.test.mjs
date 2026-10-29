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
