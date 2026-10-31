import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';

test('local dashboard starts with country and funnel controls and rejects invalid country',async()=>{
 const reservation=createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
 const child=spawn(process.execPath,['scripts/analytics-dashboard.mjs'],{env:{...process.env,ANALYTICS_PORT:String(port)},stdio:['ignore','pipe','pipe']});
 try{
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Dashboard failed to start')}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Dashboard startup timed out')),5000);timer.unref()})]);
  const html=await (await fetch(`http://127.0.0.1:${port}/`)).text();assert.match(html,/id="country"/);assert.match(html,/id="sns-diagnostics"/);assert.match(html,/id="sns-browser"/);assert.match(html,/id="sns-context"/);assert.match(html,/id="funnel-details"/);assert.match(html,/id="flow-last"/);assert.match(html,/id="flow-stages"/);
  const invalid=await fetch(`http://127.0.0.1:${port}/metrics?country=invalid`);assert.equal(invalid.status,400);assert.equal((await fetch(`http://127.0.0.1:${port}/metrics?browser=invalid`)).status,400);assert.equal((await fetch(`http://127.0.0.1:${port}/metrics?appContext=invalid`)).status,400);
 }finally{child.kill();await once(child,'exit')}
});

test('production aggregate reader compresses the expanded report before invoking Fly',async()=>{
 const{mkdtempSync,writeFileSync,rmSync}=await import('node:fs');const{tmpdir}=await import('node:os');const{join}=await import('node:path');
 const directory=mkdtempSync(join(tmpdir(),'sns-reader-')),binary=join(directory,'fly-probe.mjs');
 writeFileSync(binary,`#!/usr/bin/env node\nconst command=process.argv[7];if(!command.includes('inflateSync')||Buffer.byteLength(command)>12000)process.exit(2);console.log(JSON.stringify({compressedTransport:true,bytes:Buffer.byteLength(command)}));`,{mode:0o755});
 const reservation=createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
 const child=spawn(process.execPath,['scripts/analytics-dashboard.mjs'],{env:{...process.env,ANALYTICS_PORT:String(port),ANALYTICS_DATABASE_PATH:'',FLY_BIN:binary},stdio:['ignore','pipe','pipe']});
 try{
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Dashboard failed to start')})]);
  const response=await fetch(`http://127.0.0.1:${port}/metrics?country=all`);assert.equal(response.status,200);const report=await response.json();assert.equal(report.compressedTransport,true);assert.ok(report.bytes<12000);
 }finally{child.kill();await once(child,'exit');rmSync(directory,{recursive:true,force:true})}
});
