import {test, expect, Page} from '@playwright/test';
async function enter(page:Page) {
 await page.goto('/');await page.getByRole('button',{name:'Continue without microphone'}).click();
 await expect(page.locator('.globe-viewport')).toBeVisible();
}
async function openRegion(page:Page,id:string) {
 if(await page.locator('dialog').count()) await page.keyboard.press('Escape');
 const pin=page.locator(`.globe-pin[data-region="${id}"]`);
 for(let i=0;i<8 && !await pin.isVisible();i++) {
  await page.getByRole('button',{name:'Rotate globe east',exact:true}).click();
  await expect.poll(()=>page.locator('.globe-explorer').getAttribute('data-longitude')).not.toBeNull();
  // Wait for the scheduled canvas frame, not an arbitrary interaction delay.
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve())));
 }
 await pin.click();await expect(page.locator('dialog.character-dialog')).toBeVisible();
}
async function join(page:Page) {
 await openRegion(page,'JP');await page.getByRole('button',{name:'Choose me',exact:false}).click();
 await page.getByLabel('Your parade name').fill('Lantern Tester');
 await page.getByLabel('Your country or region').selectOption('NZ');
 await page.getByRole('button',{name:'Join the parade',exact:true}).click();
 await expect(page.locator('.candy-bag strong')).toHaveText('30');
 await openRegion(page,'JP');
}
test('single screen globe and all twenty regions open native modal dialogs',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await enter(page);
 await expect(page.locator('#main-content #character-focus')).toHaveCount(0);
 await expect(page.locator('.globe-find,.globe-pin-label')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight)).toBe(true);
 if(!info.project.name.startsWith("webkit")) await page.mouse.wheel(0,700);expect(await page.evaluate(()=>scrollY)).toBe(0);
 const catalog=await(await page.request.get('/api/catalog')).json();
 for(const r of catalog.regions) {
  await openRegion(page,r.id);
  expect(await page.locator('dialog').evaluate((el:HTMLDialogElement)=>el.matches(':modal'))).toBe(true);
  const friends=catalog.spirits.filter((s:{regionId:string})=>s.regionId===r.id);
  if(!friends.length) await expect.poll(()=>page.locator('.region-preview-art').evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth>0)).toBe(true);
  for(const s of friends) {
   await expect(page.locator('.name-line h2')).toHaveText(s.name);
   await expect.poll(()=>page.locator('.hero-spirit').evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth>0)).toBe(true);
   await page.getByRole('button',{name:`Next character in ${r.name}`,exact:true}).click();
  }
  await page.getByRole('button',{name:'Close character details',exact:true}).click();
  await expect(page.locator('dialog')).toHaveCount(0);
 }
 await openRegion(page,'JP');await page.keyboard.press('Escape');
 await page.screenshot({path:`artifacts/${info.project.name}-terrain-explore.png`});
 await page.setViewportSize({width:375,height:667});
 expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight&&document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.setViewportSize({width:812,height:375});
 expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight&&document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(errors).toEqual([]);
});
test('large transparent emoji actions, paging, swipe and close restore the globe',async({page},info)=>{
 await enter(page);await join(page);
 for(const [selector,emoji] of [['.scare-action','🎃'],['.sweet-action','🍬']]) {
  const orb=page.locator(selector+' .action-orb');await expect(orb).toHaveText(emoji);
  const styles=await orb.evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundImage,border:s.borderTopWidth,font:parseFloat(s.fontSize)};});
  expect(styles.background).toBe('none');expect(styles.border).toBe('0px');expect(styles.font).toBeGreaterThanOrEqual(56);
 }
 await page.getByRole('button',{name:'Next character in Japan',exact:true}).click();
 await expect(page.locator('.name-line h2')).toHaveText('Bake-danuki');
 const stage=page.locator('.character-stage');await stage.scrollIntoViewIfNeeded();const box=await stage.boundingBox();
 await page.mouse.move(box!.x+box!.width*.7,box!.y+box!.height*.6);await page.mouse.down();await page.mouse.move(box!.x+box!.width*.3,box!.y+box!.height*.6,{steps:5});await page.mouse.up();
 await expect(page.locator('.name-line h2')).toHaveText('Chochin-obake');
 await page.screenshot({path:`artifacts/${info.project.name}-transparent-actions.png`});
 for(const name of ['Treat — give sweet','Trick — scare a friend']) {
  await openRegion(page,'JP');await page.getByRole('button',{name,exact:true}).click();
  await expect(page.locator('dialog')).toBeVisible();await page.keyboard.press('Escape');
 }
 await openRegion(page,'AFR');await page.getByRole('button',{name:'Close character details',exact:true}).click();
 await expect(page.locator('.globe-viewport')).toBeFocused();
 const me=await(await page.request.get('/api/me')).json();expect(me.player.wallet).toBe(30);
});
test('globe drag, hover magnification and reduced motion',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await enter(page);
 const pin=page.locator('.globe-pin[data-region="JP"]');await pin.hover();
 const image=pin.locator('img');
 if(!test.info().project.name.includes('mobile')) await expect.poll(()=>image.evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).a)).toBeGreaterThan(1.7);
 const globe=page.locator('.globe-viewport');const box=await globe.boundingBox();
 const before=await page.locator('.globe-explorer').getAttribute('data-longitude');
 await page.mouse.move(box!.x+box!.width*.5,box!.y+box!.height*.8);await page.mouse.down();await page.mouse.move(box!.x+box!.width*.25,box!.y+box!.height*.8,{steps:6});await page.mouse.up();
 await expect(page.locator('.globe-explorer')).not.toHaveAttribute('data-longitude',before!);
 await expect(page.locator('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'Open my collection'}).click();await expect(page.locator('.codex-card')).toHaveCount(40);
 await page.locator('nav:visible [data-page="boards"]').click();await expect(page.locator('#board-content')).toBeVisible();
});
test("invitation previews do not award and recipient response awards only once", async ({
  page,
  browser,
}) => {
  await enter(page);
  await join(page);
  const invite = await page.evaluate(async () => {
    const r = await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spiritId: "kappa", channel: "line" }),
    });
    return r.json();
  });
  const preview = await page.request.get(invite.url);
  expect(await preview.text()).toContain("og:title");
  let me = await page.evaluate(() => fetch("/api/me").then((r) => r.json()));
  expect(me.player.wallet).toBe(30);
  const other = await browser.newContext();
  const receiver = await other.newPage();
  await receiver.goto(invite.url);
  await receiver.getByRole("button", { name: "Continue without microphone" }).click();
  const result = receiver.locator('dialog.invitation-result');
  await expect(result.getByRole('button', { name: 'Trick — scare a friend' })).toHaveAttribute('data-id', 'kappa');
  await expect(result.getByRole('button', { name: 'Treat — give sweet' })).toHaveAttribute('data-id', 'kappa');
  await expect(result.getByRole('progressbar')).toHaveCount(2);
  await expect(result.locator('.mini-meter strong')).toHaveText(['0 / 100', '0 / 100']);
  await expect(result.getByRole('button', { name: 'Share with friends' })).toHaveAttribute('data-action', 'share');
  await receiver.getByRole("button", { name: "Say Boo back" }).click();
  await receiver.getByLabel("Your parade name").fill("Friendly visitor");
  await receiver.getByLabel("Your country or region").selectOption("CA");
  await receiver
    .getByRole("button", { name: "Join the parade", exact: true })
    .click();
  await expect(receiver.locator(".candy-bag strong")).toHaveText("50");
  me = await page.evaluate(() => fetch("/api/me").then((r) => r.json()));
  expect(me.player.wallet).toBe(50);
  await receiver.evaluate(async (token) => {
    await fetch(`/api/invites/${token}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  }, invite.id);
  me = await page.evaluate(() => fetch("/api/me").then((r) => r.json()));
  expect(me.player.wallet).toBe(50);
  await other.close();
});

test("cancelled Facebook sharing and clipboard denial never award candy", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => {
        throw new DOMException("User cancelled", "AbortError");
      },
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new DOMException("Clipboard denied", "NotAllowedError");
        },
      },
    });
  });
  await enter(page);
  await join(page);
  await page
    .getByRole("button", { name: "Scare a friend", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Scare Facebook Friends", exact: false })
    .click();
  const input = page.getByLabel("Invitation link");
  await expect(input).toBeVisible();
  const fbToken = new URL(await input.inputValue()).pathname.split("/").at(-1);
  const invite = await (
    await page.request.get(`/api/invites/${fbToken}`)
  ).json();
  expect(invite.channel).toBe("facebook");
  expect(invite.eligible).toBe(false);
  await page.getByRole("button", { name: "Copy link", exact: false }).click();
  await expect(input).not.toHaveValue(new RegExp(fbToken!));
  await expect(page.locator("#toast")).toContainText("Select and copy");
  const me = await (await page.request.get("/api/me")).json();
  expect(me.player.wallet).toBe(30);
  expect(me.player.candies).toBe(30);
});


test('pitch reaction reaches only inviter and retired duel stays unavailable',async({page,browser})=>{
 await enter(page);await join(page);
 const invitation=await(await page.request.post('/api/invites',{data:{spiritId:'kappa',channel:'copy'}})).json();
 const receiverContext=await browser.newContext();
 const receiver=await receiverContext.newPage();
 await receiver.addInitScript(()=>{
   // Deterministic synthetic audio pipeline; no real microphone or permissions used.
   (window as any).__micStopped=false;
   Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>({getTracks:()=>[{stop:()=>{(window as any).__micStopped=true;}}]})});
   (window as any).AudioContext=class {
    sampleRate=48000; resume(){return Promise.resolve();}close(){return Promise.resolve();}
    createMediaStreamSource(){return {connect(){},disconnect(){}};}
    createAnalyser(){return {fftSize:2048,getFloatTimeDomainData(a:Float32Array){for(let i=0;i<a.length;i++)a[i]=.2*Math.sin(i*440*2*Math.PI/48000);}};}
   };
 });
 await receiver.goto('/i/'+invitation.id);
 const response=receiver.waitForResponse(r=>r.url().endsWith('/reaction'));
 await receiver.getByRole('button',{name:'Enable mic & open the gate',exact:false}).click();
 expect((await response).status()).toBe(200);
 expect(await receiver.evaluate(()=>(window as any).__micStopped)).toBe(true);
 const senderState=await(await page.request.get('/api/me')).json();
 expect(senderState.player.reactions.stats[0].meanHz).toBeGreaterThan(420);
 expect(senderState.player.reactions.recent[0].level).toBe('Big Boo');
 expect(senderState.player.wallet).toBe(30);
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Friend reactions'}).click();
 await expect(page.locator('.reaction-report')).toContainText('Big Boo');
 const retired=await page.request.post('/api/matches',{data:{spiritId:'kappa',opponentId:'jiangshi'}});
 expect(retired.status()).toBe(410);
 await receiverContext.close();
});
test('microphone refusal lets the recipient continue without sending a reaction',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{throw new DOMException('Denied','NotAllowedError');}}));
 await page.goto('/');
 await page.getByRole('button',{name:'Enable mic & open the gate',exact:false}).click();
 await expect(page.locator('.mic-status')).toContainText('permission declined');
 await page.getByRole('button',{name:'Continue without microphone'}).click();
 await expect(page.locator('.globe-viewport')).toBeVisible();
});

test('five named scare platforms and new messenger copy flows',async({page})=>{
 await enter(page);await join(page);
 await page.getByRole('button',{name:'Trick — scare a friend',exact:true}).click();
 for(const platform of ['X','Line','Facebook','Kakao','Wechat']) await expect(page.getByRole('button',{name:`Scare ${platform} Friends`,exact:true})).toBeVisible();
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{}}}));
 for(const [label,channel,app] of [['Kakao','kakao','KakaoTalk'],['Wechat','wechat','WeChat']]) {
  await page.getByRole('button',{name:`Scare ${label} Friends`,exact:true}).click();
  await expect(page.locator('#share-link')).toContainText(`send it to a friend in ${app}`);
  const url=await page.getByLabel('Invitation link').inputValue();
  const invite=await(await page.request.get('/api/invites/'+url.split('/').pop())).json();
  expect(invite.channel).toBe(channel);
 }
 await page.screenshot({path:'artifacts/scare-platform-options.png'});
});

test('cute globe motion loops only Jiangshi and pauses safely',async({page},info)=>{
 await enter(page);
 const motions=await(await page.request.get('/api/motions')).json();
 expect(Object.keys(motions.motions)).toEqual(['jiangshi']);
 const img=page.locator('.globe-pin img[data-cute-id="jiangshi"]');
 await expect(img).toHaveClass(/cute-sprite/);
 await expect.poll(()=>img.evaluate(el=>el.getAnimations()[0]?.playState)).toBe('running');
 const initial=await img.evaluate(el=>getComputedStyle(el).objectPosition);
 await expect.poll(()=>img.evaluate(el=>getComputedStyle(el).objectPosition)).not.toBe(initial);
 await expect(page.locator('.globe-pin img.cute-sprite')).toHaveCount(1);
 const width=await img.evaluate(el=>getComputedStyle(el).width);
 expect(width).toBe(await page.locator('.globe-pin img[data-cute-id="kappa"]').evaluate(el=>getComputedStyle(el).width));
 await page.screenshot({path:`artifacts/${info.project.name}-cute-globe.png`});
 await openRegion(page,'CN');
 await expect.poll(()=>img.evaluate(el=>el.getAnimations()[0]?.playState)).toBe('paused');
 await page.keyboard.press('Escape');
 await expect.poll(()=>img.evaluate(el=>el.getAnimations()[0]?.playState)).toBe('running');
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect(img).not.toHaveClass(/cute-sprite/);
 await expect(img).toHaveAttribute('src',/jiangshi-thumb/);
 await page.emulateMedia({reducedMotion:'no-preference'});
 await expect(img).toHaveClass(/cute-sprite/);
 await expect.poll(()=>img.evaluate(el=>el.getAnimations()[0]?.playState)).toBe('running');
});

test('pumpkin planet rotates slowly and pauses for interaction and reduced motion',async({page},info)=>{
 await enter(page);await page.mouse.move(0,0);
 const globe=page.locator('.globe-explorer');
 const initial=await globe.getAttribute('data-longitude');
 await expect.poll(()=>globe.getAttribute('data-longitude')).not.toBe(initial);
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.waitForTimeout(150);
 const paused=await globe.getAttribute('data-longitude');
 await page.waitForTimeout(700);
 expect(await globe.getAttribute('data-longitude')).toBe(paused);
 await page.screenshot({path:`artifacts/${info.project.name}-pumpkin-planet.png`});
 await openRegion(page,'CN');await expect(page.locator('dialog.character-dialog')).toBeVisible();
 await page.emulateMedia({reducedMotion:'no-preference'});
 const modalPause=await globe.getAttribute('data-longitude');await page.waitForTimeout(700);
 expect(await globe.getAttribute('data-longitude')).toBe(modalPause);
});

test('pumpkin carvings rotate behind the globe instead of staying on screen',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await enter(page);
 const glow=()=>page.locator('.globe-viewport canvas').evaluate((el:HTMLCanvasElement)=>{
  const {data}=el.getContext('2d')!.getImageData(0,0,el.width,el.height);let n=0;
  for(let i=0;i<data.length;i+=4)if(data[i]>250&&data[i+1]>220&&data[i+2]>60&&data[i+2]<210)n++;
  return n;
 });
 await expect.poll(glow).toBeGreaterThan(100);
 const front=await glow();
 for(let i=0;i<3;i++)await page.getByRole('button',{name:'Rotate globe east',exact:true}).click();
 await expect.poll(glow).toBeLessThan(front*.15);
});
