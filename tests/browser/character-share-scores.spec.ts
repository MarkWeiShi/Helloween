import {test,expect} from '@playwright/test';
const base=process.env.WD_ACCEPTANCE_ORIGIN || 'http://127.0.0.1:8787';
for(const width of [320,390])test(`character sharing and paired scores at ${width}px`,async({browser})=>{
 const context=await browser.newContext({viewport:{width,height:844},permissions:['microphone']});
 try{
  const page=await context.newPage();const authRequests:string[]=[];page.on('request',r=>{if(r.url().includes('/api/auth/'))authRequests.push(r.url());});
  await page.goto(base+'/?lang=en');await page.locator('.play-unlock').click();await expect(page.locator('.play-lock')).toHaveCount(0);
  const me=await(await context.request.get(base+'/api/me')).json();
  await page.evaluate(({id})=>localStorage.setItem(`boo:personal-scare:v1:${id}:headless-horseman`,JSON.stringify({score:42,meanHz:400,meanRms:.1})),{id:me.player.id});
  for(const selector of ['.character-share','.scare-action']){
   await page.locator('[data-globe-spirit="headless-horseman"]').dispatchEvent('click');
   await expect(page.locator('[data-personal-scare]')).toHaveText('You 42/100');
   await expect(page.locator('[data-world-scariness]')).toHaveText('World Scariness 0 / 100');
   const left=(await page.locator('[data-world-scariness]').boundingBox())!,right=(await page.locator('[data-personal-scare]').boundingBox())!;
   expect(left.x+left.width).toBeLessThanOrEqual(right.x);expect(left.y).toBeCloseTo(right.y,0);
   await page.locator(selector).click();await expect(page.locator('.share-preview')).toBeVisible();await expect(page.locator('[data-action=send-share]')).toHaveCount(6);expect(authRequests).toEqual([]);
   await page.locator('.modal-close[data-action=close]').click();
  }
  // A measured silent sample is a distinct result, not a numeric zero.
  await page.evaluate(({id})=>localStorage.setItem(`boo:personal-scare:v1:${id}:headless-horseman`,JSON.stringify({score:null,meanHz:null,meanRms:0})),{id:me.player.id});
  await page.locator('[data-globe-spirit="headless-horseman"]').dispatchEvent('click');
  await expect(page.locator('.scariness-row [data-personal-scare]')).toHaveText('No voice');
  await page.screenshot({path:`artifacts/character-score-row-${width}.png`});
 }finally{await context.close();}
});
