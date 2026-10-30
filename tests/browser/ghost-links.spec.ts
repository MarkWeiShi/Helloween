import {test,expect} from '@playwright/test';
import {startBrowserApp} from '../helpers/nginx.mjs';
let app:Awaited<ReturnType<typeof startBrowserApp>>,origin:string,ownerToken:string,inviteId:string;
test.beforeAll(async()=>{
 app=await startBrowserApp({databasePath:':memory:',rateLimits:false,authOptions:{url:'https://identity.example',key:'test-key',fetcher:async(url:string)=>Response.json(url.endsWith('/otp')?{}:{access_token:'test-only',user:{id:'library-owner',is_anonymous:false}})}});
 origin=app.origin;
 const guest=app.store.createGuest();app.store.onboard(guest.player.id,{name:'Owner',country:'CN',spiritId:'jiangshi'});ownerToken=app.store.accountLogin(guest.player.id,'library-owner').token;
 const link=app.store.createInvite(guest.player.id,{spiritId:'jiangshi',channel:'copy',friendName:'周末朋友们'});inviteId=link.id;
 for(let i=0;i<5;i++)app.store.recordAudio(app.store.createGuest().player.id,link.id,{consent:true,mime:'audio/webm',audio:Buffer.from([0x1a,0x45,0xdf,0xa3,1,2,3]).toString('base64'),durationMs:2000,language:'zh',amplitudeRms:.4,score:null,meanHz:null,peakHz:null,frames:0});
 app.store.createInvite(guest.player.id,{spiritId:'kappa',channel:'copy'});
});
test.afterAll(async()=>{await app.stop();});
test('library opens without microphone, groups five slots, filters and signs out',async({page,context},testInfo)=>{
 await context.addCookies([{name:'boo_session',value:ownerToken,url:origin}]);
 await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw Error('Library must not request microphone');};});
 await page.goto(origin+'/my-links?lang=zh');
 await expect(page.getByRole('heading',{name:'朋友尖叫',exact:true})).toBeVisible();
 await expect(page.locator('.ghost-link-card')).toHaveCount(2);await expect(page.locator('.ghost-voice-slots li')).toHaveCount(10);
 await page.locator('[data-ghost-filter]').selectOption('jiangshi');await expect(page.locator('.ghost-link-card')).toHaveCount(1);await expect(page.locator('audio')).toHaveCount(5);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`artifacts/my-ghost-links-${testInfo.project.name}.png`,fullPage:true});
 await page.locator('[data-page="boards"]:visible').click();await expect(page.locator('[data-page="boards"]:visible')).toHaveAttribute('aria-current','page');
 await page.locator('[data-page="map"]:visible').click();await expect(page.locator('.play-lock')).toBeVisible();
 await expect(page.locator('.mobile-nav')).toBeVisible();
 await expect(page.locator('.mobile-nav [data-page]')).toHaveCount(3);
 await expect(page.locator('.mobile-nav [data-page="map"]')).toHaveAttribute('aria-current','page');
 const globe=await page.locator('.globe-viewport').boundingBox(),nav=await page.locator('.mobile-nav').boundingBox();expect(globe!.y+globe!.height).toBeLessThanOrEqual(nav!.y+1);
 await page.screenshot({path:`artifacts/home-three-tabs-${testInfo.project.name}.png`,fullPage:true});
 await page.locator('.mobile-nav [data-page="boards"]').click();await expect(page.getByRole('heading',{name:'尖叫排名',exact:true})).toBeVisible();
 await page.locator('[data-page="links"]:visible').click();await expect(page.getByRole('heading',{name:'朋友尖叫',exact:true})).toBeVisible();

 await page.goto(origin+'/my-links?lang=zh');
 await page.getByRole('button',{name:'退出登录',exact:true}).click();
 await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();await expect(page.locator('.ghost-link-card')).toHaveCount(0);
});
test('email sign-in returns to saved library on another browser',async({page})=>{
 await page.goto(origin+'/my-links?lang=en');await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByLabel('Email',{exact:true}).fill('owner@example.com');await page.getByRole('button',{name:'Send sign-in code',exact:true}).click();
 await page.getByLabel('Email code',{exact:true}).fill('123456');await page.getByRole('button',{name:'Verify and continue',exact:true}).click();
 await expect(page.locator('.ghost-link-card')).toHaveCount(2);await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();
});
test('full invitation explains capacity before experience',async({page})=>{
 await page.goto(origin+'/i/'+inviteId+'?lang=en');await page.getByRole('button',{name:'Enable Mic & Play',exact:true}).click();
 await expect(page.locator('.unlock-points')).toContainText('already has five recordings');
 await expect(page.locator('audio')).toHaveCount(0);
});

test('rankings switch individuals and sharer countries and explain score eligibility',async({page},testInfo)=>{
 await page.goto(origin+'/rankings?lang=zh');
 await expect(page.getByRole('heading',{name:'尖叫排名',exact:true})).toBeVisible();
 await expect(page.locator('[data-board-group="players"]')).toHaveText('个人');
 await expect(page.locator('[data-board-group="countries"]')).toHaveText('国家');
 await expect(page.locator('.board-score').first()).toHaveText('5');
 await page.locator('[data-board-group="countries"]').click();
 await expect(page.locator('.board-name strong').first()).toContainText('中国');
 await expect(page.locator('.board-score').first()).toHaveText('5');
 await page.locator('[data-scope="intensity"]').click();
 await expect(page.locator('.rank-empty')).toHaveText('暂无符合条件的惊恐评分。');
 app.store.recordAudio(app.store.createGuest().player.id,app.store.createInvite(app.store.invite(inviteId).senderId,{spiritId:'jiangshi',channel:'copy'}).id,{consent:true,mime:'audio/webm',audio:Buffer.from([0x1a,0x45,0xdf,0xa3,1,2,3]).toString('base64'),durationMs:5000,scoringVersion:2,echoCancellation:true,meanRms:.1,score:50,meanHz:635,peakHz:635,frames:10});
 await page.locator('[data-board-group="players"]').click();
 await expect(page.locator('.board-name strong').first()).toHaveText('Owner');
 await expect(page.locator('.board-score').first()).toHaveText('50 / 100');
 await page.locator('[data-board-group="countries"]').click();
 await expect(page.locator('.board-name strong').first()).toContainText('中国');
 await expect(page.locator('.board-score').first()).toHaveText('50 / 100');
 const help=page.locator('[data-action="rankings-help"]');await expect(help).toBeVisible();
 const box=(await help.boundingBox())!;expect(box.x).toBeLessThan(20);expect(box.width).toBe(44);
 await help.click();await expect(page.getByRole('dialog')).toContainText('音高占 50%');
 await expect(page.getByRole('dialog')).toContainText('分享者所选国家');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`artifacts/scream-rankings-help-${testInfo.project.name}.png`,fullPage:true});
 await page.locator('.modal-close').click();
 await page.screenshot({path:`artifacts/scream-rankings-${testInfo.project.name}.png`,fullPage:true});
});
