"""Replace only an opaque first frame; preserve existing cropped motion blocks."""
import io,json,sys,hashlib
from pathlib import Path
from PIL import Image

def blocks(data):
    packed=data[10]; pos=13+(3*(2**((packed&7)+1)) if packed&128 else 0)
    palette=data[13:pos]; images=[]; gce=None
    def sub(p):
        while data[p]: p+=data[p]+1
        return p+1
    while data[pos]!=0x3b:
        start=pos
        if data[pos]==0x21:
            if data[pos+1]==0xf9: gce=pos
            pos=sub(pos+2)
        elif data[pos]==0x2c:
            p=data[pos+9]; pos+=10
            if p&128:pos+=3*2**((p&7)+1)
            pos=sub(pos+1); images.append((start,pos,gce))
        else:raise ValueError('Invalid GIF block')
    return palette,images

jobs=json.loads(Path(sys.argv[1]).read_text()); results=[]
for job in jobs:
    source=Path(job['source']).read_bytes(); _,frames=blocks(source)
    for start,end,gce in frames[1:]:
        x=int.from_bytes(source[start+1:start+3],'little');w=int.from_bytes(source[start+5:start+7],'little')
        assert x+w<=450,'Motion touches text region'
        assert gce is not None and ((source[gce+3]>>2)&7)==1,'Frames must retain prior canvas'
    image=Image.open(job['png']).convert('RGB').quantize(colors=256)
    buf=io.BytesIO();image.save(buf,format='GIF');new=buf.getvalue();palette,newframes=blocks(new)
    a,b,_=newframes[0]; block=bytearray(new[a:b]);assert not block[9]&128
    block[9]=(block[9]&64)|128|(new[10]&7);block=block[:10]+palette+block[10:]
    a,b,gce=frames[0];prefix=bytearray(source[:a]);prefix[gce+3]&=0xfe
    result=bytes(prefix)+block+source[b:];sha=hashlib.sha256(result).hexdigest()
    path=Path(job['out'])/(job['id']+'.'+job['lang']+'.'+sha[:12]+'.gif');path.write_bytes(result)
    results.append({'id':job['id'],'lang':job['lang'],'gif':'/art/x-cards/'+path.name,'bytes':len(result),'sha256':sha})
print(json.dumps(results))
