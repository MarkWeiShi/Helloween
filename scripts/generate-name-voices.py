"""Generate individually designed ElevenLabs name-only takes; resumable local outputs.
Reads ELEVENLABS_API_KEY from environment or the explicitly authorized ~/Projects/.env.
Only deletes temporary voice slots created by this script, after saving their audio.
"""
import os,json,time,base64,urllib.request,urllib.error,subprocess,hashlib,concurrent.futures
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
os.chdir(ROOT)
KEY=os.environ.get('ELEVENLABS_API_KEY')
if not KEY:
 KEY=next(l.split('=',1)[1].strip().strip('\"\'') for l in (Path.home()/'Projects/.env').read_text().splitlines() if l.startswith('ELEVENLABS_API_KEY='))
OUT=Path('artifacts/name-voices-v1');OUT.mkdir(parents=True,exist_ok=True)
PLAN=json.loads(Path('content/name-voices.json').read_text())['voices']
def api(path,payload=None,method=None):
 req=urllib.request.Request('https://api.elevenlabs.io/v1/'+path,data=None if payload is None else json.dumps(payload).encode(),headers={'xi-api-key':KEY,'Content-Type':'application/json'},method=method)
 for attempt in range(3):
  try:
   with urllib.request.urlopen(req,timeout=180) as r:return r.read()
  except urllib.error.HTTPError as e:
   detail=e.read().decode()[:800]
   if e.code in [429,500,502,503] and attempt<2:time.sleep(5*(attempt+1));continue
   raise RuntimeError(f'HTTP {e.code}: {detail}') from None
  except (TimeoutError,urllib.error.URLError):
   if attempt==2:raise
   time.sleep(3)
def probe(p):return float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(p)]))
def run(args):subprocess.run(args,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
def generate(v):
 folder=OUT/v['id'];folder.mkdir(exist_ok=True);public=Path('public/art/name-reveals')/v['id'];public.mkdir(parents=True,exist_ok=True)
 done=folder/'result.json'
 if done.exists():return v['id']+' cached'
 if v['id']=='jiangshi':
  raw=Path('public/art/name-reveals/jiangshi/name-zh-cn-v2.wav');voice=json.loads(Path('assets/jiangshi-name-reveal.json').read_text())['voice'];created=False
 else:
  voicefile=folder/'voice.json';created=True
  if voicefile.exists():voice=json.loads(voicefile.read_text())['voice_id']
  else:
   designfile=folder/'design.json'
   if designfile.exists():design=json.loads(designfile.read_text())
   else:
    payload={'voice_description':v['voiceDescription'],'model_id':'eleven_ttv_v3','auto_generate_text':True,'seed':v['seed']}
    design=json.loads(api('text-to-voice/design',payload))
    for i,p in enumerate(design['previews']):
     (folder/f'design-preview-{i}.mp3').write_bytes(base64.b64decode(p.pop('audio_base_64')))
    designfile.write_text(json.dumps(design,ensure_ascii=False,indent=2))
   data=json.loads(api('text-to-voice',{'voice_name':'WD name '+v['id'],'voice_description':v['voiceDescription'],'generated_voice_id':design['previews'][0]['generated_voice_id']}));voice=data['voice_id'];voicefile.write_text(json.dumps({'voice_id':voice,'createdBy':'generate-name-voices.py'}))
  raw=folder/'raw.mp3'
  if not raw.exists():
   payload={'text':f"[{v['tone']}][slowly] {v['spokenText']}",'model_id':'eleven_v4' if v['languageCode']=='zu' else 'eleven_v3','seed':v['seed'],'voice_settings':{'stability':0.5,'similarity_boost':0.8,'speed':0.8}}
   if v['languageCode']:payload['language_code']=v['languageCode']
   (folder/'tts-request.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2))
   raw.write_bytes(api('text-to-speech/'+voice+'?output_format=mp3_44100_128',payload))
 # Remove leading/trailing near-silence, retain 100ms tail; never cut speech to fit.
 trim=folder/'trim.wav'
 run(['ffmpeg','-y','-v','error','-i',str(raw),'-af','silenceremove=start_periods=1:start_duration=0.02:start_threshold=-48dB:start_silence=0.06,areverse,silenceremove=start_periods=1:start_duration=0.02:start_threshold=-48dB:start_silence=0.12,areverse','-ar','48000','-ac','2',str(trim)])
 duration=probe(trim);target=max(2.3,min(2.8,duration));tempo=max(.75,duration/target)
 # Preserve pitch; long phonetic names may require a modest pace correction.
 if not .5<=tempo<=1.65:raise RuntimeError(f'{v["id"]}: take duration {duration:.2f}s requires a fresh performance')
 audio=public/'name-v1.wav'
 run(['ffmpeg','-y','-v','error','-i',str(trim),'-af',f'atempo={tempo:.6f},loudnorm=I=-17:TP=-2:LRA=7,apad,atrim=duration=2.8','-ar','48000','-ac','2',str(audio)])
 result={'id':v['id'],'spokenText':v['spokenText'],'language':v['language'],'languageCode':v['languageCode'],'model':'eleven_v4' if v['languageCode']=='zu' else 'eleven_v3','voiceId':voice,'rawDuration':probe(raw),'trimmedDuration':duration,'tempo':tempo,'duration':probe(audio),'audio':str(audio),'sha256':hashlib.sha256(audio.read_bytes()).hexdigest(),'nativeReview':'pending','languageSupport':'supported' if v['languageCode'] else 'unsupported-language pronunciation draft','voiceSlot':'temporary' if created else 'existing Jiangshi voice'}
 done.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 if created:
  try:api('voices/'+voice,method='DELETE');result['temporaryVoiceDeleted']=True;done.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
  except Exception as e:print(v['id'],'temporary voice retained; cleanup permission unavailable',flush=True)
 return v['id']+' generated '+str(round(duration,2))+'s -> 2.8s'
if __name__=='__main__':
 requested=set(os.environ.get('VOICE_IDS','').split(','))-{''};voices=[v for v in PLAN if not requested or v['id'] in requested]
 errors=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  future={pool.submit(generate,v):v for v in voices}
  for f in concurrent.futures.as_completed(future):
   try:print(f.result(),flush=True)
   except Exception as e:errors.append({'id':future[f]['id'],'error':str(e)});print('FAILED',future[f]['id'],str(e),flush=True)
 (OUT/'errors.json').write_text(json.dumps(errors,ensure_ascii=False,indent=2))
 print('DONE',len(voices)-len(errors),'failed',len(errors),flush=True)
