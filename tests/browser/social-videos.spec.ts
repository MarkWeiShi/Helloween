import {test,expect,type Page} from '@playwright/test';
test.use({baseURL:process.env.WD_CHALLENGE_ORIGIN||'http://127.0.0.1:5174'});
async function mount(page:Page,channel:string,lang='en'){
 await page.goto(`/art/social-videos/index.html?lang=${lang}`);
 await page.evaluate(async({channel})=>{
  await (await import('/src/i18n.ts')).initLanguage();
  await import('/src/style.css');
  document.body.innerHTML='<div id="handoff" style="max-width:480px;margin:auto;padding:16px"></div>';
  const {mountSocialHandoff}=await import('/src/social-share.ts');
  await mountSocialHandoff(document.querySelector('#handoff')!,channel,'https://example.com/i/actual-invite','fallback','/unused.jpg','jiangshi');
 },{channel});
}
for(const channel of ['instagram','tiktok'])test(`${channel}: playable portrait download, correct link and manual publishing guidance`,async({page})=>{
 await page.route('**/api/social/config',r=>r.abort()); // Manual publishing needs no developer configuration.
 await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{(window as any).copied=text;}}}));
 await mount(page,channel);
 const panel=page.locator('.social-handoff'),video=panel.locator('video');
 await expect(video).toBeVisible();
 await expect(panel).toContainText('China · Chinese folk narratives');
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.videoWidth)).toBe(1080);
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.videoHeight)).toBe(1920);
 await video.evaluate((v:HTMLVideoElement)=>{v.muted=true;return v.play();});
 await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(0);
 await expect(panel).toContainText(channel==='instagram'?'Tap Stickers → Link':'URLs in the video or caption are not guaranteed to be clickable');
 await panel.locator('[data-copy-video-link]').click();
 expect(await page.evaluate(()=>(window as any).copied)).toBe('https://example.com/i/actual-invite');
 await panel.locator('[data-copy-video-post]').click();
 expect(await page.evaluate(()=>(window as any).copied)).toContain('https://example.com/i/actual-invite');
 const downloadEvent=page.waitForEvent('download');await panel.locator('a[download]').click();
 const download=await downloadEvent;expect(download.suggestedFilename()).toBe(`jiangshi-${channel}.mp4`);expect(await download.failure()).toBeNull();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`artifacts/social-videos/${channel}-${test.info().project.name}.png`,fullPage:true});
});
test('Chinese instructions and clipboard fallback preserve the invitation',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied');}}}));
 await mount(page,'instagram','zh');
 await expect(page.locator('.social-handoff')).toContainText('链接贴纸需要你在 Instagram 内手动添加');
 await page.locator('[data-copy-video-link]').click();
 await expect(page.locator('[data-video-status]')).toContainText('手动复制');
 await expect(page.locator('input')).toHaveValue('https://example.com/i/actual-invite');
});
test('missing media manifest offers a working retry',async({page})=>{
 let fail=true;await page.route('**/art/social-videos/manifest.json',route=>fail?route.fulfill({status:503,body:'unavailable'}):route.continue());
 await mount(page,'tiktok');await expect(page.getByRole('button',{name:'Retry',exact:true})).toBeVisible();
 fail=false;await page.getByRole('button',{name:'Retry',exact:true}).click();await expect(page.locator('video')).toBeVisible();
});
test('reduced motion uses static names for both preview and download',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await mount(page,'instagram');
 const manifest=await (await page.request.get('/art/social-videos/manifest.json')).json();
 await expect(page.locator('video')).toHaveAttribute('src',manifest.characters.jiangshi.reducedMotionVideo);
 await expect(page.locator('a[download]')).toHaveAttribute('href',manifest.characters.jiangshi.reducedMotionVideo);
 await expect(page.locator('.social-handoff')).toContainText('Static names are selected');
});
