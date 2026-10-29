import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const source = stripTypeScriptTypes((await fs.readFile(new URL('../src/microphone.ts',import.meta.url),'utf8')).replace(/import .*?;\n/, 'const detectPitch = () => null;\n'));
const {prepareMicrophone} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('closing while AudioContext resume is pending immediately releases the granted microphone',async()=>{
 let stops=0, closes=0, resume;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop:()=>stops++}]})}}});
 globalThis.AudioContext=class {resume(){return new Promise(resolve=>{resume=resolve;});}close(){closes++;return Promise.resolve();}};
 const controller=new AbortController(); const pending=prepareMicrophone(controller.signal);
 await Promise.resolve(); controller.abort();
 assert.equal(stops,1); assert.equal(closes,1);
 resume(); await assert.rejects(pending,{name:'AbortError'});
});
test('late permission after cancellation releases tracks without creating an audio context',async()=>{
 let stops=0, allow, contexts=0;
 navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{allow=resolve;});
 globalThis.AudioContext=class {constructor(){contexts++;}};
 const controller=new AbortController(); const pending=prepareMicrophone(controller.signal);
 controller.abort(); allow({getTracks:()=>[{stop:()=>stops++}]});
 await assert.rejects(pending,{name:'AbortError'});
 assert.equal(stops,1); assert.equal(contexts,0);
});
