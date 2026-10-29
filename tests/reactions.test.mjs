import test from 'node:test';
import assert from 'node:assert/strict';
import {detectPitch,pitchLevel,pitchScore} from '../shared/reactions.mjs';
test('voice pitch estimator distinguishes pitch from silence and bounds the game scale',()=>{
 const rate=48000;
 for(const hz of [110,220,440,880]) {
   const samples=Float32Array.from({length:2048},(_,i)=>.2*Math.sin(i*hz*2*Math.PI/rate));
   assert.ok(Math.abs(detectPitch(samples,rate)-hz)<12,`pitch ${hz}`);
 }
 assert.equal(detectPitch(new Float32Array(2048),rate),null);
 assert.equal(pitchLevel(null),'Not measured');
 assert.equal(pitchScore(null),0);
 assert.equal(pitchScore(1500),100);
});

import { BooStore } from '../server/store.mjs';
import { loadCatalog } from '../server/content.mjs';
test('voice reactions require consent and are readable only by the inviter', () => {
 const store = new BooStore(':memory:',loadCatalog());
 try {
  const sender=store.createGuest().player.id, receiver=store.createGuest().player.id, stranger=store.createGuest().player.id;
  store.onboard(sender,{name:'Sender',country:'CN',spiritId:'jiangshi'});
  const invite=store.createInvite(sender,{spiritId:'jiangshi',channel:'copy'});
  const body={consent:true,mime:'audio/webm',durationMs:5000,audio:Buffer.from([0x1a,0x45,0xdf,0xa3,1,2,3]).toString('base64')};
  assert.throws(()=>store.recordAudio(receiver,invite.id,{...body,consent:false}),{status:400});
  assert.throws(()=>store.recordAudio(sender,invite.id,body),{status:409});
  assert.throws(()=>store.recordAudio(receiver,invite.id,{...body,mime:'text/html'}),{status:415});
  assert.throws(()=>store.recordAudio(receiver,invite.id,{...body,audio:Buffer.from('not audio').toString('base64')}),{status:400});
  assert.throws(()=>store.recordAudio(receiver,invite.id,{...body,durationMs:60000}),{status:400});
  store.recordAudio(receiver,invite.id,body);
  assert.equal(store.recordAudio(receiver,invite.id,body).alreadySent,true);
  assert.equal(store.reactionSummary(sender).recent[0].hasAudio,1);
  assert.equal(store.reactionSummary(stranger).recent.length,0);
  assert.throws(()=>store.reactionAudio(stranger,invite.id,receiver),{status:404});
  assert.throws(()=>store.reactionAudio(receiver,invite.id,receiver),{status:404});
  assert.equal(Buffer.from(store.reactionAudio(sender,invite.id,receiver).audio).toString('base64'),body.audio);
 } finally { store.close(); }
});
