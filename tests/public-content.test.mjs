import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {publicCatalog} from '../server/public-content.mjs';
import {loadCatalog} from '../server/content.mjs';
test('public catalog allowlist excludes protected stories, editorial notes and unknown fields',()=>{
 const catalog=loadCatalog();catalog.secret='private';catalog.spirits[0].secret='private';
 const value=publicCatalog(catalog,{worldMap:'/map',spirits:{}});
 assert.equal(value.secret,undefined);assert.equal(value.inviteRewards,undefined);
 for(const spirit of value.spirits){assert.equal(spirit.story,undefined);assert.equal(spirit.reviewNotes,undefined);assert.equal(spirit.secret,undefined);}
});
test('web and API builds share immutable media metadata and complete runtime manifests',()=>{
 const web=JSON.parse(readFileSync('dist/release.json')),api=JSON.parse(readFileSync('dist-api/runtime/public-content.json'));
 assert.equal(web.release,api.release);assert.equal(web.contentVersion,api.contentVersion);
 assert.equal(existsSync('dist-api/dist'),false);assert.equal(existsSync('dist-api/public'),false);
 const prefix=`/releases/${web.release}`;
 const catalog=JSON.parse(readFileSync(`dist${prefix}/content/catalog.json`));assert.deepEqual(catalog,api.catalog);
 function check(value){
  if(typeof value==='string' && value.startsWith(prefix+'/'))assert.ok(existsSync('dist'+value),`Missing ${value}`);
  else if(Array.isArray(value))value.forEach(check);
  else if(value && typeof value==='object')Object.values(value).forEach(check);
 }
 check(catalog);check(api.motions);
 check(JSON.parse(readFileSync(`dist${prefix}/art/transformations/manifest.json`)));
 assert.equal(existsSync(`dist${prefix}/art/source`),false);
});

test('legacy public manifests keep original URLs for already-open players',()=>{
 const old=JSON.parse(readFileSync('dist/art/transformations/manifest.json'));
 const current=JSON.parse(readFileSync(`dist/releases/${JSON.parse(readFileSync('dist/release.json')).release}/art/transformations/manifest.json`));
 for(const [id,entry] of Object.entries(old.characters)){
  for(const key of ['entrance','loop','poster']){assert.match(entry[key],/^\/art\/transformations\//);assert.ok(existsSync('dist'+entry[key]));assert.match(current.characters[id][key],/^\/releases\//);}
 }
});

test("public CDN catalog preserves all character globe introductions",()=>{
 const catalog=loadCatalog();
 const value=publicCatalog(catalog,{worldMap:"/map",spirits:{}});
 assert.equal(value.spirits.length,56);
 for(const spirit of value.spirits)assert.equal(spirit.globeDescription,catalog.spirits.find(s=>s.id===spirit.id).globeDescription);
});
