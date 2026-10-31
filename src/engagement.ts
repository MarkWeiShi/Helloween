import {shareEnvironment,SHARE_ERRORS} from '../shared/share-diagnostics.mjs';
import {VisibleTime} from '../shared/visible-time.mjs';
const id=()=>{const b=crypto.getRandomValues(new Uint8Array(16));return [...b].map(v=>v.toString(16).padStart(2,'0')).join('');};
let started=false;
const openedAt=Date.now(),counter=new VisibleTime(!document.hidden,openedAt,performance.now());
document.addEventListener('visibilitychange',()=>{if(!started)counter.sample(!document.hidden,Date.now(),performance.now());});
function send(body:unknown,leaving=false){
 const json=JSON.stringify(body);
 if(leaving&&navigator.sendBeacon?.('/api/engagement',new Blob([json],{type:'application/json'})))return;
 void fetch('/api/engagement',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:json,keepalive:true}).catch(()=>{});
}
export function startEngagement(){
 if(started)return;started=true;
 const visitId=id();
 const pulse=(leaving=false)=>{const hours=counter.sample(!document.hidden,Date.now(),performance.now());send({kind:'dwell',visitId,openedAt,hours},leaving);};
 pulse();setInterval(()=>{if(!document.hidden)pulse();},15000);
 document.addEventListener('visibilitychange',()=>pulse(document.hidden));
 window.addEventListener('pagehide',()=>{counter.sample(false,Date.now(),performance.now());send({kind:'dwell',visitId,openedAt,hours:[...counter.hours]},true);});
 window.addEventListener('pageshow',()=>counter.sample(!document.hidden,Date.now(),performance.now()));
}
export function cardViewed(spiritId:string){if(started)send({kind:'card',viewId:id(),spiritId});}

export type ShareContext={channel?:string;inviteId?:string;spiritId?:string;flowId?:string;durationMs?:number;errorCode?:string;httpStatus?:number};
const pageId=id(),pageClock=performance.now(),flowClocks=new Map<string,number>();
export const newShareFlow=()=>{const flow=id();flowClocks.set(flow,performance.now());return flow;};
export function shareError(error:unknown):{errorCode:string;httpStatus?:number}{
 const e=error as {name?:string;code?:string;status?:number};
 const code=e?.name==='AbortError'?'CANCELLED':e?.name==='TimeoutError'?'TIMEOUT':SHARE_ERRORS.includes(e?.code||'')?e.code!:e?.status&&e.status>=500?'HTTP_5XX':e?.status&&e.status>=400?'HTTP_4XX':e?.name==='TypeError'||e?.name==='GhostApiError'&&!e?.status?'NETWORK':'OTHER';
 return {errorCode:code,...(e?.status&&e.status>=100&&e.status<=599?{httpStatus:e.status}:{})};
}
export function trackFunnel(step:string,context:ShareContext={}){
 const {durationMs,errorCode,httpStatus,...identity}=context;
 if(context.flowId&&!flowClocks.has(context.flowId))flowClocks.set(context.flowId,pageClock);
 const environment=shareEnvironment(navigator.userAgent);
 const diagnostics={pageId,clientMs:Math.min(86400000,Math.max(0,Math.round(performance.now()-(context.flowId?flowClocks.get(context.flowId)!:pageClock)))),...environment,...(durationMs===undefined?{}:{durationMs:Math.min(86400000,Math.max(0,Math.round(durationMs)))}),...(errorCode?{errorCode}:{}),...(httpStatus?{httpStatus}:{})};
 send({kind:'funnel',eventId:id(),step,...identity,diagnostics},true);
}
export async function measureShare<T>(step:string,context:ShareContext,operation:()=>Promise<T>,failure='share_sdk_failed'):Promise<T>{
 const start=performance.now();try{const result=await operation();trackFunnel(step,{...context,durationMs:performance.now()-start});return result;}
 catch(error){trackFunnel(failure,{...context,durationMs:performance.now()-start,...shareError(error)});throw error;}
}
