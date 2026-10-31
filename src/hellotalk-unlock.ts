import {api} from './api';
import {locale,t} from './i18n';
import {toast} from './toast';

type UnlockState = {enabled:boolean; available:boolean; signedIn:boolean; unlocked:boolean; pending:boolean; expiresAt:number|null; url?:string};
// The first play click grants playback and takes the visitor to HelloTalk once.
export function mountHelloTalkUnlock(root:HTMLElement) {
  const status=root.querySelector<HTMLElement>('[data-links-status]')!;
  let dead=false,checking=false,requesting=false,state:UnlockState|undefined;
  let cancelRedirect: (()=>void) | undefined;
  const copy=(zh:string,en:string)=>locale==='zh'?zh:en;
  function refresh() {
    const allowed=!!state&&(!state.enabled||state.unlocked);
    root.querySelectorAll<HTMLButtonElement>('[data-unlock-play]').forEach(button=>{
      button.hidden=allowed;button.disabled=!state||requesting;
      button.textContent='▶ '+t('Play voice');
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
    if(!state.available){status.textContent=copy('HelloTalk 链接暂不可用，请稍后重试。','The HelloTalk link is currently unavailable. Please try again later.');return;}
    requesting=true;refresh();
    status.textContent=copy('正在打开 HelloTalk，返回本页即可播放。','Opening HelloTalk. Return here to play.');
    try {
      const result=await api<UnlockState>('/hellotalk-unlock',{});
      if(dead)return;
      state=result;
      if(result.unlocked&&!result.url){refresh();status.textContent=copy('已解锁，请点击播放。','Unlocked. Tap play.');return;}
      const link=new URL(result.url||'');
      if(link.protocol!=='https:'||link.hostname!=='brc.hellotalk.com')throw new Error('Invalid HelloTalk link.');
      // Keep the explanation visible for four seconds before leaving the game.
      const dismiss=toast(t('You’ll be redirected to the app store. Download HelloTalk to hear your friends’ screams.'),4000);
      await new Promise<void>(resolve=>{
        const timer=setTimeout(resolve,4000);
        cancelRedirect=()=>{clearTimeout(timer);dismiss();resolve();};
      });
      cancelRedirect=undefined;
      if(dead)return;
      // Keep a return entry pointing directly to the recordings tab, including locale.
      const back=new URL(location.href);back.pathname='/my-links';
      history.replaceState(null,'',back);
      location.assign(link.href);
    }catch(error){if(!dead)status.textContent=(error as Error).message;}
    finally{requesting=false;if(!dead)refresh();}
  }
  root.addEventListener('click',play);
  const resume=()=>void check();
  window.addEventListener('focus',resume);window.addEventListener('pageshow',resume);document.addEventListener('visibilitychange',resume);
  void check();
  return {refresh, destroy(){dead=true;cancelRedirect?.();root.removeEventListener('click',play);window.removeEventListener('focus',resume);window.removeEventListener('pageshow',resume);document.removeEventListener('visibilitychange',resume);}};
}
