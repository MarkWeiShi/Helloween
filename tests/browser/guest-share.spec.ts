import {test,expect} from '@playwright/test';
import {startBrowserApp} from '../helpers/nginx.mjs';
let app:any,origin:string;
test.beforeAll(async()=>{app=await startBrowserApp();origin=app.origin;});
test.afterAll(async()=>{await app.stop();});
for(const channel of ['line','facebook','kakao','wechat','copy','x'])test(`guest ${channel} sharing uses only the selected provider`,async({page})=>{
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

 const authRequests:any[]=[];page.on('request',r=>{if(r.method()==='POST' && r.url().includes('/api/auth/start'))authRequests.push(r.postDataJSON());});
 await page.route('**/api/auth/start',r=>r.fulfill({json:{url:origin+'/test-x-auth'}}));
 await page.route('**/test-x-auth',r=>r.fulfill({body:'X authentication test'}));
 await page.route('https://static.line-scdn.net/**',r=>r.fulfill({contentType:'application/javascript',body:'window.liff={init:async()=>{},isLoggedIn:()=>false,login:x=>window.lineAuth=x.redirectUri}'}));
 await page.route('**/api/social/config',r=>r.fulfill({json:{origin,lineLiffId:'test-liff',kakaoKey:'',wechatReady:false,facebookAppId:''}}));
 await page.request.post(origin+'/api/session',{data:{}});
 await page.request.post(origin+'/api/onboard',{data:{name:'Guest',country:'CN',spiritId:'jiangshi'}});
 await page.goto(origin+'/?lang=en');
 await page.getByRole('button',{name:'Enable Mic & Play',exact:true}).click();
 await page.getByRole('button',{name:'Confirm and enable microphone',exact:true}).click();
 await page.locator('.globe-pin[data-spirit="jiangshi"]').click();
 await page.getByRole('button',{name:'Share this character',exact:true}).click();
 await page.locator(`[data-action="send-share"][data-channel="${channel}"]`).click();
 if(channel==='x'){await expect(page).toHaveURL(origin+'/test-x-auth');expect(authRequests).toEqual([{provider:'x'}]);return;}
 if(channel==='line'){await expect(page).toHaveURL(/\/line-share\.html\?invite=/);await expect.poll(()=>page.evaluate(()=>(window as any).lineAuth)).toContain('/line-share.html?invite=');}
 else if(channel==='facebook')await expect(page.getByRole('link',{name:'Continue to Facebook',exact:true})).toBeVisible();
 else if(channel==='copy')await expect(page.locator('[data-copy-confirm]')).toBeVisible();
 else await expect(page.getByLabel('Invitation link')).toBeVisible();
 await expect(page.locator('.account-panel')).toHaveCount(0);
 expect(authRequests).toEqual([]);
});
