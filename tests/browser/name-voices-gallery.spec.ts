import {test,expect} from '@playwright/test';
test.use({baseURL:process.env.WD_ACCEPTANCE_ORIGIN||'http://127.0.0.1:8787'});
test('all voice choices are published; language changes release old media and never add text overlays',async({page},info)=>{
 await page.goto('/review/jiangshi-name.html');
 await expect(page.locator('#review-character option')).toHaveCount(56);
 await expect(page.locator('#review-coverage')).toContainText('56 / 56');
 for(const id of ['nang-tani','ifrit','zhalmauyz-kempir']){
  await page.locator('#review-character').selectOption(id);
  await expect(page.locator('audio')).toHaveAttribute('src',`/art/name-reveals/${id}/name-v1.wav`);
  await page.getByRole('button',{name:'播放完整效果',exact:true}).click();
  const intro=page.locator('video[data-phase="intro"]');
  await expect.poll(()=>intro.evaluate((v:HTMLVideoElement)=>v.currentTime),{timeout:15000}).toBeGreaterThan(6.1);
  await expect(page.locator('.transformation-name')).toHaveCount(0);
  await page.screenshot({path:`artifacts/name-voices-v1/${info.project.name}-${id}.png`});
 }
 await page.locator('#review-character').selectOption('adze');
 await expect(page.locator('#review-status')).toContainText('该语言不在模型支持列表');
 await expect(page.locator('video[data-phase="intro"]')).toHaveJSProperty('paused',true);
});
