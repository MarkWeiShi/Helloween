import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadCuteMotions} from '../server/motions.mjs';
test('only complete cute packs hot-publish, never horror or partial assets',()=>{
 const root=mkdtempSync(join(tmpdir(),'boo-motion-test-')),dir=join(root,'public/art/motions'),spirits=new Map([['jiangshi',{}],['kappa',{}]]);
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
