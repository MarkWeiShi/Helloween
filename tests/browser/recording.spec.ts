import { test, expect, chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

test('consented invitation records five seconds at transformation and delivers private playable audio', async () => {
 const browser=await chromium.launch({channel:'chrome',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 const sender=await browser.newContext({baseURL:'http://127.0.0.1:8787'});
 const receiver=await browser.newContext({baseURL:'http://127.0.0.1:8787',permissions:['microphone']});
 try {
  await sender.request.post('/api/session',{data:{}});
  await sender.request.post('/api/onboard',{data:{name:'Recording test sender',country:'CN',spiritId:'jiangshi'}});
  const invitation=await(await sender.request.post('/api/invites',{data:{spiritId:'jiangshi',channel:'copy'}})).json();
  const page=await receiver.newPage();
  await page.addInitScript(() => {
    const evidence = {start:0,stop:0,videoTime:0};
    (window as any).__recordingEvidence = evidence;
    const originalStart = MediaRecorder.prototype.start;
    const originalStop = MediaRecorder.prototype.stop;
    MediaRecorder.prototype.start = function (...args) {
      evidence.start = performance.now();
      evidence.videoTime = document.querySelector<HTMLVideoElement>('.invitation-stage > video')?.currentTime || 0;
      return originalStart.apply(this,args);
    };
    MediaRecorder.prototype.stop = function () {
      evidence.stop = performance.now();
      return originalStop.call(this);
    };
  });
  const uploads:string[]=[];
  page.on('request',request=>{if(request.method()==='POST' && request.url().endsWith('/audio'))uploads.push(request.url());});
  await page.goto('/i/'+invitation.id);
  await page.getByRole('button',{name:'Enable Mic & Play',exact:true}).click();
  await expect(page.locator('.invitation-consent')).toBeVisible();
  expect(await page.locator('.invitation-stage > video').evaluate((v:HTMLVideoElement)=>v.paused)).toBe(true);
  await page.getByRole('button',{name:'接受邀请并开始',exact:true}).click();
  await expect(page.locator('.recording-status')).toContainText('正在录音 5 秒');
  const atStart=await page.locator('.invitation-stage > video').evaluate((v:HTMLVideoElement)=>({time:v.currentTime,muted:v.muted}));
  expect(atStart.time).toBeGreaterThanOrEqual(2); expect(atStart.time).toBeLessThan(3); expect(atStart.muted).toBe(false);
  const started=Date.now();
  await expect(page.locator('.recording-status')).toContainText('已将 5 秒惊吓录音发送', {timeout:15000});
  expect(Date.now()-started).toBeGreaterThan(4000);
  expect(uploads).toHaveLength(1);
  const timing = await page.evaluate(() => (window as any).__recordingEvidence);
  expect(timing.videoTime).toBeGreaterThanOrEqual(2);
  expect(timing.videoTime).toBeLessThan(2.3);
  expect(timing.stop-timing.start).toBeGreaterThanOrEqual(4900);
  expect(timing.stop-timing.start).toBeLessThan(5500);
  mkdirSync('artifacts/invitation-audio-acceptance',{recursive:true});
  writeFileSync('artifacts/invitation-audio-acceptance/timing.json',JSON.stringify({...timing,durationMs:timing.stop-timing.start,uploads:uploads.length,muted:atStart.muted},null,2));
  await page.screenshot({path:'artifacts/invitation-audio-acceptance/receiver-sent.png'});
  const result=await(await sender.request.get('/api/me')).json();
  const reaction=result.player.reactions.recent.find((r:{inviteId:string})=>r.inviteId===invitation.id);
  expect(reaction.hasAudio).toBe(1);
  const url=`/api/invites/${invitation.id}/audio/${reaction.receiverId}`;
  expect((await receiver.request.get(url)).status()).toBe(404);
  const audio=await sender.request.get(url);
  expect(audio.status()).toBe(200);expect(audio.headers()['content-type']).toBe('audio/webm');expect((await audio.body()).length).toBeGreaterThan(1000);
  writeFileSync('artifacts/invitation-audio-acceptance/simulated-reaction.webm',await audio.body());
  await page.getByRole('button',{name:'↻ 再看一次',exact:true}).click();
  await expect(page.locator('.invitation-film')).toHaveClass(/finished/,{timeout:15000});
  expect(uploads).toHaveLength(1);
  const senderPage=await sender.newPage();
  await senderPage.goto('/'); await senderPage.getByRole('button',{name:'Enable Mic & Play',exact:true}).click();
  await senderPage.locator('[data-action="reactions"]').click();
  await expect(senderPage.locator('audio')).toHaveCount(1);
  await senderPage.locator('audio').evaluate((audio:HTMLAudioElement)=>audio.play());
  await expect.poll(()=>senderPage.locator('audio').evaluate((a:HTMLAudioElement)=>a.currentTime)).toBeGreaterThan(0);
  await senderPage.screenshot({path:'artifacts/invitation-audio-acceptance/sender-playback.png'});
 } finally { await browser.close(); }
});

test('invitation has one accept action and cancelled recordings never upload', async () => {
 const browser=await chromium.launch({channel:'chrome',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 const sender=await browser.newContext({baseURL:'http://127.0.0.1:8787'});
 const receiver=await browser.newContext({baseURL:'http://127.0.0.1:8787',permissions:['microphone']});
 try {
  await sender.request.post('/api/session',{data:{}});
  await sender.request.post('/api/onboard',{data:{name:'Cancel test sender',country:'CN',spiritId:'jiangshi'}});
  const invitation=await(await sender.request.post('/api/invites',{data:{spiritId:'jiangshi',channel:'copy'}})).json();
  const page=await receiver.newPage(); let uploads=0;
  page.on('request',r=>{if(r.method()==='POST' && r.url().endsWith('/audio'))uploads++;});
  await page.goto('/i/'+invitation.id);
  await page.getByRole('button',{name:'Enable Mic & Play',exact:true}).click();
  await expect(page.locator('.invitation-consent button')).toHaveCount(1);
  await expect(page.locator('.pumpkin-greeting img')).toBeVisible();
  await page.screenshot({path:'artifacts/pumpkin-greeting-seedance-v1/invitation-preview.png'});
  await page.getByRole('button',{name:'接受邀请并开始',exact:true}).click();
  await expect(page.locator('.recording-status')).toContainText('正在录音 5 秒');
  await page.getByRole('button',{name:'取消录音及发送',exact:true}).click();
  await expect(page.locator('.invitation-film')).toHaveClass(/finished/,{timeout:15000});
  expect(uploads).toBe(0);
  await expect(page.locator('.recording-status')).toContainText('已取消');
 } finally { await browser.close(); }
});

test('static pumpkin loads without a greeting video and invitation still starts', async () => {
 const browser=await chromium.launch({channel:'chrome',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 const context=await browser.newContext({baseURL:'http://127.0.0.1:8787',permissions:['microphone'],viewport:{width:390,height:844}});
 const sender=await browser.newContext({baseURL:'http://127.0.0.1:8787'});
 try {
  await sender.request.post('/api/session',{data:{}});
  await sender.request.post('/api/onboard',{data:{name:'你的朋友',country:'CN',spiritId:'jiangshi'}});
  const invitation=await(await sender.request.post('/api/invites',{data:{spiritId:'jiangshi',channel:'copy'}})).json();
  const page=await context.newPage();
  await page.goto('/i/'+invitation.id);
  await page.getByRole('button',{name:'Enable Mic & Play',exact:true}).click();
  const greeting=page.locator('.pumpkin-greeting img');
  await expect(greeting).toBeVisible();
  await expect.poll(()=>greeting.evaluate((img:HTMLImageElement)=>img.complete && img.naturalWidth>0)).toBe(true);
  await expect(page.locator('.pumpkin-greeting video')).toHaveCount(0);
  await page.screenshot({path:'artifacts/pumpkin-greeting-seedance-v1/mobile-static-card.png'});
  await page.getByRole('button',{name:'接受邀请并开始',exact:true}).click();
  await expect(page.locator('.invitation-consent')).toBeHidden();
  await expect(greeting).toBeHidden();
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await expect(page.locator('dialog')).toHaveCount(0);
 } finally {await browser.close();}
});
