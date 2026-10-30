// Reuse published transformation footage and audio; no new generated content.
import {readFileSync,writeFileSync,renameSync,mkdirSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';
import {loadCatalog} from '../server/content.mjs';
import {nameMotionFor,renderNameFrames} from './social-name-motion.mjs';

const root=resolve(import.meta.dirname,'..'),out=join(root,'public/art/social-videos');
mkdirSync(out,{recursive:true});
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const hash=data=>createHash('sha256').update(data).digest('hex');
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const transformations=read(join(root,'public/art/transformations/manifest.json')).characters;
const previous=existsSync(join(out,'manifest.json'))?read(join(out,'manifest.json')).characters:{};
const titleImage='/art/ui/halloween-tricks-title.webp';
const titleBytes=readFileSync(join(root,'public',titleImage)),titleSha256=hash(titleBytes);
const titleData='data:image/webp;base64,'+titleBytes.toString('base64');
const countries=new Intl.DisplayNames(['en'],{type:'region'});
const fontPaths={
 latin:'caveat/Caveat[wght].ttf',CN:'mashanzheng/MaShanZheng-Regular.ttf',JP:'yomogi/Yomogi-Regular.ttf',KR:'gaegu/Gaegu-Regular.ttf',TH:'itim/Itim-Regular.ttf',
 arabic:'arefruqaa/ArefRuqaa-Regular.ttf',IR:'gulzar/Gulzar-Regular.ttf',KZ:'shantellsans/ShantellSans[BNCE,INFM,SPAC,wght].ttf',
};
const fonts=Object.fromEntries(Object.entries(fontPaths).map(([key,path])=>{
 const bytes=readFileSync(join(root,'assets/social-video-fonts',path));
 return [key,{path,sha256:hash(bytes),data:'data:font/ttf;base64,'+bytes.toString('base64')}];
}));
const nameColor='#ff982f';
const characters={};
const saveManifest=entries=>{
 const path=join(out,'manifest.json');
 writeFileSync(path+'.tmp',JSON.stringify({version:1,characters:entries},null,2)+'\n');
 renameSync(path+'.tmp',path);
};
const selected=process.argv.find(a=>a.startsWith('--id='))?.slice(5);
for(const spirit of loadCatalog().spirits)nameMotionFor(spirit.id,transformations[spirit.id]);
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHROME_CHANNEL||'chrome'});
const page=await browser.newPage({viewport:{width:1080,height:1920},deviceScaleFactor:1});
page.setDefaultTimeout(90000);
const dir=mkdtempSync(join(tmpdir(),'wd-social-video-'));
try{
 for(const s of loadCatalog().spirits){
  if(selected&&s.id!==selected){if(previous[s.id])characters[s.id]=previous[s.id];continue;}
  const source=transformations[s.id];
  if(!source?.entrance||!s.nativeName||!s.shortDescription)throw Error(`Missing source/copy: ${s.id}`);
  const sourceFile=join(root,'public',source.entrance),sourceSha256=hash(readFileSync(sourceFile));
  const country=countries.of(s.originCountry);
  const originLine=`${country} · ${s.culture}`;
  const descriptionLines=[originLine,s.shortDescription];
  const nativeFont=fonts[s.originCountry]||(['SA','IQ','YE'].includes(s.originCountry)?fonts.arabic:fonts.latin);
  const staticFingerprint=hash(JSON.stringify([5,sourceSha256,titleSha256,s.nativeName,s.name,descriptionLines,nativeFont.sha256,fonts.latin.sha256,nameColor]));
  const nameMotion=nameMotionFor(s.id,source);
  const fingerprint=hash(JSON.stringify([6,staticFingerprint,nameMotion]));
  const cached=previous[s.id];
  if(cached?.fingerprint===fingerprint&&existsSync(join(root,'public',cached.video))){characters[s.id]=cached;continue;}
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
   @font-face{font-family:NativeHand;src:url('${nativeFont.data}');font-weight:100 900}@font-face{font-family:EnglishHand;src:url('${fonts.latin.data}');font-weight:100 900}
   *{box-sizing:border-box}body{margin:0;width:1080px;height:1920px;background:radial-gradient(ellipse at 50% 48%,#372840 0%,#181322 58%,#100e19 100%);color:#fff5e6;font-family:Arial,sans-serif;text-align:center}
   .title-image{position:absolute;top:120px;left:120px;width:840px;height:auto}header{position:absolute;top:300px;left:120px;width:840px;color:${nameColor};text-shadow:0 2px 3px #3b1020,0 0 16px #ff7a3559}h1{font-family:NativeHand;font-size:${s.nativeName.length>18?52:66}px;line-height:1.2;margin:0;font-weight:400}h2{font-family:EnglishHand;font-size:36px;line-height:1.2;color:${nameColor};font-weight:500;margin:4px 0 0;letter-spacing:1px}
   .description{position:absolute;top:1570px;left:100px;width:880px;font-size:34px;line-height:1.5;margin:0;color:#e8deed}.description span{display:block;white-space:nowrap}.origin{color:#e4bb86}
  </style><img class="title-image" src="${titleData}" alt="Halloween Tricks by HelloTalk"><header><h1 dir="auto">${escape(s.nativeName)}</h1><h2>${escape(s.name)}</h2></header><p class="description"><span class="origin">${escape(originLine)}</span><span>${escape(s.shortDescription)}</span></p>`);
  await page.evaluate(()=>document.fonts.ready);
  await page.locator('.title-image').evaluate(image=>image.decode());
  const layout=await page.evaluate(()=>{
   const description=document.querySelector('.description');
   const lines=[...description.querySelectorAll('span')];
   let fontSize=34;
   while(lines.some(line=>line.scrollWidth>description.clientWidth)&&fontSize>22)description.style.fontSize=`${--fontSize}px`;
   return {descriptionLineCount:lines.length,descriptionFontSize:fontSize,fits:lines.every(line=>line.scrollWidth<=description.clientWidth)&&document.querySelector('header').getBoundingClientRect().bottom<440&&description.getBoundingClientRect().bottom<1770};
  });
  const fits=layout.fits;
  if(!fits)throw Error(`Text exceeds safe area: ${s.id}`);
  const staticBackground=join(dir,'static-background.png');await page.screenshot({path:staticBackground});
  await page.addStyleTag({content:'body{background:transparent}.title-image,.description{visibility:hidden}'});
  const nameBitmap=await page.screenshot({omitBackground:true,clip:{x:0,y:270,width:1080,height:190}});
  await renderNameFrames(page,dir,nameBitmap,nameMotion);
  await page.addStyleTag({content:'body{background:radial-gradient(ellipse at 50% 48%,#372840 0%,#181322 58%,#100e19 100%)}.title-image,.description{visibility:visible}header{visibility:hidden}'});
  const background=join(dir,'background.png');await page.screenshot({path:background});
  const baseFilter='[0:v]fps=24,format=rgba,colorkey=0x00ff00:0.22:0.10,despill=type=green:mix=0.5:expand=0:green=-1,scale=608:1080:force_original_aspect_ratio=decrease[key];[1:v][key]overlay=(W-w)/2:440:shortest=1';
  const encoding=['-map','[out]','-map','0:a?','-c:v','libx264','-preset','veryfast','-crf','22','-threads','4','-c:a','aac','-b:a','128k','-movflags','+faststart','-shortest'];
  let reducedMotionVideo,reducedMotionSha256;
  if(cached&&(cached.staticFingerprint===staticFingerprint||cached.fingerprint===staticFingerprint)){
   reducedMotionVideo=cached.reducedMotionVideo||cached.video;
   if(existsSync(join(root,'public',reducedMotionVideo)))reducedMotionSha256=hash(readFileSync(join(root,'public',reducedMotionVideo)));
  }
  if(!reducedMotionSha256){
   const file=join(dir,'static.mp4');
   execFileSync('ffmpeg',['-v','error','-y','-filter_complex_threads','2','-i',sourceFile,'-loop','1','-framerate','24','-i',staticBackground,'-filter_complex',baseFilter+',format=yuv420p[out]',...encoding,file]);
   const data=readFileSync(file);reducedMotionSha256=hash(data);reducedMotionVideo=`/art/social-videos/${s.id}.${reducedMotionSha256.slice(0,12)}.mp4`;writeFileSync(join(root,'public',reducedMotionVideo),data);
  }
  const video=join(dir,'video.mp4');
  execFileSync('ffmpeg',['-v','error','-y','-filter_complex_threads','2','-i',sourceFile,'-loop','1','-framerate','24','-i',background,'-framerate','24','-i',join(dir,'name-%03d.png'),
   '-filter_complex',baseFilter+`[base];[2:v]format=rgba,tpad=start_mode=clone:start_duration=${nameMotion.start}:stop_mode=clone:stop_duration=${source.duration}[names];[base][names]overlay=0:270:shortest=1,format=yuv420p[out]`,...encoding,video]);
  const bytes=readFileSync(video),sha256=hash(bytes),filename=`${s.id}.${sha256.slice(0,12)}.mp4`;
  writeFileSync(join(out,filename),bytes);
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','json',video],{encoding:'utf8'}));
  const poster=`${s.id}.${sha256.slice(0,12)}.jpg`;
  execFileSync('ffmpeg',['-v','error','-y','-ss',String(nameMotion.start+nameMotion.duration+.1),'-i',video,'-frames:v','1','-q:v','3',join(out,poster)]);
  characters[s.id]={id:s.id,nativeName:s.nativeName,name:s.name,descriptionEn:s.shortDescription,originCountry:s.originCountry,country,culture:s.culture,descriptionLines,nameStyle:{color:nameColor,nativeFont:nativeFont.path,nativeFontSha256:nativeFont.sha256,englishFont:fonts.latin.path,englishFontSha256:fonts.latin.sha256},descriptionLineCount:layout.descriptionLineCount,descriptionFontSize:layout.descriptionFontSize,titleImage,titleSha256,video:`/art/social-videos/${filename}`,poster:`/art/social-videos/${poster}`,width:1080,height:1920,duration:Number(probe.format.duration),bytes:bytes.length,sha256,source:source.entrance,sourceSha256,fingerprint,staticFingerprint,nameMotion,reducedMotionVideo,reducedMotionSha256};
  saveManifest({...previous,...characters});
  console.log(`${s.id}: ${characters[s.id].duration}s, ${(bytes.length/1e6).toFixed(2)} MB`);
 }
 saveManifest(characters);
 writeFileSync(join(out,'index.html'),`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Portrait sharing videos</title><style>body{background:#181322;color:#fff5e6;font:16px system-ui;padding:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:24px}video{width:100%;max-height:65vh}a{color:#e4bb86}</style><h1>Portrait sharing videos</h1><p>Existing footage and audio. Names animate with the spoken name near the end of each video, then hold still. Native names and English character descriptions. Add invitation links manually in Instagram Story stickers or an eligible TikTok profile.</p><main>${Object.values(characters).map(c=>`<article><h2>${escape(c.nativeName)}</h2><video data-reduced="${c.reducedMotionVideo?.split('/').pop()||c.video.split('/').pop()}" controls playsinline preload="none" poster="${c.poster.split('/').pop()}" src="${c.video.split('/').pop()}"></video><p>${(c.descriptionLines||[c.descriptionEn]).map(escape).join('<br>')}</p><a download href="${c.video.split('/').pop()}">Download MP4</a></article>`).join('')}</main><script>if(matchMedia('(prefers-reduced-motion: reduce)').matches)document.querySelectorAll('video[data-reduced]').forEach(v=>{v.src=v.dataset.reduced;v.closest('article').querySelector('a').href=v.dataset.reduced});</script>`);
}finally{await browser.close();rmSync(dir,{recursive:true,force:true});}
