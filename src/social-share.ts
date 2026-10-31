import {publicAssetData} from './public-assets';
import {showShareLoading} from './share-loading';
import {watchShareReturn,returnToGame} from './share-return';
import {t, msg, html} from "../shared/i18n.mjs";
import {api,escape as e} from './api';
import {locale} from './i18n';
type Config={lineLiffId?:string;origin:string;kakaoKey:string;wechatReady:boolean;facebookAppId:string};
let configRequest:Promise<Config>|undefined;
let configExpires=0;
export function loadShareConfig(){
 if(!configRequest||Date.now()>=configExpires){
  configExpires=Date.now()+300_000;
  configRequest=api<Config>('/social/config').catch(error=>{configRequest=undefined;throw error;});
 }
 return configRequest;
}
export function prepareSocialShare(spiritId:string){
 void loadShareConfig().catch(()=>{});
 const poster=new Image();poster.src=`/art/x-cards/${encodeURIComponent(spiritId)}.${locale}.jpg`;
}
type KakaoSDK={isInitialized():boolean;init(key:string):void;Share:{sendDefault(data:unknown):void;scrapImage(data:{imageUrl:string}):Promise<{infos:{original:{url:string}}}>}};
type WechatSDK={config(data:unknown):void;ready(cb:()=>void):void;error(cb:()=>void):void;updateAppMessageShareData(data:unknown):void;updateTimelineShareData(data:unknown):void};
declare global {interface Window {Kakao?:KakaoSDK;wx?:WechatSDK}}
const names:Record<string,string>={x:'X',line:'LINE',facebook:'Facebook',whatsapp:'WhatsApp',messenger:'Messenger',kakao:'KakaoTalk',wechat:'WeChat'};
const loaders=new Map<string,Promise<void>>();
function load(src:string){
 if(!loaders.has(src))loaders.set(src,new Promise<void>((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.crossOrigin='anonymous';const timer=setTimeout(()=>{script.remove();reject(Error(t("Sharing service timed out. Please try again.")));},12000);script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);script.remove();reject(Error(t("Sharing service could not load. Please try again.")));};document.head.append(script);}).catch(error=>{loaders.delete(src);throw error;}));
 return loaders.get(src)!;
}
export async function mountSocialHandoff(node:HTMLElement,channel:string,url:string,text:string,image:string,spiritId?:string,beforeConfirm:()=>Promise<void>|void=()=>{}){
 const panel=document.createElement('section');panel.className='social-handoff';panel.setAttribute('aria-live','polite');node.replaceChildren(panel);
 const name=names[channel];if(!name)return;
 showShareLoading(panel);
 const local=['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname);
 const notice=local?html`<p>This is a local preview link. Open the game on <a href="https://helloween.fly.dev" target="_blank" rel="noopener noreferrer">helloween.fly.dev</a> to create an invitation friends can open.</p>`:'';
 const link=html`<label class="share-link-label">Your invitation link<input readonly aria-label="Invitation link" value="${e(url)}"></label>`;
 const frame=(body:string,compact=false)=>{panel.innerHTML=compact?`<h3>${e(name)}</h3>${body}<p class="share-confirm-note">${e(locale==='zh'?'在平台内选择好友或发布，确认后才会分享。':'Confirm recipients or publish on the platform. Nothing is sent automatically.')}</p><details class="share-more"><summary>${e(locale==='zh'?'链接与其他选项':'Link and other options')}</summary>${notice}${link}</details>`:html`<h3>Share with ${e(name)}</h3>${notice}${body}${link}<p>You choose who receives it and confirm inside ${e(name)}. Nothing is sent automatically.</p>`;panel.insertAdjacentHTML('beforeend',`<button class="button text-button full" data-back-game>${e(locale==='zh'?'返回游戏':'Back to game')}</button>`);panel.querySelector<HTMLButtonElement>('[data-back-game]')!.onclick=returnToGame;panel.scrollIntoView({block:'nearest'});
  panel.querySelectorAll<HTMLAnchorElement>('a.button.primary').forEach(anchor=>anchor.onclick=event=>{
   watchShareReturn();event.preventDefault();const popup=window.open('about:blank','_blank');
   if(popup)popup.opener=null;
   void Promise.resolve(beforeConfirm()).then(()=>{if(popup)popup.location.href=anchor.href;else location.assign(anchor.href);}).catch(error=>{popup?.close();const note=document.createElement('p');note.setAttribute('role','alert');note.textContent=error.message;panel.append(note);});
  });
 };
 if(channel==='whatsapp'||channel==='messenger'){
  const label=(zh:string,en:string)=>locale==='zh'?zh:en;
  let target='';
  if(channel==='whatsapp')target=`https://wa.me/?text=${encodeURIComponent(text+' '+url)}`;
  else {
   // Native sharing and copying remain usable if the public app config is unavailable.
   const config=await loadShareConfig().catch(()=>null);if(!panel.isConnected)return;
   if(config?.facebookAppId&&!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent))target=`https://www.facebook.com/dialog/send?${new URLSearchParams({app_id:config.facebookAppId,link:url,redirect_uri:new URL('/',config.origin||location.origin).href})}`;
  }
  frame(`<p>${e(label('选择好友或群聊，在平台内确认发送。','Choose a friend or group and confirm sending in the app.'))}</p>${target?`<a class="button primary full" href="${e(target)}" target="_blank" rel="noopener noreferrer">${e(label('打开 '+name+' 分享','Continue to '+name))}</a>`:''}${channel==='messenger'&&typeof navigator.share==='function'?`<button class="button primary full" data-device-share>${e(label('在分享应用中选择 Messenger','Choose Messenger in sharing apps'))}</button>`:''}<p>${e(label('如果无法打开应用，请复制邀请链接到聊天中。','If the app cannot open, copy the invitation link into your chat.'))}</p><button class="button secondary full" data-copy-invite>${e(t('Copy link'))}</button><p role="status" data-messaging-status></p>`);
  const status=panel.querySelector<HTMLElement>('[data-messaging-status]')!;
  panel.querySelector<HTMLButtonElement>('[data-copy-invite]')!.onclick=async()=>{
   try{await beforeConfirm();await navigator.clipboard.writeText(url);status.textContent=t('Invitation link copied. Send it to someone who needs a smile.');}
   catch{panel.querySelector<HTMLInputElement>('input')?.select();status.textContent=t('Your invitation is ready. Select and copy the link below.');}
  };
  const share=panel.querySelector<HTMLButtonElement>('[data-device-share]');
  if(share)share.onclick=async()=>{
   try{
    const saving=beforeConfirm();if(saving){await saving;status.textContent=label('资料已保存，请再次点击分享。','Profile saved. Tap share again.');return;}
    watchShareReturn();await navigator.share({title:t('Halloween surprise'),text,url});
   }catch(error){if((error as Error).name!=='AbortError')status.textContent=label('无法打开分享应用，请复制链接。','Sharing apps could not open. Copy the link instead.');}
  };
  return;
 }
 const config=await loadShareConfig();if(!panel.isConnected)return;
 if(channel==='line' && config.lineLiffId){
  const token=new URL(url).pathname.match(/^\/i\/([\w-]+)$/)?.[1];
  if(token){
   const target=`https://liff.line.me/${encodeURIComponent(config.lineLiffId)}?invite=${encodeURIComponent(token)}&lang=${encodeURIComponent(locale)}`;
   frame(html`<img src="${e(image)}" alt="" width="320" style="max-width:100%;height:auto;border-radius:16px"><p>${e(locale==='zh'?'预览鬼卡片，登录 LINE 后选择好友并确认发送。':'Preview your ghost card, sign in to LINE, then choose friends and confirm.')}</p><a class="button primary full" href="${e(target)}" target="_blank" rel="noopener noreferrer">${e(locale==='zh'?'预览 LINE 卡片':'Preview LINE card')}</a>`);return;
  }
 }
 const targets:Record<string,string>={x:`https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,line:`https://line.me/R/share?text=${encodeURIComponent(text+' '+url)}`};
 if(channel==='facebook'){
  const token=new URL(url).pathname.match(/^\/i\/([\w-]+)$/)?.[1];
  const shareUrl=token?new URL(`/api/share/facebook/${encodeURIComponent(token)}?lang=${encodeURIComponent(locale)}`,url).href:url;
  const target=`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
  const poster=spiritId?`/art/x-cards/${encodeURIComponent(spiritId)}.${locale}.jpg`:image;
  const guidance=html`<a class="button primary full" href="${e(target)}" target="_blank" rel="noopener noreferrer">Continue to ${e(name)}</a>`;
  frame(`<img class="share-card-preview" src="${e(poster)}" alt="" width="960" height="504">${guidance}`,true);return;
 }
 if(targets[channel]){
  frame(html`<p>Continue to ${e(name)}. If you are signed out, ${e(name)} will ask you to sign in before you choose friends or confirm your post.</p><a class="button primary full" href="${e(targets[channel])}" target="_blank" rel="noopener noreferrer">Continue to ${e(name)}</a>`);return;
 }
 if(channel==='kakao'){
  if(!config.kakaoKey){frame(html`<p>KakaoTalk sharing is not connected on this website yet. You can copy the invitation link and send it in KakaoTalk.</p>`);return;}
  try{
   await load('https://t1.kakaocdn.net/kakao_js_sdk/2.8.4/kakao.min.js');if(!panel.isConnected)return;
   const kakao=window.Kakao;if(!kakao)throw Error(t("KakaoTalk sharing could not load."));if(!kakao.isInitialized())kakao.init(config.kakaoKey);
   // The default card is a small, already-published image. Do not put a blocking
   // GIF scrape/upload in front of Kakao's native recipient picker.
   const hostedImage=spiritId?new URL('/art/x-cards/'+encodeURIComponent(spiritId)+'.'+locale+'.jpg',config.origin||location.origin).href:new URL(image,location.origin).href;
   let gifImage:string|undefined;
   const label=(zh:string,en:string)=>locale==='zh'?zh:en;
   frame(`<img class="share-card-preview" src="${e(hostedImage)}" alt="${e(label('鬼卡片预览','Ghost card preview'))}" width="960" height="504"><label>${e(label('分享文案','Your message'))}<textarea data-kakao-caption maxlength="200" style="width:100%;min-height:90px">${e(text)}</textarea></label><label class="fine-print"><input type="checkbox" data-kakao-animated disabled> ${e(label('使用动图（可能较慢）','Use animated card (may be slower)'))}</label><button type="button" class="button primary full" data-open-kakao>${e(label('选择 KakaoTalk 好友','Continue to KakaoTalk'))}</button><p data-kakao-status role="status"></p>`,true);
   void fetch('/art/x-cards/manifest.json').then(r=>r.json()).then(publicAssetData).then(manifest=>{const base=manifest.characters?.[spiritId||''];const entry=base?{...base,...(base.localized?.[locale]||base.localized?.en||{})}:null;if(entry&&!entry.previewOnly&&entry.bytes<=5000000){gifImage=new URL(entry.gif,config.origin||location.origin).href;const option=panel.querySelector<HTMLInputElement>('[data-kakao-animated]');if(option)option.disabled=false;}}).catch(()=>{});
   panel.querySelector<HTMLButtonElement>('[data-open-kakao]')!.onclick=async()=>{
    const status=panel.querySelector<HTMLElement>('[data-kakao-status]')!;
    try{
     const saving=beforeConfirm();if(saving){await saving;status.textContent=label('资料已保存，请点选择好友继续。','Profile saved. Tap again to choose friends.');return;}
     const description=panel.querySelector<HTMLTextAreaElement>('[data-kakao-caption]')!.value.trim().slice(0,200)||text.slice(0,200);
     watchShareReturn();
     kakao.Share.sendDefault({objectType:'feed',content:{title:label('送你一个万圣节惊喜','A Halloween surprise for you'),description,imageUrl:panel.querySelector<HTMLInputElement>('[data-kakao-animated]')?.checked&&gifImage?gifImage:hostedImage,imageWidth:960,imageHeight:504,link:{webUrl:url,mobileWebUrl:url}},buttons:[{title:label('观看变身','Watch transformation'),link:{webUrl:url,mobileWebUrl:url}}]});
     status.textContent=label('请在 KakaoTalk 中确认；此页面无法确认是否已发送。','Confirm in KakaoTalk, then use the Safari return link to resume your game. This page cannot confirm delivery.');
    }catch{status.textContent=label('无法打开 KakaoTalk，请重试或复制邀请链接。','Could not open KakaoTalk. Try again or copy the invitation link.');}
   };
  }catch(error){if(panel.isConnected)frame(html`<p>${e((error as Error).message)}</p>`);}return;
 }
 if(channel==='wechat'){
  if(!/MicroMessenger/i.test(navigator.userAgent)){frame(html`<p>Copy this invitation link into WeChat and open it there. In WeChat, tap the top-right ··· menu and choose a friend or Moments. WeChat cannot open its friend picker from this browser.</p>`);return;}
  if(!config.wechatReady){frame(html`<p>Custom WeChat sharing is not connected on this website yet. Use the top-right ··· menu in WeChat to share this page, or copy the invitation link below.</p>`);return;}
  try{
   await load('https://res.wx.qq.com/open/js/jweixin-1.6.0.js');
   const signature=await api('/social/wechat-signature',{url:location.href.split('#')[0]});if(!panel.isConnected)return;
   const wx=window.wx;if(!wx)throw Error(t("WeChat sharing could not load."));
   await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(t("WeChat verification timed out."))),12000);wx.ready(()=>{clearTimeout(timer);resolve();});wx.error(()=>{clearTimeout(timer);reject(Error(t("WeChat could not verify this domain.")));});wx.config({...signature,debug:false,jsApiList:['updateAppMessageShareData','updateTimelineShareData']});});
   if(!panel.isConnected)return;
   wx.updateAppMessageShareData({title:t("A little Halloween surprise"),desc:text,link:url,imgUrl:new URL(image,location.origin).href});wx.updateTimelineShareData({title:text,link:url,imgUrl:new URL(image,location.origin).href});
   frame(html`<p>Your invitation is ready in WeChat. Tap the top-right ··· menu, then choose “Send to Chat” or “Share to Moments” and confirm in WeChat.</p>`);
  }catch(error){if(panel.isConnected)frame(html`<p>${e((error as Error).message)} You can still copy the invitation link below.</p>`);}
 }
}
