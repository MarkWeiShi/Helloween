import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {loadCatalog} from '../../server/content.mjs';
import {languages} from '../../shared/i18n.mjs';

test.use({permissions:['microphone'],launchOptions:{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']}});
test('all globe introductions are localized, fit narrow screens, and cards have no lore popup',async({page,browserName})=>{
 test.skip(browserName!=='chromium','Uses Chromium’s fake microphone; no real recording or sharing.');
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:390,height:844});
 await page.goto((process.env.WD_ACCEPTANCE_ORIGIN||'http://127.0.0.1:8787')+'/?lang=en');
 await page.locator('.play-unlock').click();await page.locator('[data-confirm-unlock]').click();
 await expect(page.locator('.play-lock')).toHaveCount(0);
 const catalog=loadCatalog();
 const cases:{lang:string;pins:{id:string;name:string;description:string}[]}[]=[];
 for(const [lang] of languages){
  const dictionary=JSON.parse(readFileSync(`src/locales/${lang}.json`,'utf8'));
  await page.locator('.language-trigger').click();await page.locator(`[data-language="${lang}"]`).click();
  await expect(page.locator('html')).toHaveAttribute('lang',lang);
  const expected=catalog.spirits.map((s:any)=>({id:s.id,name:dictionary[s.name],description:dictionary[s.globeDescription]}));
  const readPins=()=>page.locator('[data-globe-spirit]').evaluateAll(els=>els.map(el=>({id:(el as HTMLElement).dataset.globeSpirit!,name:(el as HTMLElement).dataset.previewName!,description:(el as HTMLElement).dataset.previewDescription!})).sort((a,b)=>a.id.localeCompare(b.id)));
  await expect.poll(readPins).toEqual(expected.sort((a:any,b:any)=>a.id.localeCompare(b.id)));
  // Exercise the same pointer event used by a light touch, without opening a video.
  await page.locator('[data-globe-spirit="selkie"]').dispatchEvent('pointerdown',{pointerType:'touch'});
  await expect(page.locator('.globe-caption strong')).toHaveText(expected.find((s:any)=>s.id==='selkie').name);
  await expect(page.locator('.globe-caption p')).toHaveText(expected.find((s:any)=>s.id==='selkie').description);
  await page.locator('[data-globe-spirit="selkie"]').dispatchEvent('pointercancel');
  cases.push({lang,pins:await readPins()});
 }
 for(const width of [320,390]){
  await page.setViewportSize({width,height:844});
  const failures=await page.evaluate(({cases,width})=>{
   const caption=document.querySelector<HTMLElement>('.globe-caption')!;
   const title=caption.querySelector('strong')!,p=caption.querySelector('p')!;
   const failures=[];
   for(const {lang,pins} of cases){
    document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
    for(const pin of pins){
     title.textContent=pin.name;p.textContent=pin.description;
     if(p.scrollHeight>p.clientHeight+2||p.scrollWidth>p.clientWidth+2||title.scrollWidth>caption.clientWidth+2)
      failures.push({lang,id:pin.id,width});
    }
   }return failures;
  },{cases,width});
  expect(failures).toEqual([]);
 }
 await page.locator('.language-trigger').click();await page.locator('[data-language="zh"]').click();
 await page.locator('[data-globe-spirit="selkie"]').dispatchEvent('pointerenter');
 await expect(page.locator('.globe-caption strong')).toHaveText('塞尔基');
 await page.screenshot({path:'artifacts/globe-copy/chinese-introduction.png'});
 await page.locator('[data-globe-spirit="kappa"]').dispatchEvent('click');
 await expect(page.locator('.character-dialog')).toBeVisible();
 await expect(page.locator('[data-action="lore"],[data-lore],.lore-copy')).toHaveCount(0);
 await expect(page.locator('.character-share-row')).toBeVisible();
 await expect(page.locator('.character-close')).toBeVisible();
 expect(errors).toEqual([]);
});
