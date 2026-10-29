import {test,expect} from '@playwright/test';
import {previewTransformations} from '../../shared/preview-transformations.mjs';
const base=process.env.WD_ACCEPTANCE_ORIGIN || 'http://127.0.0.1:8787';
for(const [region,id] of Object.entries(previewTransformations)){
 test(`${region}: ${id} opens its own entrance and animated loop`,async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},permissions:['microphone']});
  try{
   const page=await context.newPage();await page.goto(base+'/?lang=en');
   await page.locator('.play-unlock').click();await page.locator('[data-confirm-unlock]').click();
   await expect(page.locator('.play-lock')).toHaveCount(0);
   // Exercise the globe pin's real click handler regardless of globe rotation.
   await page.locator(`[data-preview-transform="${id}"]`).dispatchEvent('click');
   const dialog=page.locator('dialog.character-immersive');await expect(dialog).toBeVisible();
   await page.waitForFunction(()=>{const v=document.querySelector<HTMLVideoElement>('video[data-phase=intro]');return v&&!v.paused&&v.currentTime>.25&&v.videoWidth>0;},undefined,{timeout:20000});
   const intro=dialog.locator('video[data-phase=intro]');await expect(intro).toHaveAttribute('src',new RegExp(`/transformations/${id}/`));
   const canvas=dialog.locator('.transformation-player canvas');await expect(canvas).toBeVisible();
   const first=await canvas.screenshot();await page.waitForTimeout(400);expect((await canvas.screenshot()).equals(first)).toBe(false);
   await intro.evaluate((v:HTMLVideoElement)=>{v.playbackRate=4;});
   await page.waitForFunction(()=>{const v=document.querySelector<HTMLVideoElement>('video[data-phase=loop]');return v&&!v.paused&&v.currentTime>.1;},undefined,{timeout:15000});
   const loop=dialog.locator('video[data-phase=loop]');await expect(loop).toHaveAttribute('src',new RegExp(`/transformations/${id}/`));
   expect(await loop.evaluate((v:HTMLVideoElement)=>v.loop&&!v.error)).toBe(true);
   const a=await canvas.screenshot();await page.waitForTimeout(500);expect((await canvas.screenshot()).equals(a)).toBe(false);
   // Observe three actual loop boundaries at normal speed, not just a loaded first frame.
   await loop.evaluate((v:HTMLVideoElement)=>new Promise<void>((resolve,reject)=>{
    let previous=v.currentTime,wraps=0;const deadline=performance.now()+12000;
    const tick=()=>{if(v.error||v.paused||performance.now()>deadline){reject(new Error('Loop did not remain active for three cycles'));return;}
     if(v.currentTime<previous)wraps++;previous=v.currentTime;
     if(wraps>=3)resolve();else requestAnimationFrame(tick);
    };tick();
   }));
   await dialog.locator('[data-play-transform]').click();
   await page.waitForFunction(()=>{const v=document.querySelector<HTMLVideoElement>('video[data-phase=intro]');return v&&!v.paused&&v.currentTime>.1;},undefined,{timeout:15000});
   await page.locator('.character-close').click();await expect(dialog).toHaveCount(0);
  }finally{await context.close();}
 });
}
