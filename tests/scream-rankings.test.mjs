import test from 'node:test';
import assert from 'node:assert/strict';
import {BooStore} from '../server/store.mjs';
import {loadCatalog} from '../server/content.mjs';
import {personalScareScore} from '../shared/reactions.mjs';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const audio={consent:true,mime:'audio/webm',durationMs:5000,audio:Buffer.from([0x1a,0x45,0xdf,0xa3,1,2,3]).toString('base64'),score:null,meanHz:null,peakHz:null,frames:0};
const measured=(hz,rms)=>({...audio,scoringVersion:2,echoCancellation:true,meanHz:hz,peakHz:hz,frames:10,meanRms:rms,score:99});
test('four boards attribute recordings to sharers, weight friends equally, exclude legacy scores and deduplicate retries',()=>{
 const store=new BooStore(':memory:',loadCatalog());
 try {
 const owner=(name,country)=>{const id=store.createGuest().player.id;store.onboard(id,{name,country,spiritId:'kappa'});return id;};
 const jp=owner('Japan A','JP'),jp2=owner('Japan B','JP'),us=owner('US','US');
 const a=owner('Visitor US','US'),b=owner('Visitor JP','JP');
 const link=id=>store.createInvite(id,{spiritId:'kappa',channel:'copy'}).id;
 const x=link(jp),y=link(jp),z=link(jp2),u=link(us);
 store.recordInviteVisit(a,x);assert.equal(store.screamRankings(jp).rows.length,0);
 store.recordAudio(a,x,measured(635,.1)); // 50, ignoring client-provided 99
 store.recordAudio(a,y,measured(1200,1)); // 100
 store.recordAudio(b,x,measured(70,.01)); // 0
 store.recordAudio(a,z,measured(635,.1)); // 50
 store.recordAudio(b,u,{...audio,language:'en',amplitudeRms:.9}); // legacy: Trick only
 store.recordAudio(a,x,measured(1200,1)); // immutable retry
 assert.equal(store.screamRankings(jp).self.score,3);
 assert.equal(store.screamRankings(jp,'trick','countries').self.score,4);
 const individual=store.screamRankings(jp,'intensity');
 assert.equal(individual.self.score,37.5); // ((50+100)/2 + 0)/2
 assert.equal(individual.rows.find(r=>r.id===jp2).score,50);
 assert.equal(individual.rows.some(r=>r.id===us),false);
 const countries=store.screamRankings(jp,'intensity','countries');
 assert.equal(countries.self.score,33.33); // one friend across two JP sharers gets equal weight
 assert.equal(countries.self.participants,2);assert.equal(countries.self.recordings,4);
 assert.equal(countries.rows.length,1);
 const unsupported=link(us);
 store.recordAudio(a,unsupported,{...measured(1200,1),echoCancellation:false});
 assert.equal(store.screamRankings(us,'intensity').self,null);
 assert.throws(()=>store.screamRankings(jp,'intensity','languages'),{status:400});
 assert.throws(()=>store.recordAudio(b,unsupported,{...measured(635,.1),meanRms:2}),{status:400});
 assert.equal(personalScareScore(635,.1),50);
 store.db.prepare('DELETE FROM reaction_scores_v2 WHERE invite_id=? AND player_id=?').run(x,a);
 store.db.prepare('DELETE FROM reaction_details WHERE invite_id=? AND player_id=?').run(x,a);
 store.db.prepare('DELETE FROM reaction_audio WHERE invite_id=? AND player_id=?').run(x,a);
 assert.equal(store.screamRankings(jp).self.score,2);
 assert.equal(store.screamRankings(jp,'intensity').self.score,50);
 } finally {store.close();}
});
test('tied ranks and missing measurements',()=>{
 const store=new BooStore(':memory:',loadCatalog());
 try {
 const owners=Array.from({length:3},()=>store.createGuest().player.id);
 for(const id of owners){store.onboard(id,{name:'Owner',country:'JP',spiritId:'kappa'});const l=store.createInvite(id,{spiritId:'kappa',channel:'copy'}).id;for(let i=0;i<(id===owners[2]?1:5);i++)store.recordAudio(store.createGuest().player.id,l,audio);}
 assert.deepEqual(store.screamRankings(owners[0]).rows.map(r=>r.rank),[1,1,3]);
 assert.deepEqual(store.screamRankings(owners[0]).rows.map(r=>r.score),[5,5,1]);
 assert.equal(store.screamRankings(owners[0],'intensity').rows.length,0);
 assert.equal(store.screamRankings(owners[0],'trick','countries').self.score,11);
 }finally{store.close();}
});
test('additive scoring table preserves existing recordings when reopening a database',()=>{
 const dir=mkdtempSync(join(tmpdir(),'scream-migration-'));let store;
 try {
 const path=join(dir,'boo.sqlite');store=new BooStore(path,loadCatalog());
 const owner=store.createGuest().player.id,visitor=store.createGuest().player.id;
 store.onboard(owner,{name:'Owner',country:'JP',spiritId:'kappa'});
 const link=store.createInvite(owner,{spiritId:'kappa',channel:'copy'}).id;
 store.recordAudio(visitor,link,audio);store.db.exec('DROP TABLE reaction_scores_v2');store.close();
 store=new BooStore(path,loadCatalog());
 assert.equal(store.screamRankings(owner).self.score,1);
 assert.equal(store.screamRankings(owner,'intensity').self,null);
 }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});
