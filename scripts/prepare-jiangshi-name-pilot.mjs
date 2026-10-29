// Rebuild the reviewed audio tail from checked-in media; no remote generation.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
mkdirSync('public/art/name-reveals/jiangshi',{recursive:true});
execFileSync('ffmpeg',[
 '-y','-v','error','-i','public/art/transformations/jiangshi/entrance.8c2a44c9e1a0.mp4',
 '-stream_loop','-1','-i','public/art/transformations/jiangshi/loop.20dd83a0adc3.mp4',
 '-i','public/art/name-reveals/jiangshi/name-zh-cn-v2.wav',
 '-filter_complex','[0:v]trim=duration=6,setpts=PTS-STARTPTS[v0];[0:a]atrim=duration=6,asetpts=PTS-STARTPTS[a0];[1:v]trim=duration=2.6,setpts=PTS-STARTPTS[v1];[2:a]atrim=duration=2.6,asetpts=PTS-STARTPTS[a1];[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]',
 '-map','[v]','-map','[a]','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-r','24',
 '-c:a','aac','-b:a','160k','-movflags','+faststart','public/art/name-reveals/jiangshi/entrance-name-v2.mp4',
],{stdio:'inherit'});
console.log('Rebuilt Jiangshi pilot. Publish with npm run assets:transformations.');
