import {randomBytes,createHash} from 'node:crypto';
import {createXTokens} from './x-tokens.mjs';
import {ApiError} from './store.mjs';

// Supabase is the identity authority; game sessions stay in HttpOnly first-party cookies.
export function createAuth({url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY,providers=(process.env.AUTH_PROVIDERS || 'google').split(','),fetcher=fetch,db,xTokenOptions}={}) {
  const enabled=!!(url && key);
  const pending=new Map();
  const xTokens=createXTokens({db,fetcher,...xTokenOptions});
  const config=()=>({enabled,providers:enabled?providers.filter(p=>['google','facebook','apple','kakao','x'].includes(p)):[]});
  async function request(path,body) {
    if(!enabled) throw new ApiError(503,'Sign-in is temporarily unavailable. Please try again later.');
    let response;
    try { response=await fetcher(`${url.replace(/\/$/,'')}/auth/v1/${path}`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)}); }
    catch {throw new ApiError(502,'Sign-in is temporarily unavailable. Please try again.');}
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new ApiError(response.status===429?429:400,'Sign-in failed. Check your code or try signing in again.');
    return data;
  }
  function begin(session,values) {
    for(const [k,v] of pending) if(v.expires<Date.now())pending.delete(k);
    const state=randomBytes(24).toString('base64url');
    pending.set(state,{session,...values,expires:Date.now()+600000});
    return state;
  }
  function take(session,state) {
    const value=pending.get(state);
    if(!value || value.session!==session || value.expires<Date.now()) throw new ApiError(400,'Sign-in expired. Please start again.');
    pending.delete(state);
    return value;
  }
  return {config,
    xToken(subject) {return xTokens.token(subject);},
    forget(subject) {xTokens.forget(subject);},
    async start(session,body,origin) {
      if(!enabled) throw new ApiError(503,'Sign-in is temporarily unavailable. Please try again later.');
      if(body.provider==='email') {
        const email=String(body.email || '').trim().toLowerCase();
        if(email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400,'Enter a valid email address.');
        await request('otp',{email,create_user:true});
        return {state:begin(session,{email})};
      }
      if(!config().providers.includes(body.provider))throw new ApiError(400,'Choose an available sign-in option.');
      const verifier=randomBytes(48).toString('base64url');
      const state=begin(session,{verifier,provider:body.provider});
      const redirect=new URL('/api/auth/callback',origin);redirect.searchParams.set('state',state);
      const target=new URL(`${url.replace(/\/$/,'')}/auth/v1/authorize`);
      target.search=new URLSearchParams({provider:body.provider,redirect_to:redirect.href,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'s256'}).toString();
      // Supabase supplies X's baseline login scopes; request the approved posting scope too.
      // This prepares user consent only. Publishing still needs a separate server-side flow.
      if(body.provider==='x')target.searchParams.set('scopes','tweet.read users.read tweet.write media.write offline.access');
      return {url:target.href};
    },
    async finish(session,state,code) {
      const flow=take(session,state);
      if(typeof code!=='string' || !code || code.length>2048)throw new ApiError(400,'Invalid sign-in code.');
      const data=flow.email?await request('verify',{email:flow.email,token:code,type:'email'}):await request('token?grant_type=pkce',{auth_code:code,code_verifier:flow.verifier});
      if(!data.access_token || !data.user?.id || data.user.is_anonymous)throw new ApiError(401,'Account verification failed.');
      if(flow.provider==='x' && data.provider_token)xTokens.save(data.user.id,data.provider_token,data.provider_refresh_token);
      return data.user.id;
    },
  };
}
