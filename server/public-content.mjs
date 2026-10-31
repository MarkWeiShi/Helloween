import {readFileSync,existsSync} from 'node:fs';
import {RULES} from '../shared/rules.mjs';
import {countries} from '../shared/countries.mjs';
// Explicit public fields: never export story bodies or editorial review notes.
const fields = ['id','regionId','originCountry','atlasId','name','nativeName','kind','culture','shortDescription','globeDescription','folklore','wish','peaceLabel','prop','animation','color','atlasRow','sources','artNote'];
const pick = (value, keys) => Object.fromEntries(keys.filter(k => value[k] !== undefined).map(k => [k,value[k]]));
export function publicCatalog(catalog, art) {
  return {...pick(catalog,['version','language','title','storyLabel','storyDisclosure']),
    regions: catalog.regions.map(r=>pick(r,['id','name','nameZh','areaIds','subtitle'])),
    spirits: catalog.spirits.map(s=>({...pick(s,fields),art:art.spirits?.[s.id] || null})),
    countries, rules:RULES, assetOrigin:'', worldMap:art.worldMap};
}

export function loadPublicContent(root) {
  for(const path of [`${root}/runtime/public-content.json`,`${root}/.build/api-content.json`]) {
    if(existsSync(path))return JSON.parse(readFileSync(path,'utf8'));
  }
  return null;
}
