import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {loadCatalog} from '../server/content.mjs';
import {nameMotionFor} from '../scripts/social-name-motion.mjs';

test('every invitational character has a portrait MP4 with source audio and matching native/English copy',()=>{
 const {characters}=JSON.parse(readFileSync('public/art/social-videos/manifest.json'));
 const spirits=loadCatalog().spirits;
 assert.deepEqual(Object.keys(characters).sort(),spirits.map(s=>s.id).sort());
 for(const s of spirits){
  const c=characters[s.id],file='public'+c.video;
  assert.equal(c.nativeName,s.nativeName);assert.equal(c.descriptionEn,s.shortDescription);
  assert.equal(c.originCountry,s.originCountry);assert.equal(c.culture,s.culture);
  assert.deepEqual(c.descriptionLines,[`${c.country} · ${s.culture}`,s.shortDescription]);
  assert.equal(c.descriptionLineCount,2);assert.ok(c.descriptionFontSize>=22);
  assert.equal(c.titleImage,'/art/ui/halloween-tricks-title.webp');
  assert.equal(c.nameStyle.color,'#ff982f');
  assert.ok(['fade','rise','slide-right','soft-zoom','tile-reveal'].includes(c.nameMotion.type));
  const source=JSON.parse(readFileSync('public/art/transformations/manifest.json')).characters[s.id];
  assert.deepEqual(c.nameMotion,nameMotionFor(s.id,source));
  assert.ok(c.nameMotion.start>=0&&c.nameMotion.start+c.nameMotion.duration<c.duration);
  assert.notEqual(c.video,c.reducedMotionVideo);
  assert.equal(createHash('sha256').update(readFileSync('public'+c.reducedMotionVideo)).digest('hex'),c.reducedMotionSha256);
  for(const field of ['nativeFont','englishFont']){
   assert.equal(createHash('sha256').update(readFileSync('assets/social-video-fonts/'+c.nameStyle[field])).digest('hex'),c.nameStyle[field+'Sha256']);
  }
  assert.equal(createHash('sha256').update(readFileSync('public'+c.titleImage)).digest('hex'),c.titleSha256);
  const bytes=readFileSync(file);assert.equal(bytes.length,c.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),c.sha256);
  assert.equal(createHash('sha256').update(readFileSync('public'+c.source)).digest('hex'),c.sourceSha256);
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8'}));
  const video=probe.streams.find(s=>s.codec_type==='video');
  assert.equal(video.width,1080);assert.equal(video.height,1920);assert.equal(video.codec_name,'h264');assert.equal(video.pix_fmt,'yuv420p');
  assert.ok(probe.streams.some(s=>s.codec_type==='audio'&&s.codec_name==='aac'),s.id);
  assert.ok(Math.abs(Number(probe.format.duration)-c.duration)<0.1,s.id);
  assert.ok(c.duration>=3&&c.duration<=60,s.id);
 }
});

test('each name entrance is present in the actual MP4 and settles after the voice cue',()=>{
 const {characters}=JSON.parse(readFileSync('public/art/social-videos/manifest.json'));
 const sample=(c,time)=>execFileSync('ffmpeg',['-v','error','-ss',String(time),'-i','public'+c.video,'-frames:v','1','-vf','crop=840:140:120:290','-pix_fmt','rgb24','-f','rawvideo','-']);
 const delta=(a,b)=>a.reduce((sum,v,i)=>sum+Math.abs(v-b[i]),0)/a.length;
 for(const id of ['jiangshi','nie-xiaoqian','yingning','bake-danuki','painted-skin-ghost']){
  const c=characters[id],start=c.nameMotion.start;
  const before=sample(c,start-.2),entering=sample(c,start+.15),settled=sample(c,start+1.1),held=sample(c,start+1.7);
  assert.ok(delta(before,settled)>1,`${id}: name missing`);
  assert.ok(delta(entering,settled)>.4,`${id}: entrance missing`);
  assert.ok(delta(settled,held)<1,`${id}: names should stop moving`);
 }
});
