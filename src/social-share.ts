import {t, msg, html} from "../shared/i18n.mjs";
import {api,escape as e} from './api';
import {locale} from './i18n';
type Config={lineLiffId?:string;origin:string;kakaoKey:string;wechatReady:boolean;facebookAppId:string};
type KakaoSDK={isInitialized():boolean;init(key:string):void;Share:{sendDefault(data:unknown):void;scrapImage(data:{imageUrl:string}):Promise<{infos:{original:{url:string}}}>}};
type WechatSDK={config(data:unknown):void;ready(cb:()=>void):void;error(cb:()=>void):void;updateAppMessageShareData(data:unknown):void;updateTimelineShareData(data:unknown):void};
declare global {interface Window {Kakao?:KakaoSDK;wx?:WechatSDK}}
const names:Record<string,string>={x:'X',line:'LINE',facebook:'Messenger',kakao:'KakaoTalk',wechat:'WeChat'};
const loaders=new Map<string,Promise<void>>();
function load(src:string){
 if(!loaders.has(src))loaders.set(src,new Promise<void>((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.crossOrigin='anonymous';const timer=setTimeout(()=>{script.remove();reject(Error(t("Sharing service timed out. Please try again.")));},12000);script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);script.remove();reject(Error(t("Sharing service could not load. Please try again.")));};document.head.append(script);}).catch(error=>{loaders.delete(src);throw error;}));
 return loaders.get(src)!;
}
export async function mountSocialHandoff(node:HTMLElement,channel:string,url:string,text:string,image:string,spiritId?:string){
 const panel=document.createElement('section');panel.className='social-handoff';panel.setAttribute('aria-live','polite');node.replaceChildren(panel);
 const name=names[channel];if(!name)return;
 panel.textContent=msg`Preparing ${name} sharing…`;
 const config=await api<Config>('/social/config');if(!panel.isConnected)return;
 const local=['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname);
 const notice=local?html`<p>This is a local preview link. Open the game on <a href="https://helloween.fly.dev" target="_blank" rel="noopener noreferrer">helloween.fly.dev</a> to create an invitation friends can open.</p>`:'';
 const link=html`<label class="share-link-label">Your invitation link<input readonly aria-label="Invitation link" value="${e(url)}"></label>`;
 const frame=(body:string)=>{panel.innerHTML=html`<h3>Share with ${e(name)}</h3>${notice}${body}${link}<p>You choose who receives it and confirm inside ${e(name)}. Nothing is sent automatically.</p>`;panel.scrollIntoView({block:'nearest'});};
 if(channel==='x' && spiritId){
  const cn=locale==='zh';
  const label=(zh:string,en:string)=>cn?zh:en;
  try{
   const response=await fetch('/art/x-cards/manifest.json');
   if(!response.ok)throw Error('GIF unavailable');
   const manifest=await response.json();
   if(!panel.isConnected)return;
   const baseChallenge=manifest.characters[spiritId];
   const challenge=baseChallenge?{...baseChallenge,...(baseChallenge.localized?.[locale]||baseChallenge.localized?.en||{})}:null;
   if(!challenge || challenge.previewOnly)throw Error('GIF unavailable');
   const post=(cn?challenge.textZh:challenge.textEn).replace('［本次邀请链接］',url);
   const target=`https://x.com/intent/tweet?text=${encodeURIComponent(post)}`;
   frame(`<h4>${e(label('分享动态挑战','Share an animated challenge'))}</h4><img src="${e(challenge.gif)}" alt="${e(challenge.nameZh)}" width="960" height="504" style="width:100%;max-width:960px;height:auto;border-radius:16px"><p>${e(label('先下载动态卡片，再打开 X 并附图。点击帖文中的专属链接进入游戏；点击动图会打开媒体。','Download the animated card, then attach it on X. Open the invitation link in the post to play; tapping the GIF opens the media.'))}</p><a class="button secondary full" href="${e(challenge.gif)}" download="${e(spiritId)}-challenge.gif">${e(label('下载动态 GIF','Download animated GIF'))}</a><textarea readonly aria-label="${e(label('分享帖文','Share post'))}" style="width:100%;min-height:150px;box-sizing:border-box">${e(post)}</textarea><button class="button secondary full" data-copy-post>${e(label('复制完整帖文','Copy full post'))}</button><p data-copy-status role="status"></p><a class="button primary full" href="${e(target)}" target="_blank" rel="noopener noreferrer">${e(label('打开 X 发帖','Continue to X'))}</a>`);
   panel.querySelector<HTMLButtonElement>('[data-copy-post]')!.onclick=async()=>{
    const status=panel.querySelector<HTMLElement>('[data-copy-status]')!;
    try{await navigator.clipboard.writeText(post);status.textContent=label('帖文已复制。','Post copied.');}
    catch{panel.querySelector('textarea')!.select();status.textContent=label('请选择并复制上方帖文。','Select and copy the post above.');}
   };
   return;
  }catch{
   if(!panel.isConnected)return;
   frame(`<p>${e(label('动态 GIF 暂时无法加载，请重试。','The animated GIF could not load. Please try again.'))}</p>`);
   return;
  }
 }
 if(channel==='line' && config.lineLiffId){
  const token=new URL(url).pathname.match(/^\/i\/([\w-]+)$/)?.[1];
  if(token){
   const target=`/line-share.html?invite=${encodeURIComponent(token)}&lang=${encodeURIComponent(locale)}`;
   frame(html`<img src="${e(image)}" alt="" width="320" style="max-width:100%;height:auto;border-radius:16px"><p>${e(locale==='zh'?'预览鬼卡片，登录 LINE 后选择好友并确认发送。':'Preview your ghost card, sign in to LINE, then choose friends and confirm.')}</p><a class="button primary full" href="${e(target)}" target="_blank" rel="noopener noreferrer">${e(locale==='zh'?'预览 LINE 卡片':'Preview LINE card')}</a>`);return;
  }
 }
 const targets:Record<string,string>={x:`https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,line:`https://line.me/R/share?text=${encodeURIComponent(text+' '+url)}`};
 if(channel==='facebook'){
  const mobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const target=config.facebookAppId ? `https://www.facebook.com/dialog/send?app_id=${encodeURIComponent(config.facebookAppId)}&link=${encodeURIComponent(url)}&redirect_uri=${encodeURIComponent(config.origin+'/')}` : '';
  frame(html`<p>Send this invitation privately in Messenger. Sign in there if asked, choose your friend, then confirm.</p>${typeof navigator.share==='function'?html`<button type="button" class="button primary full" data-device-share>Choose Messenger in sharing apps</button>`:''}${target&&!mobile?html`<a class="button primary full" target="_blank" rel="noopener noreferrer" href="${e(target)}">Continue to Messenger</a>`:html`<p>Copy the invitation link below and paste it into your Messenger conversation.</p>`}${!config.facebookAppId?html`<p>The website’s Messenger dialog is awaiting application setup.</p>`:''}`);
  const button=panel.querySelector<HTMLButtonElement>('[data-device-share]');if(button)button.onclick=()=>{void navigator.share({title:t("Halloween surprise"),text,url}).catch(error=>{if(error.name!=='AbortError'&&panel.isConnected){const note=document.createElement('p');note.textContent=t("Sharing apps could not open. Copy the invitation link into Messenger instead.");panel.append(note);}});};return;
 }
 if(targets[channel]){
  frame(html`<p>Continue to ${e(name)}. If you are signed out, ${e(name)} will ask you to sign in before you choose friends or confirm your post.</p><a class="button primary full" href="${e(targets[channel])}" target="_blank" rel="noopener noreferrer">Continue to ${e(name)}</a>`);return;
 }
 if(channel==='kakao'){
  if(!config.kakaoKey){frame(html`<p>KakaoTalk sharing is not connected on this website yet. You can copy the invitation link and send it in KakaoTalk.</p>`);return;}
  try{
   await load('https://t1.kakaocdn.net/kakao_js_sdk/2.8.4/kakao.min.js');if(!panel.isConnected)return;
   const kakao=window.Kakao;if(!kakao)throw Error(t("KakaoTalk sharing could not load."));if(!kakao.isInitialized())kakao.init(config.kakaoKey);
   let staticImage=spiritId?new URL('/art/x-cards/'+encodeURIComponent(spiritId)+'.'+locale+'.jpg',config.origin||location.origin).href:new URL(image,location.origin).href;
   // Prepare public artwork before the click so the picker opens within the user gesture.
   let cardImage=staticImage,cardWidth=1024,cardHeight=538,usingGif=false;
   try{
    const r=await fetch('/art/x-cards/manifest.json');if(!r.ok)throw Error('GIF unavailable');
    const base=(await r.json()).characters?.[spiritId||''];
    const entry=base?{...base,...(base.localized?.[locale]||base.localized?.en||{})}:null;
    if(entry?.poster)staticImage=new URL(entry.poster,config.origin||location.origin).href;
    if(entry && !entry.previewOnly && entry.bytes<=5000000){cardImage=new URL(entry.gif,config.origin||location.origin).href;cardWidth=entry.width;cardHeight=entry.height;usingGif=true;}
   }catch{/* Static artwork remains available. */}
   let uploaded;
   try{uploaded=await kakao.Share.scrapImage({imageUrl:cardImage});}
   catch(error){if(!usingGif)throw error;cardImage=staticImage;cardWidth=960;cardHeight=504;usingGif=false;uploaded=await kakao.Share.scrapImage({imageUrl:staticImage});}
   if(!panel.isConnected)return;
   const returnedImage=uploaded.infos?.original?.url;
   if(!returnedImage)throw Error('Kakao did not return an image URL.');
   const hostedUrl=new URL(returnedImage);
   if(hostedUrl.protocol==='http:' && /(^|\.)(kakaocdn\.net|daumcdn\.net)$/.test(hostedUrl.hostname))hostedUrl.protocol='https:';
   if(hostedUrl.protocol!=='https:')throw Error('Kakao returned an unsupported image URL.');
   const hostedImage=hostedUrl.href;
   const label=(zh:string,en:string)=>locale==='zh'?zh:en;
   frame(`${usingGif?`<p>${e(label('动图已准备。KakaoTalk 可能显示静态封面；点击卡片可观看完整变身。','GIF prepared. KakaoTalk may show a still cover; tap the card for the full transformation.'))}</p><a class="button secondary full" href="${e(cardImage)}" download="${e(spiritId||'ghost')}-challenge.gif">${e(label('下载 GIF','Download GIF'))}</a>`:''}<img src="${e(hostedImage)}" alt="${e(label('鬼卡片预览','Ghost card preview'))}" width="320" style="max-width:100%;height:auto;border-radius:16px"><label>${e(label('分享文案','Your message'))}<textarea data-kakao-caption maxlength="200" style="width:100%;min-height:90px">${e(text)}</textarea></label><p>${e(label('选择好友或聊天室，并在 KakaoTalk 中确认发送。点击卡片即可打开本次变身邀请。','Choose friends or a chat, then confirm in KakaoTalk. The card opens this transformation invitation.'))}</p><button type="button" class="button primary full" data-open-kakao>${e(label('选择 KakaoTalk 好友','Continue to KakaoTalk'))}</button><p data-kakao-status role="status"></p>`);
   panel.querySelector<HTMLButtonElement>('[data-open-kakao]')!.onclick=()=>{
    const status=panel.querySelector<HTMLElement>('[data-kakao-status]')!;
    try{
     const description=panel.querySelector<HTMLTextAreaElement>('[data-kakao-caption]')!.value.trim().slice(0,200)||text.slice(0,200);
     kakao.Share.sendDefault({objectType:'feed',content:{title:label('送你一个万圣节惊喜','A Halloween surprise for you'),description,imageUrl:hostedImage,imageWidth:cardWidth,imageHeight:cardHeight,link:{webUrl:url,mobileWebUrl:url}},buttons:[{title:label('观看变身','Watch transformation'),link:{webUrl:url,mobileWebUrl:url}}]});
     status.textContent=label('请在 KakaoTalk 中确认；此页面无法确认是否已发送。','Confirm in KakaoTalk. This page cannot confirm delivery.');
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
