import test from 'node:test';
import assert from 'node:assert/strict';
import {createBgm} from '../src/bgm.ts';

test('BGM recovers from blocked autoplay, respects mute/dialogs, and resumes its loop without duplicate sources',async()=>{
 const saved={document:globalThis.document,window:globalThis.window,MutationObserver:globalThis.MutationObserver,fetch:globalThis.fetch};
 let dialog=false,enabled=true,observer,starts=[],stops=0,requests=0;
 const document=Object.assign(new EventTarget(),{hidden:false,querySelector:s=>s==='#overlay-root'?{}:dialog?{}:null});
 const window=new EventTarget();
 Object.assign(globalThis,{document,window,MutationObserver:class{constructor(fn){observer=fn;}observe(){}},fetch:async()=>{requests++;return {ok:true,arrayBuffer:async()=>new ArrayBuffer(1)};}});
 try{
  const context=Object.assign(new EventTarget(),{state:'suspended',currentTime:0,destination:{},decodeAudioData:async()=>({duration:60}),createGain:()=>({connect(){},gain:{setValueAtTime(){}}}),createBufferSource:()=>({connect(){},disconnect(){},start:(_time,offset)=>starts.push(offset),stop:()=>stops++})});
  const bgm=createBgm(()=>enabled);
  bgm.start(context);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(starts.length,0);
  context.state='running';context.dispatchEvent(new Event('statechange'));
  assert.deepEqual(starts,[0]);
  bgm.start(context);bgm.sync();assert.equal(starts.length,1);assert.equal(requests,1);
  context.currentTime=4;enabled=false;window.dispatchEvent(new Event('boo:sound'));assert.equal(stops,1);
  enabled=true;dialog=true;window.dispatchEvent(new Event('boo:sound'));assert.equal(starts.length,1);
  dialog=false;observer();assert.deepEqual(starts,[0,4]);
  document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));assert.equal(stops,2);
  document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));assert.equal(starts.length,3);
 }finally{Object.assign(globalThis,saved);}
});
