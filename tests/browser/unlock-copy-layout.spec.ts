import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {languages} from '../../shared/i18n.mjs';

const keys=['Allow the microphone. Transformations automatically measure your voice; ordinary play uploads scores only.','Friend invitations send a six-second recording privately to the inviter. You can cancel before sending.'];
const copies=languages.map(([code])=>{const dictionary=JSON.parse(readFileSync(`src/locales/${code}.json`,'utf8'));return {code,lines:keys.map(key=>dictionary[key])};});
test('complete unlock terms use two Chinese lines and at most three lines in every other language',async({page})=>{
 await page.goto('/?lang=en');await expect(page.locator('.play-unlock')).toBeVisible();
 for(const width of [320,390,1280]){
  await page.setViewportSize({width,height:844});
  const failures=[];
  for(const copy of copies){
   const result=await page.evaluate(async copy=>{
    document.documentElement.lang=copy.code;document.documentElement.dir=copy.code==='ar'?'rtl':'ltr';
    const terms=document.querySelector<HTMLElement>('.unlock-terms')!;
    [...terms.children].forEach((node,i)=>{node.textContent=copy.lines[i];});
    await document.fonts.ready;
    const rows=new Set<number>();
    for(const node of terms.children){const range=document.createRange();range.selectNodeContents(node);for(const rect of range.getClientRects())if(rect.width>.5)rows.add(Math.round(rect.top));}
    return {rows:rows.size,overflow:terms.scrollWidth>terms.clientWidth+1,clipped:getComputedStyle(terms).overflow==='hidden',text:terms.textContent};
   },copy);
   if(result.rows>(copy.code==='zh'?2:3)||(copy.code==='zh'&&result.rows!==2)||result.overflow||result.clipped)failures.push({locale:copy.code,width,...result});
  }
  expect(failures).toEqual([]);
 }
});
