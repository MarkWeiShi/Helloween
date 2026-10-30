import test from 'node:test';
import assert from 'node:assert/strict';
import {BooStore} from '../server/store.mjs';
import {loadCatalog} from '../server/content.mjs';
const audio={consent:true,mime:'audio/webm',durationMs:5000,audio:Buffer.from([0x1a,0x45,0xdf,0xa3,1]).toString('base64')};
test('friend scream score averages friends equally and excludes unscored, unsent and self recordings',()=>{
 const s=new BooStore(':memory:',loadCatalog());
 try {
 const guest=()=>s.createGuest().player.id;
 const owner=guest(),a=guest(),b=guest(),c=guest();
 s.onboard(owner,{name:'Owner',country:'JP',spiritId:'kappa'});
 const link=()=>s.createInvite(owner,{spiritId:'kappa',channel:'copy'}).id;
 const x=link(),y=link();
 const record=(id,token,score)=>s.recordAudio(id,token,{...audio,score,meanHz:300,peakHz:400,frames:10});
 assert.equal(s.state(owner).friendScreamScore,null);
 s.recordInviteVisit(a,x);
 s.recordAudio(c,x,audio);
 assert.equal(s.state(owner).friendScreamScore,null);
 record(a,x,20);record(a,y,40);record(b,x,90);
 assert.equal(s.state(owner).friendScreamScore,60); // (30 + 90) / 2, not 50
 record(a,x,100); // Duplicate cannot replace a saved score.
 assert.equal(s.state(owner).friendScreamScore,60);
 const other=guest();s.onboard(other,{name:'Other',country:'JP',spiritId:'kappa'});
 record(c,s.createInvite(other,{spiritId:'kappa',channel:'copy'}).id,100);
 assert.equal(s.state(owner).friendScreamScore,60);
 s.accountLogin(a,'friend');s.accountLogin(b,'friend');
 assert.equal(s.state(owner).friendScreamScore,50); // Same account = one friend
 const alias=guest();record(alias,y,0);
 assert.equal(s.state(owner).friendScreamScore,25); // Zero is a valid score.
 s.accountLogin(owner,'owner');s.accountLogin(alias,'owner');
 assert.equal(s.state(owner).friendScreamScore,50); // Own account is excluded.
 } finally {s.close();}
});
