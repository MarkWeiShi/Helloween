import {test,expect} from '@playwright/test';
import {startBrowserApp} from '../helpers/nginx.mjs';
let app:any,origin:string;
test.beforeAll(async()=>{app=await startBrowserApp();origin=app.origin;});
test.afterAll(async()=>{await app.stop();});
for(const selectedChannel of ['line','facebook','kakao','wechat','copy','x','signed-x'])test(`guest ${selectedChannel} sharing uses only the selected provider`,async({page,context})=>{
 const signedX=selectedChannel==='signed-x',channel=signedX?'x':selectedChannel;
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(()=>{
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}],getAudioTracks:()=>[{getSettings:()=>({echoCancellation:true})}]})}});
  (window as any).AudioContext=class {
   state='running';currentTime=0;destination={};sampleRate=48000;
   resume(){return Promise.resolve();}close(){return Promise.resolve();}
   createMediaStreamSource(){return {connect(){},disconnect(){}};}
   createAnalyser(){return {fftSize:2048,getFloatTimeDomainData(data:Float32Array){data.fill(0);}};}
   createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
   createOscillator(){return {frequency:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},start(){},stop(){}};}
  };
 });

 const authRequests:any[]=[];page.on('request',r=>{if(r.method()==='POST' && r.url().includes('/api/auth/start'))authRequests.push(r.postDataJSON());});
 await page.route('https://liff.line.me/**',r=>r.fulfill({body:'LIFF official entry'}));
 await context.route('https://www.facebook.com/sharer/**',r=>r.fulfill({body:'Facebook share window'}));
 await page.route('**/api/auth/start',r=>r.fulfill({json:{url:origin+'/test-x-auth'}}));
 await page.route('**/test-x-auth',r=>r.fulfill({body:'X authentication test'}));
 await page.route('https://static.line-scdn.net/**',r=>r.fulfill({contentType:'application/javascript',body:'window.liff={init:async()=>{},isLoggedIn:()=>false,login:x=>window.lineAuth=x.redirectUri}'}));
 await page.route('**/api/social/config',r=>r.fulfill({json:{origin,lineLiffId:'test-liff',kakaoKey:'',wechatReady:false,facebookAppId:''}}));
 await page.request.post(origin+'/api/session',{data:{}});
 if(signedX){
  const guest=app.store.createGuest(),login=app.store.accountLogin(guest.player.id,'direct-x-'+test.info().project.name);
  await context.clearCookies();
  await context.addCookies([{name:'boo_session',value:login.token,url:origin}]);
  await context.route('https://x.com/**',r=>r.fulfill({body:'X composer fixture'}));
 }
 await page.goto(origin+'/?lang=en');
 await page.getByRole('button',{name:'Enable Mic & Play',exact:true}).click();
 await page.getByRole('button',{name:'Confirm and enable microphone',exact:true}).click();
 await page.locator('.globe-pin[data-spirit="jiangshi"]').click();
 if(['wechat','copy'].includes(channel))await page.locator('.character-pumpkin').click();
 else {
  await expect(page.locator('.character-sns [data-action=send-share]')).toHaveCount(6);
  const b=await page.locator(`.character-sns [data-channel=${channel}]`).boundingBox();expect(b!.x).toBeGreaterThanOrEqual(0);expect(b!.x+b!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  if(channel==='line')await page.screenshot({path:`artifacts/social-share/${test.info().project.name}-direct-sns.png`});
 }
 const xPopup=signedX?context.waitForEvent('page'):null;
 const facebookPopup=channel==='facebook'?page.waitForEvent('popup'):null;
 await page.locator(`[data-action="send-share"][data-channel="${channel}"]`).click();
 await expect(page.locator('#share-name,#share-country,#join-form')).toHaveCount(0);
 const state=await (await page.request.get(origin+'/api/me')).json();
 expect(state.player.country).toBe('001');expect(state.player.initialized).toBe(false);
 if(channel==='copy'){await page.locator('[data-copy-confirm]').click();await expect(page.locator('#join-form')).toHaveCount(0);}
 if(channel==='line'){await expect(page.locator('[data-line-app]')).toHaveAttribute('href',/^https:\/\/liff.line.me\/test-liff\?invite=/);await expect(page.locator('[data-line-app]')).toHaveAttribute('target','_blank');expect(authRequests).toEqual([]);return;}
 if(facebookPopup){const target=await facebookPopup;await expect(target).toHaveURL(/^https:\/\/www.facebook.com\/sharer/);await target.close();expect(authRequests).toEqual([]);return;}
 if(xPopup){const target=await xPopup;await expect(target).toHaveURL(/^https:\/\/x.com\/intent\/post/);const url=new URL(target.url());expect(url.searchParams.get('text')).toContain('Jiangshi');expect(url.searchParams.get('url')).toContain('/api/share/card/');expect(authRequests).toEqual([]);await expect(page.locator('[data-publish-x],.account-panel')).toHaveCount(0);await target.close();return;}
 if(channel==='x'){await expect(page.locator('.account-panel')).toBeVisible();expect(authRequests).toEqual([]);expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('boo:pending-share')!))).toEqual({id:'jiangshi',channel:'x'});return;}
 if(channel==='copy')await expect(page.locator('[data-copy-confirm]')).toBeVisible();
 else await expect(page.getByLabel('Invitation link')).toBeVisible();
 await expect(page.locator('.account-panel')).toHaveCount(0);
 expect(authRequests).toEqual([]);
});
