import {test,expect} from '@playwright/test';
test.use({baseURL:process.env.WD_ACCEPTANCE_ORIGIN || 'http://127.0.0.1:8787'});
test('share icon matches close; Trick and icon lead to truthful platform sign-in guidance',async({page},info)=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(()=>{
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}});
  (window as any).AudioContext=class {
   state='running';currentTime=0;destination={};sampleRate=48000;
   resume(){return Promise.resolve();}close(){return Promise.resolve();}
   createMediaStreamSource(){return {connect(){},disconnect(){}};}
   createAnalyser(){return {fftSize:2048,getFloatTimeDomainData(data:Float32Array){data.fill(0);}};}
   createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
   createOscillator(){return {frequency:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},start(){},stop(){}};}
  };
 });
 await page.request.post('/api/session',{data:{}});
 await page.request.post('/api/onboard',{data:{name:'Jiangshi pilot',country:'CN',spiritId:'jiangshi'}});
 await page.goto('/');await page.getByRole('button',{name:'Enable Mic & Play',exact:true}).click();await page.getByRole('button',{name:"Confirm and enable microphone",exact:true}).click();
 await expect(page.locator('.play-lock')).toHaveCount(0);
 await page.locator('.globe-pin[data-spirit="jiangshi"]').click();
 await page.getByRole('button',{name:'Share this character',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Who needs a Boo?'})).toBeVisible();
 const shortcut=page.getByRole('button',{name:'Choose a sharing app'}), close=page.getByRole('button',{name:'Close',exact:true});
 const styles=await Promise.all([shortcut,close].map(b=>b.evaluate(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return {background:s.backgroundColor,border:s.border,width:r.width,height:r.height,x:r.x};})));
 expect(styles[0].background).toBe(styles[1].background);expect(styles[0].border).toBe(styles[1].border);expect(styles[0].width).toBe(styles[1].width);expect(styles[0].height).toBe(styles[1].height);expect(styles[0].x).toBeLessThan(styles[1].x);
 await shortcut.click();
 for(const [label,platform,host] of [['X','X','x.com'],['LINE','LINE','line.me']]){
  await page.getByRole('button',{name:label,exact:true}).click();
  const link=page.getByRole('link',{name:`Continue to ${platform}`,exact:true});await expect(link).toBeVisible();expect(new URL((await link.getAttribute('href'))!).hostname).toBe(host);
  await expect(page.locator('.social-handoff')).toContainText('Nothing is sent automatically');
 }
 await page.getByRole('button',{name:'Facebook',exact:true}).click();await expect(page.getByRole('link',{name:'Continue to Facebook',exact:true})).toHaveAttribute('href',/facebook\.com\/sharer\/sharer\.php/);
 await page.getByRole('button',{name:'KakaoTalk'}).click();await expect(page.locator('.social-handoff')).toContainText('not connected');
 await page.getByRole('button',{name:'WeChat'}).click();await expect(page.locator('.social-handoff')).toContainText('top-right');
 await page.screenshot({path:`artifacts/social-share/${info.project.name}-guide.png`});
 await close.click();
 await page.locator('.globe-pin[data-spirit="jiangshi"]').click();
 await page.getByRole('button',{name:'Trick — scare a friend',exact:true}).click();
 await expect(page.getByRole('button',{name:'X',exact:true})).toBeVisible();
 await page.screenshot({path:`artifacts/social-share/${info.project.name}-sheet.png`});
});
