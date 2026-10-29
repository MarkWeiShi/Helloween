import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const baseURL=process.env.LOCALIZATION_BASE_URL || 'http://127.0.0.1:8787';
const overrides=JSON.parse(readFileSync('content/localization/overrides.json','utf8'));
for(const locale of ['en','zh','es','pt','fr','de','it','ru','ar','hi','ja','ko','id','th','vi']) {
 test(`${locale}: mobile language, consent and direction`,async({browser})=>{
  const context=await browser.newContext({locale:locale==='zh'?'zh-CN':locale==='pt'?'pt-BR':locale,viewport:{width:390,height:844},reducedMotion:'reduce'});
  const page=await context.newPage();const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(baseURL);
  await expect(page.locator('html')).toHaveAttribute('lang',locale);
  await expect(page.locator('html')).toHaveAttribute('dir',locale==='ar'?'rtl':'ltr');
  await expect(page.locator('.play-unlock')).toHaveText(overrides[locale]?.['Enable Mic & Play']||'Enable Mic & Play');
  await expect(page.locator('.play-lock [data-language] option')).toHaveCount(16);
  await page.locator('.play-unlock').click();
  await expect(page.locator('[data-confirm-unlock]')).toHaveText(overrides[locale]?.['确认并开启麦克风']||'Confirm and enable microphone');
  expect(await page.locator('body').innerText()).not.toMatch(/\{\{\d+\}\}|undefined/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
  expect(errors).toEqual([]);await context.close();
 });
}
test('manual choice survives reload and overrides browser preferences',async({browser})=>{
 const context=await browser.newContext({locale:'ja-JP'});const page=await context.newPage();await page.goto(baseURL);
 await expect(page.locator('html')).toHaveAttribute('lang','ja');
 const before=(await (await context.request.get(baseURL+'/api/me')).json()).player.id;
 await page.locator('.play-lock [data-language]').selectOption('de');await expect(page.locator('html')).toHaveAttribute('lang','de');
 await page.goto(baseURL);await expect(page.locator('html')).toHaveAttribute('lang','de');
 expect((await (await context.request.get(baseURL+'/api/me')).json()).player.id).toBe(before);
 await page.locator('.play-lock [data-language]').selectOption('auto');await expect(page.locator('html')).toHaveAttribute('lang','ja');
 await context.close();
});
test('unknown browser locale falls back to English',async({browser})=>{
 const context=await browser.newContext({locale:'nl-NL'});const page=await context.newPage();await page.goto(baseURL);await expect(page.locator('html')).toHaveAttribute('lang','en');await expect(page.locator('.play-unlock')).toHaveText('Enable Mic & Play');await context.close();
});
test('localized exploration, profile, folklore and sharing keep user input intact',async({browser})=>{
 const context=await browser.newContext({locale:'ja-JP',permissions:['microphone'],viewport:{width:390,height:844},reducedMotion:'reduce'});
 const page=await context.newPage();await page.goto(baseURL);
 await page.locator('.play-unlock').click();await page.locator('[data-confirm-unlock]').click();
 await expect(page.locator('.play-lock')).toHaveCount(0,{timeout:20000});
 const name='Explore <b>Alice</b>';
 await context.request.post(baseURL+'/api/onboard',{data:{name,country:'JP',spiritId:'kappa'}});
 await page.reload();await page.locator('.play-unlock').click();await page.locator('[data-confirm-unlock]').click();await expect(page.locator('.play-lock')).toHaveCount(0,{timeout:20000});
 await expect(page.locator('.home-country span')).toHaveText(name);
 await expect(page.locator('.home-country b')).toHaveCount(0);
 await page.locator('[data-action="collection"]').click();
 await page.locator('[data-lore="kappa"]').click();
 await expect(page.locator('.lore-copy h3').first()).toHaveText(overrides.ja['From the folklore']);
 await expect(page.locator('.native-name')).toHaveText('河童');
 await page.locator('.modal-close').first().click();
 await page.locator('[data-action="about"]').click();
 expect(await page.locator('dialog').innerText()).not.toContain('This parade brings together');
 await context.close();
});
test('URL preserves manual language and invitation route when browser storage is blocked',async({browser})=>{
 const context=await browser.newContext({locale:'en-US'});await context.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked');}});Object.defineProperty(window,'sessionStorage',{get(){throw new Error('blocked');}});});
 const page=await context.newPage();await page.goto(baseURL+'/i/nonexistent');
 await page.locator('.play-lock [data-language]').selectOption('fr');
 await expect(page.locator('html')).toHaveAttribute('lang','fr');expect(new URL(page.url()).pathname).toBe('/i/nonexistent');
 await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','fr');await context.close();
});
test('automatic mode uses the first supported preference and follows languagechange',async({browser})=>{
 const context=await browser.newContext({locale:'nl-NL'});await context.addInitScript(()=>Object.defineProperty(navigator,'languages',{configurable:true,get:()=>[localStorage.getItem('test:preferred-language')||'nl-NL','fr-FR','ja-JP']}));
 const page=await context.newPage();await page.goto(baseURL);await expect(page.locator('html')).toHaveAttribute('lang','fr');
 await page.evaluate(()=>{localStorage.setItem('test:preferred-language','ja-JP');window.dispatchEvent(new Event('languagechange'));});await expect(page.locator('html')).toHaveAttribute('lang','ja');
 await page.locator('.play-lock [data-language]').selectOption('en');await expect(page.locator('html')).toHaveAttribute('lang','en');
 await page.evaluate(()=>window.dispatchEvent(new Event('languagechange')));await expect(page.locator('html')).toHaveAttribute('lang','en');await context.close();
});
