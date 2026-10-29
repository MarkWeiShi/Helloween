import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
// At 120 BPM, overlap one 4-beat bar. Rotate the join into the file so
// the loop boundary itself continues directly from the original waveform.
const rate=44100,channels=2,overlap=rate*2;
const pcm=execFileSync('ffmpeg',['-v','error','-i','artifacts/bgm/elevenlabs-original.mp3','-t','32','-f','f32le','-ar',String(rate),'-ac','2','pipe:1'],{maxBuffer:32e6});
const input=new Float32Array(pcm.buffer,pcm.byteOffset,pcm.length/4);
const frames=input.length/channels, length=frames-overlap;
const output=new Float32Array(length*channels);
for(let i=0;i<length;i++)for(let c=0;c<channels;c++){
 let value=input[(i+overlap)*channels+c];
 if(i>=length-overlap){const j=i-(length-overlap),mix=j/(overlap-1);value=value*(1-mix)+input[j*channels+c]*mix;}
 output[i*channels+c]=value;
}
execFileSync('ffmpeg',['-v','error','-y','-f','f32le','-ar',String(rate),'-ac','2','-i','pipe:0','-c:a','libmp3lame','-b:a','160k','public/audio/halloween-loop.mp3'],{input:Buffer.from(output.buffer)});
writeFileSync('artifacts/bgm/loop.json',JSON.stringify({durationSeconds:length/rate,crossfadeSeconds:2,provider:'ElevenLabs',boundaryDelta:[0,1].map(c=>Math.abs(output[(length-1)*2+c]-output[c]))},null,2));
console.log('Prepared loop:',length/rate,'seconds');
