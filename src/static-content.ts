import {fetchJson} from '../packages/ghost-sdk/request-signal';
import {catalogUrl,motionsUrl} from 'virtual:ghost-content';
import type {Catalog} from './types';
export type Motion = {sheet:string;frames:number;fps:number};
async function read<T>(url:string):Promise<T> {
 return fetchJson<T>(url,{credentials:'omit'});
}
export const loadCatalog=()=>read<Catalog>(catalogUrl);
let motions:Promise<{motions:Record<string,Motion>}>|undefined;
export function loadMotions(){return motions??=read<{motions:Record<string,Motion>}>(motionsUrl).catch(error=>{motions=undefined;throw error;});}
