import './line-share.css';
import {resolveLanguage} from '../shared/i18n.mjs';
import {loadCatalog} from './static-content';
import {escape as e} from './api';

type Liff={init(options:{liffId:string}):Promise<void>;isLoggedIn():boolean;isInClient?():boolean;login(options:{redirectUri:string}):void;isApiAvailable(name:string):boolean;shareTargetPicker(messages:unknown[],options:{isMultiple:boolean}):Promise<{status:string}|undefined>};
declare global{interface Window{liff?:Liff}}
const root=document.querySelector<HTMLElement>('#line-share')!;
const language=resolveLanguage([new URL(location.href).searchParams.get('lang'),...navigator.languages]);
const cn=language==='zh';
const label=(zh:string,en:string)=>cn?zh:en;
async function read(path:string){const r=await fetch(path);if(!r.ok)throw Error(label('邀请加载失败，请返回游戏重试。','Could not load the invitation. Return to the game and try again.'));return r.json();}
async function sdk(){
 if(window.liff)return window.liff;
 await new Promise<void>((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://static.line-scdn.net/liff/edge/versions/2.31.1/sdk.js';
  const timer=setTimeout(()=>{script.remove();reject(Error('LINE SDK timeout'));},12000);
  script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);reject(Error('LINE SDK unavailable'));};document.head.append(script);
 });
 if(!window.liff)throw Error('LINE SDK unavailable');return window.liff;
}
async function start(){
 const config=await read('/api/social/config');
 if(!config.lineLiffId)throw Error(label('LINE 卡片分享尚未启用。','LINE card sharing is not enabled yet.'));
 // Initialize before reading or changing URLs: LIFF can complete an OAuth redirect here.
 const liff=await sdk();await liff.init({liffId:config.lineLiffId});
 const token=new URL(location.href).searchParams.get('invite')||'';
 if(!/^[\w-]{1,80}$/.test(token))throw Error(label('请从游戏中的 LINE 分享按钮打开此页。','Open this page using the LINE share button in the game.'));
 const [invite,catalog]=await Promise.all([read('/api/invites/'+token),loadCatalog()]);
 if(invite.expired)throw Error(label('此邀请已过期，请返回游戏生成新链接。','This invitation has expired. Create a new one in the game.'));
 const spirit=catalog.spirits.find((s:{id:string})=>s.id===invite.spiritId);
 if(!spirit)throw Error('Character unavailable');
 const url=new URL('/i/'+token,config.origin||location.origin).href;
 let image=new URL('/art/x-cards/'+encodeURIComponent(spirit.id)+'.portrait.png',config.origin||location.origin).href;
 let animated=false,ratio='1:1';
 try{
  const animations=await read('/art/share-animations/manifest.json');
  const entry=animations.characters?.[spirit.id];
  if(entry && entry.bytes<=300000 && entry.width<=1024 && entry.height<=1024 && entry.frames>1){
   const candidate=new URL(entry.apng,config.origin||location.origin).href;
   await new Promise<void>((resolve,reject)=>{const img=new Image();const timer=setTimeout(()=>reject(Error('Image timeout')),10000);img.onload=()=>{clearTimeout(timer);resolve();};img.onerror=()=>{clearTimeout(timer);reject(Error('Image unavailable'));};img.src=candidate;});
   image=candidate;animated=true;ratio=entry.width+':'+entry.height;
  }
 }catch{/* Keep the complete static card when animated artwork is unavailable. */}
 let nativeName=spirit.nativeName||spirit.name,englishName=spirit.name,culture=spirit.culture||'';
 try{const cards=await read('/art/x-cards/manifest.json');const entry=cards.characters?.[spirit.id];if(entry){nativeName=entry.nativeName;englishName=entry.name;culture=(entry.localized?.[language]||entry.localized?.en)?.compactCulture||culture;}}catch{/* The catalog still supplies names and origin. */}
 const text=label(`Boo！${spirit.name} 给你准备了一个万圣节惊喜。`,`Boo! ${spirit.name} has a little Halloween surprise for you.`);
 const draftKey='boo:line-draft:'+token;
 let draft=text;try{draft=sessionStorage.getItem(draftKey)||text;}catch{}
 root.innerHTML=`<h1>${label('分享你的鬼卡片','Share your ghost card')}</h1><section class="card"><header>Halloween Tricks by HelloTalk</header><img src="${e(image)}" alt="${e(spirit.name)}"><div><h2>${e(nativeName)}</h2><h3>${e(englishName)}</h3><p dir="${language==='ar'?'rtl':'auto'}">${e(culture)}</p><p>${label('点击卡片，观看变身惊喜。','Tap the card to watch the transformation.')}</p></div></section><label for="message">${label('分享文案','Your message')}</label><textarea id="message" maxlength="400">${e(draft)}</textarea><button id="choose">${liff.isLoggedIn()?label('选择 LINE 好友','Choose LINE friends'):label('登录 LINE 并继续','Sign in to LINE')}</button><p role="status"></p>${!liff.isInClient?.()?`<a class="button" href="${e('https://liff.line.me/'+config.lineLiffId+'?invite='+encodeURIComponent(token)+'&lang='+language)}">${label('在 LINE 中打开','Open in LINE')}</a>`:''}<small>${label('选择好友并确认后才会发送。取消不会发送。','Nothing is sent until you choose recipients and confirm. Cancelling sends nothing.')}</small><label for="invite">${label('本次专属链接','Your invitation link')}</label><input id="invite" readonly value="${e(url)}"><p><a href="${e('https://line.me/R/share?text='+encodeURIComponent(text+' '+url))}" target="_blank" rel="noopener noreferrer">${label('改用普通链接分享','Share a plain link instead')}</a> · <a href="/">${label('返回游戏','Back to game')}</a></p>`;
 const button=root.querySelector<HTMLButtonElement>('#choose')!,message=root.querySelector<HTMLTextAreaElement>('#message')!,status=root.querySelector<HTMLElement>('[role=status]')!;
 button.onclick=async()=>{
  if(!liff.isLoggedIn()){
   try{sessionStorage.setItem(draftKey,message.value);}catch{}
   // Use an explicit, same-origin redirect; never forward OAuth parameters or tokens.
   liff.login({redirectUri:new URL('/line-share.html?invite='+encodeURIComponent(token)+'&lang='+language,location.origin).href});return;
  }
  if(!liff.isApiAvailable('shareTargetPicker')){status.textContent=label('当前环境无法使用好友选择器，请使用下方普通链接分享。','The friend picker is unavailable here. Use plain-link sharing below.');return;}
  button.disabled=true;status.textContent=label('请在 LINE 窗口中选择好友。如果没有出现窗口，可点击“在 LINE 中打开”。','Choose friends in the LINE window. If no window appears, use Open in LINE.');
  try{
   const caption=message.value.trim().slice(0,400)||text;
   const result=await liff.shareTargetPicker([{type:'flex',altText:caption,contents:{type:'bubble',size:'mega',body:{type:'box',layout:'vertical',backgroundColor:'#121b32',contents:[{type:'text',text:'Halloween Tricks by HelloTalk',color:'#A8DAC8',size:'sm',wrap:true},{type:'box',layout:'horizontal',margin:'md',alignItems:'center',contents:[{type:'image',url:image,size:'full',flex:4,aspectRatio:ratio,aspectMode:'fit',...(animated?{animated:true}:{}),action:{type:'uri',uri:url}},{type:'box',layout:'vertical',flex:5,spacing:'sm',contents:[{type:'text',text:nativeName,color:'#FFB66D',weight:'bold',wrap:true},{type:'text',text:englishName,color:'#F7F0DF',size:'sm',wrap:true},{type:'text',text:culture,color:'#C3CBD9',size:'xs',wrap:true,maxLines:2,align:language==='ar'?'end':'start'}]}]},{type:'text',text:caption,color:'#F7F0DF',wrap:true,margin:'md',size:'sm'}]},footer:{type:'box',layout:'vertical',contents:[{type:'button',style:'primary',color:'#067D46',action:{type:'uri',label:label('观看变身','Watch the transformation'),uri:url}}]}}}],{isMultiple:true});
   status.textContent=result?.status==='success'?label('卡片已发送。','Card sent.'):label('已取消，未发送。','Cancelled. Nothing was sent.');
  }catch{status.textContent=label('LINE 未能确认发送，请重试或使用下方链接分享。','LINE could not confirm sending. Try again or share the link below.');}
  finally{button.disabled=false;}
 };
}
void start().catch(error=>{root.innerHTML=`<h1>Scary Helloween</h1><p role="status">${e(error.message)}</p><p><a href="${e('/line-share.html?invite='+encodeURIComponent(new URL(location.href).searchParams.get('invite')||'')+'&lang='+language)}">${label('重试','Try again')}</a> · <a href="/">${label('返回游戏','Back to game')}</a></p>`;});
