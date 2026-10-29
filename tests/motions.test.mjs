import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadCuteMotions} from '../server/motions.mjs';
test('only complete cute packs hot-publish, never horror or partial assets',()=>{
 const root=mkdtempSync(join(tmpdir(),'boo-motion-test-')),dir=join(root,'art/motions'),spirits=new Map([['jiangshi',{}],['kappa',{}]]);
 try {
  mkdirSync(dir,{recursive:true});assert.deepEqual(loadCuteMotions(root,spirits),{});
  const m={state:'ready',kind:'cute',spiritId:'jiangshi',sheet:'/art/motions/test.webp',frames:36,fps:12};
  writeFileSync(join(dir,'jiangshi.json'),JSON.stringify(m));assert.deepEqual(loadCuteMotions(root,spirits),{});
  writeFileSync(join(dir,'test.webp'),'test');assert.equal(loadCuteMotions(root,spirits).jiangshi.frames,36);
  writeFileSync(join(dir,'kappa.json'),JSON.stringify({...m,spiritId:'kappa',kind:'horror'}));assert.equal(loadCuteMotions(root,spirits).kappa,undefined);
  writeFileSync(join(dir,'kappa.json'),JSON.stringify({...m,spiritId:'kappa'}));assert.ok(loadCuteMotions(root,spirits).kappa);
  writeFileSync(join(dir,'jiangshi.json'),'{');assert.equal(loadCuteMotions(root,spirits).jiangshi,undefined);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('compatibility motion API uses packaged metadata without serving sprite files',async()=>{
 const {createApp}=await import('../server/index.mjs');
 const root=mkdtempSync(join(tmpdir(),'boo-production-motion-')),dir=join(root,'dist/art/motions');
 mkdirSync(dir,{recursive:true});
 writeFileSync(join(dir,'jiangshi.json'),JSON.stringify({state:'ready',kind:'cute',spiritId:'jiangshi',sheet:'/art/motions/test.webp',frames:36,fps:12}));
 writeFileSync(join(dir,'test.webp'),'sprite fixture');
 const app=createApp({databasePath:':memory:',publicContent:{motions:{motions:loadCuteMotions(join(root,'dist'),new Map([['jiangshi',{}]]))}},rateLimits:false});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 try {
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const {motions}=await (await fetch(base+'/api/motions')).json();
  assert.equal(motions.jiangshi.frames,36);
  assert.equal((await fetch(base+motions.jiangshi.sheet)).status,404);
 }finally{await new Promise(resolve=>app.server.close(resolve));app.store.close();rmSync(root,{recursive:true,force:true});}
});

test('known regional preview characters can publish cute motion without granting catalog membership',()=>{
 const root=mkdtempSync(join(tmpdir(),'boo-preview-motion-')),dir=join(root,'art/motions'),spirits=new Map();
 try {
  mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'test.webp'),'fixture');
  for(const spiritId of ['vetala','unknown-preview'])writeFileSync(join(dir,`${spiritId}.json`),JSON.stringify({state:'ready',kind:'cute',spiritId,sheet:'/art/motions/test.webp',frames:24,fps:12}));
  const motions=loadCuteMotions(root,spirits);
  assert.equal(motions.vetala.frames,24);assert.equal(motions['unknown-preview'],undefined);assert.equal(spirits.size,0);
 } finally {rmSync(root,{recursive:true,force:true});}
});
