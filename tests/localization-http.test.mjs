import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/index.mjs';
test('initial HTML and invitation metadata use the recipient locale and escape player names',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'boo-localization-'));
 writeFileSync(join(directory,'index.html'),'<html lang="en"><head><meta name="description" content="A little fright."><title>Boo Around the World</title></head><body><p>Lighting the lanterns…</p></body></html>');
 const app=createApp({databasePath:':memory:',rateLimits:false,staticRoot:directory});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${app.server.address().port}`;
 try{
  const response=await fetch(base+'/',{headers:{'Accept-Language':'nl;q=1,ja-JP;q=0.9,en;q=0.5'}});
  assert.equal(response.headers.get('Content-Language'),'ja');assert.equal(response.headers.get('Vary'),'Accept-Language');
  const text=await response.text();assert.match(text,/<html lang="ja" dir="ltr">/);assert.ok(!text.includes('Lighting the lanterns…'));
  for(const [query,locale,dir] of [['appLang=ar-SA','ar','rtl'],['lang=pt_BR&appLang=ja','pt','ltr'],['lang=auto&appLang=ar','ko','ltr'],['appLang=invalid','ko','ltr']]){
   const page=await fetch(base+'/?'+query,{headers:{'Accept-Language':'ko-KR'}});
   assert.equal(page.headers.get('Content-Language'),locale);
   assert.ok((await page.text()).includes(`<html lang="${locale}" dir="${dir}">`));
  }
  const session=await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});let cookie=session.headers.get('set-cookie').split(';')[0];
  const guest=await session.json();cookie=`boo_session=${app.store.accountLogin(guest.player.id,'localization-test').token}`;
  const post=(path,data)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(data)});
  assert.equal((await post('/api/onboard',{name:'<b>Alice</b>',country:'JP',spiritId:'kappa'})).status,200);
  const invite=await (await post('/api/invites',{channel:'copy',spiritId:'kappa'})).json();
  const shared=await fetch(base+'/i/'+invite.id+'?lang=ar',{headers:{'Accept-Language':'ja'}});const html=await shared.text();
  assert.equal(shared.headers.get('Content-Language'),'ar');assert.match(html,/<html lang="ar" dir="rtl">/);assert.ok(html.includes('&lt;b&gt;Alice&lt;/b&gt;'));assert.ok(!html.includes('<b>Alice</b>'));
 }finally{await new Promise(resolve=>app.server.close(resolve));app.close();rmSync(directory,{recursive:true,force:true});}
});
