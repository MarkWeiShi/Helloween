import {test,expect} from '@playwright/test';
test.use({baseURL:process.env.SHARE_TEST_ORIGIN||'http://127.0.0.1:5186'});
test('slow config and SDK never hide the card, caption or copy action',async({page})=>{
 let releaseConfig!:()=>void,releaseSDK!:()=>void;
 const configGate=new Promise<void>(r=>releaseConfig=r),sdkGate=new Promise<void>(r=>releaseSDK=r);
 await page.route('**/api/social/config',async route=>{await configGate;await route.fulfill({json:{origin:'https://example.com',kakaoKey:'test'}});});
 await page.route('https://t1.kakaocdn.net/**',async route=>{await sdkGate;await route.fulfill({contentType:'application/javascript',body:'window.Kakao={isInitialized:()=>true,Share:{sendDefault:p=>window.sent=p}}'});});
 await harness(page);
 await mount(page,'kakao');
 await expect(page.locator('.share-card-preview')).toBeVisible();
 await expect(page.locator('[data-copy-ready]')).toBeEnabled();
 await expect(page.locator('[data-open-kakao]')).toBeDisabled();
 await page.locator('[data-kakao-caption]').fill('My greeting');
 await page.locator('[data-copy-ready]').click();
 expect(await page.evaluate(()=>(window as any).copied)).toBe('https://example.com/i/one');
 releaseConfig();releaseSDK();
 await expect(page.locator('[data-open-kakao]')).toBeEnabled();
 await expect(page.locator('[data-kakao-caption]')).toHaveValue('My greeting');
 expect(await page.evaluate(()=>(window as any).sent)).toBeUndefined();
 await page.locator('[data-open-kakao]').click();
 expect(await page.evaluate(()=>(window as any).sent.content.description)).toBe('My greeting');
});
test('warming and simultaneous mounts share SDK/config requests without sending',async({page})=>{
 let configs=0,scripts=0;
 await page.route('**/api/social/config',r=>{configs++;return r.fulfill({json:{origin:'https://example.com',kakaoKey:'test'}});});
 await page.route('https://t1.kakaocdn.net/**',async r=>{scripts++;await r.fulfill({contentType:'application/javascript',body:'window.Kakao={isInitialized:()=>true,Share:{sendDefault:()=>window.sent=true}}'});});
 await harness(page);
 await page.evaluate(async()=>{const m=await import('/src/social-share.ts');m.prepareSocialShare('jiangshi');m.prepareSocialShare('jiangshi');});
 await expect.poll(()=>scripts).toBe(1);
 await mount(page,'kakao');
 await expect(page.locator('[data-open-kakao]')).toBeEnabled();
 await mount(page,'kakao');
 await expect(page.locator('[data-open-kakao]')).toBeEnabled();
 expect(configs).toBe(1);expect(scripts).toBe(1);
 expect(await page.evaluate(()=>(window as any).sent)).toBeUndefined();
});
test('failed SDK retries without discarding the caption or invitation',async({page})=>{
 let scripts=0;
 await page.route('**/api/social/config',r=>r.fulfill({json:{origin:'https://example.com',kakaoKey:'test'}}));
 await page.route('https://t1.kakaocdn.net/**',r=>++scripts===1?r.abort():r.fulfill({contentType:'application/javascript',body:'window.Kakao={isInitialized:()=>true,Share:{sendDefault(){}}}'}));
 await harness(page);await mount(page,'kakao');
 await expect(page.locator('[data-retry]')).toBeVisible();
 await page.locator('[data-kakao-caption]').fill('Keep this caption');
 await page.locator('[data-retry]').click();
 await expect(page.locator('[data-open-kakao]')).toBeEnabled();
 await expect(page.locator('[data-kakao-caption]')).toHaveValue('Keep this caption');
 expect(scripts).toBe(2);
});
test('detached handoff cannot initialize the SDK or overwrite the next panel',async({page})=>{
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 await page.route('**/api/social/config',r=>r.fulfill({json:{origin:'https://example.com',kakaoKey:'test'}}));
 await page.route('https://t1.kakaocdn.net/**',async r=>{await gate;await r.fulfill({contentType:'application/javascript',body:'window.Kakao={isInitialized:()=>false,init:()=>window.initialized=true,Share:{sendDefault(){}}}'});});
 await harness(page);await mount(page,'kakao');await mount(page,'whatsapp');release();
 await expect(page.locator('a.button.primary')).toHaveAttribute('href',/^https:\/\/wa.me/);
 await expect.poll(()=>page.evaluate(()=>!!(window as any).Kakao)).toBe(true);
 expect(await page.evaluate(()=>(window as any).initialized)).toBeUndefined();
 await expect(page.locator('[data-open-kakao]')).toHaveCount(0);
});
for(const channel of ['facebook','whatsapp','wechat','messenger'])test(`${channel} exposes usable actions with config unavailable`,async({page})=>{
 await page.route('**/api/social/config',r=>r.fulfill({status:503,json:{error:'unavailable'}}));
 await harness(page);await mount(page,channel);
 await expect(page.getByRole('progressbar')).toHaveCount(0);
 await expect(page.locator('input')).toHaveValue('https://example.com/i/one');
 if(channel==='messenger')await expect(page.locator('[data-copy-invite]')).toBeEnabled();
 if(channel==='facebook'||channel==='whatsapp')await expect(page.locator('a.button.primary')).toBeVisible();
});
async function harness(page:import('@playwright/test').Page){
 await page.route('**/share-loading-harness',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
 await page.goto('/share-loading-harness?lang=en');
 await page.evaluate(async()=>{
  await (await import('/src/i18n.ts')).initLanguage();
  document.body.innerHTML='<div id="test-panel"></div>';
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{(window as any).copied=text;}}});
 });
}
async function mount(page:import('@playwright/test').Page,channel:string){
 await page.evaluate(async channel=>{
  const {mountSocialHandoff}=await import('/src/social-share.ts');
  await mountSocialHandoff(document.querySelector('#test-panel')!,channel,'https://example.com/i/one','Boo','','jiangshi');
 },channel);
}
test('LINE preserves native navigation and exposes the link before config finishes',async({page})=>{
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 await page.route('**/api/social/config',async r=>{await gate;await r.fulfill({json:{origin:'https://example.com',lineLiffId:'test-liff'}});});
 await harness(page);
 await page.evaluate(async()=>{
  const m=await import('/src/social-share.ts');
  void m.mountSocialHandoff(document.querySelector('#test-panel')!,'line','https://example.com/i/one','Boo','','jiangshi');
 });
 await expect(page.locator('[data-copy-ready]')).toBeEnabled();release();
 await expect(page.locator('[data-line-app]')).toHaveAttribute('href',/^https:\/\/liff.line.me\/test-liff/);
 const prevented=await page.locator('[data-line-app]').evaluate((a:HTMLAnchorElement)=>{
  const event=new MouseEvent('click',{cancelable:true});
  a.onclick!.call(a,event);return event.defaultPrevented;
 });
 expect(prevented).toBe(false);
});
test('failed cache requests can retry and buttons restore after waiting',async({page})=>{
 let count=0;
 await page.route('**/api/social/config',route=>{count++;return route.fulfill({status:count===1?503:200,json:count===1?{error:'unavailable'}:{origin:'https://example.com'}});});
 await page.route('**/share-loading-harness',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
 await page.goto('/share-loading-harness');
 const result=await page.evaluate(async()=>{
  const {loadShareConfig}=await import('/src/social-share.ts');
  const {startShareButtonLoading}=await import('/src/share-loading.ts');
  const button=document.createElement('button');button.innerHTML='<span>LINE</span>';document.body.append(button);
  const finish=startShareButtonLoading(button);
  const loading=button.disabled&&!!button.querySelector('[role=progressbar]');
  try{await loadShareConfig();}catch{}
  const config=await loadShareConfig();finish();
  return {loading,restored:button.innerHTML,disabled:button.disabled,origin:config.origin};
 });
 expect(count).toBe(2);expect(result).toEqual({loading:true,restored:'<span>LINE</span>',disabled:false,origin:'https://example.com'});
});
