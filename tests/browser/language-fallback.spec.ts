import {test,expect,type Page} from '@playwright/test';
import {startBrowserApp} from '../helpers/nginx.mjs';
import {readFileSync} from 'node:fs';
let app:Awaited<ReturnType<typeof startBrowserApp>>,origin:string;
test.beforeAll(async()=>{
 app=await startBrowserApp({databasePath:':memory:',rateLimits:false});
 origin=app.origin;
});
test.afterAll(async()=>{await app.stop();});
async function expectLanguage(page:Page,locale:string){
 const dictionary=JSON.parse(readFileSync(`src/locales/${locale}.json`,'utf8'));
 // Waiting for translated UI also proves client boot succeeded, rather than
 // merely asserting the server-rendered html lang attribute.
 await expect(page.locator('.play-unlock')).toHaveText(dictionary['Enable Mic & Play']);
 await expect(page.locator('html')).toHaveAttribute('lang',locale);
}
async function choose(page:Page,locale:string){
 await page.locator('.language-trigger').click();
 await page.locator(`[data-language="${locale}"]`).click();
}
test('App URL hints and regional tags resolve in the static client without saving a visit hint',async({browser})=>{
 const context=await browser.newContext({locale:'ko-KR'});
 try{
  const page=await context.newPage();
  for(const [query,locale] of [['appLang=ar-SA','ar'],['lang=pt_BR&appLang=ja','pt'],['lang=auto&appLang=ar','ko'],['lang=invalid&appLang=ZH_cn','zh'],['appLang=invalid','ko']]){
   const response=await page.goto(origin+'/?'+query);
   expect(response?.headers()['content-language']).toBeUndefined();
   await expectLanguage(page,locale);
   expect(await page.evaluate(()=>localStorage.getItem('boo:language'))).toBeNull();
  }
  await page.goto(origin);await expectLanguage(page,'ko');
 }finally{await context.close();}
});
test('saved manual choice wins over App hints; explicit lang and Default still override it',async({browser})=>{
 const context=await browser.newContext({locale:'ko-KR'});
 try{
  const page=await context.newPage();await page.goto(origin+'/?appLang=ja-JP');await expectLanguage(page,'ja');
  await choose(page,'de');await expectLanguage(page,'de');
  await page.goto(origin+'/?appLang=fr-FR');await expectLanguage(page,'de');
  await page.goto(origin+'/?lang=pt-BR&appLang=ja');await expectLanguage(page,'pt');
  expect(await page.evaluate(()=>localStorage.getItem('boo:language'))).toBe('de');
  await choose(page,'auto');await expectLanguage(page,'ko');
  await page.goto(origin);await expectLanguage(page,'ko');
 }finally{await context.close();}
});
for(const [mode,expected] of [
 ['missing-list','ko'],['empty-list','ko'],['malformed-list','ko'],['throwing-list','ko'],
 ['missing-both','en'],['throwing-both','en'],['unsupported','en'],['ordered-list','ja'],
] as const){
 test(`${mode}: automatic detection loads ${expected} without a boot error`,async({browser})=>{
  const context=await browser.newContext({locale:mode==='unsupported'?'nl-NL':'fr-FR'});
  try{
   await context.addInitScript(mode=>{
    Object.defineProperty(navigator,'languages',{configurable:true,get(){
     if(mode==='throwing-list'||mode==='throwing-both')throw Error('Unavailable languages');
     if(mode==='missing-list'||mode==='missing-both')return undefined;
     if(mode==='empty-list')return [];
     if(mode==='malformed-list')return 'de-DE';
     if(mode==='ordered-list')return ['xx','ja-JP','de-DE'];
     return ['nl-NL'];
    }});
    Object.defineProperty(navigator,'language',{configurable:true,get(){
     if(mode==='throwing-both')throw Error('Unavailable language');
     if(mode==='missing-both')return undefined;
     return mode==='unsupported'?'nl-NL':'ko-KR';
    }});
   },mode);
   const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin);await expectLanguage(page,expected);expect(errors).toEqual([]);
  }finally{await context.close();}
 });
}
test('manual choice survives a new visit and browser changes; Default restores automatic matching',async({browser})=>{
 const context=await browser.newContext({locale:'fr-FR'});
 try{
  await context.addInitScript(()=>{
   Object.defineProperty(navigator,'languages',{get(){throw Error('Unavailable');}});
   Object.defineProperty(navigator,'language',{get:()=>localStorage.getItem('test:language')||'ko-KR'});
  });
  const page=await context.newPage();await page.goto(origin);await expectLanguage(page,'ko');
  await choose(page,'de');await expectLanguage(page,'de');
  expect(await page.evaluate(()=>localStorage.getItem('boo:language'))).toBe('de');
  await page.evaluate(()=>localStorage.setItem('test:language','ja-JP'));
  await page.goto(origin);await expectLanguage(page,'de');
  await page.evaluate(()=>window.dispatchEvent(new Event('languagechange')));await expectLanguage(page,'de');
  await choose(page,'auto');await expectLanguage(page,'ja');
  expect(await page.evaluate(()=>localStorage.getItem('boo:language'))).toBe('auto');
  await page.goto(origin);await expectLanguage(page,'ja');
 }finally{await context.close();}
});
test('blocked storage keeps a manual choice in the URL and preserves the invitation route',async({browser})=>{
 const context=await browser.newContext({locale:'ko-KR'});
 try{
  await context.addInitScript(()=>{
   Object.defineProperty(window,'localStorage',{get(){throw Error('Unavailable storage');}});
   Object.defineProperty(navigator,'languages',{get:()=>undefined});
  });
  const page=await context.newPage();await page.goto(origin+'/i/nonexistent?campaign=test');await expectLanguage(page,'ko');
  await choose(page,'ja');await expectLanguage(page,'ja');
  expect(new URL(page.url()).pathname).toBe('/i/nonexistent');expect(new URL(page.url()).searchParams.get('campaign')).toBe('test');
  await page.reload();await expectLanguage(page,'ja');
  await choose(page,'auto');await expectLanguage(page,'ko');
 }finally{await context.close();}
});
test('a temporary locale download failure does not overwrite the saved manual preference',async({browser})=>{
 const context=await browser.newContext({locale:'ja-JP'});
 try{
  await context.addInitScript(()=>localStorage.setItem('boo:language','de'));
  const page=await context.newPage();await page.route(/\/assets\/de-[^/]+\.js$/,route=>route.abort());
  await page.goto(origin);await expectLanguage(page,'en');
  expect(await page.evaluate(()=>localStorage.getItem('boo:language'))).toBe('de');
  await page.locator('.language-trigger').click();await expect(page.locator('[data-language="de"]')).toHaveAttribute('aria-checked','true');
  await page.unrouteAll();await page.reload();await expectLanguage(page,'de');
 }finally{await context.close();}
});
