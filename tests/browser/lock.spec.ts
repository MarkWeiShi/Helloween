import {test,expect} from '@playwright/test';
test('single lock over rotating world grants access only after mic and audio',async({page},info)=>{
 await page.addInitScript(()=>{
  (window as any).micStops=0;(window as any).tones=0;
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>({getTracks:()=>[{stop:()=>{(window as any).micStops++;}}]})}});
  (window as any).AudioContext=class{
   state='suspended';currentTime=0;destination={};sampleRate=48000;
   resume(){this.state='running';return Promise.resolve();}close(){this.state='closed';return Promise.resolve();}
   createMediaStreamSource(){return{connect(){},disconnect(){}};}
   createAnalyser(){return{fftSize:2048};}
   createGain(){return{gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
   createOscillator(){return{frequency:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},start(){(window as any).tones++;},stop(){}};}
  };
 });
 page.on('console',msg=>{if(msg.type()==='warning')console.log(msg.text());});
 await page.goto('/');
 const button=page.getByRole('button',{name:'Enable Mic & Play',exact:true});
 await expect(button).toBeVisible();await expect(page.locator('.app-shell')).toHaveAttribute('inert','');
 await expect(page.locator('.gate-world,.gate-friends,.gate-copy')).toHaveCount(0);
 const globe=page.locator('.globe-explorer');
 const lon=await globe.getAttribute('data-longitude');await expect.poll(()=>globe.getAttribute('data-longitude')).not.toBe(lon);
 await page.screenshot({path:`artifacts/${info.project.name}-play-lock.png`});
 await button.click();await expect(page.locator('.play-lock')).toHaveCount(0);
 await expect(page.locator('.app-shell')).not.toHaveAttribute('inert','');
 expect(await page.evaluate(()=>(window as any).micStops)).toBe(1);
 expect(await page.evaluate(()=>(window as any).tones)).toBe(6);
 await expect(page.locator('.globe-pin')).toHaveCount(63);
 await expect(page.getByRole('button',{name:'Zoom out',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();
 await expect(page.locator('.globe-explorer')).toHaveAttribute('data-zoom','2');
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();
 await expect(page.locator('.globe-explorer')).toHaveAttribute('data-zoom','3');
 await expect(page.getByRole('button',{name:'Zoom in',exact:true})).toBeDisabled();
 await page.screenshot({path:`artifacts/${info.project.name}-zoom-near.png`});
 await page.getByRole('button',{name:'Zoom out',exact:true}).click();
 await page.getByRole('button',{name:'Zoom out',exact:true}).click();
 await expect(page.locator('.globe-explorer')).toHaveAttribute('data-zoom','1');
 await page.screenshot({path:`artifacts/${info.project.name}-zoom-far.png`});
 const anchors=await page.locator('.globe-pin').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-anchor')));
 await page.getByRole('button',{name:'Rotate globe east',exact:true}).click();
 expect(await page.locator('.globe-pin').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-anchor')))).toEqual(anchors);
 await page.screenshot({path:`artifacts/${info.project.name}-pacific-pumpkin.png`});
 await page.locator('.globe-pin[data-globe-spirit="kappa"]').click();await expect(page.locator('dialog')).toBeVisible();
});
test('denied microphone leaves the world locked and supports retry',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{throw new DOMException('Denied','NotAllowedError');}}));
 await page.goto('/');await page.getByRole('button',{name:'Enable Mic & Play'}).click();
 await expect(page.locator('.mic-status')).toContainText('still locked');
 await expect(page.locator('.app-shell')).toHaveAttribute('inert','');
 await expect(page.getByRole('button',{name:'Enable Mic & Play'})).toBeEnabled();
 await expect(page.getByRole('button',{name:'Continue without microphone'})).toHaveCount(0);
});
