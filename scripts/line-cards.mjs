import {readFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import sharp from 'sharp';

// LINE Flex images require JPEG/PNG, at most 1024px. Keep complete landscape artwork.
export function lineCardsPlugin(){
 let root,out;
 return {name:'line-compatible-cards',apply:'build',configResolved(config){root=config.root;out=resolve(root,config.build.outDir);},async closeBundle(){
  const manifest=JSON.parse(readFileSync(join(root,'public/art/manifest.json'),'utf8'));
  mkdirSync(join(out,'line-cards'),{recursive:true});
  for(const [id,art] of Object.entries(manifest.spirits)){
   if(!art.share)continue;
   await sharp(join(root,'public',art.share)).resize({width:1024,height:538,fit:'contain',background:'#111a30'}).jpeg({quality:88}).toFile(join(out,'line-cards',id+'.jpg'));
  }
 }};
}
