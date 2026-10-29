// Real-browser layout audit. Uses an isolated in-memory app and synthetic accounts;
// no production requests, messages, recordings or authentication providers.
import {chromium} from '@playwright/test';
import {createApp} from '../server/index.mjs';
import {languages,localizeCatalog} from '../shared/i18n.mjs';
import {loadCatalog} from '../server/content.mjs';
import {mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const output=resolve(process.env.LAYOUT_OUTPUT||'artifacts/locale-layout');mkdirSync(output,{recursive:true});
const app=createApp({databasePath:':memory:',rateLimits:false,staticRoot:resolve(process.env.LAYOUT_DIST||'dist'),authOptions:{url:'https://identity.example',key:'layout-test',fetcher:async()=>Response.json({})}});
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${app.server.address().port}`;
const catalog=loadCatalog();
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHROME_CHANNEL||'chrome',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const sourceHash=()=>{const hash=createHash('sha256');for(const path of readdirSync('src',{recursive:true}).filter(x=>/\.(ts|css|json)$/.test(x)).sort())hash.update(path).update(readFileSync('src/'+path));return hash.digest('hex');};
const report={startedAt:new Date().toISOString(),browser:browser.version(),sourceHash:sourceHash(),screens:[],catalogChecks:0,recordingStateChecks:0,issues:[],errors:[]};
// Check the rendered box, text fragments, clipping ancestors and action line counts.
// Vertical document/dialog scrolling is intentional. Ellipsized user names and
// single-line form values are intentionally excluded; authored labels are not.
function measure(){
 const issues=[];const dialog=document.querySelector('dialog[open]');
 const root=dialog||document.querySelector('#app')||document.body;
 if(document.documentElement.scrollWidth>innerWidth+2)issues.push({kind:'page-width',width:document.documentElement.scrollWidth});
 const visible=el=>!!el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'&&!el.closest('[hidden], [inert]');
 for(const el of root.querySelectorAll('*')){
  if(!visible(el)||el.closest('svg,canvas,.globe-pins,.language-menu:not(:popover-open)')||['INPUT','SELECT','AUDIO','VIDEO','IMG'].includes(el.tagName))continue;
  const text=[...el.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim());if(!text.length)continue;
  const style=getComputedStyle(el),rect=el.getBoundingClientRect();
  if(style.textOverflow==='ellipsis')continue;
  const fragments=text.flatMap(n=>{const r=document.createRange();r.selectNodeContents(n);return [...r.getClientRects()];});
  const label=text.map(n=>n.textContent.trim()).join(' '),selector=el.tagName.toLowerCase()+(el.className?'.'+String(el.className).trim().split(/\s+/).join('.'):''),ys=new Set(fragments.map(r=>Math.round(r.y)));
  const overflow=fragments.some(r=>r.left<-2||r.right>innerWidth+2);
  let clip=false;for(let p=el;p&&p!==root.parentElement;p=p.parentElement){const s=getComputedStyle(p),b=p.getBoundingClientRect();if(['hidden','clip','auto','scroll'].includes(s.overflowX)&&s.textOverflow!=='ellipsis'&&fragments.some(r=>r.left<b.left-2||r.right>b.right+2))clip=true;}
  if(overflow||clip)issues.push({kind:overflow?'text-outside-viewport':'text-clipped',selector,text:label});
  if(el.matches('button,.action-caption,.mobile-nav .nav-item span,.play-unlock span')&&ys.size>2)issues.push({kind:'action-lines',selector,text:label,lines:ys.size});
  if(el.matches('.share-preview h2')&&ys.size>4)issues.push({kind:'preview-title-lines',text:label,lines:ys.size});
  if(el.matches('h1,h2')&&style.display!=='inline'&&fragments.some(r=>r.left<rect.left-2||r.right>rect.right+2))issues.push({kind:'heading-width',selector,text:label});
 }
 const info=document.querySelector('.character-immersive .character-info');if(info&&info.getBoundingClientRect().bottom>innerHeight+2)issues.push({kind:'recording-controls-clipped'});
 const confirm=document.querySelector('[data-confirm-unlock]');if(confirm){const r=confirm.getBoundingClientRect(),d=dialog.getBoundingClientRect();if(r.bottom>d.bottom-4||r.bottom>innerHeight-4)issues.push({kind:'confirm-below-fold',bottom:r.bottom});}
 const nav=dialog?[]:[...document.querySelectorAll('.mobile-nav .nav-item')].filter(visible);for(const n of nav){const r=n.getBoundingClientRect(),s=n.querySelector('span:last-child');if(s){const b=s.getBoundingClientRect();if(b.left<r.left-1||b.right>r.right+1)issues.push({kind:'nav-width',text:s.textContent});}}
 return issues;
}
async function capture(page,locale,width,screen){
 await page.evaluate(()=>document.fonts.ready);const issues=await page.evaluate(measure);
 report.screens.push({locale,width,screen,issues:issues.length});report.issues.push(...issues.map(x=>({locale,width,screen,...x})));
 if(process.env.LAYOUT_SCREENSHOTS!=='0')await page.screenshot({path:`${output}/${locale}-${width}-${screen}.png`,fullPage:false});
}
async function click(page,selector){await page.locator(selector).first().click({timeout:10000});}
async function close(page){await page.keyboard.press('Escape');}
async function unlock(page){await click(page,'.play-unlock');await click(page,'[data-confirm-unlock]');await page.locator('.play-lock').waitFor({state:'detached'});}
try{
 const codes=(process.env.LAYOUT_LOCALES||languages.map(x=>x[0]).join(',')).split(',');
 const widths=(process.env.LAYOUT_WIDTHS||'320,390,768,1024,1440').split(',').map(Number);
 for(const locale of codes)for(const width of widths){
  const height=width===320?640:width===390?844:900;
  const dict=JSON.parse(readFileSync(`src/locales/${locale}.json`,'utf8'));
  const context=await browser.newContext({locale,viewport:{width,height},permissions:['microphone'],reducedMotion:'reduce'});
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push({locale,width,error:e.message}));
  try{
   const guest=app.store.createGuest();app.store.onboard(guest.player.id,{name:'Alexandra Montgomery',country:'DE',spiritId:'jiangshi'});
   const login=app.store.accountLogin(guest.player.id,`layout-${locale}-${width}`);
   app.store.db.prepare('UPDATE players SET wallet=999,candies=999 WHERE id=?').run(guest.player.id);
   for(const s of catalog.spirits)app.store.db.prepare('INSERT OR REPLACE INTO progress VALUES(?,?,100,?)').run(guest.player.id,s.id,Date.now());
   const link=app.store.createInvite(guest.player.id,{spiritId:'jiangshi',channel:'copy',friendName:'Alexandra Montgomery'});
   app.store.recordAudio(app.store.createGuest().player.id,link.id,{consent:true,mime:'audio/webm',audio:Buffer.from([0x1a,0x45,0xdf,0xa3,1,2,3]).toString('base64'),durationMs:2000,score:88,meanHz:300,peakHz:500,frames:10});
   await context.addCookies([{name:'boo_session',value:login.token,url:origin}]);
   if(process.env.LAYOUT_SHARING_ONLY==='1'){
    await page.goto(`${origin}/?lang=${locale}`);await unlock(page);
    await page.evaluate(id=>localStorage.setItem(`boo:personal-scare:v1:${id}:jiangshi`,JSON.stringify({score:88})),guest.player.id);
    await click(page,'.globe-pin[data-spirit="jiangshi"]');await click(page,'.character-share');await page.locator('.share-preview').waitFor();
    await capture(page,locale,width,'share');console.log(`${locale} ${width}: sharing complete`);continue;
   }
   await page.goto(`${origin}/?lang=${locale}`);await page.locator('.play-unlock').waitFor();if(await page.locator('html').getAttribute('lang')!==locale)throw Error('Wrong locale loaded');await capture(page,locale,width,'locked');
   await click(page,'.language-trigger');await capture(page,locale,width,'languages');await page.keyboard.press('Escape');
   await click(page,'.play-unlock');await capture(page,locale,width,'consent');await click(page,'[data-confirm-unlock]');await page.locator('.play-lock').waitFor({state:'detached'});
   await capture(page,locale,width,'map');await click(page,'[data-action="stats-help"]');await capture(page,locale,width,'stats');await close(page);
   await page.evaluate(id=>localStorage.setItem(`boo:personal-scare:v1:${id}:jiangshi`,JSON.stringify({score:88,meanHz:300,meanRms:.2})),guest.player.id);
   await click(page,'.globe-pin[data-spirit="jiangshi"]');await page.locator('[data-personal-scare]').waitFor();
   await page.evaluate(()=>document.querySelectorAll('video').forEach(video=>video.pause()));
   const statusKeys=['首次变身时录音 3 秒，测测它有多吓人','对我的可怕程度 · 未测得有效声音','● 正在录音 2 秒，本机评分后发送给邀请人…','● 正在录音 3 秒，仅在本机计算评分…','已取消录音及发送。可重新播放，在本机计算评分。','麦克风不可用，本次仅播放动画，不录音或上传。','变身素材暂不可用，请点击播放重试。','{{0}} · 发送失败，录音暂留本页，可重试或取消。','{{0}} · 录音尚未发送，可重试或取消。','This link already has five recordings. Your recording was not saved.'];
   for(const key of statusKeys){
    const message=(dict[key]||key).replace('{{0}}',(dict['对我的可怕程度 · {{0}} / 100']||'Score {{0}} / 100').replace('{{0}}','88'));
    await page.evaluate(message=>{document.querySelector('[data-personal-scare]').textContent=message;document.querySelectorAll('.reaction-capture-controls button').forEach(button=>button.hidden=false);},message);
    const issues=await page.evaluate(measure);report.recordingStateChecks++;report.issues.push(...issues.map(x=>({locale,width,screen:'recording-state',key,...x})));
   }
   await capture(page,locale,width,'recording-controls');await close(page);
   await click(page,'[data-action="collection"]');await capture(page,locale,width,'collection');
   await click(page,'[data-lore="jiangshi"]');await capture(page,locale,width,'lore');
   // Exercise every character's translated name, folklore, wish and story in the
   // actual mounted components, keeping their original layout and type styles.
   const localized=localizeCatalog(structuredClone(catalog),dict);
   for(const s of localized.spirits){
    await page.evaluate(s=>{document.querySelector('.lore-top h2').textContent=s.name;document.querySelector('.lore-top>span').textContent=s.culture;document.querySelector('.lore-copy>p').textContent=s.folklore;document.querySelector('.wish-excerpt p').textContent=s.wish;const b=document.querySelector('[data-action="equip"]');const icon=b.querySelector('.icon');b.replaceChildren(...(icon?[icon]:[]),document.createTextNode(s.action));},{...s,action:dict['{{0}} Join the parade as {{1}}'].replace('{{0}}','').replace('{{1}}',s.name)});
    const issues=await page.evaluate(measure);report.catalogChecks++;report.issues.push(...issues.map(x=>({locale,width,screen:'catalog-lore',character:s.id,...x})));
   }
   await click(page,'[data-action="story"]');await page.locator('.story-copy').waitFor();await capture(page,locale,width,'story');
   for(const s of localized.spirits)for(const part of s.story||[]){await page.evaluate(part=>{document.querySelector('.story-copy h2').textContent=part.title;document.querySelector('.story-copy>p').textContent=part.text;},part);const issues=await page.evaluate(measure);report.catalogChecks++;report.issues.push(...issues.map(x=>({locale,width,screen:'catalog-story',character:s.id,...x})));}
   await click(page,'#story-next');await click(page,'#story-next');await capture(page,locale,width,'ending');
   await click(page,'[data-action="share"]');await capture(page,locale,width,'share');await close(page);
   await click(page,'[data-action="profile"]');await capture(page,locale,width,'profile');await close(page);
   await click(page,'[data-page="boards"]:visible');await page.locator('.board-row').first().waitFor();await capture(page,locale,width,'leaderboard');
   await click(page,'[data-action="about"]');await capture(page,locale,width,'about');await close(page);
   await page.goto(`${origin}/my-links?lang=${locale}`);await page.locator('.ghost-link-card').waitFor();await capture(page,locale,width,'recordings');
   await click(page,'[data-action="signout"]');await page.locator('[data-action="signin"]').waitFor();await capture(page,locale,width,'empty-recordings');await click(page,'[data-action="signin"]');await page.locator('.account-panel').waitFor();await capture(page,locale,width,'signin');await close(page);
   await page.goto(`${origin}/i/${link.id}?lang=${locale}`);await click(page,'.play-unlock');await capture(page,locale,width,'invite-consent');await click(page,'[data-confirm-unlock]');await page.locator('[data-invite-play]').waitFor();await capture(page,locale,width,'invite');
   console.log(`${locale} ${width}: complete`);
  }catch(e){report.errors.push({locale,width,error:e.stack});console.log(`${locale} ${width}: ${e.message}`);}
  finally{await context.close();writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));}
 }
}finally{await browser.close();await new Promise(r=>app.server.close(r));app.close();}
report.finishedAt=new Date().toISOString();report.sourceUnchanged=sourceHash()===report.sourceHash;if(!report.sourceUnchanged)report.errors.push({error:'Source changed during audit; rebuild and rerun'});writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({screens:report.screens.length,catalogChecks:report.catalogChecks,recordingStateChecks:report.recordingStateChecks,issues:report.issues.length,errors:report.errors.length}));
if(report.errors.length||report.issues.length)process.exitCode=1;
