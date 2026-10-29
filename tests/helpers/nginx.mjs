import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createServer} from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
import {createApp} from '../../server/index.mjs';
const root=resolve(import.meta.dirname,'../..');
async function port() {
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const value=server.address().port;await new Promise(r=>server.close(r));return value;
}
export async function startNginx(apiOrigin,{staticRoot=join(root,'dist'),port:chosenPort}={}) {
 const binary=process.env.NGINX_BIN || 'nginx';
 const directory=mkdtempSync(join(tmpdir(),'ghost-nginx-'));
 const webPort=await port(),gatewayPort=chosenPort || await port();
 const quote=s=>'"'+s.replaceAll('\\','\\\\').replaceAll('"','\\"')+'"';
 const staticConfig=readFileSync(join(root,'deploy/nginx/static.conf'),'utf8')
   .replace('listen 80;',`listen 127.0.0.1:${webPort};`).replace('root /usr/share/nginx/html;',`root ${quote(resolve(staticRoot))};`)
   .replace('/etc/nginx/ghost-security.conf',quote(join(root,'deploy/nginx/security.conf')));
 const gateway=readFileSync(join(root,'deploy/nginx/gateway.conf.template'),'utf8')
   .replace('listen 8080;',`listen 127.0.0.1:${gatewayPort};`)
   .replaceAll('${API_UPSTREAM}',new URL(apiOrigin).host).replaceAll('${WEB_UPSTREAM}',`127.0.0.1:${webPort}`);
 const config=join(directory,'nginx.conf');
 writeFileSync(config,`daemon off; master_process off; error_log stderr warn; pid ${quote(join(directory,'nginx.pid'))};
 events {worker_connections 256;}
 http {
  access_log off;
  client_body_temp_path ${quote(join(directory,'body'))};
  proxy_temp_path ${quote(join(directory,'proxy'))};
  types {text/html html; text/css css; application/javascript js; application/json json; image/svg+xml svg; image/webp webp; image/png png; image/jpeg jpg jpeg; image/x-icon ico; video/mp4 mp4; video/webm webm; audio/mpeg mp3; audio/wav wav; audio/ogg ogg; font/woff2 woff2;}
  default_type application/octet-stream;
  ${readFileSync(join(root,'deploy/nginx/cache.conf'),'utf8')}
  ${staticConfig}
  ${gateway}
 }`);
 const validation=spawnSync(binary,['-t','-p',directory+'/', '-c',config],{encoding:'utf8'});
 if(validation.error || validation.status!==0){rmSync(directory,{recursive:true,force:true});throw new Error(`NGINX required; set NGINX_BIN. ${validation.error?.message || validation.stderr}`);}
 const processHandle=spawn(binary,['-p',directory+'/', '-c',config],{stdio:['ignore','ignore','pipe']});let errors='';
 processHandle.stderr.on('data',data=>{errors+=data;});
 const origin=`http://127.0.0.1:${gatewayPort}`;
 const close=async()=>{if(processHandle.exitCode===null){const done=new Promise(r=>processHandle.once('exit',r));processHandle.kill('SIGQUIT');await done;}rmSync(directory,{recursive:true,force:true});};
 try {
  for(let i=0;i<100;i++) {
   if(processHandle.exitCode!==null)throw new Error(errors);
   try{await fetch(origin+'/favicon.svg');return {origin,staticOrigin:`http://127.0.0.1:${webPort}`,close};}catch{}
   await new Promise(r=>setTimeout(r,50));
  }
  throw new Error('NGINX startup timed out: '+errors);
 }catch(error){await close();throw error;}
}
export async function startBrowserApp(options={}) {
 const app=createApp({databasePath:':memory:',rateLimits:false,...options});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const apiOrigin=`http://127.0.0.1:${app.server.address().port}`;
 let web;try{web=await startNginx(apiOrigin);}catch(error){app.close();throw error;}
 return {...app,...web,apiOrigin,stop:async()=>{await web.close();await new Promise(r=>app.server.close(r));app.close();}};
}
