import {test,expect} from '@playwright/test';
import {startBrowserApp} from '../helpers/nginx.mjs';
let app:Awaited<ReturnType<typeof startBrowserApp>>,origin:string,token:string;
test.beforeAll(async()=>{
 process.env.LINE_LIFF_ID='test-liff';
 app=await startBrowserApp({databasePath:':memory:',rateLimits:false});origin=app.origin;
 const guest=app.store.createGuest();const login=app.store.accountLogin(guest.player.id,'line-test');
 app.store.onboard(login.player.id,{name:'LINE tester',country:'CN',spiritId:'jiangshi'});
 const r=await fetch(origin+'/api/invites',{method:'POST',headers:{cookie:'boo_session='+login.token,'content-type':'application/json'},body:JSON.stringify({spiritId:'jiangshi',channel:'line'})});
 token=(await r.json()).id;expect(token).toBeTruthy();
});
test.afterAll(async()=>{await app.stop();delete process.env.LINE_LIFF_ID;});
for(const mode of ['success','cancel','error','unavailable','login'])test(`LINE card: ${mode}`,async({page})=>{
 await page.route('https://static.line-scdn.net/**',route=>route.fulfill({contentType:'application/javascript',body:`window.calls=[];window.liff={init:async()=>{},isLoggedIn:()=>${mode!=='login'},login:x=>window.redirect=x.redirectUri,isApiAvailable:()=>${mode!=='unavailable'},shareTargetPicker:async(m)=>{window.calls.push(m);${mode==='error'?'throw Error("provider failed")':mode==='cancel'?'return undefined':'return {status:"success"}'}}};`}));
 await page.goto(origin+'/line-share.html?invite='+token);
 const button=page.locator('#choose');await expect(button).toBeEnabled();
 expect(await page.evaluate(()=>(window as any).calls.length)).toBe(0);
 await page.locator('#message').fill('Custom spooky greeting');await button.click();
 if(mode==='login'){
  await expect.poll(()=>page.evaluate(()=>(window as any).redirect)).toBe(origin+'/line-share.html?invite='+token+'&lang=en');return;
 }
 await expect(page.locator('[role=status]')).toContainText({success:'Card sent.',cancel:'Cancelled. Nothing was sent.',error:'could not confirm',unavailable:'unavailable'}[mode]!);
 await expect(button).toBeEnabled();
 const calls=await page.evaluate(()=>(window as any).calls);
 if(mode==='unavailable'){expect(calls).toHaveLength(0);return;}
 const card=calls[0][0];expect(card.type).toBe('flex');expect(card.contents.hero.url).toBe(origin+'/line-cards/jiangshi.jpg');expect((await page.request.get(card.contents.hero.url)).headers()['content-type']).toContain('image/jpeg');expect(card.altText).toBe('Custom spooky greeting');
 expect(card.contents.hero.action.uri).toBe(origin+'/i/'+token);
 expect(card.contents.footer.contents[0].action.uri).toBe(origin+'/i/'+token);
 if(mode==='success')await page.screenshot({path:'artifacts/private/line-setup/local-card-tested.png'});
});
test('invalid and expired invites never offer sending',async({page})=>{
 await page.route('https://static.line-scdn.net/**',r=>r.fulfill({contentType:'application/javascript',body:'window.liff={init:async()=>{}}'}));
 await page.goto(origin+'/line-share.html?invite=missing');await expect(page.locator('[role=status]')).toContainText('Could not load');await expect(page.locator('#choose')).toHaveCount(0);
 app.store.db.prepare('UPDATE invites SET created_at=0 WHERE id=?').run(token);
 await page.goto(origin+'/line-share.html?invite='+token);await expect(page.locator('[role=status]')).toContainText('expired');await expect(page.locator('#choose')).toHaveCount(0);
});
