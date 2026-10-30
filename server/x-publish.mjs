import {createHash} from 'node:crypto';
import {ApiError} from './store.mjs';
import {normalizeLanguage} from '../shared/i18n.mjs';

export function createXPublisher({fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}) {
 async function request(path,token,body) {
  let response;
  try{response=await fetcher(`https://api.x.com/2/${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});}
  catch{const error=new ApiError(502,'X did not confirm the result. Check your X posts before trying again.');error.code='X_UNCONFIRMED';throw error;}
  if(!response.ok){
   const status=response.status;
   const message=status===402?'X API credits are exhausted. Automatic GIF publishing requires the app owner to add credits. You can use manual sharing instead.':status===401?'X authorization expired or was revoked. Sign in to X again.':status===403?'X rejected this request. Check the app posting permissions and X account restrictions.':status===429?'X is rate limiting requests. Please wait before trying again.':'X could not complete publishing. Check your X authorization and API access.';
   const error=new ApiError(status>=400&&status<500?status:502,message);
   error.code=status===402?'X_CREDITS_DEPLETED':status===401?'X_AUTH_REQUIRED':status===403?'X_FORBIDDEN':status===429?'X_RATE_LIMITED':'X_REQUEST_FAILED';
   // Explicit provider rejections cannot have created a post; transport errors and
   // 5xx responses remain uncertain and must never trigger an automatic repost.
   error.postRejected=path==='tweets'&&[400,401,402,403,404,413,415,422,429].includes(status);
   throw error;
  }
  const result=await response.json();if(result.errors?.length)throw new ApiError(502,'X could not complete publishing.');return result.data;
 }
 return async function publish({token,spiritId,language,text,origin,beforePost,cardSha}) {
  const lang=normalizeLanguage(language)||'en';
  const manifestResponse=await fetcher(new URL('/art/x-cards/manifest.json',origin),{signal:AbortSignal.timeout(10000)});
  if(!manifestResponse.ok)throw new ApiError(503,'The animated card is unavailable.');
  const manifest=await manifestResponse.json(),base=manifest.characters?.[spiritId];
  const card=base?{...base,...base.localized?.[lang]}:null;
  if(!card || card.previewOnly)throw new ApiError(503,'The animated card is unavailable.');
  if(typeof cardSha!=='string' || card.sha256!==cardSha)throw new ApiError(409,'The card changed. Reload the game before publishing.');
  const asset=new URL(card.gif,origin);
  if(asset.origin!==new URL(origin).origin || !/^\/(releases\/[\w-]+\/)?art\/x-cards\/[\w.-]+\.gif$/.test(asset.pathname))throw new ApiError(503,'Invalid animated card.');
  const image=await fetcher(asset,{signal:AbortSignal.timeout(15000)});
  if(!image.ok || Number(image.headers.get('content-length'))>5000000)throw new ApiError(503,'The animated card is unavailable.');
  const bytes=Buffer.from(await image.arrayBuffer());
  if(bytes.length>5000000 || !/^GIF8[79]a$/.test(bytes.subarray(0,6).toString()))throw new ApiError(503,'Invalid animated card.');
  if(createHash('sha256').update(bytes).digest('hex')!==cardSha)throw new ApiError(503,'The animated card could not be verified.');
  let media=await request('media/upload',token,{media:bytes.toString('base64'),media_type:'image/gif',media_category:'tweet_gif'});
  const mediaId=media?.id;if(!mediaId)throw new ApiError(502,'X did not accept the animated card.');
  for(let attempt=0;media.processing_info && media.processing_info.state!=='succeeded';attempt++) {
   if(media.processing_info.state==='failed'||attempt>=8)throw new ApiError(502,'X could not process the animated card.');
   await sleep(Math.min(Math.max(media.processing_info.check_after_secs||1,1),5)*1000);
   media=await request(`media/upload?command=STATUS&media_id=${encodeURIComponent(mediaId)}`,token);
  }
  beforePost();
  const post=await request('tweets',token,{text,media:{media_ids:[mediaId]}});
  if(!/^\d+$/.test(post?.id))throw new ApiError(502,'Check your X profile before trying again.');
  return {id:post.id,url:`https://x.com/i/status/${post.id}`};
 };
}
