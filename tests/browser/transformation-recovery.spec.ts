import {test,expect} from '@playwright/test';
test.use({launchOptions:{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']}});
async function open(page:any){
 await page.goto('/?lang=en');
 await page.locator('.play-unlock').click();
 await expect(page.locator('.play-lock')).toHaveCount(0);
}
test('failed entrance shows centered loading and automatically recovers without revealing the poster',async({page,context})=>{
 await context.grantPermissions(['microphone']);await open(page);
 let attempts=0;await page.route('**/*entrance*.mp4',route=>{attempts++;return route.abort();});
 await page.locator('[data-globe-spirit="jiangshi"]').dispatchEvent('click');
 await expect.poll(()=>attempts).toBeGreaterThan(0);
 await expect(page.locator('[data-play-transform]')).toBeVisible();
 const loading=page.locator('.transformation-loading');
 await expect(loading).toBeVisible();await expect(loading).toContainText('0%');
 await expect(loading).toContainText(/Preparing video|Buffering video|Load failed/);
 await expect(page.locator('.transformation-player > img')).toBeHidden();
 const spinner=(await page.locator('.transformation-progress').boundingBox())!,viewport=page.viewportSize()!;
 expect(Math.abs(spinner.x+spinner.width/2-viewport.width/2)).toBeLessThan(3);
 expect(Math.abs(spinner.y+spinner.height/2-viewport.height/2)).toBeLessThan(35);
 await page.screenshot({path:`artifacts/loading-${viewport.width}.png`});
 await page.unroute('**/*entrance*.mp4');
 await page.waitForFunction(()=>{const video=document.querySelector<HTMLVideoElement>('video[data-phase=intro]');return video&&!video.paused&&video.currentTime>.1&&video.videoWidth>0;});
 await expect(loading).toBeHidden();await expect(page.locator('.transformation-player > img')).toBeHidden();
});
test('closing failed playback cancels automatic retries and the progress ring never spins',async({page,context})=>{
 await context.grantPermissions(['microphone']);await page.emulateMedia({reducedMotion:'reduce'});await open(page);
 let attempts=0;await page.route('**/*entrance*.mp4',route=>{attempts++;return route.abort();});
 await page.locator('[data-globe-spirit="jiangshi"]').dispatchEvent('click');
 await expect.poll(()=>attempts).toBeGreaterThan(0);await expect(page.locator('[data-play-transform]')).toBeVisible();
 await expect(page.locator('.transformation-progress')).toHaveCSS('animation-name','none');
 await page.locator('.character-close').click();const closedAttempts=attempts;
 await page.waitForTimeout(2200);expect(attempts).toBe(closedAttempts);
 await expect(page.locator('.transformation-loading')).toHaveCount(0);
});
test('a stalled entrance keeps loading through the timeout and resumes after the network recovers',async({page,context})=>{
 await context.grantPermissions(['microphone']);await open(page);
 const held:import('@playwright/test').Route[]=[];
 await page.route('**/*entrance*.mp4',route=>{held.push(route);});
 await page.locator('[data-globe-spirit="jiangshi"]').dispatchEvent('click');
 await expect.poll(()=>held.length).toBeGreaterThan(0);
 await expect(page.locator('.transformation-loading')).toBeVisible();
 // Replay becomes available only once the real 10-second playback timeout fires.
 await expect(page.locator('[data-play-transform]')).toBeVisible({timeout:15000});
 await expect(page.locator('.transformation-loading')).toBeVisible();
 await expect(page.locator('.transformation-player > img')).toBeHidden();
 await page.unroute('**/*entrance*.mp4');
 await Promise.all(held.map(route=>route.abort().catch(()=>{})));
 await page.waitForFunction(()=>{const video=document.querySelector<HTMLVideoElement>('video[data-phase=intro]');return video&&!video.paused&&video.currentTime>.1;},null,{timeout:20000});
 await expect(page.locator('.transformation-loading')).toBeHidden();
});
test('buffer events update a stationary percentage ring and replay resets it',async({page,context})=>{
 await context.grantPermissions(['microphone']);await page.setViewportSize({width:390,height:844});await open(page);
 const held:import('@playwright/test').Route[]=[];
 await page.route('**/*entrance*.mp4',route=>{held.push(route);});
 await page.locator('[data-globe-spirit="jiangshi"]').dispatchEvent('click');
 await expect.poll(()=>held.length).toBeGreaterThan(0);
 const ring=page.getByRole('progressbar',{name:'Video buffer progress'});
 await expect(ring).toHaveAttribute('aria-valuenow','0');
 await page.locator('video[data-phase=intro]').evaluate(video=>{
  Object.defineProperty(video,'buffered',{configurable:true,value:{length:1,start:()=>0,end:()=>1.5}});
  video.dispatchEvent(new Event('progress'));
 });
 await expect(ring).toHaveText('50%');await expect(ring).toHaveAttribute('aria-valuenow','50');
 await expect(ring).toHaveCSS('animation-name','none');
 expect(await ring.evaluate(el=>getComputedStyle(el,'::before').backgroundImage)).toContain('50%');
 await page.waitForTimeout(300);await expect(ring).toHaveText('50%');
 await page.screenshot({path:process.env.LOADING_PREVIEW_PATH || 'artifacts/loading-progress-mobile.png'});
 await page.locator('video[data-phase=intro]').evaluate(video=>{delete (video as any).buffered;video.dispatchEvent(new Event('error'));});
 await expect(page.locator('.transformation-loading')).toContainText('Load failed');
 await page.locator('[data-play-transform]').click();
 await expect(ring).toHaveText('0%');
 await page.locator('.character-close').click();
 await Promise.all(held.map(route=>route.abort().catch(()=>{})));
});
