import {escape as e} from './api';
import {locale} from './i18n';
export function showShareLoading(node:HTMLElement,stage:'invite'|'card'='card'){
 const text=stage==='invite'
  ?(locale==='zh'?'正在生成邀请，请稍候…':'Creating your invitation, please wait…')
  :(locale==='zh'?'正在准备分享卡片，请稍候…':'Preparing your share card, please wait…');
 node.innerHTML=`<div class="share-loading" role="status"><span>${e(text)}</span><div class="share-loading-track" role="progressbar" aria-label="${e(text)}"><span></span></div></div>`;
}
export function startShareButtonLoading(button?:HTMLButtonElement){
 if(!button)return ()=>{};
 const original=button.innerHTML;
 button.disabled=true;
 button.setAttribute('aria-busy','true');
 showShareLoading(button,'invite');
 return ()=>{button.innerHTML=original;button.disabled=false;button.removeAttribute('aria-busy');};
}
