import test from 'node:test';
import assert from 'node:assert/strict';
import {BooStore} from '../server/store.mjs';
import {loadCatalog} from '../server/content.mjs';
const sample={consent:true,scoringVersion:2,echoCancellation:true,meanHz:600,meanRms:.1,frames:80};
test('global character scores include own measurements, deduplicate retries and reject invalid samples',()=>{
 const s=new BooStore(':memory:',loadCatalog());
 try {
 const a=s.createGuest().player.id,b=s.createGuest().player.id;
 assert.deepEqual(s.globalScares().stats,[]);
 s.recordScare(a,'jiangshi',sample);
 s.recordScare(a,'jiangshi',{...sample,meanHz:1000});
 let stat=s.globalScares().stats[0]; assert.equal(stat.samples,1);assert.equal(stat.score,48);
 s.recordScare(b,'jiangshi',{...sample,meanHz:1000});
 stat=s.globalScares().stats[0];assert.equal(stat.samples,2);assert.equal(stat.score,57);
 assert.equal(s.recordScare(b,'kappa',{...sample,meanHz:null,meanRms:0,frames:0}).counted,false);
 assert.equal(s.recordScare(b,'kappa',{...sample,echoCancellation:false}).counted,false);
 assert.throws(()=>s.recordScare(b,'kappa',{...sample,meanRms:2}),{status:400});
 assert.throws(()=>s.recordScare(b,'missing',sample),{status:404});
 assert.throws(()=>s.recordScare(b,'kappa',{...sample,consent:false}),{status:400});
 assert.equal(s.globalScares().stats.length,1);
 }finally{s.close();}
});
test('existing invitation scores and own measurements count each participant once per character',()=>{
 const s=new BooStore(':memory:',loadCatalog());try{
 const owner=s.createGuest().player.id,friend=s.createGuest().player.id;
 s.onboard(owner,{name:'Owner',country:'CN',spiritId:'jiangshi'});
 const link=s.createInvite(owner,{spiritId:'jiangshi',channel:'copy'});
 s.recordAudio(friend,link.id,{...sample,score:48,peakHz:800,durationMs:6000,mime:'audio/webm',audio:Buffer.from([0x1a,0x45,0xdf,0xa3,1,2,3]).toString('base64')});
 assert.equal(s.globalScares().stats[0].samples,1);
 s.recordScare(friend,'jiangshi',sample);
 assert.equal(s.globalScares().stats[0].samples,1);
 s.recordScare(owner,'jiangshi',sample);
 assert.equal(s.globalScares().stats[0].samples,2);
 assert.deepEqual(Object.keys(s.globalScares().stats[0]).sort(),['samples','score','spiritId','updatedAt']);
 }finally{s.close();}
});
test('account linking deduplicates earlier guest samples and invalidates the aggregate cache',()=>{
 let now=1000;const s=new BooStore(':memory:',loadCatalog(),{now:()=>now});try{
 const a=s.createGuest().player.id,b=s.createGuest().player.id;
 s.recordScare(a,'jiangshi',sample);now++;
 s.recordScare(b,'jiangshi',{...sample,meanHz:1000});
 assert.equal(s.globalScares().stats[0].samples,2);
 s.accountLogin(a,'same-account');s.accountLogin(b,'same-account');
 assert.equal(s.globalScares().stats[0].samples,1);
 assert.equal(s.globalScares().stats[0].score,48);
 assert.equal(s.globalScares().stats[0].updatedAt,1000);
 }finally{s.close();}
});
