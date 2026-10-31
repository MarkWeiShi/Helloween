import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
test.use({launchOptions:{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']}});
const baseURL=process.env.LOCALIZATION_BASE_URL || 'http://127.0.0.1:8787';
const overrides=JSON.parse(readFileSync('content/localization/overrides.json','utf8'));
async function chooseLanguage(page:Page,code:string){
 await page.locator('.language-trigger').click();
 await page.locator(`#language-menu [data-language="${code}"]`).click();
}
for(const locale of ['en','zh','es','pt','fr','de','it','ru','ar','hi','ja','ko','id','th','vi']) {
 test(`${locale}: mobile language, consent and direction`,async({browser})=>{
  const context=await browser.newContext({locale:locale==='zh'?'zh-CN':locale==='pt'?'pt-BR':locale,viewport:{width:390,height:844},reducedMotion:'reduce'});
  const page=await context.newPage();const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(baseURL);
  await expect(page.locator('html')).toHaveAttribute('lang',locale);
  await expect(page.locator('html')).toHaveAttribute('dir',locale==='ar'?'rtl':'ltr');
  await expect(page.locator('.play-unlock')).toHaveAccessibleName(overrides[locale]?.['Agree and unlock']||'Agree and unlock');
  await expect(page.locator('#language-menu [data-language]')).toHaveCount(16);
  await page.locator('.play-unlock').click();
  await expect(page.locator('.play-lock,.unlock-consent')).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toMatch(/\{\{\d+\}\}|undefined/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
  expect(errors).toEqual([]);await context.close();
 });
}
test('manual choice survives reload and overrides browser preferences',async({browser})=>{
 const context=await browser.newContext({locale:'ja-JP'});const page=await context.newPage();await page.goto(baseURL);
 await expect(page.locator('html')).toHaveAttribute('lang','ja');
 const before=(await (await context.request.get(baseURL+'/api/me')).json()).player.id;
 await chooseLanguage(page,'de');await expect(page.locator('html')).toHaveAttribute('lang','de');
 await page.goto(baseURL);await expect(page.locator('html')).toHaveAttribute('lang','de');
 expect((await (await context.request.get(baseURL+'/api/me')).json()).player.id).toBe(before);
 await chooseLanguage(page,'auto');await expect(page.locator('html')).toHaveAttribute('lang','ja');
 await context.close();
});
test('unknown browser locale falls back to English',async({browser})=>{
 const context=await browser.newContext({locale:'nl-NL'});const page=await context.newPage();await page.goto(baseURL);await expect(page.locator('html')).toHaveAttribute('lang','en');await expect(page.locator('.play-unlock')).toHaveAccessibleName('Agree and unlock');await context.close();
});
test('localized exploration and profile keep user input intact',async({browser})=>{
 const context=await browser.newContext({locale:'ja-JP',permissions:['microphone'],viewport:{width:390,height:844},reducedMotion:'reduce'});
 const page=await context.newPage();await page.goto(baseURL);
 await page.locator('.play-unlock').click();
 await expect(page.locator('.play-lock')).toHaveCount(0,{timeout:20000});
 const name='Explore <b>Alice</b>';
 await context.request.post(baseURL+'/api/onboard',{data:{name,country:'JP',spiritId:'kappa'}});
 await page.reload();await expect(page.locator('.play-lock')).toHaveCount(0,{timeout:20000});
 await expect(page.locator('.home-country span')).toHaveText(name);
 await expect(page.locator('.home-country b')).toHaveCount(0);
 await page.locator('[data-action="profile"]').dispatchEvent('click');
 await expect(page.locator('dialog h2')).toContainText(name);
 await expect(page.locator('dialog h2 b')).toHaveCount(0);
 await context.close();
});
test('URL preserves manual language and invitation route when browser storage is blocked',async({browser})=>{
 const context=await browser.newContext({locale:'en-US'});await context.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked');}});Object.defineProperty(window,'sessionStorage',{get(){throw new Error('blocked');}});});
 await context.request.post(baseURL+'/api/session',{data:{}});const invitation=await (await context.request.post(baseURL+'/api/invites',{data:{spiritId:'kappa',channel:'copy'}})).json();
 expect(invitation.id).toBeTruthy();const page=await context.newPage();await page.goto(baseURL+'/i/'+invitation.id);
 await chooseLanguage(page,'fr');
 await expect(page.locator('html')).toHaveAttribute('lang','fr');expect(new URL(page.url()).searchParams.get('invite')).toBe(invitation.id);
 await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','fr');await context.close();
});
test('automatic mode uses the first supported preference and follows languagechange',async({browser})=>{
 const context=await browser.newContext({locale:'nl-NL'});await context.addInitScript(()=>Object.defineProperty(navigator,'languages',{configurable:true,get:()=>[localStorage.getItem('test:preferred-language')||'nl-NL','fr-FR','ja-JP']}));
 const page=await context.newPage();await page.goto(baseURL);await expect(page.locator('html')).toHaveAttribute('lang','fr');
 await page.evaluate(()=>{localStorage.setItem('test:preferred-language','ja-JP');window.dispatchEvent(new Event('languagechange'));});await expect(page.locator('html')).toHaveAttribute('lang','ja');
 await chooseLanguage(page,'en');await expect(page.locator('html')).toHaveAttribute('lang','en');
 await page.evaluate(()=>window.dispatchEvent(new Event('languagechange')));await expect(page.locator('html')).toHaveAttribute('lang','en');await context.close();
});

test('top-right globe opens flag menu above the locked page',async({browser})=>{
 for(const width of [390,1280]){
  const context=await browser.newContext({locale:'zh-CN',viewport:{width,height:844}});const page=await context.newPage();await page.goto(baseURL+'/?lang=zh');
  const trigger=page.locator('.language-trigger');await expect(trigger).toBeVisible();await expect(page.locator('.language-trigger')).toHaveCount(1);
  await expect(page.locator('.play-lock-content .language-picker, select[data-language]')).toHaveCount(0);
  const bounds=(await trigger.boundingBox())!;const help=(await page.locator('#app > .stats-help').boundingBox())!;expect(Math.abs(bounds.y-help.y)).toBeLessThan(1);expect(width-bounds.x-bounds.width).toBeLessThan(30);
  expect(await trigger.evaluate(el=>el.closest('[inert]'))).toBeNull();
  await expect(trigger.locator('img')).toHaveCSS('width','30px');await expect(trigger.locator('img')).toHaveCSS('height','30px');
  await trigger.click();await expect(page.locator('#language-menu')).toBeVisible();await expect(trigger).toHaveAttribute('aria-expanded','true');
  await expect(page.locator('[data-language="ja"] .language-flag')).toHaveText('🇯🇵');
  await page.keyboard.press('Escape');await expect(page.locator('#language-menu')).toBeHidden();
  await trigger.click();await page.mouse.click(10,800);await expect(page.locator('#language-menu')).toBeHidden();
  await chooseLanguage(page,'ja');await expect(page.locator('html')).toHaveAttribute('lang','ja');await expect(page.locator('.play-lock')).toBeVisible();
  await context.close();
 }
});
