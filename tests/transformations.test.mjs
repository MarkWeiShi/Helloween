import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const assetSource=stripTypeScriptTypes((await fs.readFile(new URL('../src/public-assets.ts',import.meta.url),'utf8')).replace("import {assetOrigin,releasePrefix,mediaPrefix,changedAssets} from 'virtual:ghost-content';","const assetOrigin='',releasePrefix='/releases/21e0f86429f2cfe9808d',mediaPrefix=releasePrefix,changedAssets={};"));
const assetModule='data:text/javascript;base64,'+Buffer.from(assetSource).toString('base64');
const code = stripTypeScriptTypes((await fs.readFile(new URL('../src/transformation-player.ts', import.meta.url), 'utf8')).replace('./public-assets',assetModule).replace('../packages/ghost-sdk/request-signal',new URL('../dist-sdk/request-signal.js',import.meta.url).href).replace('../shared/i18n.mjs', new URL('../shared/i18n.mjs',import.meta.url).href));
const runtime = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const entry = {entrance:'/art/transformations/jiangshi/entrance.mp4',loop:'/art/transformations/jiangshi/loop.mp4',poster:'/art/transformations/jiangshi/poster.png',duration:6,loopDuration:2,revealAt:2.3};
test('manifest rejects missing loop, arbitrary external media and invalid reveal timing', () => {
 assert.equal(runtime.validTransformation(entry),true);
 for (const invalid of [{...entry,loop:null},{...entry,entrance:'https://example.com/video.mp4'},{...entry,revealAt:6},{...entry,loopDuration:0}]) assert.equal(runtime.validTransformation(invalid),false);
});
test('first-play persistence is per player and character, with storage-denied fallback', () => {
 globalThis.localStorage = {getItem(){throw Error('denied');},setItem(){throw Error('denied');}};
 assert.equal(runtime.hasPlayedTransformation('one','ghost'),false);
 runtime.markTransformationPlayed('one','ghost');
 assert.equal(runtime.hasPlayedTransformation('one','ghost'),true);
 assert.equal(runtime.hasPlayedTransformation('two','ghost'),false);
 assert.equal(runtime.hasPlayedTransformation('one','other'),false);
});
test('seen state survives a new runtime instance and remains isolated by character and player', async () => {
 const storage=new Map();
 globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
 runtime.markTransformationPlayed('persisted-player','banshee');
 const restored=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}#reload`);
 assert.equal(restored.hasPlayedTransformation('persisted-player','banshee'),true);
 assert.equal(restored.hasPlayedTransformation('other-player','banshee'),false);
 assert.equal(restored.hasPlayedTransformation('persisted-player','kappa'),false);
});
for (const renderer of ['webgl','2d']) test(`${renderer}: video changes from entrance to infinite action loop and releases resources on close`, async () => {
 const callbacks = new Map(); let nextFrame=0;
 globalThis.requestAnimationFrame = cb => { callbacks.set(++nextFrame,cb); return nextFrame; };
 globalThis.cancelAnimationFrame = id => callbacks.delete(id);
 const gl = new Proxy({}, {get:(_,name) => name === 'getShaderParameter' || name === 'getProgramParameter' ? () => true : name === 'getExtension' ? () => null : () => ({})});
 let composited;
 const software={clearRect(){},drawImage(){},getImageData(){return {data:new Uint8ClampedArray([0,255,0,255,200,20,20,255])};},putImageData(image){composited=image.data;}};
 class Element extends EventTarget {
  children=[]; dataset={}; attributes={}; hidden=false; paused=true; ended=false; readyState=3; currentTime=0; loop=false;
  classList={add(){},toggle(){}};
  append(...nodes){this.children.push(...nodes);}
  getContext(kind){return renderer==='webgl'?gl:kind==='2d'?software:null;}
  play(){this.paused=false;return Promise.resolve();}
  pause(){this.paused=true;}
  setAttribute(key,value){this.attributes[key]=value;}
  getAttribute(key){return key==='src'?this.src:this.attributes[key];}
  removeAttribute(key){if(key==='src')this.src='';} load(){this.loads=(this.loads||0)+1;this.error=null;} remove(){this.removed=true;}
 }
 globalThis.document = Object.assign(new EventTarget(),{hidden:false,createElement:()=>new Element()});
 globalThis.window = new EventTarget();
 globalThis.fetch = async () => ({ok:true,json:async()=>({version:1,characters:{jiangshi:entry}})});
 let reveals=0, captures=0, pauses=0, audible=false;
 const stage = new Element(); const motion=runtime.mountTransformation(stage,'jiangshi',{sound:()=>audible,toggleSound:()=>{audible=!audible;},onCaptureStart:()=>captures++,onReveal:()=>reveals++,onPause:()=>pauses++});
 const host=stage.children[0], video=host.children[2], loop=host.children[3];
 assert.equal(host.children[5].hidden,false);
 assert.equal(await motion.play(),true);
 assert.equal(host.children[5].hidden,true);
 if(renderer==='2d') { assert.equal(composited[3],0); assert.equal(composited[7],255); }
 assert.equal(video.src,entry.entrance); assert.equal(video.muted,true); assert.equal(video.loop,false);
 host.children[4].onclick(); assert.equal(video.muted,false); assert.equal(loop.muted,false); assert.equal(host.children[4].getAttribute('aria-pressed'),'true');
 assert.equal(loop.src,entry.loop); assert.equal(loop.preload,'auto'); assert.equal(loop.loads,1); assert.equal(loop.paused,true);
 // A failed entrance must not reveal the final transformation poster.
 video.onerror();
 assert.equal(host.children[5].hidden,false);
 assert.equal(host.children[0].hidden,true);
 assert.equal(await motion.play(),true);
 assert.equal(host.children[0].hidden,true);
 const tick=()=>{const [key,cb]=[...callbacks.entries()].at(-1);callbacks.delete(key);cb();};
 video.currentTime=1.99;tick();assert.equal(captures,0);assert.equal(reveals,0);
 video.currentTime=2.99;tick();assert.equal(captures,0);assert.equal(reveals,1);
 video.currentTime=3;tick();tick();assert.equal(captures,1);assert.equal(reveals,1);
 video.onended(); await Promise.resolve(); await Promise.resolve();
 assert.equal(video.src,entry.entrance); assert.equal(loop.src,entry.loop); assert.equal(loop.loop,true); assert.equal(loop.paused,false); assert.equal(loop.loads,1);
 document.hidden=true; document.dispatchEvent(new Event('visibilitychange')); assert.equal(video.paused,true); assert.ok(pauses);
 // Resolve an obsolete play after a newer replay: it must not stop the newer intro.
 document.hidden=false;
 // A queued ended event arriving after pause must not restart backgrounded media.
 await motion.play(); motion.pause();
 const loopStarts=loop.loads;
 video.onended(); await Promise.resolve(); await Promise.resolve();
 assert.equal(loop.paused,true); assert.equal(loop.loads,loopStarts);
 // Failed preloads must be reset even when the published URL is unchanged.
 video.error={code:2}; loop.error={code:2};
 const introLoads=video.loads, loopLoads=loop.loads;
 assert.equal(await motion.play(),true);
 assert.equal(video.loads,introLoads+1); assert.equal(loop.loads,loopLoads+1);
 let resolveOld;
 video.play=()=>{video.paused=false;return new Promise(resolve=>{resolveOld=resolve;});};
 const obsolete=motion.play(); await Promise.resolve(); await Promise.resolve();
 video.play=()=>{video.paused=false;return Promise.resolve();};
 assert.equal(await motion.play(),true);
 resolveOld(); assert.equal(await obsolete,false); assert.equal(video.paused,false);
 // A play that resolves after dismissal must stop both videos and never resume drawing.
 let resolveClosed;
 video.play=()=>new Promise(resolve=>{resolveClosed=()=>{video.paused=false;resolve();};});
 const closing=motion.play(); await Promise.resolve(); await Promise.resolve();
 motion.dispose(); resolveClosed(); assert.equal(await closing,false); assert.equal(video.paused,true); assert.equal(loop.paused,true);
 assert.equal(host.removed,true); assert.equal(video.onended,null); assert.equal(callbacks.size,0);
});
test('missing manifest entry can be retried after publication', async () => {
 let attempts=0;
 globalThis.fetch=async()=>{attempts++;return {ok:true,json:async()=>({version:1,characters:{newghost:{...entry,poster:'/art/transformations/newghost/poster.png'}}})};};
 await assert.rejects(runtime.loadTransformation('newghost'));
 assert.equal((await runtime.loadTransformation('newghost')).duration,6);
 assert.equal(attempts,1);
});
