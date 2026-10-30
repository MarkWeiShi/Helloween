import {api} from './api';
import {locale} from './i18n';

type UnlockState = {enabled:boolean; available:boolean; signedIn:boolean; unlocked:boolean; pending:boolean; expiresAt:number|null; url?:string};
// The list stays visible; only playback waits for a server-issued grant.
export function mountHelloTalkUnlock(root:HTMLElement) {
  const status=root.querySelector<HTMLElement>('[data-links-status]')!;
  let dead=false,checking=false,requesting=false,state:UnlockState|undefined;
  const copy=(zh:string,en:string)=>locale==='zh'?zh:en;
  function refresh() {
    const allowed=!!state&&(!state.enabled||state.unlocked);
    root.querySelectorAll<HTMLButtonElement>('[data-unlock-play]').forEach(button=>{
      button.hidden=allowed;button.disabled=!state||requesting;
      button.textContent=copy('▶ 播放声音','▶ Play voice');
    });
    root.querySelectorAll<HTMLAudioElement>('[data-voice-audio]').forEach(audio=>{
      audio.hidden=!allowed;
      if(allowed&&!audio.src)audio.src=audio.dataset.voiceAudio!;
      if(!allowed){audio.pause();audio.removeAttribute('src');}
    });
  }
  async function check() {
    if(dead||checking||requesting||document.hidden)return;
    checking=true;
    try {
      const before=state?.unlocked;
      state=await api<UnlockState>('/hellotalk-unlock');
      if(!dead){refresh();if(!before&&state.unlocked)status.textContent=copy('已解锁，点击播放即可听朋友的声音。','Unlocked. Tap play to hear your friend.');}
    } catch(error){if(!dead)status.textContent=(error as Error).message;}
    finally{checking=false;}
  }
  async function play(event:Event) {
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-unlock-play]');
    if(!button||!state||requesting||dead)return;
    if(!state.signedIn){status.textContent=copy('请先登录游戏账号，再解锁播放。','Sign in to the game before unlocking playback.');return;}
    if(!state.available){status.textContent=copy('HelloTalk 验证暂不可用，请稍后重试。','HelloTalk verification is currently unavailable. Please try again later.');return;}
    requesting=true;refresh();
    status.textContent=copy('正在打开 HelloTalk；安装并打开后，请返回本页播放。','Opening HelloTalk. After installing and opening it, return here to play.');
    try {
      const result=await api<UnlockState>('/hellotalk-unlock',{});
      if(dead)return;
      state=result;
      if(result.unlocked){refresh();status.textContent=copy('已解锁，请点击播放。','Unlocked. Tap play.');return;}
      const link=new URL(result.url||'');
      if(link.protocol!=='https:'||link.hostname!=='brc.hellotalk.com')throw new Error('Invalid HelloTalk link.');
      // Keep a return entry pointing directly to the recordings tab, including locale.
      const back=new URL(location.href);back.pathname='/my-links';
      history.replaceState(null,'',back);
      location.assign(link.href);
    }catch(error){if(!dead)status.textContent=(error as Error).message;}
    finally{requesting=false;if(!dead)refresh();}
  }
  root.addEventListener('click',play);
  const timer=setInterval(()=>void check(),5000);
  const resume=()=>void check();
  window.addEventListener('focus',resume);window.addEventListener('pageshow',resume);document.addEventListener('visibilitychange',resume);
  void check();
  return {refresh, destroy(){dead=true;clearInterval(timer);root.removeEventListener('click',play);window.removeEventListener('focus',resume);window.removeEventListener('pageshow',resume);document.removeEventListener('visibilitychange',resume);}};
}
