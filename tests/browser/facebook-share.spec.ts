import {test,expect} from '@playwright/test';
test.use({baseURL:process.env.WD_CHALLENGE_ORIGIN || 'http://127.0.0.1:5174'});
test('Facebook shares the localized ghost card without app credentials or OAuth',async({page},info)=>{
 await page.route('**/api/social/config',r=>r.fulfill({json:{origin:'https://helloween.fly.dev',facebookAppId:''}}));
 const requests:string[]=[];page.on('request',r=>requests.push(r.url()));
 await page.goto('/art/share-challenges/index.html?lang=en');
 await page.evaluate(async()=>{
  await import('/src/style.css');
  const i18n=await import('/src/i18n.ts');await i18n.initLanguage();
  const {mountSocialHandoff}=await import('/src/social-share.ts');
  document.body.innerHTML='<main id="handoff"></main>';
  await mountSocialHandoff(document.querySelector('#handoff')!,'facebook','https://helloween.fly.dev/i/test-invite','Boo!','/unused.jpg','jiangshi');
 });
 const link=page.getByRole('link',{name:'Continue to Facebook',exact:true});
 const target=new URL((await link.getAttribute('href'))!);
 expect(target.origin+target.pathname).toBe('https://www.facebook.com/sharer/sharer.php');
 expect(target.searchParams.get('u')).toBe('https://helloween.fly.dev/api/share/facebook/test-invite?lang=en');
 expect(target.searchParams.has('app_id')).toBe(false);
 await expect(page.getByLabel('Invitation link')).toHaveValue('https://helloween.fly.dev/i/test-invite');
 await expect(page.locator('.social-handoff')).toContainText('Nothing is sent automatically');
 const poster=page.locator('.social-handoff img');await expect(poster).toHaveJSProperty('naturalWidth',960);
 expect(requests.some(url=>url.includes('/auth/')||url.includes('facebook.com'))).toBe(false);
 await page.screenshot({path:`artifacts/social-share/${info.project.name}-facebook.png`});
});
