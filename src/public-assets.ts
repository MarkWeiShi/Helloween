import {assetOrigin,releasePrefix} from 'virtual:ghost-content';
// Only public art is eligible. API, account and private recording URLs stay same-origin.
export function publicAssetUrl(path:string):string {
 if(!assetOrigin)return path;
 if(/^\/releases\/[a-f0-9]{20}\/(?:art|geo|audio|icons)\//.test(path))return assetOrigin+path;
 if(/^\/(?:art|geo|audio|icons)\//.test(path))return assetOrigin+releasePrefix+path;
 return path;
}
export function publicAssetData<T>(value:T):T {
 if(typeof value==='string')return publicAssetUrl(value) as T;
 if(Array.isArray(value))return value.map(publicAssetData) as T;
 if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,publicAssetData(v)])) as T;
 return value;
}
