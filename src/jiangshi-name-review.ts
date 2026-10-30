import {publicAssetData} from './public-assets';
import './style.css';
import { loadTransformation, mountTransformation } from './transformation-player';
const stage=document.querySelector<HTMLElement>('.review-stage')!;
const status=document.querySelector<HTMLElement>('#review-status')!;
const select=document.querySelector<HTMLSelectElement>('#review-character')!;
const audio=document.querySelector<HTMLAudioElement>('audio')!;
const play=document.querySelector<HTMLButtonElement>('#review-play')!;
let sound=true;
let player:ReturnType<typeof mountTransformation>|undefined;
type Voice={id:string;nativeName:string;language:string;gender:string;timbre:string;audio?:string;status:string;languageSupport?:string};
let items:Voice[]=[];
let selection=0;
async function choose(id:string){
 const generation=++selection;player?.dispose();audio.pause();stage.replaceChildren();
 const item=items.find(v=>v.id===id)!;
 document.querySelector('#review-title')!.textContent=item.nativeName;
 document.querySelector('#review-direction')!.textContent=`${item.language} · ${item.gender} · ${item.timbre}`;
 play.disabled=!item.audio;
 if(item.audio)audio.src=item.audio;else audio.removeAttribute('src');
 status.textContent=item.audio?(item.languageSupport?.startsWith('unsupported')?'已生成发音试稿；该语言不在模型支持列表，待母语听审。':'6 秒变身 + 2.8 秒名字音频；音色与母语发音待听审。'):'该角色声音尚在制作。';
 const image=document.createElement('img');image.className='hero-spirit';image.alt=item.nativeName;stage.append(image);
 player=mountTransformation(stage,id,{
 sound:()=>sound,toggleSound:()=>{sound=!sound;},
 onStart:()=>{status.textContent='正在变身，结束后只说角色名字。';},
 onIntroEnd:()=>{status.textContent='名字播放结束，继续原有角色动作。可重播或单独试听。';},
 onPause:()=>{status.textContent='已停止，可重新播放。';},
 onError:()=>{status.textContent='素材暂不可用，请重新播放。';},
 });
 const entry=await loadTransformation(id);if(selection===generation)image.src=entry.poster;
}
play.onclick=()=>{audio.pause();void player?.play();};
document.querySelector<HTMLButtonElement>('#review-pause')!.onclick=()=>player?.pause();
audio.onplay=()=>player?.pause();select.onchange=()=>void choose(select.value);
void fetch('/art/name-reveals/manifest.json',{cache:'no-cache'}).then(r=>r.json()).then(publicAssetData).then(data=>{
 items=data.items;
 for(const item of items){const option=document.createElement('option');option.value=item.id;option.textContent=`${item.nativeName} · ${item.language}${item.audio?'':' · 制作中'}`;select.append(option);}
 document.querySelector('#review-coverage')!.textContent=`已制作 ${data.generated} / ${data.total}，逐个音频为独立定制声线；母语与表演质量待人工听审。`;
 const id=new URLSearchParams(location.search).get('character');select.value=items.some(i=>i.id===id)?id!:'jiangshi';void choose(select.value);
}).catch(()=>{status.textContent='审核清单暂不可用。';});
window.addEventListener('pagehide',()=>player?.dispose(),{once:true});
