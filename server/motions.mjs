import {previewTransformations} from '../shared/preview-transformations.mjs';
import {existsSync,readdirSync,readFileSync} from 'node:fs';
import {join,basename} from 'node:path';
// Read on demand so atomically published motion packs need no server restart.
export function loadCuteMotions(staticRoot, spirits) {
 const directory=join(staticRoot,'art/motions'), result={};
 if(!existsSync(directory))return result;
 for(const file of readdirSync(directory).filter(f=>f.endsWith('.json'))) {
  try {
   const m=JSON.parse(readFileSync(join(directory,file),'utf8'));
   if(m.state!=='ready'||m.kind!=='cute'||(!spirits.has(m.spiritId)&&!Object.values(previewTransformations).includes(m.spiritId))||file!==`${m.spiritId}.json`)continue;
   if(!Number.isInteger(m.frames)||m.frames<3||m.frames>144||!Number.isFinite(m.fps)||m.fps<1||m.fps>30)continue;
   if(typeof m.sheet!=='string'||!/^\/art\/motions\/[a-z0-9.-]+\.webp$/.test(m.sheet)||!existsSync(join(directory,basename(m.sheet))))continue;
   result[m.spiritId]={sheet:m.sheet,frames:m.frames,fps:m.fps};
  }catch{/* An incomplete or invalid pack leaves the static portrait intact. */}
 }
 return result;
}
