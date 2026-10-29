import importlib.util,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('voices',Path(__file__).with_name('generate-name-voices.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
for p in m.OUT.glob('*/result.json'):
 d=json.loads(p.read_text());v=p.with_name('voice.json')
 if d.get('temporaryVoiceDeleted') or not v.exists():continue
 if json.loads(v.read_text()).get('createdBy')!='generate-name-voices.py':continue
 try:m.api('voices/'+d['voiceId'],method='DELETE')
 except Exception as e:
  if 'voice_not_found' not in str(e):raise
 d['temporaryVoiceDeleted']=True;p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');print(d['id'],'temporary slot cleared',flush=True)
