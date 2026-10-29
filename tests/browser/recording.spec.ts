import {test,expect,chromium} from '@playwright/test';
import {createApp} from '../../server/index.mjs';
let origin:string,app:ReturnType<typeof createApp>;
test.beforeAll(async()=>{app=createApp({databasePath:':memory:',rateLimits:false,...(process.env.WD_STATIC_ROOT?{staticRoot:process.env.WD_STATIC_ROOT}:{})});await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${(app.server.address() as any).port}`;});
test.afterAll(async()=>{await new Promise<void>(r=>app.server.close(()=>r()));app.close();});
async function setup() {
 const browser=await chromium.launch({channel:'chrome',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 const sender=await browser.newContext({baseURL:origin,permissions:['microphone']});
 const receiver=await browser.newContext({baseURL:origin,permissions:['microphone'],viewport:{width:390,height:844}});
 const guest=app.store.createGuest();const login=app.store.accountLogin(guest.player.id,'recording-'+guest.player.id);
 await sender.addCookies([{name:'boo_session',value:login.token,url:origin}]);
 await sender.request.post('/api/onboard',{data:{name:'Sender',country:'CN',spiritId:'jiangshi'}});
 const invitation=await(await sender.request.post('/api/invites',{data:{spiritId:'jiangshi',channel:'copy',friendName:'小明同学'}})).json();
 const page=await receiver.newPage();
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(()=>{
  const evidence={start:0,stop:0,videoTime:0}; (window as any).__recordingEvidence=evidence;
  const start=MediaRecorder.prototype.start,stop=MediaRecorder.prototype.stop;
  MediaRecorder.prototype.start=function(...args){evidence.start=performance.now();evidence.videoTime=document.querySelector<HTMLVideoElement>('video[data-phase="intro"]')?.currentTime || 0;return start.apply(this,args);};
  MediaRecorder.prototype.stop=function(){evidence.stop=performance.now();return stop.call(this);};
 });
 await page.goto('/i/'+invitation.id);
 await expect(page.locator('#mic-notice')).toHaveCount(0);
 await expect(page.locator('.unlock-points')).toContainText("Only your inviter, Sender, can listen.");
 await expect(page.locator('[data-confirm-unlock]')).toBeInViewport({ratio:1});
 expect(await page.evaluate(()=>(window as any).__recordingEvidence.start)).toBe(0);
 await page.screenshot({path:'artifacts/reaction-unlock-dialog-mobile.png'});
 return {browser,sender,receiver,page,invitation};
}
async function confirmUnlock(page:any) {
 await page.getByRole('button',{name:"Confirm and enable microphone",exact:true}).click();
}
test('five-second local scoring uploads named private audio and replay does not send twice',async()=>{
 const {browser,sender,receiver,page,invitation}=await setup();
 try {
  let uploads=0; page.on('request',r=>{if(r.method()==='POST' && r.url().endsWith('/audio'))uploads++;});
  await confirmUnlock(page);
  await expect(page.locator('[data-personal-scare]')).toContainText("Recording for 5 seconds");
  await expect(page.locator('[data-personal-scare]')).toBeInViewport();
  await expect(page.locator('[data-personal-scare]')).toContainText("Your 5-second recording was sent",{timeout:15000});
  const timing=await page.evaluate(()=>(window as any).__recordingEvidence);
  expect(timing.videoTime).toBeGreaterThanOrEqual(2); expect(timing.videoTime).toBeLessThan(2.3);
  expect(timing.stop-timing.start).toBeGreaterThanOrEqual(4900); expect(timing.stop-timing.start).toBeLessThan(5600);
  const {player}=await(await sender.request.get('/api/me')).json();
  const reaction=player.reactions.recent.find((r:any)=>r.inviteId===invitation.id);
  expect(reaction).toMatchObject({name:'小明同学',friendName:'小明同学',hasAudio:1,durationMs:5000});
  const local=await page.evaluate(()=>Object.entries(localStorage).filter(([key])=>key.startsWith('boo:personal-scare:')).map(([,value])=>JSON.parse(value)));
  expect(reaction.score).toBe(local[0].score);
  const intensity=app.store.db.prepare('SELECT language,rms FROM reaction_intensity WHERE invite_id=? AND player_id=?').get(invitation.id,reaction.receiverId);
  expect(intensity.language).toBe('en');expect(Number.isFinite(intensity.rms)).toBe(true);expect(intensity.rms).toBeGreaterThanOrEqual(0);expect(intensity.rms).toBeLessThanOrEqual(1);
  const audioPath=`/api/invites/${invitation.id}/audio/${reaction.receiverId}`;
  expect((await receiver.request.get(audioPath)).status()).toBe(404);
  const audio=await sender.request.get(audioPath); expect(audio.status()).toBe(200); expect((await audio.body()).length).toBeGreaterThan(1000);
  await page.screenshot({path:'artifacts/reaction-result-mobile.png'});
  await page.locator('[data-play-transform]').click();
  await expect(page.locator('[data-play-transform]')).toBeVisible({timeout:15000});
  expect(uploads).toBe(1);
  const senderPage=await sender.newPage(); await senderPage.emulateMedia({reducedMotion:'reduce'}); await senderPage.goto('/my-links');
  await expect(senderPage.locator('.ghost-link-card').first()).toContainText('小明同学');
  await expect(senderPage.locator('.ghost-link-card').first().getByRole('link',{name:'Open invitation'})).toHaveAttribute('href','/i/'+invitation.id);
  await senderPage.getByLabel('小明同学 · Voice reaction').evaluate((a:HTMLAudioElement)=>a.play());
  await expect.poll(()=>senderPage.getByLabel('小明同学 · Voice reaction').evaluate((a:HTMLAudioElement)=>a.currentTime)).toBeGreaterThan(0);
  await senderPage.screenshot({path:'artifacts/reaction-inbox.png'});
  await senderPage.goto('/');await senderPage.getByRole('button',{name:'Enable Mic & Play',exact:true}).click();await senderPage.getByRole('button',{name:'Confirm and enable microphone',exact:true}).click();
  await senderPage.locator('.globe-pin[data-spirit="jiangshi"]').click();
  await senderPage.getByRole('button',{name:'Share this character',exact:true}).click();
  await senderPage.locator('#share-friend-name').fill('小红');
  const created=senderPage.waitForResponse(r=>r.request().method()==='POST' && r.url().endsWith('/api/invites'));
  await senderPage.getByRole('button',{name:'Copy link',exact:true}).click();
  const named=await(await created).json();
  const after=await(await sender.request.get('/api/me')).json();
  expect(after.player.reactions.links.find((l:any)=>l.inviteId===named.id).friendName).toBe('小红');
 } finally {await browser.close();}
});
test('ordinary exploration stays local and cancelling invitation capture never uploads',async()=>{
 const {browser,page,sender,invitation}=await setup();
 try {
  let uploads=0;page.on('request',r=>{if(r.method()==='POST' && r.url().endsWith('/audio'))uploads++;});
  await page.goto('/');
  await page.getByRole('button',{name:'Enable Mic & Play',exact:true}).click();await page.getByRole('button',{name:"Confirm and enable microphone",exact:true}).click();
  await page.locator('.globe-pin[data-spirit="jiangshi"]').click();
  await expect(page.locator('[data-personal-scare]')).toContainText(/My Scariness Score|No Voice Detected/,{timeout:15000});
  expect(uploads).toBe(0);
  await page.goto('/i/'+invitation.id);
  await confirmUnlock(page);
  await expect(page.locator('[data-personal-scare]')).toContainText("Recording for 5 seconds");
  await page.getByRole('button',{name:"Cancel recording and sending",exact:true}).click();
  await expect(page.locator('[data-personal-scare]')).toContainText("cancelled");
  await expect(page.locator('[data-play-transform]')).toBeVisible({timeout:15000});
  expect(uploads).toBe(0);
  expect((await(await sender.request.get('/api/me')).json()).player.reactions.recent).toHaveLength(0);
 }finally{await browser.close();}
});
test('upload failure preserves score and allows retry with the same recording',async()=>{
 const {browser,page,sender}=await setup();
 try {
  let attempts=0; const bodies:any[]=[];
  await page.route('**/api/invites/*/audio',async route=>{
   attempts++;bodies.push(route.request().postDataJSON());
   if(attempts===1)await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Try again'})});else await route.continue();
  });
  await confirmUnlock(page);
  await expect(page.locator('[data-personal-scare]')).toContainText("Sending failed",{timeout:15000});
  await expect(page.locator('[data-personal-scare]')).toContainText(/My Scariness Score|No Voice Detected/);
  await page.getByRole('button',{name:"Retry sending recording",exact:true}).click();
  await expect(page.locator('[data-personal-scare]')).toContainText("Your 5-second recording was sent");
  expect(bodies[1]).toEqual(bodies[0]);
  expect((await(await sender.request.get('/api/me')).json()).player.reactions.recent).toHaveLength(1);
 }finally{await browser.close();}
});

test('closing during capture releases the microphone and never uploads',async()=>{
 const {browser,page,sender}=await setup();
 try {
  await page.evaluate(()=>{
   const streams:MediaStream[]=[];(window as any).__streams=streams;
   const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
   navigator.mediaDevices.getUserMedia=async constraints=>{const stream=await original(constraints);streams.push(stream);return stream;};
  });
  let uploads=0;page.on('request',r=>{if(r.method()==='POST' && r.url().endsWith('/audio'))uploads++;});
  await confirmUnlock(page);
  await expect(page.locator('[data-personal-scare]')).toContainText("Recording for 5 seconds");
  await page.getByRole('button',{name:'Close character details',exact:true}).click();
  await expect(page.locator('dialog')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).__streams.every((s:MediaStream)=>s.getTracks().every(t=>t.readyState==='ended')))).toBe(true);
  // Wait past the capture deadline to detect any stale upload callback.
  await page.waitForTimeout(3500);
  expect(uploads).toBe(0);
  expect((await(await sender.request.get('/api/me')).json()).player.reactions.recent).toHaveLength(0);
 }finally{await browser.close();}
});
