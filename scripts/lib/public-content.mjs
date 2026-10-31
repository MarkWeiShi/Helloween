import {createHash} from 'node:crypto';
import {readFileSync, readdirSync, mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {loadCatalog} from '../../server/content.mjs';
import {loadCuteMotions} from '../../server/motions.mjs';

import {publicCatalog} from '../../server/public-content.mjs';
export {publicCatalog};
export function publicFiles(root) {
  const paths=[];
  function walk(dir, prefix='') {
    for(const item of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
      const path=prefix+item.name;
      if(item.name.startsWith('.') || path==='art/source')continue;
      if(item.isSymbolicLink())throw new Error(`Unexpected public symlink: ${path}`);
      if(item.isDirectory())walk(join(dir,item.name),path+'/');
      else if(/\.(json|gif|webp|png|jpe?g|svg|ico|mp4|webm|mp3|wav|ogg|woff2?)$/i.test(item.name) || ['art/share-challenges/index.html','art/share-challenges/posts.zh.txt'].includes(path))paths.push(path);
    }
  }
  walk(root); return paths;
}
export function rewritePublicPaths(value, prefix, assetPaths={}) {
  if(typeof value==='string')return (assetPaths[value] || value.replace(/^\/(art|geo|audio|icons)\//,`${prefix}/$1/`));
  if(Array.isArray(value))return value.map(v=>rewritePublicPaths(v,prefix,assetPaths));
  if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rewritePublicPaths(v,prefix,assetPaths)]));
  return value;
}
export function prepareContent(root=process.cwd()) {
  const source=join(root,'public'), files=publicFiles(source), catalog=loadCatalog(join(root,'content'));
  const art=JSON.parse(readFileSync(join(source,'art/manifest.json'),'utf8'));
  const raw={catalog:publicCatalog(catalog,art),motions:{motions:loadCuteMotions(source,new Map(catalog.spirits.map(s=>[s.id,s])))}};
  const baseline=JSON.parse(readFileSync(join(root,'content/asset-baseline.json'),'utf8'));
  const reused=new Set();
  const hash=createHash('sha256').update(JSON.stringify(raw)).update(JSON.stringify(baseline));
  for(const file of files){const bytes=readFileSync(join(source,file));hash.update(file).update('\0').update(bytes);if(!file.endsWith('.json') && createHash('sha256').update(bytes).digest('hex')===baseline.files[file])reused.add(file);}
  const release=hash.digest('hex').slice(0,20), prefix=`/releases/${release}`;
  const mediaPrefix=`/releases/${baseline.release}`;
  const assetPaths=Object.fromEntries(files.map(file=>['/'+file,(reused.has(file)?mediaPrefix:prefix)+'/'+file]));
  const snapshot={release,contentVersion:catalog.version,...rewritePublicPaths(raw,prefix,assetPaths)};
  const directory=join(root,'.build');mkdirSync(directory,{recursive:true});
  writeFileSync(join(directory,'api-content.json'),JSON.stringify(snapshot));
  return {root,source,files,release,prefix,snapshot,raw,assetPaths,mediaPrefix,reused};
}
