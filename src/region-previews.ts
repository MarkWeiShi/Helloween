import {regionPreviews as previews} from '../shared/preview-characters.mjs';
import {publicAssetData} from './public-assets';
export const regionPreviews: Record<string,{name:string;culture:string;thumb:string;portrait:string}> = publicAssetData(previews);
