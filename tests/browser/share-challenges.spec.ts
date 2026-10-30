import {test,expect} from '@playwright/test';
test.use({baseURL:process.env.WD_CHALLENGE_ORIGIN || 'http://127.0.0.1:5174'});
test('X fallback opens a composer with text and invitation without downloading a GIF',async({page})=>{
 await page.route('**/api/social/config',route=>route.fulfill({json:{origin:'https://example.com',kakaoKey:'',wechatReady:false,facebookAppId:''}}));
 for(const lang of ['zh','en','ja','ko','ar']){
  await page.goto(`/art/share-challenges/index.html?lang=${lang}`);
  await page.evaluate(async()=>{
   const i18n=await import('/src/i18n.ts');await i18n.initLanguage();
   const {mountSocialHandoff}=await import('/src/social-share.ts');
   document.body.innerHTML='<div id="handoff"></div>';
   await mountSocialHandoff(document.querySelector('#handoff')!,'x','https://example.com/i/current-invite','Localized caption','/unused.jpg','jiangshi');
  });
  const panel=page.locator('.social-handoff');
  const target=new URL((await panel.locator('a.button.primary').getAttribute('href'))!);
  expect(target.searchParams.get('text')).toBe('Localized caption');
  expect(target.searchParams.get('url')).toBe('https://example.com/i/current-invite');
  await expect(panel.locator('[data-publish-x],img,textarea')).toHaveCount(0);
 }
});
