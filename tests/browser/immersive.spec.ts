import {test,expect,chromium} from '@playwright/test';
import sharp from 'sharp';
test('globe character occupies viewport and keeps video uncropped',async()=>{
 const browser=await chromium.launch({channel:'chrome',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try {
  for(const viewport of [{width:390,height:844},{width:320,height:568},{width:844,height:390},{width:1280,height:800}]) {
   const context=await browser.newContext({viewport,permissions:['microphone']});
   const page=await context.newPage();
   await page.goto(`${process.env.WD_ACCEPTANCE_ORIGIN || 'http://127.0.0.1:8787'}/?lang=en`);
   await page.getByRole('button',{name:'Agree and unlock',exact:true}).click();
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
   await expect(dialog.locator('.immersive-video-layer')).toHaveAttribute('popover','manual');
   expect(await dialog.locator('.immersive-video-layer').evaluate(el=>el.matches(':popover-open'))).toBe(true);
   expect(await dialog.locator('.immersive-controls-layer').evaluate(el=>el.matches(':popover-open'))).toBe(true);
   expect(await dialog.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(await page.locator('html').evaluate(el=>getComputedStyle(el).backgroundColor));
   expect(await dialog.locator('.character-info').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
   expect(await stage.evaluate(el=>getComputedStyle(el).overflow)).toBe('visible');
   expect(await dialog.locator('canvas').evaluate(el=>getComputedStyle(el).objectFit)).toBe('contain');
   await page.waitForFunction(()=>{const v=document.querySelector<HTMLVideoElement>('video[data-phase=intro]');return v&&v.currentTime>.1;});
   await dialog.locator('video[data-phase=intro]').evaluate((v:HTMLVideoElement)=>{v.currentTime=v.duration-.1;});
   await page.waitForFunction(()=>{const v=document.querySelector<HTMLVideoElement>('video[data-phase=loop]');return v&&!v.paused&&v.currentTime>.1;});
   const media=(await dialog.locator('.immersive-video-layer').boundingBox())!;
   // Playback spans the whole viewport, including the upper/lower controls.
   for(const key of ['x','y','width','height'] as const)expect(media[key]).toBeCloseTo(box![key],0);
   expect(await dialog.locator('.immersive-video-layer').evaluate(el=>getComputedStyle(el).pointerEvents)).toBe('none');
   await expect(dialog.locator('.character-previous,.character-next,[data-action="preview-page"]')).toHaveCount(0);
   expect(media.width).toBeCloseTo(viewport.width,0);
   // Transparent foreground playback must not intercept the existing button hit areas.
   for(const selector of ['.character-close','.character-share','.transformation-replay','.scare-action']) {
    await dialog.locator(selector).hover();
    expect(await dialog.locator(selector).evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    expect(await dialog.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),`${selector} remains clickable`).toBe(true);
   }
   await expect(dialog.locator('[data-play-transform]')).toBeVisible();
   const info=await dialog.locator('.character-info').boundingBox();
   expect(info!.y+info!.height).toBeLessThanOrEqual(viewport.height+1);
   expect((await stage.boundingBox())!.y+(await stage.boundingBox())!.height).toBeLessThanOrEqual(info!.y+1);
   await expect(dialog.getByRole('button',{name:'Trick or Treat!',exact:true})).toBeInViewport();
   await expect(page.locator('[data-action=wallet], [data-action=gift], [data-action=donate]')).toHaveCount(0);
   const actions=(await dialog.locator('.reaction-actions').boundingBox())!;
   expect(actions.x+actions.width/2).toBeCloseTo(viewport.width/2,0);
   await expect(dialog.locator('.mini-meter')).toContainText(['Scariness 0 / 100']);
   expect(await dialog.evaluate(el=>el.scrollHeight<=el.clientHeight+1)).toBe(true);
   await page.screenshot({path:`artifacts/immersive-${viewport.width}.png`});
   // Pixel-level regression: even a very high-z side frame cannot cover the
   // playback surface. z-index comparisons alone cannot prove top-layer order.
   await dialog.evaluate(async el=>{
    el.querySelectorAll('video').forEach(v=>v.pause());
    await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    const frame=document.createElement('div');frame.dataset.testOccluder='';
    frame.style.cssText='position:fixed;inset:0;z-index:2147483647;background:rgb(0,255,0);pointer-events:none';el.append(frame);
    const canvas=el.querySelector<HTMLCanvasElement>('.immersive-video-layer canvas')!;
    const gl=canvas.getContext('webgl')!;gl.clearColor(1,0,1,1);gl.clear(gl.COLOR_BUFFER_BIT);
   });
   const pixels=await sharp(await page.screenshot()).removeAlpha().raw().toBuffer({resolveWithObject:true});
   // Sample inside the source frame rather than the canvas's contain letterbox.
   const center=(Math.floor(media.y+media.height/2)*pixels.info.width+Math.floor(media.x+media.width/2))*3;
   expect([...pixels.data.subarray(center,center+3)]).toEqual([255,0,255]);
   // The controls layer must paint above even an opaque video frame.
   await dialog.locator('.immersive-controls-layer').evaluate(el=>{
    const probe=document.createElement('span');probe.dataset.testControlProbe='';
    probe.style.cssText='position:fixed;left:calc(50% - 10px);top:calc(50% - 10px);width:20px;height:20px;background:rgb(0,0,255)';el.append(probe);
   });
   const foreground=await sharp(await page.screenshot()).removeAlpha().raw().toBuffer();
   expect([...foreground.subarray(center,center+3)]).toEqual([0,0,255]);
   await dialog.locator('[data-test-control-probe]').evaluate(el=>el.remove());
   await dialog.locator('[data-test-occluder]').evaluate(el=>el.remove());
   await dialog.locator('[data-play-transform]').click();
   await page.waitForFunction(()=>{const v=document.querySelector<HTMLVideoElement>('video[data-phase=intro]');return v&&!v.paused&&v.currentTime>.1&&v.currentTime<2;});
   await page.getByRole('button',{name:'Close character details',exact:true}).click();
   await expect(dialog).toHaveCount(0);
   await expect(page.locator('.immersive-video-layer')).toHaveCount(0);
   await context.close();
  }
 } finally {await browser.close();}
});
