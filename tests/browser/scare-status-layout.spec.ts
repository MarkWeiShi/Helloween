import {test,expect,chromium} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {languages} from '../../shared/i18n.mjs';
const keys=['Recording… {{0}}s','Measuring… {{0}}s','No Voice Detected','My Scariness Score {{0}} / 100','My Scariness Score — / 100','Sending…','Link full · not sent','Already sent','Voice sent','Send failed · retry','Recording cancelled','Get ready…','Mic unavailable','Not sent · retry','Paused · replay','Video failed · retry','● 5s · record & send','● 5s · local only','No recording · retry','Starting mic…'];
test('all 15 languages keep every scare status on one complete line at narrow widths',async()=>{
 const browser=await chromium.launch({channel:'chrome',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try{
  const page=await browser.newPage({viewport:{width:320,height:568},permissions:['microphone']});
  await page.goto((process.env.WD_ACCEPTANCE_ORIGIN||'http://127.0.0.1:8791')+'/?lang=en');
  await page.locator('.play-unlock').click();await expect(page.locator('.play-lock')).toHaveCount(0);
  await page.locator('[data-spirit="kappa"].globe-pin').dispatchEvent('click');
  await page.waitForFunction(()=>document.querySelector<HTMLVideoElement>('video[data-phase=intro]')?.currentTime!>.1);
  await page.evaluate(()=>document.querySelectorAll('video').forEach(v=>v.pause()));
  const cases=languages.map(([code])=>({code,dictionary:JSON.parse(readFileSync(`src/locales/${code}.json`,'utf8'))}));
  const failures=[];
  for(const width of [320,390]){
   await page.setViewportSize({width,height:844});
   failures.push(...await page.evaluate(({cases,keys,width})=>{
    const status=document.querySelector<HTMLElement>('[data-personal-scare]')!;
    const errors=[];
    for(const {code,dictionary} of cases){
     document.documentElement.lang=code;document.documentElement.dir=code==='ar'?'rtl':'ltr';
     for(const key of keys){
      status.textContent=dictionary[key].replace('{{0}}','100');
      const style=getComputedStyle(status);
      if(style.whiteSpace!=='nowrap'||status.scrollWidth>status.clientWidth+1||status.getBoundingClientRect().height>parseFloat(style.lineHeight)+1)
       errors.push({code,key,text:status.textContent,width,needed:status.scrollWidth,available:status.clientWidth});
     }
    }
    return errors;
   },{cases,keys,width}));
  }
  expect(failures).toEqual([]);
  await page.evaluate(()=>{document.documentElement.lang='ja';document.documentElement.dir='ltr';document.querySelector('[data-personal-scare]')!.textContent='声なし';});
  await page.screenshot({path:'artifacts/video-surface/single-line-ja.png'});
 }finally{await browser.close();}
});
