import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {loadCatalog} from '../server/content.mjs';
import {previewTransformations} from '../shared/preview-transformations.mjs';
test('every playable and regional ghost has a verified animated cute GIF and invitation copy',async()=>{
 const {characters}=JSON.parse(readFileSync('public/art/share-challenges/manifest.json'));
 const playable=loadCatalog().spirits.map(s=>s.id);
 assert.deepEqual(Object.keys(characters).sort(),[...playable,...Object.values(previewTransformations)].sort());
 for(const [id,c] of Object.entries(characters)){
  const bytes=readFileSync('public'+c.gif),metadata=await sharp(bytes,{animated:true}).metadata();
  assert.equal(createHash('sha256').update(bytes).digest('hex'),c.sha256,id);
  assert.equal(metadata.format,'gif');assert.equal(metadata.pages,c.frames,id);
  assert.equal(metadata.loop,0,id);assert.ok(c.duration>=3&&c.duration<=5,id);
  const seconds=metadata.delay.reduce((a,b)=>a+b,0)/1000;
  assert.ok(seconds>=3&&seconds<=5,`${id}: ${seconds}s`);
  assert.ok(bytes.length<5_000_000,id);
  assert.equal(c.previewOnly,!playable.includes(id));
  for(const text of [c.textZh,c.textEn]){
   assert.equal(text.split('［本次邀请链接］').length,2,id);
   assert.ok(text.includes('#Halloween #BooAroundTheWorld'),id);
  }
 }
});

test('CDN release includes GIFs, preview gallery and post copy',async()=>{
 const {publicFiles,rewritePublicPaths}=await import('../scripts/lib/public-content.mjs');
 const files=new Set(publicFiles('public'));
 const manifest=JSON.parse(readFileSync('public/art/share-challenges/manifest.json'));
 for(const c of Object.values(manifest.characters))assert.ok(files.has(c.gif.slice(1)),c.id);
 assert.ok(files.has('art/share-challenges/index.html'));
 assert.ok(files.has('art/share-challenges/posts.zh.txt'));
 const rewritten=rewritePublicPaths(manifest,'/releases/test');
 for(const c of Object.values(rewritten.characters))assert.ok(c.gif.startsWith('/releases/test/art/share-challenges/'));
});
