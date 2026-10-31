// Runs on an actual regional host. Never emits session cookies or invite tokens.
const origin='https://helloween.fly.dev';
let cookie='';
async function request(url,body){
 const start=performance.now();
 const r=await fetch(url,{method:body?'POST':'GET',headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json',Origin:origin}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
 const headersMs=performance.now()-start;
 if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];
 const text=await r.text();
 return {data:text,timing:{status:r.status,headersMs:Math.round(headersMs),totalMs:Math.round(performance.now()-start),bytes:Buffer.byteLength(text),entry:r.headers.get('fly-request-id')?.slice(-3),cache:r.headers.get('cf-cache-status')}};
}
const health=JSON.parse((await request(origin+'/healthz')).data);
const trace=(await request('https://www.cloudflare.com/cdn-cgi/trace')).data;
const egressIp=trace.match(/^ip=(.*)$/m)?.[1];
const session=await request(origin+'/api/session',{});
if(session.timing.status!==200)throw Error('session status '+session.timing.status);
const rows=[];
for(let i=0;i<10;i++){
 const start=performance.now();
 try{
  const [config,invite]=await Promise.all([request(origin+'/api/social/config'),request(origin+'/api/invites',{spiritId:'jiangshi',channel:'line'})]);
  if(config.timing.status!==200||invite.timing.status!==200)throw Error('API status '+config.timing.status+'/'+invite.timing.status);
  const apiReadyMs=Math.round(performance.now()-start);
  const id=JSON.parse(invite.data).id;
  const card=await request(origin+'/api/share/facebook/'+encodeURIComponent(id)+'?lang=en');
  rows.push({round:i,config:config.timing,invite:invite.timing,apiReadyMs,card:card.timing,apiAndCardMs:Math.round(performance.now()-start)});
 }catch(e){rows.push({round:i,error:e.name+': '+e.message,elapsedMs:Math.round(performance.now()-start)});}
 await new Promise(r=>setTimeout(r,1200));
}
console.log(JSON.stringify({region:process.env.FLY_REGION,egressIp,time:new Date().toISOString(),build:health.buildId,release:health.release,scope:'HTTP API chain only; not browser or SNS editor ready',session:session.timing,rows}));
