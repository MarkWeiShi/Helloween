import {collectMessages} from './collect-locales.mjs';
import {readFileSync} from 'node:fs';
import {languages,localizeCatalog} from '../shared/i18n.mjs';
import {loadCatalog} from '../server/content.mjs';
const source=JSON.parse(readFileSync(new URL('../content/localization/source.json',import.meta.url)));
const placeholders=s=>[...s.matchAll(/\{\{\d+\}\}/g)].map(x=>x[0]).sort().join(',');
const failures=[];const report=[];
for(const key of collectMessages())if(!source.includes(key))failures.push(`Unregistered source copy: ${key}`);
for(const [code] of languages){
 let dictionary;try{dictionary=JSON.parse(readFileSync(new URL(`../src/locales/${code}.json`,import.meta.url)));}catch{failures.push(`${code}: missing bundle`);continue;}
 for(const key of source){if(!dictionary[key]?.trim())failures.push(`${code}: missing ${key}`);else if(placeholders(key)!==placeholders(dictionary[key]))failures.push(`${code}: placeholders differ: ${key}`);else if(/[<>⁇]/.test(dictionary[key])||/987600\d\d/.test(dictionary[key]))failures.push(`${code}: unexpected HTML in translation: ${key}`);}
 const catalog=loadCatalog();localizeCatalog(catalog,new Proxy(dictionary,{getOwnPropertyDescriptor(target,key){if(!Object.hasOwn(target,key))failures.push(`${code}: missing catalog copy ${key}`);return Object.getOwnPropertyDescriptor(target,key);}}));
 report.push({locale:code,messages:Object.keys(dictionary).length});
}
console.log(JSON.stringify({languages:report,errors:failures},null,2));if(failures.length)process.exitCode=1;
