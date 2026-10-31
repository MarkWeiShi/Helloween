import { test, expect } from '@playwright/test';

test.use({baseURL: process.env.WD_ACCEPTANCE_ORIGIN || 'http://127.0.0.1:8787'});
for (const regionId of ['AFR', 'ARAB', 'WAS', 'ECA']) {
 test(`${regionId}: four new globe friends have artwork, lore and usable cards`, async ({page}, info) => {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(()=>{
   Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}});
   (window as any).AudioContext=class {
    state='running';currentTime=0;destination={};sampleRate=48000;
    resume(){return Promise.resolve();}close(){return Promise.resolve();}
    createMediaStreamSource(){return {connect(){},disconnect(){}};}
    createAnalyser(){return {fftSize:2048,getFloatTimeDomainData(data:Float32Array){data.fill(0);}};}
    createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
    createOscillator(){return {frequency:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},start(){},stop(){}};}
   };
  });
  await page.goto('/');await page.getByRole('button',{name:'Agree and unlock',exact:true}).click();
  await expect(page.locator('.play-lock')).toHaveCount(0);
  const catalog=await(await page.request.get('/api/catalog')).json();
  expect(catalog.spirits).toHaveLength(56);
  const friends=catalog.spirits.filter((s:any)=>s.regionId===regionId);
  expect(friends).toHaveLength(4);
  await expect(page.locator(`.globe-pin[data-region="${regionId}"]`)).toHaveCount(4);
  await expect(page.locator(`.globe-pin.soon[data-region="${regionId}"]`)).toHaveCount(0);
  const pin=page.locator(`[data-globe-spirit="${friends[0].id}"]`);
  await page.mouse.move(0,0);
  const reachable = () => pin.evaluate(el => {
   const r=el.getBoundingClientRect(),style=getComputedStyle(el);
   if(el.hasAttribute('hidden') || Number(style.opacity)<.95)return null;
   for(const x of [.5,.3,.7])for(const y of [.5,.3,.7]){
    const hit=document.elementFromPoint(r.x+r.width*x,r.y+r.height*y);
    if(hit && el.contains(hit))return {x:r.width*x,y:r.height*y};
   }
   return null;
  });
  for(let i=0;i<24 && !await reachable();i++){
   await page.locator('.globe-viewport').press('ArrowLeft');
   await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));
  }
  const clickPosition=await reachable();expect(clickPosition).not.toBeNull();
  await pin.click({position:clickPosition!});
  for(const [i,s] of friends.entries()) {
   await expect(page.locator('.name-line h2')).toHaveText(s.name);
   await expect(page.locator('.character-navigation small')).toHaveText(`${i+1} / 4`);
   await expect(page.locator('.description')).toHaveText(s.shortDescription);
   await expect.poll(()=>page.locator('.hero-spirit').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth===480)).toBe(true);
   await expect(page.getByRole('button',{name:'Choose me',exact:true})).toBeEnabled();
   for(const pose of ['idle','scare','peace','thumb','share']) expect((await page.request.get(s.art[pose])).ok()).toBe(true);
   await page.screenshot({path:`artifacts/regional-expansion/${info.project.name}-${s.id}.png`});
   const regionName=catalog.regions.find((r:any)=>r.id===regionId).name;
   await page.getByRole('button',{name:`Next character in ${regionName}`,exact:true}).click();
  }
  await page.getByRole('button',{name:`Read ${friends[0].name}'s story`,exact:true}).click();
  await expect(page.locator('.lore-copy')).toContainText(friends[0].folklore);
  await page.getByText('Explore the sources',{exact:true}).click();
  expect(await page.locator('.lore-copy a').first().getAttribute('href')).toBe(friends[0].sources[0].url);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`artifacts/regional-expansion/${info.project.name}-${regionId}-globe.png`});
  expect(errors).toEqual([]);
 });
}
