import test from 'node:test';
import assert from 'node:assert/strict';
import {BooStore} from '../server/store.mjs';
import {loadCatalog} from '../server/content.mjs';
import {countries} from '../shared/countries.mjs';
import {CHANNELS} from '../shared/rules.mjs';
test('all invitation channels accept a guest with default name and Earth affiliation',()=>{
 const store=new BooStore(':memory:',loadCatalog());try{
  assert.equal(countries[0].code,'001');
  const guest=store.createGuest();assert.match(guest.player.name,/^Little Boo /);assert.equal(guest.player.country,'001');
  for(const channel of CHANNELS){const link=store.createInvite(guest.player.id,{spiritId:'jiangshi',channel});const invite=store.invite(link.id);assert.equal(invite.name,guest.player.name);assert.equal(invite.country,'001');}
  assert.equal(store.state(guest.player.id).initialized,false);
  store.db.prepare('UPDATE players SET country=NULL WHERE id=?').run(guest.player.id);
  store.createInvite(guest.player.id,{spiritId:'jiangshi',channel:'copy'});assert.equal(store.state(guest.player.id).country,'001');
  store.onboard(guest.player.id,{name:'Chosen name',country:'CN',spiritId:'jiangshi'});
  store.createInvite(guest.player.id,{spiritId:'jiangshi',channel:'line'});
  assert.equal(store.state(guest.player.id).country,'CN');assert.equal(store.state(guest.player.id).name,'Chosen name');
  const earth=store.createGuest();store.onboard(earth.player.id,{name:earth.player.name,country:'001',spiritId:'jiangshi'});assert.equal(store.state(earth.player.id).country,'001');
 }finally{store.close();}
});
