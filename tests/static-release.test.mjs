import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {installWeb} from '../scripts/install-web.mjs';
test('static installation atomically switches HTML, retains old media and rolls back without touching API',()=>{
 const root=mkdtempSync(join(tmpdir(),'ghost-install-')),target=join(root,'site');
 function build(version){const source=join(root,version);mkdirSync(join(source,'assets'),{recursive:true});mkdirSync(join(source,'releases',version),{recursive:true});writeFileSync(join(source,'assets',version+'.js'),version);writeFileSync(join(source,'releases',version,'media.mp4'),version);writeFileSync(join(source,'index.html'),version);writeFileSync(join(source,'release.json'),JSON.stringify({release:version}));symlinkSync(`releases/${version}/media.mp4`,join(source,'legacy.mp4'));return source;}
 try {
  const first=build('one'),second=build('two');const a=installWeb(first,target),b=installWeb(second,target);
  assert.equal(readFileSync(join(target,'current/index.html'),'utf8'),'two');
  assert.equal(readFileSync(join(target,'current/legacy.mp4'),'utf8'),'two');
  assert.ok(existsSync(join(target,'current/assets/one.js')));assert.ok(existsSync(join(target,'current/releases/one/media.mp4')));
  installWeb(first,target,{rollback:a.deployment});assert.equal(readFileSync(join(target,'current/index.html'),'utf8'),'one');assert.equal(readFileSync(join(target,'current/legacy.mp4'),'utf8'),'one');assert.ok(existsSync(join(target,'current/assets/two.js')));
  writeFileSync(join(second,'assets/two.js'),'mutated');assert.throws(()=>installWeb(second,target),/Immutable path collision/);
  assert.equal(readFileSync(join(target,'current/index.html'),'utf8'),'one');assert.notEqual(a.deployment,b.deployment);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('a LINE page-only update activates its new HTML and can roll back',()=>{
 const root=mkdtempSync(join(tmpdir(),'ghost-line-release-')),source=join(root,'source'),target=join(root,'target');
 try{
  mkdirSync(join(source,'assets'),{recursive:true});mkdirSync(join(source,'releases'));
  writeFileSync(join(source,'index.html'),'unchanged game');writeFileSync(join(source,'release.json'),'{}');
  writeFileSync(join(source,'line-share.html'),'first card');const a=installWeb(source,target);
  writeFileSync(join(source,'line-share.html'),'updated card');const b=installWeb(source,target);
  assert.notEqual(a.deployment,b.deployment);assert.equal(readFileSync(join(target,'current/line-share.html'),'utf8'),'updated card');
  installWeb(source,target,{rollback:a.deployment});assert.equal(readFileSync(join(target,'current/line-share.html'),'utf8'),'first card');
 }finally{rmSync(root,{recursive:true,force:true});}
});
