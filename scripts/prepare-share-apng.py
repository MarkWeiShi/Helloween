#!/usr/bin/env python3
"""Convert approved ghost GIFs into LINE-compatible APNGs; no new artwork."""
from pathlib import Path
from PIL import Image, ImageOps
import hashlib, json, io
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'public/art/share-challenges/manifest.json'
OUT=ROOT/'public/art/share-animations'
OUT.mkdir(parents=True,exist_ok=True)
manifest={'version':1,'characters':{}}
for ident,item in json.loads(SOURCE.read_text())['characters'].items():
 if item.get('previewOnly'):continue
 source=ROOT/'public'/item['gif'].lstrip('/')
 raw=source.read_bytes(); digest=hashlib.sha256(raw).hexdigest()
 if digest!=item['sha256']:raise ValueError('Source hash mismatch: '+ident)
 with Image.open(source) as im:
  frames=[]; durations=[]
  for i in range(im.n_frames):
   im.seek(i);frames.append(im.convert('RGBA'));durations.append(im.info.get('duration',80))
  encoded=None
  for count,size in [(16,224),(16,192),(12,192),(12,160),(10,144),(8,128)]:
   indices=sorted(set(i*len(frames)//min(count,len(frames)) for i in range(min(count,len(frames)))))
   selected=[ImageOps.contain(frames[i],(size,size),Image.Resampling.LANCZOS) for i in indices]
   # One palette across every frame prevents per-frame palette mismatches in APNG.
   sheet=Image.new('RGB',(size,size*len(selected)), '#111a30')
   for i,f in enumerate(selected):sheet.paste(f.convert('RGB'),(0,i*size))
   palette=sheet.quantize(colors=96,method=Image.Quantize.MEDIANCUT)
   indexed=[f.convert('RGB').quantize(palette=palette,dither=Image.Dither.NONE) for f in selected]
   timing=[sum(durations[a:b]) for a,b in zip(indices,indices[1:]+[len(frames)])]
   buf=io.BytesIO();indexed[0].save(buf,format='PNG',save_all=True,append_images=indexed[1:],duration=timing,loop=0,optimize=True,disposal=0,blend=0)
   if len(buf.getvalue())<=295000:encoded=buf.getvalue();break
  if encoded is None:raise ValueError('Could not fit LINE limit: '+ident)
 filename=ident+'.'+hashlib.sha256(encoded).hexdigest()[:12]+'.png'
 (OUT/filename).write_bytes(encoded)
 with Image.open(io.BytesIO(encoded)) as verify:
  assert verify.n_frames>1 and verify.width<=1024 and verify.height<=1024
  manifest['characters'][ident]={'apng':'/art/share-animations/'+filename,'width':verify.width,'height':verify.height,'frames':verify.n_frames,'bytes':len(encoded),'durationMs':sum(durations),'sha256':hashlib.sha256(encoded).hexdigest(),'sourceGif':item['gif'],'sourceSha256':digest}
 print(ident,len(encoded),size,len(indices),flush=True)
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
