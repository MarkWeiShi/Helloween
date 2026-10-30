import {catalogUrl,motionsUrl} from 'virtual:ghost-content';
import type {Catalog} from './types';
export type Motion = {sheet:string;frames:number;fps:number};
async function read<T>(url:string):Promise<T> {
 const response=await fetch(url,{credentials:'omit',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('Public content unavailable');return response.json();
}
export const loadCatalog=()=>read<Catalog>(catalogUrl);
let motions:Promise<{motions:Record<string,Motion>}>|undefined;
export function loadMotions(){return motions??=read<{motions:Record<string,Motion>}>(motionsUrl).catch(error=>{motions=undefined;throw error;});}
