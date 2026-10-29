import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {publicationFiles,publishAssets} from '../scripts/publish-assets.mjs';
test('complete static publisher orders immutable files before entrypoints and dry-run needs no credentials',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'ghost-publish-'));
 try {
  for(const name of ['release.json','index.html','assets/app.js','releases/version/movie.mp4','.vite/manifest.json']){mkdirSync(join(directory,name,'..'),{recursive:true});writeFileSync(join(directory,name),'{}');}
  const paths=publicationFiles(directory);assert.equal(paths.at(-1),'index.html');assert.ok(paths.includes('releases/version/movie.mp4'));assert.equal(paths.includes('.vite/manifest.json'),false);
  assert.deepEqual(await publishAssets({STATIC_DIRECTORY:directory,PUBLISH_DRY_RUN:'true'}),{files:4,mutated:false,entrypointsLast:true});
 }finally{rmSync(directory,{recursive:true,force:true});}
});
