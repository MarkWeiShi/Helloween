import {previewCharacters} from '../shared/preview-characters.mjs';
import {publicAssetData} from './public-assets';
import type {Catalog,Spirit} from './types';
type ShareCharacter=Pick<Spirit,'id'|'regionId'|'name'|'nativeName'|'culture'|'art'>;
const previews:Record<string,ShareCharacter>=publicAssetData(previewCharacters);
export function findShareCharacter(catalog:Catalog,id:string):ShareCharacter|undefined {return catalog.spirits.find(s=>s.id===id)||previews[id];}
// Sharing a preview should not change a guest's playable catalog selection.
export function profileSpiritId(catalog:Catalog,id:string){return catalog.spirits.some(s=>s.id===id)?id:catalog.spirits[0].id;}
