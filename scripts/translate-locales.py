#!/usr/bin/env python3
"""Generate reviewable offline translation drafts. Never runs in the product.
Usage: python scripts/translate-locales.py /path/to/m2m100-ct2 [locale ...]
Requires ctranslate2 and sentencepiece. Model: jncraton/m2m100_418M-ct2-int8,
revision 7c1b2620a4e58dacecbd8bf89cfd6da7eb9eb7b0 (upstream M2M100, MIT).
English normalization and editorial overrides are the source of truth.
"""
import json, re, sys, time
from pathlib import Path
import ctranslate2
import sentencepiece as spm
ROOT=Path(__file__).resolve().parent.parent
MODEL=Path(sys.argv[1])
REPAIR='--repair' in sys.argv
LANGUAGES=[x for x in sys.argv[2:] if x!='--repair'] or ['zh','es','pt','fr','de','it','ru','ar','hi','ja','ko','id','th','vi']
source=json.loads((ROOT/'content/localization/source.json').read_text())
en=json.loads((ROOT/'src/locales/en.json').read_text())
overrides=json.loads((ROOT/'content/localization/overrides.json').read_text())
processor=spm.SentencePieceProcessor(model_file=str(MODEL/'sentencepiece.bpe.model'))
translator=ctranslate2.Translator(str(MODEL),device='cpu',compute_type='int8',intra_threads=4,inter_threads=1)
placeholder=re.compile(r'\{\{(\d+)\}\}')
def dump(path,value):
 tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n');tmp.replace(path)
def tokens(text):return ['__en__']+processor.encode(text,out_type=str)+['</s>']
def batch(texts,locale):
 result=translator.translate_batch([tokens(x) for x in texts],target_prefix=[[f'__{locale}__'] for _ in texts],beam_size=2,disable_unk=True,suppress_sequences=[["<"],[">"],["unk"]],max_decoding_length=384,repetition_penalty=1.1,no_repeat_ngram_size=4)
 return [processor.decode(r.hypotheses[0][1:]).strip() for r in result]
def parts(text):
 # Keep long disclosure copy within the model's context, without truncating it.
 sentences=re.split(r'(?<=[.!?])\s+(?=[A-Z])',text)
 result=[]
 for sentence in sentences:
  if len(processor.encode(sentence))<=200:result.append(sentence);continue
  words=sentence.split();chunk=[]
  for word in words:
   if len(processor.encode(' '.join(chunk+[word])))>180:
    result.append(' '.join(chunk));chunk=[]
   chunk.append(word)
  if chunk:result.append(' '.join(chunk))
 return result
for lang in LANGUAGES:
 start=time.time(); path=ROOT/f'src/locales/{lang}.json'
 completed=json.loads(path.read_text()) if path.exists() else {}
 if REPAIR:completed={k:v for k,v in completed.items() if not re.search(r'[<>⁇]|987600\d\d',v)}
 for key in source:
  if key in overrides.get(lang,{}):completed[key]=overrides[lang][key]
  elif lang=='zh' and re.search('[\u3400-\u9fff]',key):completed[key]=key
 pending=[key for key in source if key not in completed]
 jobs=[];mapping={}
 for key in pending:
  text=placeholder.sub(lambda m:str(98760000+int(m[1])),en[key]); mapping[key]=parts(text)
  jobs.extend(mapping[key])
 jobs=list(dict.fromkeys(jobs));translated={}
 print(f'{lang}: {len(pending)} messages, {len(jobs)} segments',flush=True)
 for i in range(0,len(jobs),24):
  chunk=jobs[i:i+24]; translated.update(zip(chunk,batch(chunk,lang)))
  if i%120==0:print(f'{lang}: segments {min(i+24,len(jobs))}/{len(jobs)}, {time.time()-start:.0f}s',flush=True)
 for key in pending:
  value=' '.join(translated[x] for x in mapping[key])
  value=re.sub(r'987600(\d\d)',lambda m:'{{'+str(int(m[1]))+'}}',value)
  if sorted(placeholder.findall(value))!=sorted(placeholder.findall(key)):
   # Preserve every value even when the model drops a numeric marker. These
   # templates remain flagged for editorial review in the generated report.
   segments=placeholder.split(en[key]);chunks=[segments[i] for i in range(0,len(segments),2)]
   results=batch([x.strip() for x in chunks if x.strip()],lang);it=iter(results);value=''
   for i,chunk in enumerate(chunks):
    if chunk.strip():value+=(' ' if chunk.startswith(' ') else '')+next(it)+(' ' if chunk.endswith(' ') else '')
    if i<len(chunks)-1:value+='{{'+segments[i*2+1]+'}}'
  if not value:raise RuntimeError(f'Empty translation: {lang} {key}')
  prefix=re.match(r'^([\U0001F300-\U0001FAFF]\s*)',key)
  if prefix:value=prefix[0]+re.sub(r'^[⁇?\s]+','',value)
  completed[key]=value
 dump(path,{key:completed[key] for key in source})
 print(f'{lang}: complete in {time.time()-start:.0f}s',flush=True)
