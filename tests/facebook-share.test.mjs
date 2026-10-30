import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/index.mjs';
import {facebookShareDocument} from '../server/facebook-share.mjs';

test('Facebook preview escapes metadata and constrains locale and destination',()=>{
 const html=facebookShareDocument({id:'abc',name:'PRIVATE'}, {id:'jiangshi',name:'<script>bad</script>'},'https://helloween.fly.dev','evil/../../');
 assert.match(html,/jiangshi.en.jpg/);
 assert.match(html,/&lt;script&gt;/);
 assert.ok(html.includes('location.replace("/?invite=abc&lang=en")'));
 assert.ok(!html.includes('PRIVATE'));
});
test('Facebook crawler gets the correct card without sessions or attributed visits',async()=>{
 const app=createApp({databasePath:':memory:',rateLimits:false});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 try {
  const guest=app.store.createGuest();
  app.store.onboard(guest.player.id,{name:'PRIVATE NAME',country:'CN',spiritId:'jiangshi'});
  const invite=app.store.createInvite(guest.player.id,{spiritId:'jiangshi',channel:'facebook',friendName:'PRIVATE FRIEND'});
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const before=app.store.db.prepare('SELECT COUNT(*) AS n FROM invite_visits').get().n;
  const response=await fetch(`${base}/api/share/facebook/${invite.id}?lang=zh`);
  assert.equal(response.status,200);assert.equal(response.headers.get('set-cookie'),null);
  const html=await response.text();
  assert.match(html,/og:image/);assert.match(html,/jiangshi.zh.jpg/);
  assert.ok(html.includes(`/?invite=${invite.id}&lang=zh`));assert.ok(!html.includes('PRIVATE'));
  assert.equal(app.store.db.prepare('SELECT COUNT(*) AS n FROM invite_visits').get().n,before);
  assert.equal((await fetch(`${base}/api/share/facebook/missing`)).status,404);
 } finally {await new Promise(r=>app.server.close(r));app.close();}
});
