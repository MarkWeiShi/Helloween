// Attach saved, individually generated name audio to the existing transformation.
// Original six-second visuals and original loop remain the source of every frame.
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {loadCatalog} from '../server/content.mjs';import {prepareTransformations} from './prepare-transformations.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const plan=read('content/name-voices.json');const catalog=loadCatalog();
const pilots={},items=[];
for(const v of plan.voices){
 const resultPath=`artifacts/name-voices-v1/${v.id}/result.json`;
 if(!fs.existsSync(resultPath)){items.push({...v,status:'pending-generation'});continue;}
 const result=read(resultPath);const folder=['ghost-horror-40-v1','ghost-horror-regional-v1'].map(r=>`artifacts/${r}/${v.id}`).find(p=>fs.existsSync(`${p}/manifest.json`));
 if(!folder)throw Error(`Missing original video ${v.id}`);
 const output=`public/art/name-reveals/${v.id}/entrance-name-v3.mp4`;
 if(!fs.existsSync(output)||fs.statSync(output).mtimeMs<fs.statSync(result.audio).mtimeMs){
 execFileSync('ffmpeg',['-y','-v','error','-i',`${folder}/entrance-playback.mp4`,'-stream_loop','-1','-i',`${folder}/horror-loop-playback.mp4`,'-i',result.audio,'-filter_complex','[0:v]trim=duration=6,setpts=PTS-STARTPTS[v0];[0:a]atrim=duration=6,asetpts=PTS-STARTPTS[a0];[1:v]trim=duration=2.8,setpts=PTS-STARTPTS[v1];[2:a]atrim=duration=2.8,asetpts=PTS-STARTPTS[a1];[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]','-map','[v]','-map','[a]','-c:v','libx264','-threads','2','-preset','fast','-crf','20','-pix_fmt','yuv420p','-r','24','-c:a','aac','-b:a','160k','-movflags','+faststart',output]);
 }
 pilots[v.id]={source:output,duration:8.8,spokenName:{text:v.spokenText,language:v.language,startsAt:6,duration:2.8,audio:'/'+result.audio.replace(/^public\//,''),nativeReview:'pending'}};
 items.push({...v,...result,status:'generated-awaiting-listening',audio:'/'+result.audio.replace(/^public\//,''),name:catalog.spirits.find(s=>s.id===v.id).name});
 console.log(v.id+' prepared');
}
fs.writeFileSync('content/name-reveal-pilots.json',JSON.stringify(pilots,null,2)+'\n');
const report={version:1,generatedAt:new Date().toISOString(),total:items.length,generated:Object.keys(pilots).length,visualChanges:'none; name overlay removed',humanListening:'pending',items};
fs.writeFileSync('assets/name-voices.json',JSON.stringify(report,null,2)+'\n');
fs.writeFileSync('public/art/name-reveals/manifest.json',JSON.stringify(report,null,2)+'\n');
console.log(prepareTransformations({requireAll:true}));
