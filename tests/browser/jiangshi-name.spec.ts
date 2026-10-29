import { test, expect } from '@playwright/test';
test.use({baseURL:process.env.WD_ACCEPTANCE_ORIGIN || 'http://127.0.0.1:8787'});
for (const reducedMotion of ['no-preference','reduce'] as const) {
 test(`jiangshi spoken-name pilot: synchronized tail, replay, mute and stop (${reducedMotion})`,async({page},info)=>{
  await page.emulateMedia({reducedMotion});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/review/jiangshi-name.html');
  await page.getByRole('button',{name:'播放完整效果',exact:true}).click();
  const intro=page.locator('video[data-phase="intro"]'),loop=page.locator('video[data-phase="loop"]');
  const name=page.locator('.transformation-name');
  await expect.poll(()=>intro.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(.2);
  await expect(name).toBeHidden();
  await expect.poll(()=>intro.evaluate((v:HTMLVideoElement)=>v.duration)).toBeGreaterThan(8.5);
  await expect.poll(()=>loop.evaluate((v:HTMLVideoElement)=>!v.paused),{timeout:15000}).toBe(true);
  await expect(name).toHaveCount(0);
  await page.screenshot({path:`artifacts/jiangshi-name-review/${info.project.name}-${reducedMotion}.png`});
  await page.getByRole('button',{name:'关闭变身声音',exact:true}).click();
  await page.getByRole('button',{name:'播放完整效果',exact:true}).click();
  await expect.poll(()=>intro.evaluate((v:HTMLVideoElement)=>!v.paused&&v.currentTime<2&&v.muted)).toBe(true);
  await expect(name).toBeHidden();
  await page.getByRole('button',{name:'停止',exact:true}).click();
  expect(await intro.evaluate((v:HTMLVideoElement)=>v.paused)).toBe(true);
  expect(await loop.evaluate((v:HTMLVideoElement)=>v.paused)).toBe(true);
  await expect(name).toBeHidden();expect(errors).toEqual([]);
 });
}
