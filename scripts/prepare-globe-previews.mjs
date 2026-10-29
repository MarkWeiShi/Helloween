import sharp from 'sharp';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const source='public/art/source/globe-previews-atlas.png';
const rows=[
 ['ECA','Almas','Mongolian regional stories'],['SAS','Vetala','Indian literary riddle tales'],['RU','Domovoi','Russian and East Slavic traditions'],
 ['ARAB','Ifrit','Arabian literary tales'],['WAS','Pari','Persian and neighboring traditions'],['AFR','Kalanoro','Malagasy regional traditions'],
 ['FR','Lutin','French regional folklore'],['DE','Kobold','German-language folklore'],['CAM','Duppy','Jamaican and Caribbean traditions'],
 ['SAM','El Tunche','Peruvian Amazon regional stories'],['OCE','Bunyip','Southeastern Australian traditions'],
];
const {width,height}=await sharp(source).metadata();
const previews={};mkdirSync('public/art/region-previews',{recursive:true});
for(let i=0;i<rows.length;i++){
 const [region,name,culture]=rows[i];const col=i%3,row=Math.floor(i/3);
 const left=Math.round(col*width/3),top=Math.round(row*height/4);
 const cell=await sharp(source).extract({left,top,width:Math.round((col+1)*width/3)-left,height:Math.round((row+1)*height/4)-top}).toBuffer();
 const cropped=await sharp(cell).trim({threshold:8}).toBuffer();
 const save=async(size)=>{const bytes=await sharp(cropped).resize(size-24,size-24,{fit:'inside'}).extend({top:12,bottom:12,left:12,right:12,background:{r:0,g:0,b:0,alpha:0}}).webp({quality:88}).toBuffer();const hash=createHash('sha256').update(bytes).digest('hex').slice(0,10);const path=`/art/region-previews/${region.toLowerCase()}-${size}.${hash}.webp`;writeFileSync('public'+path,bytes);return path;};
 previews[region]={name,culture,thumb:await save(144),portrait:await save(480)};
}
writeFileSync('src/region-previews.ts','// Original visual previews only. These do not create playable characters or awards.\nexport const regionPreviews: Record<string, {name: string; culture: string; thumb: string; portrait: string}> = '+JSON.stringify(previews,null,2)+';\n');
console.log('Prepared',Object.keys(previews).length,'regional visual previews.');
