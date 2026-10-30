import {test,expect} from '@playwright/test';
test.use({baseURL:process.env.WD_ACCEPTANCE_ORIGIN || 'http://127.0.0.1:8787'});
test('single lock over the world grants access only after mic and audio',async({page},info)=>{
 await page.addInitScript(()=>{
  (window as any).micStops=0;(window as any).tones=0;
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>({getTracks:()=>[{stop:()=>{(window as any).micStops++;}}],getAudioTracks:()=>[{getSettings:()=>({echoCancellation:true})}]})}});
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
 // Production intentionally pauses auto-rotation while the play lock is visible.
 await expect(globe).toBeVisible();
 await page.screenshot({path:`artifacts/${info.project.name}-play-lock.png`});
 await button.click();await page.getByRole('button',{name:"Confirm and enable microphone",exact:true}).click();await expect(page.locator('.play-lock')).toHaveCount(0);
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
 await page.locator('.globe-viewport').focus();
 await page.keyboard.press('ArrowRight');
 expect(await page.locator('.globe-pin').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-anchor')))).toEqual(anchors);
 await page.screenshot({path:`artifacts/${info.project.name}-pacific-pumpkin.png`});
 await page.locator('.globe-pin[data-spirit="kappa"]').click();await expect(page.locator('dialog')).toBeVisible();
});
test('unlock asks for confirmation before microphone access; dismiss and denial keep the game locked',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(()=>{
  (window as any).__micRequests=0;
  Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{(window as any).__micRequests++;throw new DOMException('Denied','NotAllowedError');}});
 });
 await page.goto('/');
 const unlock=page.getByRole('button',{name:'Enable Mic & Play',exact:true});
 await expect(unlock).toBeVisible();
 await expect(page.locator('.play-lock-content p:not(:empty)')).toHaveCount(0);
 await page.screenshot({path:'artifacts/unlock-button-mobile.png'});
 await unlock.click();
 await expect(page.getByRole('dialog',{name:"Before you start"})).toBeVisible();
 await expect(page.locator('.unlock-points li')).toHaveCount(4);
 await expect(page.locator('.unlock-points')).toContainText("Exploring uploads no audio");
 expect(await page.evaluate(()=>(window as any).__micRequests)).toBe(0);
 await page.keyboard.press('Escape');
 await expect(page.locator('dialog')).toHaveCount(0);
 await expect(page.locator('.app-shell')).toHaveAttribute('inert','');
 await expect(unlock).toBeFocused();
 expect(await page.evaluate(()=>(window as any).__micRequests)).toBe(0);
 await unlock.click();
 await page.getByRole('button',{name:'Close',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).__micRequests)).toBe(0);
 await unlock.click();
 const confirm=page.getByRole('button',{name:"Confirm and enable microphone",exact:true});
 await expect(confirm).toBeInViewport({ratio:1});
 await page.screenshot({path:'artifacts/unlock-confirmation-mobile.png'});
 await confirm.click();
 await expect(page.locator('.mic-status')).toContainText('still locked');
 expect(await page.evaluate(()=>(window as any).__micRequests)).toBe(1);
 await expect(page.locator('.app-shell')).toHaveAttribute('inert','');
 await expect(unlock).toBeEnabled();
 await unlock.click();
 expect(await page.evaluate(()=>(window as any).__micRequests)).toBe(1);
 await confirm.click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__micRequests)).toBe(2);
});
