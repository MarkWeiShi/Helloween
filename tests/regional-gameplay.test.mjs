import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from '../server/content.mjs';
import { BooStore } from '../server/store.mjs';
test('all sixteen new characters support selection and invitations without an economy',()=>{
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
   store.select(id,'jiangshi');store.select(id,s.id);
   assert.equal(store.state(id).wallet,undefined);
  }
 }finally{store.close();}
});
