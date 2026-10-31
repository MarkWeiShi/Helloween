import test from 'node:test';
import assert from 'node:assert/strict';
import {startBrowserApp} from './helpers/nginx.mjs';
const skip=!process.env.NGINX_BIN && process.env.REQUIRE_NGINX!=='1';
test('Fly ingress isolates anonymous rate limits and overwrites spoofed X-Real-IP',{skip},async()=>{
 const app=await startBrowserApp({flyAdapter:true,rateLimits:true,trustedProxy:true});
 try {
  const send=(ip,spoof)=>fetch(app.origin+'/api/config',{headers:{'Fly-Client-IP':ip,'X-Real-IP':spoof}});
  for(let i=0;i<40;i++){
   const response=await send('192.0.2.10','198.51.100.'+i);assert.equal(response.status,200);await response.arrayBuffer();
  }
  assert.equal((await send('192.0.2.10','203.0.113.99')).status,429);
  const other=await send('192.0.2.11','203.0.113.99');assert.equal(other.status,200);assert.equal(other.headers.get('cache-control'),'no-store');
  const direct=await fetch(app.origin+'/api/config',{headers:{'X-Real-IP':'203.0.113.99'}});assert.equal(direct.status,200);
 }finally{await app.stop();}
});
