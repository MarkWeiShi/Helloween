import {test,expect} from '@playwright/test';
test.use({launchOptions:{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']}});
test('loading waits for a presented frame; close has no circle and WhatsApp uses a transparent bundled glyph',async({page,context})=>{
 await context.grantPermissions(['microphone']);await page.setViewportSize({width:390,height:844});
 await page.addInitScript(()=>{
  const native=HTMLVideoElement.prototype.requestVideoFrameCallback;
  (window as any).heldFrames=[];(window as any).holdVideoFrames=true;
  HTMLVideoElement.prototype.requestVideoFrameCallback=function(callback){return native.call(this,(now,meta)=>{
   if((window as any).holdVideoFrames)(window as any).heldFrames.push(()=>callback(now,meta));else callback(now,meta);
  });};
 });
 await page.goto('/?lang=en');await page.locator('.play-unlock').click();await page.locator('[data-confirm-unlock]').click();
 await expect(page.locator('.play-lock')).toHaveCount(0);
 await page.locator('[data-globe-spirit="jiangshi"]').dispatchEvent('click');
 await page.waitForFunction(()=>(window as any).heldFrames.length>0);
 const loading=page.locator('.transformation-loading');
 await expect(loading).toBeVisible();
 await expect(page.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow','100');
 await expect(page.locator('.character-close')).toHaveCSS('border-top-width','0px');
 await expect(page.locator('.character-close')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 const whatsapp=page.locator('.character-sns [data-channel=whatsapp]');
 await expect(whatsapp.locator('svg.social-logo path')).toHaveCount(1);
 await expect(whatsapp.locator('img,rect,image')).toHaveCount(0);
 await page.evaluate(()=>{(window as any).holdVideoFrames=false;for(const cb of (window as any).heldFrames)cb();});
 await expect(loading).toBeHidden();
 await expect(page.locator('.transformation-player canvas').first()).toBeVisible();
 await page.screenshot({path:process.env.VIDEO_UI_PREVIEW_PATH || 'artifacts/video-ready-ui.png'});
 await page.locator('.character-close').click();await expect(loading).toHaveCount(0);
});
