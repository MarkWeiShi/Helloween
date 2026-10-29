import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {socialConfig,createWechatSigner} from '../server/social.mjs';
const env={PUBLIC_ORIGIN:'https://helloween.fly.dev',KAKAO_JAVASCRIPT_KEY:'public-key',WECHAT_APP_ID:'wx-app',WECHAT_APP_SECRET:'private-secret'};
test('social config exposes only the public SDK key, not WeChat secrets',()=>{const config=socialConfig(env);assert.equal(config.kakaoKey,'public-key');assert.equal(config.wechatReady,true);assert.ok(!JSON.stringify(config).includes('private-secret'));});
test('WeChat signs exact same-origin page URL, strips hash, caches tickets and never returns ticket',async()=>{
 let count=0;const sign=createWechatSigner(env,async url=>{count++;return {ok:true,json:async()=>url.includes('/token?')?{access_token:'token',expires_in:7200}:{ticket:'ticket',expires_in:7200}};});
 const [a,b]=await Promise.all([sign('https://helloween.fly.dev/?a=1#top'),sign('https://helloween.fly.dev/i/abc')]);assert.equal(count,2);assert.equal(a.appId,'wx-app');assert.equal(a.signature,createHash('sha1').update(`jsapi_ticket=ticket&noncestr=${a.nonceStr}&timestamp=${a.timestamp}&url=https://helloween.fly.dev/?a=1`).digest('hex'));assert.notEqual(a.nonceStr,b.nonceStr);assert.equal(a.ticket,undefined);
 await assert.rejects(()=>sign('https://evil.example/'),{status:403});await assert.rejects(()=>sign('https://user:pass@helloween.fly.dev/'),{status:403});assert.equal(count,2);
});
test('missing credentials and provider failures do not generate fake authorization',async()=>{
 await assert.rejects(()=>createWechatSigner({})('https://helloween.fly.dev/'),{status:503});
 const sign=createWechatSigner(env,async()=>({ok:true,json:async()=>({errcode:40013,errmsg:'bad id'})}));await assert.rejects(()=>sign('https://helloween.fly.dev/'),/configuration needs attention/);
});
