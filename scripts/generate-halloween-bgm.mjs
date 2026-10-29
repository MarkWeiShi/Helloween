import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {homedir} from 'node:os';
const env=parseEnv(await readFile(`${homedir()}/Projects/.env`,'utf8'));
const key=env.ELEVENLABS_API_KEY;
if(!key)throw Error('ELEVENLABS_API_KEY is missing');
const request={model_id:'music_v1',music_length_ms:32000,force_instrumental:true,prompt:'An original instrumental seamless looping background music bed for a cute Halloween pumpkin planet exploration game. Whimsical spooky playful magical nighttime atmosphere, friendly little ghosts, warm mysterious adventure, not horror. Delicate celesta and music box bells, plucked pizzicato strings, soft rounded bass, gentle wooden percussion, subtle haunted organ accents. Steady 120 BPM, 4/4, repeating eight-bar motif, light arrangement with plenty of space. Consistent level and orchestration from beginning to end. No intro, no outro, no fade out, no final cadence, end poised to repeat the first beat. No vocals, no speech, no screams, no jump scares, no harsh loud sounds.'};
await mkdir('artifacts/bgm',{recursive:true});
await writeFile('artifacts/bgm/generation.json',JSON.stringify({provider:'ElevenLabs',...request},null,2));
const res=await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128',{method:'POST',headers:{'Content-Type':'application/json','xi-api-key':key},body:JSON.stringify(request),signal:AbortSignal.timeout(240000)});
if(!res.ok){console.error('ElevenLabs generation failed',res.status,(await res.text()).slice(0,1200));process.exit(1);}
await writeFile('artifacts/bgm/elevenlabs-original.mp3',Buffer.from(await res.arrayBuffer()));
console.log('ElevenLabs music saved to artifacts/bgm/elevenlabs-original.mp3');
