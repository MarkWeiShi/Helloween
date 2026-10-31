// Use the existing cute sprite sheets and card layout for regional invitations.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import sharp from 'sharp';
import {previewCharacters} from '../shared/preview-characters.mjs';
import {languages} from '../shared/i18n.mjs';
const directory='public/art/x-cards';mkdirSync(directory,{recursive:true});
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
for(const spirit of Object.values(previewCharacters)){
 const motion=JSON.parse(readFileSync(`public/art/motions/${spirit.id}.json`));
 const portrait=await sharp('public'+motion.sheet).extract({left:0,top:0,width:motion.cell,height:motion.cell}).resize(320,320).png().toBuffer();
 writeFileSync(`${directory}/${spirit.id}.portrait.png`,portrait);
 const ghost=await sharp(portrait).resize(392,392).png().toBuffer();
 const text=(value,y,size,color)=>`<text x="460" y="${y}" font-family="sans-serif" font-size="${size}" fill="${color}">${escape(value)}</text>`;
 for(const [language] of languages){
  const dictionary=JSON.parse(readFileSync(`src/locales/${language}.json`));
  const culture=dictionary[spirit.culture]||spirit.culture;
  const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="504"><rect width="960" height="504" fill="#121b32"/><circle cx="230" cy="262" r="195" fill="#1d2b44"/>${text('Halloween Tricks',76,28,'#a8dac8')}${text('by HelloTalk',110,28,'#a8dac8')}${text(spirit.name,200,38,'#ffb66d')}${text(culture,276,Math.min(22,Math.floor(440/Math.max(1,[...culture].length*.66))),'#c3cbd9')}${text('Open your invitation in the post.',448,19,'#aebacd')}</svg>`);
  await sharp(svg).composite([{input:ghost,left:34,top:66}]).jpeg({quality:88}).toFile(`${directory}/${spirit.id}.${language}.jpg`);
 }
 console.log(`${spirit.id}: portrait + ${languages.length} share cards`);
}
