import type {Player, Invite, Spirit} from './types.js';
export type * from './types.js';
export class GhostApiError extends Error {
  constructor(message:string, public status=0, public retryAfterMs=0) {super(message);this.name='GhostApiError';}
}
export interface ClientOptions {baseUrl?:string; timeoutMs?:number; fetch?:typeof fetch}
export interface RequestOptions {signal?:AbortSignal;timeoutMs?:number}
export interface GhostLink {inviteId:string;spiritId:string;createdAt:number;friendName:string|null;visits:number;recordings:{receiverId:string;name:string;durationMs:number;createdAt:number}[]}
export interface AudioInput {consent:boolean;mime:string;audio:string;durationMs:number;[key:string]:unknown}
export function createGhostClient({baseUrl='/api',timeoutMs=15000,fetch:fetcher=globalThis.fetch}:ClientOptions={}) {
  const base=baseUrl.replace(/\/$/,'');
  const url=(path:string)=>{if(!path.startsWith('/') || path.startsWith('//'))throw new TypeError('API path must start with one slash');return base+path;};
  async function request<T>(path:string,body?:unknown,{signal,timeoutMs:requestTimeoutMs=timeoutMs}:RequestOptions={}):Promise<T> {
    for(let attempt=0;;attempt++) {
      try {
        const response=await fetcher(url(path),{method:body===undefined?'GET':'POST',credentials:'same-origin',
          signal:AbortSignal.any([AbortSignal.timeout(requestTimeoutMs),...(signal?[signal]:[])]),
          headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
        const retry=response.headers.get('Retry-After');
        const wait=retry===null?0:/^\d+$/.test(retry)?Number(retry)*1000:Math.max(0,Date.parse(retry)-Date.now());
        const retryAfterMs=Number.isFinite(wait)?wait:0;
        let data;
        try{data=await response.json();}catch{throw new GhostApiError('Invalid API response',response.status,retryAfterMs);}
        if(!response.ok)throw new GhostApiError(data?.error || 'Request failed',response.status,retryAfterMs);
        return data as T;
      } catch(error) {
        if(signal?.aborted)throw signal.reason;
        // HTTP failures (including 429) are returned to callers, never retried here.
        if(error instanceof GhostApiError)throw error;
        if(body!==undefined || attempt>0)throw new GhostApiError('Network request failed');
        await new Promise(r=>setTimeout(r,250+Math.random()*250));
      }
    }
  }
  const id=(v:string)=>encodeURIComponent(v);
  return {request,url,
    config:()=>request<{contentVersion:number;release:string|null}>('/config'),
    session:()=>request<{player:Player}>('/session',{}),
    me:(options?:RequestOptions)=>request<{player:Player}>('/me',undefined,options),
    onboard:(body:{name:string;country:string;spiritId:string})=>request<{player:Player}>('/onboard',body),
    select:(spiritId:string)=>request<{player:Player}>('/select',{spiritId}),
    auth:{config:()=>request<{enabled:boolean;providers:string[]}>('/auth/config'),start:(body:{provider:string;email?:string})=>request<{url?:string;state?:string}>('/auth/start',body),verify:(state:string,code:string)=>request<{player:Player}>('/auth/verify',{state,code}),logout:()=>request<{player:Player}>('/auth/logout',{})},
    invites:{get:(key:string)=>request<Invite>(`/invites/${id(key)}`),create:(body:{spiritId:string;channel:string;friendName?:string})=>request<{id:string;url:string} & Record<string,unknown>>('/invites',body),visit:(key:string)=>request(`/invites/${id(key)}/visit`,{}),respond:(key:string)=>request<{player:Player} & Record<string,unknown>>(`/invites/${id(key)}/respond`,{}),reaction:(key:string,body:unknown)=>request(`/invites/${id(key)}/reaction`,body)},
    audio:{upload:(key:string,body:AudioInput)=>request<{alreadySent?:boolean;full?:boolean;ok?:boolean}>(`/invites/${id(key)}/audio`,body),url:(key:string,receiver:string)=>url(`/invites/${id(key)}/audio/${id(receiver)}`)},
    links:(offset=0,spirit='')=>request<{links:GhostLink[];hasMore:boolean;spirits:string[]}>(`/my-links?${new URLSearchParams({offset:String(offset),spirit})}`),
    readReactions:()=>request<{player:Player}>('/reactions/read',{}),
    story:(key:string)=>request<{story:NonNullable<Spirit['story']>;peaceLabel:string}>(`/spirits/${id(key)}/story`),
    rankings:<T=unknown>(scope='trick')=>request<T>(`/scream-rankings?scope=${id(scope)}`),
    event:(event:string,detail='')=>request('/events',{event,detail}),
    social:{config:<T=unknown>()=>request<T>('/social/config'),wechatSignature:<T=unknown>(pageUrl:string)=>request<T>('/social/wechat-signature',{url:pageUrl})},
  };
}
