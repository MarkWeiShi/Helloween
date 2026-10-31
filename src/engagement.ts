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

export const newShareFlow=()=>id();
export function trackFunnel(step:string,context:{channel?:string;inviteId?:string;spiritId?:string;flowId?:string}={}){
 send({kind:'funnel',eventId:id(),step,...context},true);
}
