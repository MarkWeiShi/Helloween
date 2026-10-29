import {cpSync,mkdirSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {prepareContent} from './lib/public-content.mjs';
const {snapshot}=prepareContent();
const target='dist-api';rmSync(target,{recursive:true,force:true});mkdirSync(target,{recursive:true});
for(const dir of ['server','shared','content'])cpSync(dir,join(target,dir),{recursive:true});
mkdirSync(join(target,'runtime'),{recursive:true});
writeFileSync(join(target,'runtime/public-content.json'),JSON.stringify(snapshot));
mkdirSync(join(target,'scripts'),{recursive:true});
for(const file of ['backup.mjs','verify-backup.mjs','metrics.mjs'])cpSync(join('scripts',file),join(target,'scripts',file));
// Preserve npm's exact production lock; only server-side runtime dependencies install.
const pkg=JSON.parse(readFileSync('package.json','utf8'));
writeFileSync(join(target,'package.json'),JSON.stringify({...pkg,scripts:{start:'node server/index.mjs'},devDependencies:{}},null,2));
cpSync('package-lock.json',join(target,'package-lock.json'));
console.log(JSON.stringify({api:target,release:snapshot.release,contentVersion:snapshot.contentVersion}));
