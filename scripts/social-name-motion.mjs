import {writeFileSync} from 'node:fs';
import {join} from 'node:path';

// Match the observed source actions, not a random effect or a cultural stereotype.
const groups=[
 ['rise','A gentle upward entrance echoes the hop or lift, then settles.',
  'jiangshi kappa kasa-obake dokkaebi krahang phi-kong-koi duwende brownie boggart jackalope tokoloshe nasnas karakoncolos'],
 ['fade','A soft appearance accompanies the apparition or lantern reveal.',
  'nie-xiaoqian chochin-obake gaekgwi nang-tani banshee la-planchada la-pascualita ghul albasty'],
 ['slide-right','A short lateral entrance echoes turning, peeking or reaching into view.',
  'yingning tikbalang puca dullahan kelpie headless-horseman hidebehind el-charro-negro curupira cuca kalanoro shahmaran zhalmauyz-kempir'],
 ['soft-zoom','A restrained 94% to 100% scale echoes the forward lean or expansion.',
  'bake-danuki bulgasari kapre merrow jersey-devil asanbosam div zhalgyz-koz'],
 ['tile-reveal','Staggered translucent blocks assemble the name to echo the transformation, unfolding or swirling action.',
  'painted-skin-ghost gumiho krasue santelmo selkie la-mulata-de-cordoba saci boitata adze ifrit marid pari zheztyrnak'],
];
export function nameMotionFor(id,source){
 const group=groups.find(g=>g[2].split(' ').includes(id));
 if(!group)throw Error(`Missing deliberate name motion: ${id}`);
 const start=source.spokenName?.startsAt??source.revealAt;
 const duration=.8;
 if(!Number.isFinite(start)||start+duration>source.duration)throw Error(`Invalid name motion timing: ${id}`);
 return {type:group[0],reason:group[1],start,duration,easing:[.23,1,.32,1],fps:24,holdUntil:source.duration};
}

export async function renderNameFrames(page,dir,bitmap,motion){
 const data='data:image/png;base64,'+bitmap.toString('base64');
 await page.evaluate(async data=>{
  const image=new Image();image.src=data;await image.decode();
  window.nameBitmap=image;
 },data);
 const frames=Math.ceil(motion.duration*motion.fps)+1;
 for(let i=0;i<frames;i++){
  const png=await page.evaluate(({motion,time})=>{
   // Exact cubic-bezier(.23,1,.32,1), shared by fade and transform progress.
   const ease=p=>{
    p=Math.max(0,Math.min(1,p));let lo=0,hi=1;
    const bez=(t,a,b)=>3*(1-t)*(1-t)*t*a+3*(1-t)*t*t*b+t*t*t;
    for(let n=0;n<24;n++){const mid=(lo+hi)/2;if(bez(mid,.23,.32)<p)lo=mid;else hi=mid;}
    return p===0?0:p===1?1:bez((lo+hi)/2,1,1);
   };
   const image=window.nameBitmap,canvas=document.createElement('canvas');
   canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');
   const p=Math.min(1,time/motion.duration),v=ease(p);
   if(motion.type==='tile-reveal'){
    // A fixed diagonal order keeps this reproducible; no flashing or random noise.
    const cols=12,rows=3,w=canvas.width/cols,h=canvas.height/rows;
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
     const delay=(x+y)/(cols+rows-2)*.5;
     ctx.globalAlpha=ease((p-delay)/.5);
     ctx.drawImage(image,x*w,y*h,w,h,x*w,y*h,w,h);
    }
   }else{
    ctx.globalAlpha=v;
    const x=motion.type==='slide-right'?72*(1-v):0;
    const y=motion.type==='rise'?22*(1-v):0;
    const scale=motion.type==='soft-zoom'?.94+.06*v:1;
    ctx.translate(canvas.width/2+x,canvas.height/2+y);ctx.scale(scale,scale);
    ctx.drawImage(image,-canvas.width/2,-canvas.height/2);
   }
   return canvas.toDataURL('image/png').split(',')[1];
  },{motion,time:i/motion.fps});
  writeFileSync(join(dir,`name-${String(i).padStart(3,'0')}.png`),Buffer.from(png,'base64'));
 }
 return frames;
}
