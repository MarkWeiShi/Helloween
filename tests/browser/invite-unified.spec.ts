import {test,expect,chromium} from '@playwright/test';
test('accepting an invitation opens the shared immersive character view',async()=>{
 const browser=await chromium.launch({channel:'chrome',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try {
 const sender=await browser.newContext({baseURL:(process.env.WD_ACCEPTANCE_ORIGIN || 'http://127.0.0.1:8787')});
 await sender.request.post('/api/session',{data:{}});
 await sender.request.post('/api/onboard',{data:{name:'你的朋友',country:'CN',spiritId:'jiangshi'}});
 const invite=await(await sender.request.post('/api/invites',{data:{spiritId:'jiangshi',channel:'copy'}})).json();
 const receiver=await browser.newContext({baseURL:(process.env.WD_ACCEPTANCE_ORIGIN || 'http://127.0.0.1:8787'),permissions:['microphone'],viewport:{width:390,height:844}});
 const page=await receiver.newPage();await page.goto('/i/'+invite.id);
 await page.getByRole('button',{name:'Enable Mic & Play',exact:true}).click();await page.getByRole('button',{name:"Confirm and enable microphone",exact:true}).click();
 await page.getByRole('button',{name:"Accept invitation",exact:true}).click();
 const dialog=page.locator('dialog.character-immersive');await expect(dialog).toBeVisible();
 await expect(dialog.locator('#character-focus')).toHaveAttribute('aria-label','Jiangshi');
 await expect(dialog.locator(':scope > .immersive-video-layer')).toHaveCount(1);
 await expect(page.locator('.invitation-cinema')).toHaveCount(0);
 await expect(dialog.locator('.character-info')).toBeInViewport();
 await page.screenshot({path:'artifacts/invite-unified-mobile.png'});
 await page.getByRole('button',{name:'Close character details',exact:true}).click();
 await expect(dialog).toHaveCount(0);
 }finally{await browser.close();}
});
