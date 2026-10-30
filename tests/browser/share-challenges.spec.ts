import {test,expect} from '@playwright/test';
test.use({baseURL:process.env.WD_CHALLENGE_ORIGIN || 'http://127.0.0.1:5174'});
test('animated X challenge includes the correct GIF and this invitation across five interface languages',async({page})=>{
 await page.route('**/api/social/config',route=>route.fulfill({json:{origin:'https://example.com',kakaoKey:'',wechatReady:false,facebookAppId:''}}));
 for(const lang of ['zh','en','ja','ko','ar']){
  await page.goto(`/art/share-challenges/index.html?lang=${lang}`);
  await page.evaluate(async()=>{
   const i18n=await import('/src/i18n.ts');await i18n.initLanguage();
   const {mountSocialHandoff}=await import('/src/social-share.ts');
   document.body.innerHTML='<div id="handoff"></div>';
   await mountSocialHandoff(document.querySelector('#handoff')!,'x','https://example.com/i/current-invite','fallback','/unused.jpg','jiangshi');
  });
  const panel=page.locator('.social-handoff');
  const post=await panel.locator('textarea').inputValue();
  expect(post).toContain('https://example.com/api/share/card/current-invite');
  expect(post).toContain('#Halloween #HelloTalk');
  expect(post).not.toContain('［本次邀请链接］');
  expect(post).toContain(lang==='zh'?'我派了一只僵尸来找你':'I sent Jiangshi');
  await expect(panel.getByRole('button')).toHaveCount(1);
  await expect(panel.locator('a[download]')).toHaveCount(0);
  const gif=panel.locator('img');await expect(gif).toBeVisible();
  await expect(gif).toHaveAttribute('src',new RegExp('jiangshi\\.'+lang+'\\.'));
  await expect.poll(()=>gif.evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBe(960);

 }
});
