import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {ApiError} from './store.mjs';

// The key is a deployment secret, never stored beside the encrypted database.
export function createXTokens({db,key=process.env.X_TOKEN_ENCRYPTION_KEY,clientId=process.env.X_CLIENT_ID,clientSecret=process.env.X_CLIENT_SECRET,fetcher=fetch,now=Date.now}={}) {
 const secret=key?Buffer.from(key,'base64'):null;
 if(secret && secret.length!==32)throw Error('X_TOKEN_ENCRYPTION_KEY must encode 32 bytes');
 if(secret && db)db.exec('CREATE TABLE IF NOT EXISTS x_credentials(subject TEXT PRIMARY KEY, encrypted TEXT NOT NULL)');
 const memory=new Map(),flights=new Map();
 function read(subject){
  if(!subject)return null;
  if(!secret || !db)return memory.get(subject)||null;
  const row=db.prepare('SELECT encrypted FROM x_credentials WHERE subject=?').get(subject);
  if(!row)return null;
  try{
   const [iv,tag,data]=row.encrypted.split('.').map(v=>Buffer.from(v,'base64'));
   const cipher=createDecipheriv('aes-256-gcm',secret,iv);cipher.setAAD(Buffer.from(subject));cipher.setAuthTag(tag);
   return JSON.parse(Buffer.concat([cipher.update(data),cipher.final()]).toString());
  }catch{throw new ApiError(503,'X authorization could not be read. Please try again later.');}
 }
 function write(subject,entry){
  if(!secret || !db){memory.set(subject,entry);return;}
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',secret,iv);cipher.setAAD(Buffer.from(subject));
  const data=Buffer.concat([cipher.update(JSON.stringify(entry)),cipher.final()]);
  db.prepare('INSERT INTO x_credentials VALUES(?,?) ON CONFLICT(subject) DO UPDATE SET encrypted=excluded.encrypted').run(subject,[iv,cipher.getAuthTag(),data].map(v=>v.toString('base64')).join('.'));
 }
 function forget(subject){if(!subject)return;memory.delete(subject);if(secret&&db)db.prepare('DELETE FROM x_credentials WHERE subject=?').run(subject);}
 function save(subject,token,refreshToken){
  // Supabase expires_in describes its own session, not X's token. Use a conservative
  // first refresh deadline; subsequent responses provide X's actual expires_in.
  write(subject,{token,refreshToken:refreshToken||null,expires:now()+3600000,version:randomBytes(16).toString('hex')});
 }
 async function refresh(subject,entry){
  if(!entry.refreshToken || !clientId)return null;
  const body=new URLSearchParams({grant_type:'refresh_token',refresh_token:entry.refreshToken,client_id:clientId});
  const headers={'Content-Type':'application/x-www-form-urlencoded'};
  if(clientSecret)headers.Authorization='Basic '+Buffer.from(encodeURIComponent(clientId)+':'+encodeURIComponent(clientSecret)).toString('base64');
  let response;
  try{response=await fetcher('https://api.x.com/2/oauth2/token',{method:'POST',headers,body:body.toString(),signal:AbortSignal.timeout(15000)});}
  catch{throw new ApiError(503,'X authorization renewal is temporarily unavailable. Please try again.');}
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
   if(data.error==='invalid_grant' || data.error==='invalid_token'){
    if(read(subject)?.version===entry.version)forget(subject);
    return null;
   }
   throw new ApiError(503,'X authorization renewal is temporarily unavailable. Please try again.');
  }
  if(typeof data.access_token!=='string' || !Number.isFinite(Number(data.expires_in)) || Number(data.expires_in)<=0)throw new ApiError(503,'X authorization renewal could not be verified. Please try again.');
  // Logout or a new login during the request must not resurrect/overwrite credentials.
  if(read(subject)?.version!==entry.version)return null;
  const updated={token:data.access_token,refreshToken:data.refresh_token||entry.refreshToken,expires:now()+Number(data.expires_in)*1000,version:randomBytes(16).toString('hex')};
  write(subject,updated);return updated.token;
 }
 async function token(subject){
  const entry=read(subject);if(!entry)return null;
  if(entry.expires>now()+60000)return entry.token;
  if(!flights.has(subject))flights.set(subject,refresh(subject,entry).finally(()=>flights.delete(subject)));
  return flights.get(subject);
 }
 return {save,token,forget};
}
