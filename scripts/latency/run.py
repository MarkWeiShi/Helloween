import subprocess,base64,shlex,json,concurrent.futures
from pathlib import Path
w=Path(__file__).parent
# This probe creates ten unsent invitations per started machine; no SNS messages are sent.
machines=json.loads(subprocess.check_output(['fly','machines','list','-a','helloween','--json']))
code=base64.b64encode((w/'chain.mjs').read_bytes()).decode()
command='node --input-type=module -e '+shlex.quote("import('data:text/javascript;base64,"+code+"')")
def run(m):
 p=subprocess.run(['fly','machine','exec',m['id'],'-a','helloween',command,'--timeout','120','--json'],capture_output=True,text=True,timeout=150)
 try:
  envelope=json.loads(p.stdout);data=json.loads(envelope['stdout'].strip());(w/(m['region']+'.json')).write_text(json.dumps(data,indent=2));return {'region':m['region'],'rows':len(data['rows']),'errors':sum('error'in x for x in data['rows'])}
 except Exception as e:return {'region':m['region'],'error':str(e),'stderr':p.stderr[-300:]}
with concurrent.futures.ThreadPoolExecutor(max_workers=5)as pool:
 for result in pool.map(run,[m for m in machines if m['state']=='started']):print(json.dumps(result),flush=True)
