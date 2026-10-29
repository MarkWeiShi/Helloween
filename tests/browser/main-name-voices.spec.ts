import {test,expect} from '@playwright/test';
test.use({baseURL:process.env.WD_ACCEPTANCE_ORIGIN || 'http://127.0.0.1:8787'});
for (const spiritId of ['jiangshi','ifrit','zhalmauyz-kempir']) test(`${spiritId}: main page plays assigned name tail, replays and releases media`,async({page},info)=>{
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
 await page.request.post('/api/onboard',{data:{name:'Jiangshi pilot',country:'CN',spiritId}});
 await page.goto('/');await page.getByRole('button',{name:'Enable Mic & Play',exact:true}).click();await page.getByRole('button',{name:"Confirm and enable microphone",exact:true}).click();
 await expect(page.locator('.play-lock')).toHaveCount(0);
 await page.locator(`.globe-pin[data-spirit="${spiritId}"]`).click();
 await expect.poll(()=>page.locator('video[data-phase="intro"]').evaluate((v:HTMLVideoElement)=>v.currentTime),{timeout:15000}).toBeGreaterThan(6.2);
 const manifest=await (await page.request.get('/art/transformations/manifest.json')).json();
 const intro=page.locator('video[data-phase="intro"]');
 await expect(intro).toHaveAttribute('src',manifest.characters[spiritId].entrance);
 await expect(intro).toHaveJSProperty('muted',false);
 expect(manifest.characters[spiritId].spokenName.startsAt).toBe(6);
 expect(manifest.characters[spiritId].spokenName.duration).toBe(2.8);
 await expect(page.locator('.transformation-name')).toHaveCount(0);
 await expect(page.locator('[data-personal-scare]')).not.toContainText("Recording for");
 await page.screenshot({path:`artifacts/main-name-voices/${info.project.name}-${spiritId}.png`});
 await expect(page.locator('[data-play-transform]')).toBeVisible({timeout:6000});
 await page.locator('[data-play-transform]').click();
 await expect.poll(()=>intro.evaluate((v:HTMLVideoElement)=>!v.paused&&v.currentTime<2&&!v.muted)).toBe(true);
 const video=await page.locator('video[data-phase="intro"]').elementHandle();
 await page.getByRole('button',{name:'Close character details',exact:true}).click();
 await expect(page.locator('.transformation-player')).toHaveCount(0);
 expect(await video!.evaluate((v:HTMLVideoElement)=>v.paused&&!v.getAttribute('src'))).toBe(true);
});
