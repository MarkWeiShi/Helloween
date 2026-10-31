import {test,expect,chromium} from '@playwright/test';
import {startBrowserApp} from '../helpers/nginx.mjs';
let app:Awaited<ReturnType<typeof startBrowserApp>>;
test.beforeAll(async()=>{app=await startBrowserApp();});test.afterAll(async()=>{await app.stop();});
test('global scores are shared across users and ordinary playback submits numeric measurements',async()=>{
 const browser=await chromium.launch({channel:'chrome',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try {
 const base=app.origin;
 const a=await browser.newContext({permissions:['microphone']});
 const b=await browser.newContext({permissions:['microphone']});
 const pages=await Promise.all([a.newPage(),b.newPage()]);
 for(const page of pages){
  await page.goto(base+'/?lang=en');
  await page.locator('.play-unlock').click();
  await expect(page.locator('.unlock-consent')).toHaveCount(0);

  await expect(page.locator('.play-lock')).toHaveCount(0);
 }
 const response=await a.request.post(base+'/api/spirits/jiangshi/scare',{data:{consent:true,scoringVersion:2,echoCancellation:true,meanHz:600,meanRms:.1,frames:80},headers:{origin:base}});
 expect(response.status()).toBe(200);
 const awaitingSample=pages[1].waitForRequest(r=>r.method()==='POST'&&r.url().endsWith('/spirits/jiangshi/scare'),{timeout:25000});
 for(const page of pages){
  await page.locator('[data-globe-spirit="jiangshi"]').dispatchEvent('click');
  await expect(page.locator('[data-world-scariness]')).toHaveText('World Scariness 48 / 100');
  await expect(page.locator('[data-world-samples], .reaction-capture-controls, .reaction-capture-progress')).toHaveCount(0);
 }
 const request=await awaitingSample;
 const payload=request.postDataJSON();
 expect(payload.scoringVersion).toBe(2);expect(payload.consent).toBe(true);
 expect(payload).not.toHaveProperty('audio');expect(payload).toHaveProperty('meanHz');

 const global=await(await b.request.get(base+'/api/character-scares')).json();
 expect(global.stats.find((s:any)=>s.spiritId==='jiangshi').samples).toBeGreaterThanOrEqual(1);
 }finally{await browser.close();}
});
