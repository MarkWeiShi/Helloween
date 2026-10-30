import {escape as e} from './api';
import {locale} from './i18n';

type VideoCard={id:string;nativeName:string;name:string;descriptionEn:string;descriptionLines?:string[];video:string;poster:string;reducedMotionVideo?:string};
export async function mountVideoShare(panel:HTMLElement,channel:'instagram'|'tiktok',url:string,spiritId?:string){
 const label=(zh:string,en:string)=>locale==='zh'?zh:en;
 const instagram=channel==='instagram',name=instagram?'Instagram Story':'TikTok';
 panel.textContent=label('正在准备竖屏视频…','Preparing portrait video…');
 try{
  const response=await fetch('/art/social-videos/manifest.json',{cache:'no-cache',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Missing manifest');
  const data=await response.json(),card:VideoCard=data.characters?.[spiritId||''];
  if(!card||!/^\/art\/social-videos\/[a-z0-9.-]+\.mp4$/.test(card.video)||!/^\/art\/social-videos\/[a-z0-9.-]+\.jpg$/.test(card.poster))throw Error('Missing video');
  if(!panel.isConnected)return;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const video=reduce&&card.reducedMotionVideo&&/^\/art\/social-videos\/[a-z0-9.-]+\.mp4$/.test(card.reducedMotionVideo)?card.reducedMotionVideo:card.video;
  const post=label(`我派了${card.nativeName}来找你 👻\n你敢挑战吗？` ,`I sent ${card.name} to find you 👻\nDare to try?`)+`\n${url}\n#Halloween #BooAroundTheWorld`;
  const local=['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname);
  const steps=instagram?[
   label('下载 MP4，并保存到手机相册。','Download the MP4 and save it to your camera roll.'),
   label('复制下方邀请链接，在 Instagram 新建 Story 并选中视频。','Copy your invitation link below. Create an Instagram Story and select the video.'),
   label('点击「贴纸 → Link／链接」，粘贴邀请链接，将贴纸放在视频留白处，再确认发布。','Tap Stickers → Link, paste your invitation link, place the sticker in the empty space, then publish.'),
  ]:[
   label('下载 MP4，并保存到手机相册。','Download the MP4 and save it to your camera roll.'),
   label('打开 TikTok，点击「＋ → 上传」，选择视频，按需粘贴并编辑帖文，再确认发布。','Open TikTok, tap + → Upload, select the video, then paste and edit your caption before publishing.'),
   label('若你的账号有主页网站入口，可将邀请链接放在那里；否则可将链接私发给朋友。视频或文案中的网址不保证可点击。','If your account has a profile website field, put the invitation link there. Otherwise, send it to friends separately. URLs in the video or caption are not guaranteed to be clickable.'),
  ];
  panel.innerHTML=`<h3>${e(label('分享至 ','Share to ')+name)}</h3>${local?`<p class="fine-print">${e(label('这是本地预览链接。请在正式网站生成朋友可打开的邀请链接。','This is a local preview link. Create your invitation on the live website so friends can open it.'))}</p>`:''}
   <video class="social-video-preview" controls playsinline preload="metadata" poster="${e(card.poster)}" src="${e(video)}" aria-label="${e(card.name)}"></video>
   <p>${e(card.nativeName)} · ${e(card.name)}<br>${(card.descriptionLines||[card.descriptionEn]).map(e).join('<br>')}</p>
   <a class="button primary full" href="${e(video)}" download="${e(card.id)}-${channel}.mp4">${e(label('下载竖屏 MP4','Download portrait MP4'))}</a>
   ${reduce?`<p class="fine-print">${e(label('已按减少动态效果偏好选用静态名字版本；原视频动作仍会播放。','Static names are selected for your reduced-motion preference; the original character footage still plays.'))}</p>`:''}
   <p class="fine-print">${e(label('若手机打开了视频预览，请使用系统分享菜单保存到文件或相册。','If your phone opens a video preview, use its sharing menu to save to Files or Photos.'))}</p>
   <ol>${steps.map(s=>`<li>${e(s)}</li>`).join('')}</ol>
   ${instagram?`<p>${e(label('链接贴纸需要你在 Instagram 内手动添加；下载的视频不会自带可点击链接。若没有 Link 贴纸，可将邀请链接私发给朋友。','Add the link sticker manually inside Instagram; the downloaded video has no clickable link. If Link stickers are unavailable, send the invitation to friends separately.'))}</p>`:''}
   <label class="share-link-label">${e(label('本次邀请链接','Your invitation link'))}<input readonly aria-label="Invitation link" value="${e(url)}"></label>
   <button type="button" class="button secondary full" data-copy-video-link>${e(label('复制邀请链接','Copy invitation link'))}</button>
   <label>${e(label('发布文案（可复制后编辑）','Caption (copy and edit before posting)'))}<textarea readonly class="social-video-caption" aria-label="Share caption">${e(post)}</textarea></label>
   <button type="button" class="button secondary full" data-copy-video-post>${e(label('复制发布文案','Copy caption'))}</button><p data-video-status role="status"></p>
   <a class="button secondary full" href="${instagram?'https://www.instagram.com/':'https://www.tiktok.com/'}" target="_blank" rel="noopener noreferrer">${e(label('打开 ','Open ')+(instagram?'Instagram':'TikTok'))}</a>
   <p class="fine-print">${e(label('你需要在平台内选择视频并确认发布，不会自动上传或发送。','Choose the video and confirm inside the app. Nothing is uploaded or posted automatically.'))}</p>`;
  const status=panel.querySelector<HTMLElement>('[data-video-status]')!;
  async function copy(value:string,field:HTMLInputElement|HTMLTextAreaElement){
   try{await navigator.clipboard.writeText(value);status.textContent=label('已复制。','Copied.');}
   catch{field.focus();field.select();status.textContent=label('请长按或手动复制已选中的内容。','Copy the selected text manually.');}
  }
  panel.querySelector<HTMLButtonElement>('[data-copy-video-link]')!.onclick=()=>void copy(url,panel.querySelector('input')!);
  panel.querySelector<HTMLButtonElement>('[data-copy-video-post]')!.onclick=()=>void copy(post,panel.querySelector('textarea')!);
  panel.querySelector('video')!.onerror=()=>{status.textContent=label('视频预览暂时无法播放，可尝试下载或重试。','The preview could not play. Try downloading the video or retrying.');};
  panel.scrollIntoView({block:'nearest'});
 }catch{
  if(!panel.isConnected)return;
  panel.innerHTML=`<p>${e(label('视频暂时无法加载，请重试。','The video could not load. Please try again.'))}</p><button type="button" class="button secondary full">${e(label('重试','Retry'))}</button>`;
  panel.querySelector('button')!.onclick=()=>void mountVideoShare(panel,channel,url,spiritId);
 }
}
