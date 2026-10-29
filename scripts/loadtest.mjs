import {fork} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const users=Number(process.env.LOAD_USERS || 20),duration=Number(process.env.LOAD_DURATION_MS || 30000),think=Number(process.env.LOAD_THINK_MS || 15000);
if(!Number.isInteger(users)||users<1||users>10000||!Number.isFinite(duration)||duration<1000||!Number.isFinite(think)||think<100)throw Error('Invalid load parameters');
if(process.argv.includes('--fixture-server')) {
 const {createApp}=await import('../server/index.mjs');
 const directory=mkdtempSync(join(tmpdir(),'ghost-load-'));
 const app=createApp({databasePath:join(directory,'test.sqlite')});
 const sessions=Array.from({length:users},(_,i)=>{
  const owner=app.store.createGuest(),receiver=app.store.createGuest();
  for(const guest of [owner,receiver])app.store.onboard(guest.player.id,{name:`Load ${i}`,country:'JP',spiritId:'kappa'});
  return {owner:app.store.accountLogin(owner.player.id,`load-owner-${i}`).token,receiver:receiver.token,receiverId:receiver.player.id};
 });
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 process.send({target:`http://127.0.0.1:${app.server.address().port}`,sessions});
 process.on('message',async()=>{
  const metrics=app.telemetry.snapshot();
  const mismatches=app.store.db.prepare(`SELECT COUNT(*) n FROM players p JOIN (SELECT player_id,SUM(delta) balance FROM ledger GROUP BY player_id) l ON p.id=l.player_id WHERE p.wallet!=l.balance`).get().n;
  await new Promise(r=>app.server.close(r));app.close();rmSync(directory,{recursive:true,force:true});process.send({metrics,ledgerMismatches:mismatches});process.disconnect();
 });
} else {
 let child,target=process.env.LOAD_TARGET,sessions,serverReport;
 if(target){
  if(!process.env.LOAD_SESSIONS_FILE)throw Error('External runs require LOAD_SESSIONS_FILE with dedicated test accounts; writes create invites and audio.');
  sessions=JSON.parse(readFileSync(process.env.LOAD_SESSIONS_FILE));
 }else{
  child=fork(fileURLToPath(import.meta.url),['--fixture-server'],{stdio:['ignore','inherit','inherit','ipc']});
  const ready=await new Promise((r,j)=>{child.once('message',r);child.once('error',j);child.once('exit',()=>j(Error('Fixture server exited before ready')));});
  target=ready.target;sessions=ready.sessions;
 }
 const latencies=[],routes={},failures=[];let total=0,failed=0,limited=0;
 async function call(actor,path,body){
  const began=performance.now();total++;const route=path.replace(/\/invites\/[^/?]+/,'/invites/:id').replace(/\/audio\/[^/?]+/,'/audio/:id');
  const count=routes[route]??={requests:0,errors:0};count.requests++;
  try{
   const response=await fetch(target.replace(/\/$/,'')+'/api'+path,{method:body===undefined?'GET':'POST',headers:{Cookie:`boo_session=${actor}`,...(body===undefined?{}:{'Content-Type':'application/json',Origin:new URL(target).origin})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
   const data=response.headers.get('content-type')?.includes('application/json')?await response.json():await response.arrayBuffer();
   if(!response.ok){if(response.status===429)limited++;throw Error(`HTTP ${response.status}`);}return data;
  }catch(error){failed++;count.errors++;if(failures.length<20)failures.push({route,error:error.name==='TimeoutError'?'timeout':error.message.replace(/https?:\/\/\S+/g,'[endpoint]')});return null;}
  finally{if(latencies.length<1000000)latencies.push(performance.now()-began);}
 }
 try{
  if(!Array.isArray(sessions)||sessions.length<users)throw Error('Not enough dedicated sessions');
  const audio=Buffer.alloc(40000);audio.set([0x1a,0x45,0xdf,0xa3]);
  const body={consent:true,mime:'audio/webm',audio:audio.toString('base64'),durationMs:5000};
  const started=performance.now(),end=started+duration;
  await Promise.all(sessions.slice(0,users).map(async(session,i)=>{
   await new Promise(r=>setTimeout(r,i/users*Math.min(1000,duration/4)));
   await call(session.owner,'/session',{});let round=0;
   while(performance.now()<end){
    await call(session.owner,'/me');
    if(round%4===0){
     await call(session.owner,'/select',{spiritId:'kappa'});
     const invite=await call(session.owner,'/invites',{spiritId:'kappa',channel:'copy'});
     if(invite?.id){await call(session.receiver,`/invites/${invite.id}`);await call(session.receiver,`/invites/${invite.id}/visit`,{});await call(session.receiver,`/invites/${invite.id}/respond`,{});await call(session.receiver,`/invites/${invite.id}/audio`,body);await call(session.owner,`/invites/${invite.id}/audio/${session.receiverId}`);}
     await call(session.owner,'/my-links?offset=0');await call(session.owner,'/scream-rankings?scope=trick');
    }
    round++;await new Promise(r=>setTimeout(r,Math.max(0,Math.min(think+Math.random()*1000,end-performance.now()))));
   }
  }));
  if(child){const stopped=new Promise(r=>child.once('message',r));child.send('stop');serverReport=await stopped;}
  latencies.sort((a,b)=>a-b);
  const report={environment:child?'Local separate-process synthetic smoke; not production capacity':'External dedicated test accounts; synthetic audio',users,durationMs:performance.now()-started,requests:total,rps:total/((performance.now()-started)/1000),failed,limited,errorRate:failed/Math.max(1,total),p95Ms:latencies[Math.floor(latencies.length*.95)],p99Ms:latencies[Math.floor(latencies.length*.99)],routes,failures,server:serverReport};
  mkdirSync('artifacts',{recursive:true});writeFileSync(process.env.LOAD_REPORT || 'artifacts/loadtest-split.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  if(failed || serverReport?.ledgerMismatches)process.exitCode=1;
 }finally{if(child?.connected)child.kill('SIGTERM');}
}
