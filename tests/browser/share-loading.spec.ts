import {test,expect} from '@playwright/test';
test.use({baseURL:process.env.SHARE_TEST_ORIGIN||'http://127.0.0.1:5186'});
test('slow sharing config shows progress and warm channels reuse the request',async({page})=>{
 let count=0;
 await page.route('**/api/social/config',async route=>{
  count++;await new Promise(resolve=>setTimeout(resolve,1000));
  await route.fulfill({json:{origin:'https://example.com',wechatReady:false,kakaoKey:'',facebookAppId:''}});
 });
 await page.route('**/share-loading-harness',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
 await page.goto('/share-loading-harness');
 await page.evaluate(async()=>{
  await (await import('/src/i18n.ts')).initLanguage();
  await import('/src/style.css');
  document.body.innerHTML='<div id="test-panel"></div>';
  const {mountSocialHandoff}=await import('/src/social-share.ts');
  void mountSocialHandoff(document.querySelector('#test-panel')!,'wechat','https://example.com/i/one','','','jiangshi');
 });
 await expect(page.getByRole('progressbar')).toBeVisible({timeout:700});
 await expect(page.getByRole('progressbar')).toHaveCount(0);
 await page.evaluate(async()=>{
  const {mountSocialHandoff}=await import('/src/social-share.ts');
  await mountSocialHandoff(document.querySelector('#test-panel')!,'kakao','https://example.com/i/two','','','jiangshi');
 });
 expect(count).toBe(1);
 await expect(page.locator('.share-link-label input')).toHaveValue('https://example.com/i/two');
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
