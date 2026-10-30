import {test,expect} from '@playwright/test';
test.use({baseURL:process.env.WD_CHALLENGE_ORIGIN || 'http://127.0.0.1:5174'});
for(const mode of ['ready','http-image','gif-rejected','image-failure','no-key'])test(`Kakao ghost card: ${mode}`,async({page})=>{
 await page.route('**/api/social/config',r=>r.fulfill({json:{origin:'https://helloween.fly.dev',kakaoKey:mode==='no-key'?'':'test-key'}}));
 await page.route('https://t1.kakaocdn.net/**',r=>r.fulfill({contentType:'application/javascript',body:`window.Kakao={isInitialized:()=>false,init:k=>window.usedKey=k,Share:{scrapImage:async data=>{window.scraped=data;${mode==='gif-rejected'?'if(data.imageUrl.endsWith(".gif"))throw Error("GIF rejected");':''}${mode==='image-failure'?'throw Error("Image unavailable");':'return '+JSON.stringify({infos:{original:{url:(mode==='http-image'?'http':'https')+'://k.kakaocdn.net/test.jpg'}}})+';'}},sendDefault:data=>window.shared=data}};`}));
 await page.goto('/art/share-challenges/index.html?lang=en');
 await page.evaluate(async()=>{
  const i18n=await import('/src/i18n.ts');await i18n.initLanguage();
  const {mountSocialHandoff}=await import('/src/social-share.ts');
  document.body.innerHTML='<div id="handoff"></div>';
  await mountSocialHandoff(document.querySelector('#handoff')!,'kakao','https://helloween.fly.dev/i/test-invite','Boo!','/unused.jpg','jiangshi');
 });
 await expect(page.getByLabel('Invitation link')).toHaveValue('https://helloween.fly.dev/i/test-invite');
 expect(await page.evaluate(()=>window.shared)).toBeUndefined();
 if(!['ready','http-image','gif-rejected'].includes(mode)) {await expect(page.locator('[data-open-kakao]')).toHaveCount(0);return;}
 if(mode==='gif-rejected')expect(await page.evaluate(()=>window.scraped.imageUrl)).toBe('https://helloween.fly.dev/art/x-cards/jiangshi.en.jpg');else expect(await page.evaluate(()=>window.scraped.imageUrl)).toMatch(/jiangshi\.en\.[a-f0-9]+\.gif$/);
 await page.locator('textarea').fill('My ghost surprise');
 await page.locator('[data-open-kakao]').click();
 const payload=await page.evaluate(()=>window.shared);
 expect(payload.objectType).toBe('feed');
 expect(payload.content.description).toBe('My ghost surprise');
 expect(payload.content.imageUrl).toBe('https://k.kakaocdn.net/test.jpg');
 expect(payload.content.link.webUrl).toBe('https://helloween.fly.dev/i/test-invite');
 expect(payload.buttons[0].link.mobileWebUrl).toBe(payload.content.link.webUrl);
 await expect(page.locator('[data-kakao-status]')).toContainText('cannot confirm delivery');
});
