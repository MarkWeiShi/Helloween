// Localize only the cultural note, retaining native/English names and global branding.
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';
import {loadCatalog} from '../server/content.mjs';
import {languages} from '../shared/i18n.mjs';
const file='public/art/x-cards/manifest.json';const manifest=JSON.parse(readFileSync(file));
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const dictionaries=Object.fromEntries(languages.map(([l])=>[l,JSON.parse(readFileSync(`src/locales/${l}.json`))]));
async function wrap(text,lang){
 const segments=[...new Intl.Segmenter(lang,{granularity:'word'}).segment(text)].map(s=>s.segment);
 for(let size=22;size>=14;size--){
  const lines=[];let line='';
  for(const part of segments){
   const candidate=line+part;const {width}=await sharp({text:{text:esc(candidate.trim()),font:`sans ${size}`,rgba:true}}).metadata();
   if(width>440&&line.trim()){lines.push(line.trim());line=part.trimStart();}else line=candidate;
  }
  if(line.trim())lines.push(line.trim());
  if(lines.length<=2)return {lines,size};
 }
 throw Error(`Culture note exceeds two lines: ${lang} ${text}`);
}
const temp=mkdtempSync(join(tmpdir(),'ghost-cultures-'));
try{
 for(const s of loadCatalog().spirits){
  const entry=manifest.characters[s.id];const source='public'+(entry.baseGif||entry.gif);
  const motion=JSON.parse(readFileSync(`public/art/motions/${s.id}.json`));
  await sharp('public'+motion.sheet).extract({left:0,top:0,width:motion.cell,height:motion.cell}).resize(320,320).png().toFile(`public/art/x-cards/${s.id}.portrait.png`);
  const base=await sharp(source).png().toBuffer();const jobs=[];const layouts={};
  for(const [lang] of languages){
   const origin=lang==='en'?s.culture:dictionaries[lang][s.culture];
   const folklore=lang==='en'?s.folklore:dictionaries[lang][s.folklore];
   if(!origin||!folklore)throw Error(`Missing culture translation: ${lang}/${s.id}`);
   let culture=[...new Intl.Segmenter(lang,{granularity:'sentence'}).segment(folklore)][0].segment.trim();
   let layout;try{layout=await wrap(culture,lang);}catch{culture=origin;layout=await wrap(culture,lang);}
   layouts[lang]={culture,compactCulture:origin,...layout};
   // Paint the whole two-line area to make regeneration idempotent.
   const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="504"><rect x="450" y="250" width="490" height="254" fill="#121b32"/>${layout.lines.map((line,i)=>`<text x="${lang==='ar'?900:460}" y="${276+i*27}" text-anchor="${lang==='ar'?'end':'start'}" font-family="sans-serif" font-size="${layout.size}" fill="#c3cbd9">${esc(line)}</text>`).join('')}</svg>`);
   const png=join(temp,`${s.id}-${lang}.png`);await sharp(base).composite([{input:svg}]).png().toFile(png);
   const poster=`/art/x-cards/${s.id}.${lang}.jpg`;await sharp(png).jpeg({quality:88}).toFile('public'+poster);layouts[lang].poster=poster;
   jobs.push({id:s.id,lang,source,png,out:'public/art/x-cards'});
  }
  const jobfile=join(temp,'jobs.json');writeFileSync(jobfile,JSON.stringify(jobs));
  const outputs=JSON.parse(execFileSync('python3',['scripts/localize-x-card-frame.py',jobfile],{encoding:'utf8'}));
  entry.baseGif ||= entry.gif;entry.localized=Object.fromEntries(outputs.map(o=>[o.lang,{...o,...layouts[o.lang]}]));
  Object.assign(entry,entry.localized.en);delete entry.lang;
  console.log(`${s.id}: ${outputs.length} languages`);
 }
 manifest.languages=languages.map(([l])=>l);writeFileSync(file,JSON.stringify(manifest,null,2)+'\n');
}finally{rmSync(temp,{recursive:true,force:true});}
