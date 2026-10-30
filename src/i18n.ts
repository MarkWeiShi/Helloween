import {regionNames,nativePopover} from './browser-compat';
import { languages, resolveBrowserLanguage, resolveLanguagePreference, localizeCatalog, setDictionary, t } from '../shared/i18n.mjs';
export {languages};
export {t,msg,html} from "../shared/i18n.mjs";
const storageKey = 'boo:language';
let preference = 'auto';
try { preference = localStorage.getItem(storageKey) || 'auto'; } catch {}
preference=resolveLanguagePreference(new URL(location.href).searchParams,preference);
// Static HTML is language-neutral; browser preferences and URL hints resolve here.
export let locale = preference==='auto' ? resolveBrowserLanguage(navigator, document.documentElement.lang) : preference;
let dictionary: Record<string,string> = {};
const bundles = import.meta.glob<Record<string,string>>('./locales/*.json', {import:'default'});
export async function initLanguage() {
 try { dictionary = await bundles[`./locales/${locale}.json`]!(); }
 catch { locale='en'; dictionary=await bundles['./locales/en.json']!(); }
 setDictionary(dictionary);
 document.documentElement.lang=locale;
 document.documentElement.dir=locale==='ar'?'rtl':'ltr';
 document.title=t(document.title);
 const description=document.querySelector<HTMLMetaElement>('meta[name="description"]');
 if(description)description.content=t(description.content);
 const loading=document.querySelector('.boot p');if(loading)loading.textContent=t('Lighting the lanterns…');
}
export function content<T>(value:T):T {const result=localizeCatalog(value,dictionary) as T;
 const countries=(result as {countries?:{code:string;name:string}[]})?.countries;
 if(countries){const names=regionNames(locale);for(const country of countries)country.name=names.of(country.code)||country.name;}
 return result;}
const languageFlags: Record<string,string> = {en:'🇬🇧',zh:'🇨🇳',es:'🇪🇸',pt:'🇧🇷',fr:'🇫🇷',de:'🇩🇪',it:'🇮🇹',ru:'🇷🇺',ar:'🇸🇦',hi:'🇮🇳',ja:'🇯🇵',ko:'🇰🇷',id:'🇮🇩',th:'🇹🇭',vi:'🇻🇳'};
export function languageSelector() {
 const option=(code:string,name:string,flag:string)=>`<button type="button" role="menuitemradio" aria-checked="${preference===code}" data-language="${code}"><span class="language-flag" aria-hidden="true">${flag}</span><span lang="${code==='auto'?locale:code}" dir="auto">${name}</span><span class="language-check" aria-hidden="true">${preference===code?'✓':''}</span></button>`;
 return `<div class="language-picker"><button type="button" class="language-trigger" popovertarget="language-menu" aria-label="${t('Language')}" title="${t('Language')}" aria-haspopup="menu" aria-expanded="false" aria-controls="language-menu"><img class="corner-ui-icon" src="/art/ui/language-globe.webp" width="30" height="30" alt="" aria-hidden="true"></button><div id="language-menu" class="language-menu${nativePopover?'':' compat-menu'}" ${nativePopover?'popover="auto"':'hidden'} role="menu" aria-label="${t('Language')}">${option('auto',t('Default'),'🌐')}${languages.map(([code,name])=>option(code,code==='id'?'Bahasa':name,languageFlags[code])).join('')}</div></div>`;
}
document.addEventListener('toggle',event=>{
 const menu=event.target;
 if(!(menu instanceof HTMLElement)||menu.id!=='language-menu')return;
 const open=nativePopover?menu.matches(':popover-open'):!menu.hidden;
 document.querySelector('.language-trigger')?.setAttribute('aria-expanded',String(open));
 if(open)menu.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus({preventScroll:true});
},true);
document.addEventListener('keydown',event=>{
 if(!(event.target instanceof Element)||!event.target.closest('#language-menu'))return;
 const options=[...document.querySelectorAll<HTMLButtonElement>('#language-menu [data-language]')];
 const current=options.indexOf(document.activeElement as HTMLButtonElement);
 const index=event.key==='Home'?0:event.key==='End'?options.length-1:event.key==='ArrowDown'?(current+1)%options.length:event.key==='ArrowUp'?(current-1+options.length)%options.length:-1;
 if(index>=0){event.preventDefault();options[index]?.focus();}
});
document.addEventListener('click',event=>{
 const option=event.target instanceof Element?event.target.closest<HTMLButtonElement>('[data-language]'):null;
 if(!option)return;
 const value=option.dataset.language!;
 try{localStorage.setItem(storageKey,value);}catch{}
 // Reload retains the invitation route and guest progress, and ends audio capture.
 const url=new URL(location.href);url.searchParams.set('lang',value);location.assign(url.href);
});
window.addEventListener('languagechange',()=>{if(preference==='auto')location.reload();});

// Old WebViews ignore popovertarget, so supply only the missing interactions.
if(!nativePopover){
 const close=()=>{const menu=document.getElementById('language-menu');if(menu)menu.hidden=true;document.querySelector('.language-trigger')?.setAttribute('aria-expanded','false');};
 document.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target:null;
  const menu=document.getElementById('language-menu');if(!menu)return;
  if(target?.closest('.language-trigger')){
   menu.hidden=!menu.hidden;
   document.querySelector('.language-trigger')?.setAttribute('aria-expanded',String(!menu.hidden));
   if(!menu.hidden)menu.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }else if(!target?.closest('#language-menu'))close();
 });
 document.addEventListener('keydown',event=>{if(event.key==='Escape' && document.getElementById('language-menu')?.hidden===false){close();document.querySelector<HTMLElement>('.language-trigger')?.focus();}});
 document.addEventListener('focusin',event=>{if(event.target instanceof Element && !event.target.closest('.language-picker'))close();});
}
