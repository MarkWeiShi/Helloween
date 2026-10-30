import {cpSync,copyFileSync,constants,existsSync,lstatSync,mkdirSync,readdirSync,readFileSync,renameSync,symlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const digest=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
function activate(target,id) {
 if(!/^[a-f0-9]{20}$/.test(id) || !existsSync(join(target,'deployments',id,'index.html')))throw Error('Unknown static deployment');
 const current=join(target,'current');
 if(existsSync(current) && !lstatSync(current).isSymbolicLink())throw Error('Refusing to replace a non-symlink current directory');
 const temporary=join(target,`.current-${randomUUID()}`);symlinkSync(`deployments/${id}`,temporary);renameSync(temporary,current);
 return {deployment:id,current};
}
export function installWeb(source,target,{rollback}={}) {
 target=resolve(target);mkdirSync(target,{recursive:true});
 if(rollback)return activate(target,rollback);
 source=resolve(source);
 if(!existsSync(join(source,'release.json')))throw Error('A completed static build is required');
 const hash=createHash('sha256').update(readFileSync(join(source,'index.html'))).update(readFileSync(join(source,'release.json')));
 if(existsSync(join(source,'review/jiangshi-name.html')))hash.update(readFileSync(join(source,'review/jiangshi-name.html')));
 if(existsSync(join(source,'line-share.html')))hash.update(readFileSync(join(source,'line-share.html')));
 if(existsSync(join(source,'review/social-share.html')))hash.update(readFileSync(join(source,'review/social-share.html')));
 const id=hash.digest('hex').slice(0,20);
 function immutable(src,dst) {
  mkdirSync(dst,{recursive:true});
  for(const entry of readdirSync(src,{withFileTypes:true})) {
   const from=join(src,entry.name),to=join(dst,entry.name);
   if(entry.isDirectory())immutable(from,to);
   else if(entry.isSymbolicLink())throw Error('Immutable trees must not contain symlinks');
   else if(existsSync(to)){if(digest(from)!==digest(to))throw Error(`Immutable path collision: ${entry.name}`);}
   else copyFileSync(from,to,constants.COPYFILE_EXCL);
  }
 }
 // Complete immutable publication first. Old versions are never deleted.
 for(const name of ['assets','releases'])immutable(join(source,name),join(target,'objects',name));
 const destination=join(target,'deployments',id);
 if(!existsSync(destination)) {
  const staged=join(target,'deployments',`.staging-${randomUUID()}`);mkdirSync(staged,{recursive:true});
  for(const name of readdirSync(source))if(!['assets','releases','.vite'].includes(name))cpSync(join(source,name),join(staged,name),{recursive:true,verbatimSymlinks:true});
  for(const name of ['assets','releases'])symlinkSync(`../../objects/${name}`,join(staged,name));
  renameSync(staged,destination);
 }
 return activate(target,id);
}
if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])) {
 const [source,target,rollback]=process.argv.slice(2);
 if(!source || !target)throw Error('Usage: node scripts/install-web.mjs dist /srv/ghost [deployment-id-to-rollback]');
 console.log(JSON.stringify(installWeb(source,target,{rollback})));
}
