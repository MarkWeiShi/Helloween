import {test,expect,chromium} from '@playwright/test';
test('global scores are shared across users and ordinary playback submits numeric measurements',async()=>{
 const browser=await chromium.launch({channel:'chrome',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try {
 const base=process.env.WD_ACCEPTANCE_ORIGIN || 'http://127.0.0.1:8787';
 const a=await browser.newContext({permissions:['microphone']});
 const b=await browser.newContext({permissions:['microphone']});
 const pages=await Promise.all([a.newPage(),b.newPage()]);
 for(const page of pages){
  await page.goto(base+'/?lang=en');
  await page.locator('.play-unlock').click();
  await expect(page.locator('.unlock-consent')).toContainText('uploads numbers only');
  await page.locator('[data-confirm-unlock]').click();
  await expect(page.locator('.play-lock')).toHaveCount(0);
 }
 const response=await a.request.post(base+'/api/spirits/jiangshi/scare',{data:{consent:true,scoringVersion:2,echoCancellation:true,meanHz:600,meanRms:.1,frames:80},headers:{origin:base}});
 expect(response.status()).toBe(200);
 for(const page of pages){
  await page.locator('[data-globe-spirit="jiangshi"]').dispatchEvent('click');
  await expect(page.locator('[data-world-scariness]')).toHaveText('World Scariness 48 / 100');
  await expect(page.locator('[data-world-samples]')).toContainText('Participants: 1');
 }
 const request=await pages[1].waitForRequest(r=>r.method()==='POST'&&r.url().endsWith('/spirits/jiangshi/scare'),{timeout:25000});
 const payload=request.postDataJSON();
 expect(payload.scoringVersion).toBe(2);expect(payload.consent).toBe(true);
 expect(payload).not.toHaveProperty('audio');expect(payload).toHaveProperty('meanHz');
 await expect(pages[1].locator('.reaction-capture-controls')).toContainText(/Global score updated|No valid sample/,{timeout:15000});
 const global=await(await b.request.get(base+'/api/character-scares')).json();
 expect(global.stats.find((s:any)=>s.spiritId==='jiangshi').samples).toBeGreaterThanOrEqual(1);
 }finally{await browser.close();}
});
