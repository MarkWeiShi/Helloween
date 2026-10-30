import './line-share.css';
import {loadCatalog} from './static-content';
import {escape as e} from './api';
import {mountSocialHandoff} from './social-share';
import {initLanguage} from './i18n';
const root=document.querySelector<HTMLElement>('#preview')!;
async function start(){
 await initLanguage();
 const token=new URL(location.href).searchParams.get('invite')||'';
 if(!/^[\w-]{1,80}$/.test(token))throw Error('Open this preview with an existing invitation.');
 const r=await fetch('/api/invites/'+encodeURIComponent(token));if(!r.ok)throw Error('Invitation unavailable');
 const invite=await r.json();if(invite.expired)throw Error('Invitation expired');
 const catalog=await loadCatalog(),spirit=catalog.spirits.find((s:{id:string})=>s.id===invite.spiritId);
 if(!spirit)throw Error('Character unavailable');
 const url=new URL('/i/'+token,location.origin).href;
 root.innerHTML=`<h1>${e(spirit.name)} — sharing preview</h1><p>Preview artwork and choose a sharing app. Nothing is posted or sent until you confirm in that app.</p><nav><button data-channel="x">X GIF</button><a class="button" href="/line-share.html?invite=${encodeURIComponent(token)}&lang=en">LINE animated card</a><button data-channel="kakao">KakaoTalk GIF card</button></nav><div id="handoff"></div>`;
 for(const button of root.querySelectorAll<HTMLButtonElement>('[data-channel]'))button.onclick=()=>{void mountSocialHandoff(root.querySelector('#handoff')!,button.dataset.channel!,url,`Boo! ${spirit.name} has a little Halloween surprise for you.`,new URL('/line-cards/'+spirit.id+'.jpg',location.origin).href,spirit.id).catch(()=>{root.querySelector('#handoff')!.textContent='Could not prepare sharing. Please try again.';});};
}
void start().catch(error=>{root.textContent=error.message;});
