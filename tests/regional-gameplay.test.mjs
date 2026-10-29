import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from '../server/content.mjs';
import { BooStore } from '../server/store.mjs';
test('all sixteen new characters support selection, gifts, invitations and gated endings',()=>{
 const catalog=loadCatalog();let now=Date.UTC(2026,9,29);
 const store=new BooStore(':memory:',catalog,{now:()=>now});
 try {
  const friends=catalog.spirits.filter(s=>['AFR','ARAB','WAS','ECA'].includes(s.regionId));
  assert.equal(friends.length,16);
  for(const s of friends){
   const id=store.createGuest().player.id;
   store.onboard(id,{name:'Regional visitor',country:s.originCountry,spiritId:s.id});
   assert.equal(store.state(id).selected,s.id);
   const invitation=store.createInvite(id,{spiritId:s.id,channel:'copy'});
   assert.equal(store.invite(invitation.id).spiritId,s.id);
   assert.throws(()=>store.story(id,s.id),/Complete this wish/);
   for(let i=0;i<4;i++){
    const challenge=store.startMatch(id,s.id,'kappa');now+=15000;
    store.finishMatch(id,challenge.id,challenge.targets);
   }
   store.gift(id,s.id,'complete',`regional-${s.id}`);
   assert.deepEqual(store.story(id,s.id).story,s.story);
   assert.equal(store.state(id).peaceCount,1);
   assert.equal(store.state(id).progress.find(p=>p.spiritId===s.id).donated,100);
   store.select(id,'jiangshi');store.select(id,s.id);
   assert.equal(store.state(id).peaceCount,1);
  }
 }finally{store.close();}
});
