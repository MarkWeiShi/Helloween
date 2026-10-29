import {createHash,randomBytes} from 'node:crypto';
export function socialConfig(env=process.env){return {origin:env.PUBLIC_ORIGIN||'',kakaoKey:env.KAKAO_JAVASCRIPT_KEY||'',wechatReady:!!(env.WECHAT_APP_ID&&env.WECHAT_APP_SECRET),facebookAppId:env.FACEBOOK_APP_ID||''};}
export function createWechatSigner(env=process.env,request=fetch){
 let cached, pending;
 async function ticket(){
  if(cached&&cached.until>Date.now())return cached.value;
  if(pending)return pending;
  pending=(async()=>{
   async function read(url){const r=await request(url,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('WeChat service unavailable');const d=await r.json();if(d.errcode)throw Error('WeChat configuration needs attention');return d;}
   const token=await read(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(env.WECHAT_APP_ID)}&secret=${encodeURIComponent(env.WECHAT_APP_SECRET)}`);
   const data=await read(`https://api.weixin.qq.com/cgi-bin/ticket/getticket?access_token=${encodeURIComponent(token.access_token)}&type=jsapi`);
   if(!data.ticket)throw Error('WeChat ticket unavailable');
   cached={value:data.ticket,until:Date.now()+(Math.min(token.expires_in||7200,data.expires_in||7200)-120)*1000};return cached.value;
  })().finally(()=>{pending=undefined;});return pending;
 }
 return async function sign(raw){
  if(!socialConfig(env).wechatReady)throw Object.assign(Error('WeChat sharing is not configured yet'),{status:503});
  let url;try{url=new URL(raw);}catch{throw Object.assign(Error('Invalid page URL'),{status:400});}
  if(!env.PUBLIC_ORIGIN||url.origin!==new URL(env.PUBLIC_ORIGIN).origin||url.username||url.password)throw Object.assign(Error('Only this website can request a sharing signature'),{status:403});
  url.hash='';const value=await ticket(),nonceStr=randomBytes(16).toString('hex'),timestamp=Math.floor(Date.now()/1000);
  return {appId:env.WECHAT_APP_ID,nonceStr,timestamp,signature:createHash('sha1').update(`jsapi_ticket=${value}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url.href}`).digest('hex')};
 };
}
