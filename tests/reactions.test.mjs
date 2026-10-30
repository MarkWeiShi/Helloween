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

test('three-second reactions retain per-link names, local scores and private labels across retries and friends', () => {
 const store = new BooStore(':memory:',loadCatalog());
 try {
  const sender=store.createGuest().player.id, alice=store.createGuest().player.id, bob=store.createGuest().player.id;
  store.onboard(sender,{name:'Sender',country:'CN',spiritId:'jiangshi'});
  const first=store.createInvite(sender,{spiritId:'jiangshi',channel:'copy',friendName:'Alice from school'});
  const second=store.createInvite(sender,{spiritId:'jiangshi',channel:'copy',friendName:'Bob'});
  assert.equal(store.invite(first.id).friendName,undefined,'private labels are never exposed to visitors');
  store.recordInviteVisit(alice,first.id); store.recordInviteVisit(bob,first.id);
  const body={consent:true,mime:'audio/webm',durationMs:3000,audio:Buffer.from([0x1a,0x45,0xdf,0xa3,1,2,3]).toString('base64'),name:'Alice',score:46,meanHz:440,peakHz:500,frames:55};
  for(const invalid of [{name:''},{name:'x'.repeat(25)},{score:101},{frames:0},{consent:false},{durationMs:2999}]) {
   assert.throws(()=>store.recordAudio(alice,first.id,{...body,...invalid}),{status:400});
  }
  store.recordAudio(alice,first.id,body);
  store.readReactions(sender);
  assert.equal(store.recordAudio(alice,first.id,{...body,name:'Changed',score:20}).alreadySent,true);
  store.recordAudio(bob,first.id,{...body,name:'Bob',score:null,meanHz:null,peakHz:null,frames:0});
  store.recordAudio(alice,second.id,{...body,name:'Alice again',score:20});
  const summary=store.reactionSummary(sender);
  const reaction=summary.recent.find(r=>r.inviteId===first.id && r.receiverId===alice);
  assert.equal(reaction.name,'Alice'); assert.equal(reaction.score,46); assert.equal(reaction.durationMs,3000); assert.equal(reaction.friendName,'Alice from school');
  assert.notEqual(reaction.seenAt,null,'retry does not mark an old recording unread');
  assert.equal(summary.recent.length,3);
  assert.equal(summary.links.find(l=>l.inviteId===first.id).visits,2);
  assert.equal(summary.links.find(l=>l.inviteId===first.id).recordings,2);
  assert.equal(store.reactionSummary(bob).links.length,0);
  assert.throws(()=>store.reactionAudio(bob,first.id,alice),{status:404});
 } finally { store.close(); }
});

test('recordings without a name use an existing nickname, private link label, or guest name', () => {
 const store = new BooStore(':memory:',loadCatalog());
 try {
  const sender=store.createGuest().player.id, guest=store.createGuest().player.id, named=store.createGuest().player.id;
  store.onboard(sender,{name:'Sender',country:'CN',spiritId:'jiangshi'});
  store.onboard(named,{name:'Existing nickname',country:'CN',spiritId:'jiangshi'});
  const labelled=store.createInvite(sender,{spiritId:'jiangshi',channel:'copy',friendName:'小明'});
  const unlabelled=store.createInvite(sender,{spiritId:'jiangshi',channel:'copy'});
  const body={consent:true,mime:'audio/webm',durationMs:3000,audio:Buffer.from([0x1a,0x45,0xdf,0xa3,1,2,3]).toString('base64'),score:null,meanHz:null,peakHz:null,frames:0};
  store.recordAudio(guest,labelled.id,body);
  store.recordAudio(named,labelled.id,body);
  store.recordAudio(guest,unlabelled.id,body);
  const rows=store.reactionSummary(sender).recent;
  assert.equal(rows.find(r=>r.inviteId===labelled.id && r.receiverId===guest).name,'小明');
  assert.equal(rows.find(r=>r.inviteId===labelled.id && r.receiverId===named).name,'Existing nickname');
  assert.equal(rows.find(r=>r.inviteId===unlabelled.id).name,store.rawPlayer(guest).name);
  assert.equal(store.invite(labelled.id).friendName,undefined);
 }finally{store.close();}
});

for(const durationMs of [5000,6000]) test(`${durationMs/1000}-second scored reactions persist measurements while validating silent and malformed samples`,()=>{
 const store=new BooStore(':memory:',loadCatalog());
 try{
  const sender=store.createGuest().player.id,receiver=store.createGuest().player.id,silent=store.createGuest().player.id;
  store.onboard(sender,{name:'Sender',country:'CN',spiritId:'jiangshi'});
  const invite=store.createInvite(sender,{spiritId:'jiangshi',channel:'copy',friendName:'Viewer'});
  const body={consent:true,mime:'audio/webm',durationMs,audio:Buffer.from([0x1a,0x45,0xdf,0xa3,1,2,3]).toString('base64'),score:46,meanHz:440,peakHz:500,frames:99,language:'en',amplitudeRms:.2};
  for(const change of [{score:101},{frames:0},{meanHz:null,peakHz:null},{durationMs:4999}])assert.throws(()=>store.recordAudio(receiver,invite.id,{...body,...change}),{status:400});
  store.recordAudio(receiver,invite.id,body);
  store.recordAudio(silent,invite.id,{...body,score:null,meanHz:null,peakHz:null,frames:0,amplitudeRms:0});
  const rows=store.reactionSummary(sender).recent;
  const row=rows.find(r=>r.receiverId===receiver);assert.equal(row.durationMs,durationMs);assert.equal(row.score,46);assert.equal(row.meanHz,440);assert.equal(row.peakHz,500);
  assert.equal(rows.find(r=>r.receiverId===silent).score,null);
 }finally{store.close();}
});
