// Pure localization primitives shared by the browser, catalog audit and tests.
export const languages = [
 ['en','English'],['zh','中文'],['es','Español'],['pt','Português'],['fr','Français'],
 ['de','Deutsch'],['it','Italiano'],['ru','Русский'],['ar','العربية'],['hi','हिन्दी'],
 ['ja','日本語'],['ko','한국어'],['id','Bahasa Indonesia'],['th','ไทย'],['vi','Tiếng Việt'],
];
export function resolveLanguage(preferences = []) {
 for (const preference of preferences) {
  const base = String(preference).toLowerCase().replaceAll('_','-').split('-')[0];
  if (languages.some(([code])=>code===base)) return base;
 }
 return 'en';
}
export const decode = text => text.replace(/&(amp|lt|gt|quot|#39|nbsp);/g,(_,key)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'",nbsp:'\u00a0'})[key]);
export const escapeHTML = text => String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
export function translate(text, dictionary) {
 const trimmed=text.trim();
 return Object.hasOwn(dictionary,trimmed) ? text.replace(trimmed,()=>dictionary[trimmed]) : text;
}
// Translate authored text only, before dynamic data is interpolated. Never walk or
// rewrite the rendered DOM: names, input values, URLs and event bindings stay intact.
export function mapMarkup(source, transform) {
 return source.replace(/(<[^>]*>)|([^<]+)/g,(whole,tag,text)=> {
  if (tag) return tag.replace(/\b(aria-label|title|placeholder|alt)=("([^"]*)"|'([^']*)')/g,(_,name,quoted,a,b)=>`${name}="${escapeHTML(transform(decode(a??b)))}"`);
  return escapeHTML(transform(decode(text)));
 });
}
export function interpolate(source, values) {
 return source.replace(/\{\{(\d+)\}\}/g,(match,index)=>index<values.length?String(values[index]):match);
}
export function templateSource(parts) {return parts.reduce((out,part,index)=>out+(index?`{{${index-1}}}`:'')+part,'');}
export function localizeCatalog(value, dictionary, key='') {
 if(Array.isArray(value))return value.map(item=>localizeCatalog(item,dictionary,key));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,localizeCatalog(v,dictionary,k)]));
 return typeof value==='string' && ['name','subtitle','kind','culture','shortDescription','folklore','artNote','wish','peaceLabel','prop','title','text','storyLabel','storyDisclosure'].includes(key)?translate(value,dictionary):value;
}

let activeDictionary = {};
export function setDictionary(value) {activeDictionary=value;}
export function t(source) {return translate(source,activeDictionary);}
export function msg(parts,...values) {return interpolate(t(templateSource(parts)),values);}
export function html(parts,...values) {return interpolate(mapMarkup(templateSource(parts),t),values);}
