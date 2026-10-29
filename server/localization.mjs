import {readFileSync} from 'node:fs';
import {resolveLanguage,translate,interpolate,languages} from '../shared/i18n.mjs';
const cache=new Map();
export function requestLanguage(url,header='') {
 const explicit=url.searchParams.get('lang');
 if(explicit && explicit!=='auto' && languages.some(([code])=>code===explicit))return explicit;
 const preferences=String(header).split(',').map((part,index)=>{const [tag,...params]=part.trim().split(';');const q=Number(params.find(x=>x.trim().startsWith('q='))?.trim().slice(2)??1);return {tag,q,index};}).filter(x=>Number.isFinite(x.q)&&x.q>0).sort((a,b)=>b.q-a.q||a.index-b.index).map(x=>x.tag);
 return resolveLanguage(preferences);
}
export function serverTranslator(locale) {
 locale=resolveLanguage([locale]);
 if(!cache.has(locale)) {
  try{cache.set(locale,JSON.parse(readFileSync(new URL(`../src/locales/${locale}.json`,import.meta.url),'utf8')));}catch{cache.set(locale,{});}
 }
 return (source,...values)=>interpolate(translate(source,cache.get(locale)),values);
}
