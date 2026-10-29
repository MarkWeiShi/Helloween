import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';import {loadCatalog} from '../server/content.mjs';
const plan=JSON.parse(fs.readFileSync('content/name-voices.json'));const report=JSON.parse(fs.readFileSync('public/art/name-reveals/manifest.json'));const manifest=JSON.parse(fs.readFileSync('public/art/transformations/manifest.json'));
test('voice casting covers every live character separately, with name-only requests',()=>{
 const ids=loadCatalog().spirits.map(s=>s.id).sort();assert.deepEqual(plan.voices.map(v=>v.id).sort(),ids);assert.equal(new Set(plan.voices.map(v=>v.voiceDescription)).size,ids.length);
 for(const v of plan.voices){assert.ok(v.spokenText.length);assert.ok(v.language);assert.ok(v.gender);assert.ok(v.timbre);assert.ok(!v.spokenText.includes('我是'));}
});
test('published voice takes are local 2–3 second assets and preserve original loops without overlays',()=>{
 assert.equal(report.total,plan.voices.length);
 const ready=report.items.filter(v=>v.audio);assert.equal(ready.length,report.generated);
 for(const v of ready){
  assert.ok(v.duration>=2&&v.duration<=3);assert.equal(createHash('sha256').update(fs.readFileSync('public'+v.audio)).digest('hex'),v.sha256);
  const entry=manifest.characters[v.id];assert.equal(entry.nameReveal,undefined);assert.equal(entry.spokenName.text,v.spokenText);assert.equal(entry.spokenName.startsAt,6);assert.equal(entry.duration,8.8);assert.ok(entry.loop.includes('/loop.'));
 }
 const player=fs.readFileSync('src/transformation-player.ts','utf8');assert.equal(player.includes('transformation-name'),false);
});
