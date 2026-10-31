import {test,expect} from '@playwright/test';
import {previewTransformations} from '../../shared/preview-transformations.mjs';
test.use({launchOptions:{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']}});
test('seven previews share with current controls and return to their own card',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('boo:play-unlocked:v2','true'));
 await page.route('**/api/social/config',route=>route.fulfill({json:{origin:'http://localhost',lineLiffId:'test-liff',kakaoKey:''}}));
 await page.goto('/?lang=en');
 for(const id of Object.values(previewTransformations)){
  await page.locator(`[data-preview-transform="${id}"]`).dispatchEvent('click');
  await expect(page.locator('.character-sns button')).toHaveCount(6);
  for(const channel of ['x','line','facebook','whatsapp','messenger','kakao'])await expect(page.locator(`.character-sns [data-channel="${channel}"]`)).toHaveAttribute('data-id',id);
  await expect.poll(()=>page.locator('.character-sns img').evaluateAll(es=>es.every(e=>(e as HTMLImageElement).naturalWidth>0))).toBe(true);
  const created=page.waitForResponse(r=>r.url().endsWith('/api/invites')&&r.request().method()==='POST');
  await page.locator('.character-sns [data-channel="line"]').click();
  const response=await created;expect(response.status()).toBe(200);const invitation=await response.json();
  expect((await (await page.request.get('/api/invites/'+invitation.id)).json()).spiritId).toBe(id);
  await expect(page.locator('[data-line-app]')).toHaveAttribute('href',new RegExp(invitation.id));
  expect((await page.request.get(`/art/x-cards/${id}.en.jpg`)).status()).toBe(200);
  await page.locator('.modal-close').click();
  await expect(page.locator('.character-sns [data-channel="line"]')).toHaveAttribute('data-id',id);
  await page.locator('.character-close').click();
 }
});
test('a preview invitation opens its own transformation for the recipient',async({page,context})=>{
 await context.grantPermissions(['microphone']);
 await page.goto('/?lang=en');
 await expect(page.locator('.play-unlock')).toBeVisible();
 const invitation=await (await page.request.post('/api/invites',{data:{spiritId:'vetala',channel:'line'}})).json();
 expect(invitation.id).toBeTruthy();
 await page.goto('/?invite='+invitation.id+'&lang=en');

 await expect(page.locator('.character-sns [data-channel=line]')).toHaveAttribute('data-id','vetala');
 await page.waitForFunction(()=>{const video=document.querySelector<HTMLVideoElement>('video[data-phase=intro]');return video&&!video.paused&&video.currentTime>.1&&video.src.includes('/vetala/');});
});
test('preview LINE card uses its own portrait and can complete the existing guest profile flow',async({page})=>{
 await page.route('**/api/social/config',route=>route.fulfill({json:{origin:new URL(route.request().url()).origin,lineLiffId:'test-liff'}}));
 await page.route('https://static.line-scdn.net/**',route=>route.fulfill({contentType:'application/javascript',body:`window.sent=[];window.liff={init:async()=>{},isLoggedIn:()=>true,isApiAvailable:()=>true,shareTargetPicker:async messages=>{window.sent.push(messages);return {status:'success'};}};`}));
 await page.goto('/?lang=en');
 await expect(page.locator('.play-unlock')).toBeVisible();
 const invitation=await(await page.request.post('/api/invites',{data:{spiritId:'vetala',channel:'line'}})).json();
 expect(invitation.id).toBeTruthy();
 await page.goto('/line-share.html?invite='+invitation.id+'&lang=en');
 await expect(page.locator('.card h2')).toHaveText('Vetala');
 await expect.poll(()=>page.locator('.card img').evaluate(e=>(e as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
 await page.locator('#profile-name').fill('Preview friend');await page.locator('#profile-country').selectOption('CN');
 await page.locator('#choose').click();
 await expect.poll(()=>page.evaluate(()=>(window as any).sent.length)).toBe(1);
 expect((await(await page.request.get('/api/me')).json()).player.initialized).toBe(true);
 const message=await page.evaluate(()=>(window as any).sent[0][0]);
 expect(JSON.stringify(message)).toContain('vetala.portrait.png');expect(JSON.stringify(message)).toContain('/i/'+invitation.id);
});
