import {t, content, msg} from './i18n';
import {createGhostClient, GhostApiError} from '../packages/ghost-sdk/index';
export {GhostApiError};
export const client=createGhostClient({baseUrl:'/api'});
// UI adapter keeps translation and presentation out of the standalone SDK.
export async function api<T = any>(path:string,body?:unknown):Promise<T> {
 try {
  const data=await client.request<T>(path,body,path==='/social/x/publish'?{timeoutMs:120000}:undefined);
  return /^\/spirits\/[^/]+\/story$/.test(path)?content(data):data;
 } catch(error) {
  if(error instanceof GhostApiError) {
   if(!error.status){error.message=t('The lanterns flickered. Please try again.');throw error;}
   error.message=t(error.message);throw error;
  }
  throw new Error(t('The lanterns flickered. Please try again.'));
 }
}
export const escape=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function event(name:string,detail=''){void api('/events',{event:name,detail}).catch(()=>{});}
