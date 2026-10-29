import {test,expect,chromium} from '@playwright/test';
test('globe character occupies viewport and keeps video uncropped',async()=>{
 const browser=await chromium.launch({channel:'chrome',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try {
  for(const viewport of [{width:390,height:844},{width:320,height:568},{width:844,height:390},{width:1280,height:800}]) {
   const context=await browser.newContext({viewport,permissions:['microphone']});
   const page=await context.newPage();
   await page.goto('http://127.0.0.1:8787');
   await page.getByRole('button',{name:'Enable Mic & Play',exact:true}).click();
   const pin=page.locator('.globe-pin[data-spirit="kappa"]');
   await expect(pin).toBeVisible(); await pin.click();
   const dialog=page.locator('dialog.character-immersive');
   await expect(dialog).toBeVisible();
   const box=await dialog.boundingBox(); expect(box?.width).toBeCloseTo(viewport.width,0);expect(box?.height).toBeCloseTo(viewport.height,0);
   const stage=dialog.locator('.character-stage');
   expect((await stage.boundingBox())!.height).toBeGreaterThan(150);
   await expect(dialog.locator('.transformation-player')).toHaveCount(1);
   await expect(dialog.locator('.fill-character')).toHaveCount(0);
   await expect(dialog.locator(':scope > .immersive-video-layer')).toHaveCount(1);
   expect(await dialog.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(await dialog.locator('.character-info').evaluate(el=>getComputedStyle(el).backgroundColor));
   expect(await stage.evaluate(el=>getComputedStyle(el).overflow)).toBe('visible');
   expect(await dialog.locator('canvas').evaluate(el=>getComputedStyle(el).objectFit)).toBe('contain');
   const info=await dialog.locator('.character-info').boundingBox();
   expect(info!.y+info!.height).toBeLessThanOrEqual(viewport.height+1);
   expect((await stage.boundingBox())!.y+(await stage.boundingBox())!.height).toBeLessThanOrEqual(info!.y+1);
   await expect(dialog.getByRole('button',{name:'Trick — scare a friend',exact:true})).toBeInViewport();
   await expect(dialog.getByRole('button',{name:'Treat — give sweet',exact:true})).toBeInViewport();
   await expect(dialog.locator('.mini-meter')).toContainText(['Scariness 0 / 100','Sweetness 0 / 100']);
   expect(await dialog.evaluate(el=>el.scrollHeight<=el.clientHeight+1)).toBe(true);
   await page.screenshot({path:`artifacts/immersive-${viewport.width}.png`});
   await page.getByRole('button',{name:'Close character details',exact:true}).click();
   await expect(dialog).toHaveCount(0);
   await context.close();
  }
 } finally {await browser.close();}
});
