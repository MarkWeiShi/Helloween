import { languages, resolveLanguage, localizeCatalog, setDictionary, t } from '../shared/i18n.mjs';
export {languages};
export {t,msg,html} from "../shared/i18n.mjs";
const storageKey = 'boo:language';
let preference = 'auto';
try { preference = localStorage.getItem(storageKey) || 'auto'; } catch {}
if(preference!=='auto'&&!languages.some(([code])=>code===preference))preference='auto';
const urlPreference=new URL(location.href).searchParams.get('lang');
if(urlPreference==='auto'||languages.some(([code])=>code===urlPreference))preference=urlPreference!;
export let locale = resolveLanguage(preference==='auto' ? [...navigator.languages] : [preference]);
let dictionary: Record<string,string> = {};
const bundles = import.meta.glob<Record<string,string>>('./locales/*.json', {import:'default'});
export async function initLanguage() {
 try { dictionary = await bundles[`./locales/${locale}.json`]!(); }
 catch { locale='en'; preference='en'; dictionary=await bundles['./locales/en.json']!(); }
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
 if(countries){const names=new Intl.DisplayNames([locale],{type:"region"});for(const country of countries)country.name=names.of(country.code)||country.name;}
 return result;}
export function languageSelector() {
 return `<label class="language-picker"><span aria-hidden="true">🌐</span><select data-language aria-label="${t('Language')}"><option value="auto" ${preference==='auto'?'selected':''}>${t('Device language')}</option>${languages.map(([code,name])=>`<option value="${code}" lang="${code}" ${preference===code?'selected':''}>${name}</option>`).join('')}</select></label>`;
}
document.addEventListener('change',event=>{
 const select=event.target;
 if(!(select instanceof HTMLSelectElement)||!select.matches('[data-language]'))return;
 try{localStorage.setItem(storageKey,select.value);}catch{}
 // A reload also stops active microphone sessions and avoids mixing languages in
 // an open invitation, while retaining the route, cookie and saved game progress.
 const url=new URL(location.href);url.searchParams.set('lang',select.value);location.assign(url.href);
});
window.addEventListener('languagechange',()=>{if(preference==='auto')location.reload();});
