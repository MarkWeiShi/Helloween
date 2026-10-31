import {test,expect,chromium} from '@playwright/test';
import {startBrowserApp} from '../helpers/nginx.mjs';
let origin:string,app:Awaited<ReturnType<typeof startBrowserApp>>;
test.beforeAll(async()=>{app=await startBrowserApp({databasePath:':memory:',rateLimits:false});origin=app.origin;});
test.afterAll(async()=>{await app.stop();});
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
 await page.getByRole('button',{name:'Agree and unlock',exact:true}).click();
 await expect(page.locator('dialog.character-immersive')).toBeVisible();
 expect(await page.evaluate(()=>(window as any).__recordingEvidence.start)).toBe(0);
 return {browser,sender,receiver,page,invitation};
}
async function confirmUnlock(page:any) {
 await expect(page.locator('[data-record-reaction]')).toBeHidden();
}
test('six-second local scoring uploads named private audio and replay does not send twice',async()=>{
 const {browser,sender,receiver,page,invitation}=await setup();
 try {
  let uploads=0; page.on('request',r=>{if(r.method()==='POST' && r.url().endsWith('/audio'))uploads++;});
  await confirmUnlock(page);
  await expect(page.locator('[data-personal-scare]')).toContainText("Recording…");
  await expect(page.locator('[data-personal-scare]')).toBeInViewport();
  await expect(page.locator('[data-personal-scare]')).toContainText("Voice sent",{timeout:15000});
  const timing=await page.evaluate(()=>(window as any).__recordingEvidence);
  expect(timing.videoTime).toBeGreaterThanOrEqual(3); expect(timing.videoTime).toBeLessThan(3.35);
  expect(timing.stop-timing.start).toBeGreaterThanOrEqual(5900); expect(timing.stop-timing.start).toBeLessThan(6600);
  const {player}=await(await sender.request.get('/api/me')).json();
  const reaction=player.reactions.recent.find((r:any)=>r.inviteId===invitation.id);
  expect(reaction).toMatchObject({name:'小明同学',friendName:'小明同学',hasAudio:1,durationMs:6000});
  const local=await page.evaluate(()=>Object.entries(localStorage).filter(([key])=>key.startsWith('boo:personal-scare:')).map(([,value])=>JSON.parse(value)));
  expect(reaction.score).toBe(local[0].score);
  const intensity=app.store.db.prepare('SELECT language,rms FROM reaction_intensity WHERE invite_id=? AND player_id=?').get(invitation.id,reaction.receiverId);
  expect(intensity.language).toBe('en');expect(Number.isFinite(intensity.rms)).toBe(true);expect(intensity.rms).toBeGreaterThanOrEqual(0);expect(intensity.rms).toBeLessThanOrEqual(1);
  const audioPath=`/api/invites/${invitation.id}/audio/${reaction.receiverId}`;
  expect((await receiver.request.get(audioPath)).status()).toBe(404);
  const audio=await sender.request.get(audioPath); expect(audio.status()).toBe(200); expect((await audio.body()).length).toBeGreaterThan(1000);
  const encoded=(await audio.body()).toString('base64');
  const decodedDuration=await page.evaluate(async encoded=>{
    const context=new AudioContext();
    try {const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));return (await context.decodeAudioData(bytes.buffer)).duration;}
    finally {await context.close();}
  },encoded);
  expect(decodedDuration).toBeGreaterThanOrEqual(5.8);expect(decodedDuration).toBeLessThan(6.5);
  console.log('Recording timing evidence',JSON.stringify({...timing,decodedDuration}));
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
  await senderPage.goto('/');await senderPage.locator('.play-unlock').click();
  await senderPage.locator('.globe-pin[data-spirit="jiangshi"]').click();
  await senderPage.locator('.character-pumpkin').click();
  const created=senderPage.waitForResponse(r=>r.request().method()==='POST' && r.url().endsWith('/api/invites'));
  await senderPage.getByRole('button',{name:'Copy link',exact:true}).click();
  const named=await(await created).json();
  const after=await(await sender.request.get('/api/me')).json();
  expect(after.player.reactions.links.find((l:any)=>l.inviteId===named.id)).toBeTruthy();
 } finally {await browser.close();}
});
test('ordinary exploration stays local and leaving invitation capture never uploads',async()=>{
 const {browser,page,sender,invitation}=await setup();
 try {
  let uploads=0;page.on('request',r=>{if(r.method()==='POST' && r.url().endsWith('/audio'))uploads++;});
  await page.goto('/');
  if(await page.locator('.play-unlock').isVisible())await page.locator('.play-unlock').click();
  await page.locator('.globe-pin[data-spirit="jiangshi"]').click();
  await expect(page.locator('[data-record-reaction]')).toBeHidden();
  expect(uploads).toBe(0);
  await page.goto('/i/'+invitation.id);
  await expect(page.locator('.play-lock, .unlock-consent')).toHaveCount(0);
  if(await page.locator('[data-invite-play]').isVisible())await page.locator('[data-invite-play]').click();
  await expect(page.locator('[data-record-reaction]')).toBeHidden();
  await expect(page.locator('[data-personal-scare]')).toContainText("Recording…");
  await expect(page.locator('.character-info')).not.toHaveAttribute('inert','');
  await page.goto('about:blank');
  expect(uploads).toBe(0);
  expect((await(await sender.request.get('/api/me')).json()).player.reactions.recent).toHaveLength(0);
 }finally{await browser.close();}
});
for (const full of [false,true]) test(`${full?'full storage':'upload failure'} preserves score and allows retry with the same recording`,async()=>{
 const {browser,page,sender}=await setup();
 try {
  let attempts=0; const bodies:any[]=[];
  await page.route('**/api/invites/*/audio',async route=>{
   attempts++;bodies.push(route.request().postDataJSON());
   if(attempts===1)await route.fulfill({status:full?200:503,contentType:'application/json',body:JSON.stringify(full?{ok:true,full:true}:{error:'Try again'})});else await route.continue();
  });
  await confirmUnlock(page);
  await expect(page.locator('[data-personal-scare]')).toContainText(full?"Storage full (50 voices)":"Send failed",{timeout:15000});
  expect(await page.evaluate(()=>Object.keys(localStorage).some(key=>key.startsWith("boo:personal-scare:")))).toBe(true);
  await page.locator('[data-play-transform]').click();
  await expect(page.locator('[data-personal-scare]')).toContainText("Voice sent");
  expect(bodies[1]).toEqual(bodies[0]);
  expect((await(await sender.request.get('/api/me')).json()).player.reactions.recent).toHaveLength(1);
 }finally{await browser.close();}
});

test('pagehide during locked capture releases the microphone and never uploads',async()=>{
 const {browser,page,sender}=await setup();
 try {
  await page.evaluate(()=>{
   const streams:MediaStream[]=[];(window as any).__streams=streams;
   const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
   navigator.mediaDevices.getUserMedia=async constraints=>{const stream=await original(constraints);streams.push(stream);return stream;};
  });
  let uploads=0;page.on('request',r=>{if(r.method()==='POST' && r.url().endsWith('/audio'))uploads++;});
  await confirmUnlock(page);
  await expect(page.locator('[data-personal-scare]')).toContainText("Recording…");
  await expect(page.locator('dialog.character-immersive')).not.toHaveAttribute('data-playback-locked','');
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  expect(await page.evaluate(()=>(window as any).__streams.every((s:MediaStream)=>s.getTracks().every(t=>t.readyState==='ended')))).toBe(true);
  // Wait past the capture deadline to detect any stale upload callback.
  await page.waitForTimeout(3500);
  expect(uploads).toBe(0);
  expect((await(await sender.request.get('/api/me')).json()).player.reactions.recent).toHaveLength(0);
 }finally{await browser.close();}
});
