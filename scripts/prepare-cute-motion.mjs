// Publish an explicitly selected cute-only video segment as a globe sprite loop.
// node scripts/prepare-cute-motion.mjs ID VIDEO START_SECONDS END_SECONDS
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readdirSync,rmSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {loadCatalog} from '../server/content.mjs';
const [id,input,startArg,endArg]=process.argv.slice(2),start=Number(startArg),end=Number(endArg);
if(!/^[a-z0-9-]+$/.test(id||'') || !input || !Number.isFinite(start) || !Number.isFinite(end) || start<0 || end<=start || end-start>3)throw Error('Usage: ID VIDEO START END (explicit cute-only range, max 3 seconds)');
const catalog=loadCatalog();
if(!catalog.spirits.some(s=>s.id===id))throw Error('Unknown stable character ID');
const dir=mkdtempSync(join(tmpdir(),'boo-cute-')),output='public/art/motions';
mkdirSync(output,{recursive:true});
try {
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-ss',String(start),'-i',resolve(input),'-t',String(end-start),'-an','-vf','fps=12,format=rgba,colorkey=0x00ff00:0.22:0.10,despill=type=green:mix=0.5:expand=0:green=-1',join(dir,'%03d.png')]);
 const files=readdirSync(dir).filter(f=>f.endsWith('.png')).sort();
 if(files.length<3)throw Error('Too few motion frames');
 let left=Infinity,top=Infinity,right=0,bottom=0;
 for(const f of files){const {data,info}=await sharp(join(dir,f)).ensureAlpha().raw().toBuffer({resolveWithObject:true});for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>32){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}}
 if(!Number.isFinite(left))throw Error('No foreground found');
 const crop={left,top,width:right-left+1,height:bottom-top+1},cell=160;
 const frames=await Promise.all(files.map(f=>sharp(join(dir,f)).extract(crop).resize(cell-16,cell-16,{fit:'contain',background:'#00000000'}).extend({top:8,bottom:8,left:8,right:8,background:'#00000000'}).png().toBuffer()));
 // Ping-pong the same cute action, excluding duplicated endpoints: no hard jump.
 const sequence=[...frames,...frames.slice(1,-1).reverse()];
 const sheet=await sharp({create:{width:cell*sequence.length,height:cell,channels:4,background:'#00000000'}}).composite(sequence.map((input,i)=>({input,left:i*cell,top:0}))).webp({quality:88}).toBuffer();
 const hash=createHash('sha256').update(sheet).digest('hex').slice(0,12),name=`${id}-cute.${hash}.webp`;
 writeFileSync(join(output,name),sheet);
 const manifest={version:1,spiritId:id,state:'ready',kind:'cute',sheet:`/art/motions/${name}`,frames:sequence.length,fps:12,cell,source:input,start,end,loop:'ping-pong',audio:false};
 const target=join(output,`${id}.json`);writeFileSync(target+'.tmp',JSON.stringify(manifest,null,2)+'\n');renameSync(target+'.tmp',target);
 console.log(JSON.stringify({id,frames:sequence.length,duration:sequence.length/12,bytes:sheet.length,crop}));
}finally{rmSync(dir,{recursive:true,force:true});}
