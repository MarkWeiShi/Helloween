// Reassemble the published cute-only video frames; never include a scare frame.
import {existsSync,readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {loadCatalog} from '../server/content.mjs';
import {previewTransformations} from '../shared/preview-transformations.mjs';
const root=resolve(import.meta.dirname,'..');
const read=p=>JSON.parse(readFileSync(join(root,p),'utf8'));
const zh=read('src/locales/zh.json');
const extraNames={vetala:'Vetala',domovoi:'Domovoi',lutin:'Lutin',kobold:'Kobold',duppy:'Duppy','el-tunche':'El Tunche',bunyip:'Bunyip'};
const spirits=[...loadCatalog().spirits,...Object.values(previewTransformations).map(id=>({id,name:extraNames[id],previewOnly:true}))];
const out=join(root,'public/art/share-challenges');mkdirSync(out,{recursive:true});
const entries={};
const previous=existsSync(join(out,'manifest.json'))?read('public/art/share-challenges/manifest.json').characters:{};
for(const s of spirits){
 const m=read(`public/art/motions/${s.id}.json`);
 if(m.state!=='ready'||m.kind!=='cute')throw Error(`Missing cute motion: ${s.id}`);
 const sheet=readFileSync(join(root,'public',m.sheet));
 const repeats=Math.ceil(3*m.fps/m.frames),count=m.frames*repeats;
 const fps=Math.max(m.fps,Math.ceil(count/5));
 const cached=previous[s.id];
 if(cached && cached.duration===count/fps && cached.sourceSheetSha256===createHash('sha256').update(sheet).digest('hex') && existsSync(join(root,'public',cached.gif))){entries[s.id]=cached;continue;}
 const dir=mkdtempSync(join(tmpdir(),'boo-share-'));
 try{
  for(let i=0;i<m.frames;i++)await sharp(sheet).extract({left:i*m.cell,top:0,width:m.cell,height:m.cell}).resize(320,320).flatten({background:'#17132b'}).png().toFile(join(dir,`${String(i).padStart(3,'0')}.png`));
  const gif=join(dir,'share.gif');
  execFileSync('ffmpeg',['-v','error','-y','-stream_loop',String(repeats-1),'-framerate',String(fps),'-i',join(dir,'%03d.png'),'-frames:v',String(count),'-filter_complex','[0:v]split[a][b];[a]palettegen=max_colors=192[p];[b][p]paletteuse=dither=sierra2_4a','-loop','0',gif]);
  const data=readFileSync(gif),hash=createHash('sha256').update(data).digest('hex');
  const filename=`${s.id}.${hash.slice(0,12)}.gif`;writeFileSync(join(out,filename),data);
  const nameZh=zh[s.name]||s.nativeName||s.name;
  const textZh=`我派了${s.id==='jiangshi'?'一只僵尸':nameZh+'来敲你的门'}${s.id==='jiangshi'?'来找你':''} 👻\n你能忍住不叫吗？打开试试——\n［本次邀请链接］\n#Halloween #BooAroundTheWorld`;
  entries[s.id]={id:s.id,name:s.name,nameZh,previewOnly:!!s.previewOnly,gif:`/art/share-challenges/${filename}`,bytes:data.length,sha256:hash,width:320,height:320,frames:count,duration:count/fps,sourceVideo:relative(root,resolve(root,m.source)),sourceStart:m.start,sourceEnd:m.end,sourceSheet:m.sheet,sourceSheetSha256:createHash('sha256').update(sheet).digest('hex'),textZh,textEn:`I sent ${s.name} to find you 👻\nCan you keep from screaming? Open it and try—\n［本次邀请链接］\n#Halloween #BooAroundTheWorld`};
  console.log(`${s.id}: ${data.length} bytes, ${(count/fps).toFixed(2)}s`);
 }finally{rmSync(dir,{recursive:true,force:true});}
}
// Copy is refreshed even when the media bytes can be reused.
for(const s of Object.values(entries)){
 if(s.id==='painted-skin-ghost')s.nameZh='画皮鬼';
 if(s.id==='chochin-obake')s.nameZh='提灯妖怪';
 s.textZh=`我派了${s.id==='jiangshi'?'一只僵尸来找你':s.nameZh+'来敲你的门'} 👻\n你能忍住不叫吗？打开试试——\n［本次邀请链接］\n#Halloween #BooAroundTheWorld`;
}
writeFileSync(join(out,'manifest.json'),JSON.stringify({version:1,characters:entries},null,2)+'\n');
writeFileSync(join(out,'posts.zh.txt'),Object.values(entries).map(s=>`${s.nameZh} (${s.id})${s.previewOnly?' — 地区展示角色，暂不支持角色邀请':''}\nGIF: ${s.gif}\n${s.textZh}\n`).join('\n'));
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
writeFileSync(join(out,'index.html'),`<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>鬼怪动态挑战 · GIF 与帖文</title><style>body{background:#17132b;color:#fff;font:16px system-ui;margin:32px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}article{padding:20px;background:#262039;border-radius:16px}img{width:100%;max-width:320px}textarea{box-sizing:border-box;width:100%;height:160px;padding:12px}a{color:#ffd58a}small{display:block;margin:12px 0}</style><h1>分享动态挑战</h1><p>56 个可邀请鬼怪 + 7 个地区展示角色。下载 GIF，将帖文中的占位符替换为游戏生成的本次邀请链接，再附图发帖。</p><main>${Object.values(entries).map(s=>`<article><h2>${esc(s.nameZh)}</h2><img loading="lazy" src="${s.gif.split('/').pop()}" alt="${esc(s.nameZh)}的萌态动态挑战"><small>${s.previewOnly?'地区展示角色：尚不支持角色邀请链接':'可在游戏中生成角色邀请链接'} · ${s.duration.toFixed(2)} 秒</small><a download href="${s.gif.split('/').pop()}">下载 GIF</a><textarea readonly>${esc(s.textZh)}</textarea></article>`).join('')}</main></html>`);
