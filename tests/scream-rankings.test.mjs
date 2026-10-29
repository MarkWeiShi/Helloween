import test from 'node:test';
import assert from 'node:assert/strict';
import {BooStore} from '../server/store.mjs';
import {loadCatalog} from '../server/content.mjs';
const audio={consent:true,mime:'audio/webm',durationMs:2000,audio:Buffer.from([0x1a,0x45,0xdf,0xa3,1,2,3]).toString('base64'),score:null,meanHz:null,peakHz:null,frames:0};
test('Trick counts saved audio, intensity groups by recording language and weights participants equally',()=>{
 const store=new BooStore(':memory:',loadCatalog());
 try{
 const makeOwner=name=>{const id=store.createGuest().player.id;store.onboard(id,{name,country:'JP',spiritId:'kappa'});return id;};
 const owner=makeOwner('A'),other=makeOwner('B'),a=store.createGuest().player.id,b=store.createGuest().player.id,c=store.createGuest().player.id;
 const link=()=>store.createInvite(owner,{spiritId:'kappa',channel:'copy'}).id;
 const first=link(),second=link();
 store.recordInviteVisit(a,first);assert.equal(store.screamRankings(owner).rows.length,0);
 store.recordAudio(a,first,{...audio,language:'zh',amplitudeRms:.2});
 store.recordAudio(a,second,{...audio,language:'zh',amplitudeRms:.4});
 store.recordAudio(b,first,{...audio,language:'zh',amplitudeRms:.9});
 store.recordAudio(c,first,{...audio,language:'en',amplitudeRms:.8});
 store.recordAudio(c,second,audio); // Historical clients count for Trick, never as zero intensity.
 store.recordAudio(a,first,{...audio,language:'de',amplitudeRms:1}); // Retry cannot change original language or intensity.
 assert.equal(store.screamRankings(owner).self.score,5);
 const intensity=store.screamRankings(owner,'intensity');
 assert.deepEqual(intensity.rows.map(r=>[r.id,r.score,r.participants,r.recordings]),[['en',80,1,1],['zh',60,2,3]]);
 assert.ok(!JSON.stringify(intensity).includes(a));
 const otherLink=store.createInvite(other,{spiritId:'kappa',channel:'copy'}).id;
 for(let i=0;i<6;i++)store.recordAudio(store.createGuest().player.id,otherLink,{...audio,language:'ja',amplitudeRms:0});
 const trick=store.screamRankings(owner);assert.equal(trick.rows.length,2);assert.deepEqual(trick.rows.map(r=>r.rank),[1,1]);
 assert.equal(store.screamRankings(other,'intensity').rows.find(r=>r.id==='ja').score,0);
 for(const patch of [{amplitudeRms:2,language:'zh'},{amplitudeRms:-1,language:'zh'},{amplitudeRms:.3},{language:'xx',amplitudeRms:.3}])assert.throws(()=>store.recordAudio(b,second,{...audio,...patch}),{status:400});
 }finally{store.close();}
});
