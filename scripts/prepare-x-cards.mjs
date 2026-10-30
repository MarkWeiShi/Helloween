// Landscape GIF attachments: fixed card typography and cute-only motion.
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {loadCatalog} from '../server/content.mjs';
const out='public/art/x-cards';mkdirSync(out,{recursive:true});
const challenges=JSON.parse(readFileSync('public/art/share-challenges/manifest.json')).characters;
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const entries={};
for(const s of loadCatalog().spirits){
 const motion=JSON.parse(readFileSync(`public/art/motions/${s.id}.json`));
 if(motion.kind!=='cute'||motion.state!=='ready')throw Error(`Missing cute motion ${s.id}`);
 const text=(value,x,y,size,color,weight='normal')=>`<text x="${x}" y="${y}" font-family="sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${esc(value)}</text>`;
 const fit=(value,max)=>Math.min(max,Math.floor(440/Math.max(1,[...value].length*.66)));
 const native=s.nativeName||s.name;
 const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="504"><rect width="960" height="504" fill="#121b32"/><circle cx="230" cy="262" r="195" fill="#1d2b44"/>${text('Halloween Tricks',460,76,28,'#a8dac8')}${text('by HelloTalk',460,110,28,'#a8dac8')}${text(native,460,187,fit(native,38),'#ffb66d','bold')}${text(s.name,460,236,fit(s.name,30),'#f7f0df')}${text('Open your invitation in the post.',460,448,19,'#aebacd')}</svg>`);
 const background=await sharp(svg).png().toBuffer();
 const dir=mkdtempSync(join(tmpdir(),'ghost-x-card-'));
 try{
  for(let i=0;i<motion.frames;i++){
   const ghost=await sharp('public'+motion.sheet).extract({left:i*motion.cell,top:0,width:motion.cell,height:motion.cell}).resize(392,392).png().toBuffer();
   await sharp(background).composite([{input:ghost,left:34,top:66}]).png().toFile(join(dir,`${String(i).padStart(3,'0')}.png`));
  }
  execFileSync('ffmpeg',['-v','error','-y','-framerate',String(motion.fps),'-i',join(dir,'%03d.png'),'-filter_complex','[0:v]split[a][b];[a]palettegen=max_colors=192[p];[b][p]paletteuse=dither=sierra2_4a','-loop','0',join(dir,'card.gif')]);
  const bytes=readFileSync(join(dir,'card.gif'));if(bytes.length>5000000)throw Error(`Card too large ${s.id}`);
  const hash=createHash('sha256').update(bytes).digest('hex');const file=`${s.id}.${hash.slice(0,12)}.gif`;
  writeFileSync(join(out,file),bytes);
  entries[s.id]={...challenges[s.id],nativeName:native,gif:`/art/x-cards/${file}`,width:960,height:504,bytes:bytes.length,sha256:hash,frames:motion.frames,duration:motion.frames/motion.fps,textEn:challenges[s.id].textEn.replaceAll('#BooAroundTheWorld','#HelloTalk'),textZh:challenges[s.id].textZh.replaceAll('#BooAroundTheWorld','#HelloTalk')};
  console.log(`${s.id}: ${bytes.length}`);
 }finally{rmSync(dir,{recursive:true,force:true});}
}
writeFileSync(join(out,'manifest.json'),JSON.stringify({version:1,brand:'Halloween Tricks by HelloTalk',characters:entries},null,2)+'\n');
