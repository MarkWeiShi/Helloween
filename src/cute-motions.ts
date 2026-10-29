import {loadMotions} from './static-content';
// Sprite images preserve alpha across Safari/Chrome without hidden video decoders.
export function mountCuteMotions(host:HTMLElement) {
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const entries=[...host.querySelectorAll<HTMLImageElement>('img[data-cute-id]')].map(img=>({img,original:img.src,sheet:'',animation:null as Animation|null}));
 let dead=false,loading=false;
 const sync=()=>{
  for(const e of entries){
   const pause=document.hidden||reduced.matches||!!document.querySelector('dialog[open]')||!!e.img.closest('[hidden]');
   if(reduced.matches){e.img.src=e.original;e.img.classList.remove('cute-sprite');}
   else if(e.sheet){e.img.src=e.sheet;e.img.classList.add('cute-sprite');}
   if(e.animation){if(pause)e.animation.pause();else e.animation.play();}
  }
 };
 async function refresh(){
  if(dead||loading||document.hidden)return;loading=true;
  try {
   const {motions}=await loadMotions();
   if(dead)return;
   for(const entry of entries){
    const m=motions[entry.img.dataset.cuteId!];
    if(!m){entry.animation?.cancel();entry.animation=null;entry.sheet='';entry.img.src=entry.original;entry.img.classList.remove('cute-sprite');continue;}
    if(m.sheet===entry.sheet)continue;
    const loaded=await new Promise<boolean>(resolve=>{const probe=new Image();probe.onload=()=>resolve(true);probe.onerror=()=>resolve(false);probe.src=m.sheet;});
    if(dead)return;if(!loaded)continue;
    entry.animation?.cancel();entry.sheet=m.sheet;entry.img.src=m.sheet;entry.img.classList.add('cute-sprite');
    const frames=Array.from({length:m.frames},(_,i)=>({objectPosition:`${i/(m.frames-1)*100}% 50%`,offset:i/m.frames,easing:'steps(1,end)'}));
    frames.push({objectPosition:'100% 50%',offset:1,easing:'steps(1,end)'});
    entry.animation=entry.img.animate(frames,{duration:m.frames/m.fps*1000,iterations:Infinity});
   }
   sync();
  }catch{/* Network errors keep the last good loop or static fallback. */}finally{loading=false;}
 }
 // Only observe visibility attributes, not the animation's own image/style mutations.
 const observer=new MutationObserver(sync);observer.observe(host,{subtree:true,attributes:true,attributeFilter:['hidden']});
 const dialogs=new MutationObserver(sync);dialogs.observe(document.querySelector('#overlay-root')!,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
 const visibility=()=>{sync();if(!document.hidden)void refresh();};
 document.addEventListener('visibilitychange',visibility);reduced.addEventListener('change',sync);
 void refresh();
 return ()=>{dead=true;observer.disconnect();dialogs.disconnect();document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',sync);entries.forEach(e=>e.animation?.cancel());};
}
