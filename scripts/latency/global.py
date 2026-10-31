import json,urllib.request,time,concurrent.futures
from pathlib import Path
w=Path(__file__).parent
def call(path,body=None):
 return json.load(urllib.request.urlopen(urllib.request.Request('https://api.globalping.io/v1/'+path,data=json.dumps(body).encode()if body else None,headers={'Content-Type':'application/json'}),timeout=30))
def measure(name,target,path,locations):
 d=call('measurements',{'type':'http','target':target,'locations':locations,'measurementOptions':{'protocol':'HTTPS','request':{'method':'GET','path':path}}})
 print(name,d['id'],flush=True)
 for _ in range(25):
  time.sleep(2);result=call('measurements/'+d['id'])
  if result['status']=='finished':break
 # Persist only metadata/timing: config bodies may contain public app identifiers.
 rows=[]
 for r in result.get('results',[]):
  p=r['probe'];v=r['result'];rows.append({'probe':{k:p.get(k)for k in ['city','country','asn','network']},'status':v.get('statusCode'),'state':v.get('status'),'timings':v.get('timings'),'truncated':v.get('truncated'),'entry':v.get('headers',{}).get('fly-request-id','')[-3:]})
 (w/('global-'+name+'.json')).write_text(json.dumps({'id':d['id'],'scope':'HTTP only; not editor ready','rows':rows},indent=2))
 return d['id']
locations=[{'magic':city,'limit':1}for city in ['Tokyo','Singapore','Mumbai','Sydney','Frankfurt','Virginia','Sao Paulo','London','Johannesburg','Hong Kong']]
mid=measure('config','helloween.fly.dev','/api/social/config',locations)
with concurrent.futures.ThreadPoolExecutor(max_workers=3)as pool:
 jobs=[pool.submit(measure,*args,mid) for args in [('kakao','t1.kakaocdn.net','/kakao_js_sdk/2.8.4/kakao.min.js'),('line','static.line-scdn.net','/liff/edge/versions/2.31.1/sdk.js'),('config-repeat','helloween.fly.dev','/api/social/config')]]
 for job in jobs:job.result()
