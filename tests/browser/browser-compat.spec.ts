import {test,expect} from '@playwright/test';
for(const legacy of [false,true]){
 test(`${legacy?'fallback capabilities':'native capabilities'}: boot, languages, dialog and reload`,async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const requests:string[]=[];page.on('request',request=>{if(new URL(request.url()).pathname==='/api/session')requests.push(request.method());});
  await page.addInitScript(({legacy})=>{
   localStorage.setItem('boo:play-unlocked:v1','true');
   if(legacy){
    for(const key of ['any','timeout'])Object.defineProperty(AbortSignal,key,{configurable:true,value:undefined});
    Object.defineProperty(Intl,'DisplayNames',{configurable:true,value:undefined});
    Object.defineProperty(Intl,'Segmenter',{configurable:true,value:undefined});
    Object.defineProperty(Object,'hasOwn',{configurable:true,value:undefined});
    for(const key of ['showPopover','hidePopover'])Object.defineProperty(HTMLElement.prototype,key,{configurable:true,value:undefined});
    Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:undefined});
    delete (HTMLElement.prototype as any).inert;
    const add=EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener=function(type,listener,options){
     return add.call(this,type,listener,typeof options==='object' && options?{capture:options.capture,once:options.once,passive:options.passive}:options);
    };
    const supports=CSS.supports.bind(CSS);
    CSS.supports=((...args:string[])=>args[0]==='selector(:focus-visible)'?false:(supports as any)(...args)) as typeof CSS.supports;
   }
  },{legacy});
  await page.goto('/?lang=zh');
  await expect(page.locator('.globe-explorer')).toBeVisible();
  await expect(page.locator('.boot')).toHaveCount(0);
  await page.locator('.language-trigger').click();
  await expect(page.locator('#language-menu')).toBeVisible();
  await expect(page.locator('.language-trigger')).toHaveAttribute('aria-expanded','true');
  await page.keyboard.press('Escape');
  await expect(page.locator('#language-menu')).not.toBeVisible();
  await page.locator('.stats-help').click();
  await expect(page.locator('dialog')).toBeVisible();
  if(legacy){
   await expect(page.locator('dialog')).toHaveAttribute('aria-modal','true');
   await page.locator('dialog button').first().focus();await page.keyboard.press('Shift+Tab');
   expect(await page.locator('dialog').evaluate(el=>el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');await expect(page.locator('dialog')).toHaveCount(0);
  await page.locator('.language-trigger').click();await page.locator('[data-language="en"]').click();
  await expect(page).toHaveURL(/lang=en/);await expect(page.locator('.globe-explorer')).toBeVisible();
  await page.locator('.globe-pin[data-spirit="kappa"]').click();
  await expect(page.locator('dialog')).toBeVisible();
  await expect(page.locator('dialog .globe-character')).toBeVisible();
  expect(requests).toEqual(['POST','POST']);
  await page.locator('.character-close').click();
  await expect(page.locator('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.screenshot({path:`artifacts/compat-${info.project.name}-${legacy?'fallback':'native'}.png`});
 });
}
test('legacy inert fallback keeps locked controls unavailable when consent is dismissed',async({page})=>{
 await page.addInitScript(()=>{
  delete (HTMLElement.prototype as any).inert;
  Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:undefined});
 });
 await page.goto('/?lang=en');
 await expect(page.locator('.play-unlock')).toBeVisible();
 await expect(page.locator('.app-shell')).toHaveAttribute('aria-hidden','true');
 await expect(page.locator('.app-shell')).toHaveClass(/compat-inert/);
 await page.locator('.play-unlock').click();
 await expect(page.locator('dialog')).toBeVisible();
 await page.locator('.modal-close').click();await expect(page.locator('dialog')).toHaveCount(0);
 await expect(page.locator('.app-shell')).toHaveAttribute('aria-hidden','true');
});

test('legacy lock restores controls after microphone consent',async({page})=>{
 await page.addInitScript(()=>{
  delete (HTMLElement.prototype as any).inert;
  Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:undefined});
  const track={stop(){},getSettings(){return {echoCancellation:true};}};
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>({getTracks:()=>[track],getAudioTracks:()=>[track]})}});
  (window as any).AudioContext=class{
   state='suspended';currentTime=0;destination={};sampleRate=48000;
   resume(){this.state='running';return Promise.resolve();}close(){return Promise.resolve();}
   createMediaStreamSource(){return {connect(){},disconnect(){}};}
   createAnalyser(){return {fftSize:2048};}
   createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
   createOscillator(){return {frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},start(){},stop(){}};}
  };
 });
 await page.goto('/?lang=en');await page.locator('.play-unlock').click();
 await page.locator('[data-confirm-unlock]').click();
 await expect(page.locator('.play-lock')).toHaveCount(0);
 await expect(page.locator('.app-shell')).not.toHaveAttribute('inert');
 await expect(page.locator('.app-shell')).not.toHaveClass(/compat-inert/);
 await expect(page.locator('.app-shell')).not.toHaveAttribute('aria-hidden');
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();
 await expect(page.locator('.globe-explorer')).toHaveAttribute('data-zoom','2');
});
