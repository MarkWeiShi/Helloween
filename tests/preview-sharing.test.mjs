import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createApp} from '../server/index.mjs';
import {previewCharacters} from '../shared/preview-characters.mjs';
import {languages} from '../shared/i18n.mjs';
test('all regional previews support existing invitation channels and public crawler cards',async()=>{
 const app=createApp({databasePath:':memory:',rateLimits:false});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 try{
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const session=app.store.createGuest();
  for(const spirit of Object.values(previewCharacters)){
   for(const channel of ['x','line','facebook','whatsapp','messenger','kakao']){
    const response=await fetch(base+'/api/invites',{method:'POST',headers:{cookie:'boo_session='+session.token,'content-type':'application/json'},body:JSON.stringify({spiritId:spirit.id,channel})});
    assert.equal(response.status,200,`${spirit.id}/${channel}`);
    const invitation=await response.json();assert.equal(app.store.invite(invitation.id).spiritId,spirit.id);
    const card=await fetch(base+'/api/share/card/'+invitation.id+'?lang=zh');assert.equal(card.status,200);
    assert.match(await card.text(),new RegExp(spirit.id+'\\.zh\\.jpg'));
   }
   for(const [language] of languages)assert.ok(existsSync(`public/art/x-cards/${spirit.id}.${language}.jpg`));
   assert.ok(readFileSync(`public/art/x-cards/${spirit.id}.portrait.png`).length>0);
  }
  assert.throws(()=>app.store.createInvite(session.player.id,{spiritId:'unknown-preview',channel:'line'}),/not available/);
 }finally{await new Promise(r=>app.server.close(r));app.close();}
});
