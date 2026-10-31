import {publicAssetUrl} from './public-assets';
import {scopedListener,focusedPinSelector} from './browser-compat';
import {t} from "../shared/i18n.mjs";
import { geoOrthographic, geoPath, geoDistance, geoGraticule10, geoContains, geoRotation, geoArea } from 'd3-geo';
import type { GeoPermissibleObjects } from 'd3-geo';

// Discovery anchors, not borders or claims of exclusive cultural ownership.
export const anchors: Record<string, [number, number]> = {
  CN: [105, 34], JP: [139, 36], KR: [128, 38], ECA: [84, 48], SAS: [78, 20],
  SEA: [112, 5], RU: [98, 63], ARAB: [42, 24], WAS: [48, 40], AFR: [19, -6],
  GB: [-3, 55], FR: [2, 46], DE: [11, 51], EUR: [23, 60], NAM: [-105, 43],
  MX: [-102, 23], CAM: [-78, 15], BR: [-52, -12], SAM: [-72, -30], OCE: [146, -27],
};
// Regional discovery points keep the new friends near their documented traditions.
// These are illustrative locations, never claims of exclusive cultural ownership.
const spiritAnchors: Record<string, [number, number]> = {
  adze: [2, 7], asanbosam: [-5, 9], tokoloshe: [28, -27], kalanoro: [47, -19],
  ghul: [42, 23], ifrit: [44, 33], marid: [54, 22], nasnas: [47, 15],
  div: [53, 33], pari: [59, 30], shahmaran: [36, 37], karakoncolos: [35, 42],
  zheztyrnak: [73, 46], albasty: [62, 43], 'zhalmauyz-kempir': [68, 52], 'zhalgyz-koz': [83, 49],
};
// Cached spherical rind lighting: raised lobes, recessed seams and fine skin grain.
// Stable texture coordinates avoid shimmer while the geographic surface rotates.
let rindTexture: HTMLCanvasElement | undefined;
let rindKey="";
function pumpkinRind(view:[number,number]) {
  const key=`${Math.round(view[0]*2)},${Math.round(view[1]*2)}`;
  if(rindTexture && rindKey===key)return rindTexture;
  rindKey=key;
  const yaw=view[0]*Math.PI/180,tilt=view[1]*Math.PI/180;
  const n=320, texture=document.createElement('canvas');texture.width=texture.height=n;
  const context=texture.getContext('2d')!, pixels=context.createImageData(n,n);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const u=(x+.5)/n*2-1,v=(y+.5)/n*2-1,r2=u*u+v*v;
    if(r2>=1)continue;
    const z=Math.sqrt(1-r2);
    const longitude=Math.atan2(u,v*Math.sin(tilt)+z*Math.cos(tilt))+yaw;
    const latitude=Math.asin(-v*Math.cos(tilt)+z*Math.sin(tilt));
    const wave=longitude*8;
    // Tangential normal perturbation makes broad lobes catch light independently.
    const perturb=.36*Math.sin(wave)*(1-v*v);
    let nx=u+perturb*z,ny=v,nz=z-perturb*u;
    const length=Math.hypot(nx,ny,nz);nx/=length;ny/=length;nz/=length;
    const diffuse=Math.max(0,nx*-.45+ny*-.5+nz*.74);
    const groove=Math.pow((1-Math.cos(wave))/2,8)*.2*(1-v*v);
    const grain=(Math.sin(longitude*1771.1+latitude*3311.7)*43758.5453)%1;
    const striae=Math.sin(longitude*370+Math.sin(latitude*18)*2)*.022;
    const light=Math.max(.4,Math.min(1,.47+diffuse*.65-groove+grain*.035+striae));
    const i=(y*n+x)*4;pixels.data[i]=Math.round(255*light);pixels.data[i+1]=Math.round(250*light);pixels.data[i+2]=Math.round(241*light);pixels.data[i+3]=255;
  }
  context.putImageData(pixels,0,0);rindTexture=texture;return texture;
}
// Carvings are geographic polygons, not a screen overlay: projection clips
// their far side and foreshortens the edges along with the continents.
const faceRotation=geoRotation([150,-8]);
function carving(points:[number,number][]):GeoPermissibleObjects {
  const ring=points.map(([px,py])=>{
    const x=px*.85,y=py*.85;
    const z=Math.sqrt(Math.max(.001,1-x*x-y*y));
    return faceRotation.invert!([Math.atan2(x,z)*180/Math.PI,Math.asin(-y)*180/Math.PI]);
  });
  ring.push(ring[0]);
  const polygon={type:'Polygon' as const,coordinates:[ring]};
  if(geoArea(polygon)>2*Math.PI)ring.reverse();
  return polygon;
}
const mouth:[number,number][]=[[-.56,.25],[-.38,.34],[-.28,.3],[-.23,.42],[-.08,.44],[-.08,.34],[.08,.34],[.08,.44],[.23,.42],[.28,.3],[.38,.34],[.56,.25]];
for(let i=1;i<=24;i++){
  const t=i/24,q=1-t;
  mouth.push([q*q*q*.56+3*q*q*t*.37-3*q*t*t*.37-t*t*t*.56,q*q*q*.25+3*q*q*t*.79+3*q*t*t*.79+t*t*t*.25]);
}
const carvings=[carving([[-.12,-.15],[-.5,-.12],[-.36,-.43]]),carving([[.12,-.15],[.5,-.12],[.36,-.43]]),carving(mouth)];
let landPromise: Promise<GeoPermissibleObjects> | undefined;
let orientation: [number, number] = [105, 23];
let previousRegion = '';
let zoomLevel = 0;
const zoomScales = [1, 1.35, 1.75];
// A stable global terrain field: every landmass receives relief, including
// islands and the far hemisphere. Sample once, then project while rotating.
type TerrainPoint = [number, number, number];
function terrainField(land: GeoPermissibleObjects): TerrainPoint[] {
  const result: TerrainPoint[] = [];
  for (let lat = -87; lat <= 85; lat += 4) {
    const step = 4 / Math.max(.22, Math.cos(lat * Math.PI / 180));
    for (let lon = -180; lon < 180; lon += step) {
      if (!geoContains(land, [lon, lat])) continue;
      const noise = Math.abs(Math.sin(lon * 12.9898 + lat * 78.233));
      const polar = Math.abs(lat) > 64;
      const mountains = (lon < -65 && lon > -125 && noise > .55) ||
        (lon > 65 && lon < 105 && lat > 26 && lat < 40) || noise > .96;
      const desert = (lon > -18 && lon < 65 && lat > 15 && lat < 34) ||
        (lon > 115 && lon < 145 && lat < -19 && lat > -32);
      const kind = polar || mountains ? 0 : desert ? 3 : Math.abs(lat) < 18 ? 2 : lat > 48 ? 1 : 4;
      result.push([lon, lat, kind]);
    }
  }
  return result;
}
export function mountGlobe(host: HTMLElement, selectedRegion: string) {
  const canvas = host.querySelector<HTMLCanvasElement>('canvas')!;
  const ctx = canvas.getContext('2d');
  const pins = [...host.querySelectorAll<HTMLButtonElement>('.globe-pin')];
  const picker = host.querySelector<HTMLSelectElement>('.globe-jump')!;
  // Resolve crowding once in geographic space. These anchors never move with view.
  const fixed = new Map<HTMLButtonElement,[number,number]>();
  for(const pin of pins){
    const localOrigin=spiritAnchors[pin.dataset.globeSpirit!];
    const origin=localOrigin || anchors[pin.dataset.region!];let best=origin,bestDistance=-1;
    for(let i=0;i<240;i++){
      const angle=i*2.399963,spread=i===0?0:Math.sqrt(i)*(localOrigin ? .75 : 2.8);
      const candidate:[number,number]=[origin[0]+Math.cos(angle)*spread/Math.max(.45,Math.cos(origin[1]*Math.PI/180)),Math.max(-72,Math.min(76,origin[1]+Math.sin(angle)*spread))];
      const nearest=Math.min(Math.PI,...[...fixed.values()].map(p=>geoDistance(p,candidate)));
      if(nearest>bestDistance){best=candidate;bestDistance=nearest;}
      if(nearest>.32){best=candidate;break;}
    }
    fixed.set(pin,best);pin.dataset.anchor=best.join(',');
  }

  const signal = new AbortController();
  let dead = false, frame = 0, size = 0, land: GeoPermissibleObjects | undefined;
  let start: { x: number; y: number; lon: number; lat: number; id: number } | null = null;
  let dragged = false;
  let restUntil = 0, hovering = false;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let relief: TerrainPoint[] = [];
  if (previousRegion !== selectedRegion) {
    const anchor = anchors[selectedRegion];
    if (anchor) orientation = [anchor[0], Math.max(-15, Math.min(40, anchor[1] - 8))];
    previousRegion = selectedRegion;
  }
  const projection = geoOrthographic().clipAngle(90).precision(0.6);
  const graticule = geoGraticule10();
  const terrain = Array.from({length:6},(_,i)=>{const img=new Image();img.onload=()=>schedule();img.src=publicAssetUrl(`/art/terrain/${i}.webp`);return img;});
  const tintedTerrain = new WeakMap<HTMLImageElement, HTMLCanvasElement>();

  const visible = (p: [number, number]) => geoDistance(p, orientation) < Math.PI / 2 - 0.06;
  const schedule = () => { if (!frame && !dead) frame = requestAnimationFrame(draw); };
  function draw() {
    frame = 0;
    if (!ctx || dead || document.hidden) return;
    const box = host.querySelector<HTMLElement>('.globe-viewport')!;
    size = box.clientWidth;
    if (!size) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(size * dpr)) {
      canvas.width = Math.round(size * dpr); canvas.height = Math.round(size * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const center = size / 2, radius = (size - 20) / 2.28 * zoomScales[zoomLevel];
    projection.translate([center, center]).scale(radius).rotate([-orientation[0], -orientation[1]]);
    const path = geoPath(projection, ctx);
    // Nearly spherical proportions keep the pumpkin full and round.
    ctx.save();ctx.translate(center,center);ctx.scale(1.13,1);ctx.translate(-center,-center);
    const shell=()=>{
      ctx.beginPath();ctx.moveTo(center,center-radius*.94);
      ctx.bezierCurveTo(center-radius*.5,center-radius*1.13,center-radius*1.08,center-radius*.65,center-radius,center+radius*.08);
      ctx.bezierCurveTo(center-radius*.98,center+radius*.72,center-radius*.43,center+radius*1.06,center,center+radius*.94);
      ctx.bezierCurveTo(center+radius*.43,center+radius*1.06,center+radius*.98,center+radius*.72,center+radius,center+radius*.08);
      ctx.bezierCurveTo(center+radius*1.08,center-radius*.65,center+radius*.5,center-radius*1.13,center,center-radius*.94);ctx.closePath();
    };
    // Atmosphere and a soft contact shadow give the globe a toy-like volume.
    ctx.save();
    ctx.fillStyle = '#040b1760'; ctx.filter = 'blur(12px)';
    ctx.beginPath(); ctx.ellipse(center, size * .91, radius * .67, radius * .09, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    const halo = ctx.createRadialGradient(center, center, radius * .9, center, center, radius * 1.16);
    halo.addColorStop(0, '#ff941a45'); halo.addColorStop(.65, '#ff811c18'); halo.addColorStop(1, '#ff811c00');
    ctx.fillStyle = halo; ctx.beginPath();ctx.arc(center, center, radius * 1.16, 0, Math.PI * 2);ctx.fill();
    ctx.save();shell();ctx.clip();
    const ocean = ctx.createRadialGradient(center - radius * .45, center - radius * .6, 5, center, center, radius * 1.2);
    ocean.addColorStop(0, '#ffc05a');ocean.addColorStop(.48, '#ff6627');ocean.addColorStop(1, '#bf3518');
    ctx.fillStyle = ocean;ctx.fillRect(0, 0, size, size);
    // Rind texture replaces the cartographic grid on the pumpkin skin.
    if (land) {
      ctx.save();ctx.translate(0, 5);ctx.beginPath();path(land);ctx.fillStyle = '#254b20';ctx.shadowColor = '#143c1c99';ctx.shadowBlur = 7;ctx.fill();ctx.restore();
      ctx.beginPath();path(land);ctx.lineJoin = 'round';ctx.lineWidth = 3;ctx.strokeStyle = '#a9ce7188';ctx.stroke();
      const soil = ctx.createLinearGradient(0, size * .1, size * .75, size);
      soil.addColorStop(0, '#b9dc80');soil.addColorStop(.4, '#75ac48');soil.addColorStop(1, '#36763e');
      ctx.fillStyle = soil;ctx.fill();ctx.lineWidth = 1;ctx.strokeStyle = '#daf0b277';ctx.stroke();
      // Overlapping relief covers the whole land surface; coast clipping
      // keeps the miniature terrain attached to the actual continents.
      ctx.save();ctx.beginPath();path(land);ctx.clip();
      const projected = relief.flatMap(([lon,lat,kind]) => {
        const point: [number,number] = [lon,lat];
        if (!visible(point)) return [];
        const [x,y] = projection(point)!;
        return [{x,y,kind,depth:Math.cos(geoDistance(point,orientation))}];
      }).sort((a,b)=>a.y-b.y);
      ctx.globalAlpha=.72;
      for (const {x,y,kind,depth} of projected) {
        const img = terrain[kind];
        if (!img.complete || !img.naturalWidth) continue;
        let sprite = tintedTerrain.get(img);
        if (!sprite) {
          sprite = document.createElement('canvas'); sprite.width=img.naturalWidth; sprite.height=img.naturalHeight;
          const tinted=sprite.getContext('2d')!;
          tinted.filter="grayscale(1) sepia(1) saturate(1.7) hue-rotate(52deg)";
          tinted.drawImage(img,0,0); tintedTerrain.set(img,sprite);
        }
        const width = size * .09 * (.55 + .45 * depth);
        const height = width * (.6 + .4 * depth);
        ctx.drawImage(sprite,x-width/2,y-height*.58,width,height);
      }
      ctx.restore();
    }
    // Tiny pumpkin lanterns keep the Halloween language on the rotating surface.
    for (const point of [[116,23],[74,25],[31,23],[24,-22],[-100,33],[-60,-18],[134,-24],[18,48],[120,56],[-75,7]] as [number,number][]) {
      if (!visible(point)) continue;
      const [x,y]=projection(point)!;const r=Math.max(4,size*.011);
      ctx.save();ctx.shadowColor='#ffb24a';ctx.shadowBlur=r*2;
      ctx.fillStyle='#ed994b';ctx.beginPath();ctx.ellipse(x,y,r*1.12,r,0,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
      ctx.strokeStyle='#b97031';ctx.lineWidth=.7;ctx.beginPath();ctx.ellipse(x,y,r*.5,r,0,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle='#4c593e';ctx.fillRect(x-.7,y-r-2,1.4,3);
      ctx.fillStyle='#ffe3a2';ctx.beginPath();ctx.moveTo(x-r*.5,y-r*.1);ctx.lineTo(x-r*.18,y-r*.35);ctx.lineTo(x-r*.18,y+r*.07);ctx.closePath();ctx.fill();
      ctx.beginPath();ctx.moveTo(x+r*.5,y-r*.1);ctx.lineTo(x+r*.18,y-r*.35);ctx.lineTo(x+r*.18,y+r*.07);ctx.closePath();ctx.fill();
      ctx.beginPath();ctx.arc(x,y+r*.12,r*.45,0,Math.PI);ctx.fill();ctx.restore();
    }
    const shade = ctx.createRadialGradient(center-radius*.35,center-radius*.4,radius*.25,center,center,radius);
    shade.addColorStop(0,'#fff4cc10');shade.addColorStop(.72,'#00000000');shade.addColorStop(1,'#4b160b55');ctx.fillStyle=shade;ctx.fillRect(0,0,size,size);
    // Light the entire land-and-sea surface together so terrain follows each lobe.
    ctx.save();ctx.globalCompositeOperation='multiply';
    ctx.drawImage(pumpkinRind(orientation),center-radius,center-radius,radius*2,radius*2);
    ctx.restore();
    const shine=ctx.createRadialGradient(center-radius*.35,center-radius*.5,0,center-radius*.35,center-radius*.5,radius*.52);
    shine.addColorStop(0,'#ffe4a455');shine.addColorStop(.35,'#ffd78320');shine.addColorStop(1,'#ffd78300');
    ctx.fillStyle=shine;ctx.fillRect(0,0,size,size);
    // Geographic meridians are rooted in the pumpkin, so grooves turn with land.
    for(let lon=-180;lon<180;lon+=45){
      const seam={type:'LineString' as const,coordinates:Array.from({length:43},(_,i)=>[lon+Math.sin(i*.22)*1.2,-84+i*4])};
      ctx.beginPath();path(seam);ctx.save();ctx.strokeStyle='#5a210c55';ctx.lineWidth=radius*.011;ctx.shadowColor='#4a190b66';ctx.shadowBlur=radius*.012;ctx.stroke();ctx.restore();
    }
    ctx.save();ctx.shadowColor='#ffdc63';ctx.shadowBlur=radius*.045;
    const flame=ctx.createLinearGradient(0,center-radius*.5,0,center+radius*.65);
    flame.addColorStop(0,'#fff8b8');flame.addColorStop(1,'#ffd963');
    ctx.fillStyle=flame;ctx.strokeStyle='#9b3210';ctx.lineWidth=radius*.022;ctx.lineJoin='round';
    for(const shape of carvings){ctx.beginPath();path(shape);ctx.fill();ctx.stroke();}
    ctx.restore();
    ctx.restore();shell();ctx.strokeStyle='#ffbd6d99';ctx.lineWidth=1.5;ctx.stroke();
    // A shaded, twisted 3D stalk: rings, side facets and cut end rotate in world space.
    const yaw=orientation[0]*Math.PI/180,tilt=orientation[1]*Math.PI/180;
    const projectStem=(x:number,y:number,z:number)=>{
      const horizontal=x*Math.cos(yaw)-z*Math.sin(yaw),forward=x*Math.sin(yaw)+z*Math.cos(yaw);
      return {x:center+radius*horizontal,y:center-radius*(y*Math.cos(tilt)-forward*Math.sin(tilt)),depth:y*Math.sin(tilt)+forward*Math.cos(tilt)};
    };
    const stemPoint=(t:number,angle:number)=>{
      const radius3=.095*(1-.38*t)*(1+.09*Math.cos(angle*8));
      const bend=.14*t*t;
      return projectStem(Math.sin(angle+t*.35)*radius3+bend,.91+t*.33,Math.cos(angle+t*.35)*radius3-bend*.45);
    };
    const faces=[];
    for(let row=0;row<12;row++)for(let col=0;col<24;col++){
      const angle=col*Math.PI/12,t=row/12;
      const corners=[stemPoint(t,angle),stemPoint(t,angle+Math.PI/12),stemPoint(t+1/12,angle+Math.PI/12),stemPoint(t+1/12,angle)];
      const light=.48+.4*Math.cos(angle-yaw+.7)+.08*Math.sin(col*7+row*.8);
      faces.push({corners,depth:corners.reduce((a,p)=>a+p.depth,0)/4,light});
    }
    faces.sort((a,b)=>a.depth-b.depth);
    for(const {corners,light} of faces){
      ctx.beginPath();corners.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();
      ctx.fillStyle=`rgb(${Math.round(95+95*light)},${Math.round(65+70*light)},${Math.round(26+35*light)})`;ctx.fill();
    }
    const topRing=Array.from({length:48},(_,i)=>stemPoint(1,i*Math.PI/24));
    ctx.beginPath();topRing.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle='#d3b375';ctx.fill();ctx.strokeStyle='#614426';ctx.lineWidth=1.3;ctx.stroke();
    for(const fraction of [.35,.65]){
      const top=projectStem(.14,1.24,-.063);
      ctx.beginPath();topRing.forEach((p,i)=>{const x=top.x+(p.x-top.x)*fraction,y=top.y+(p.y-top.y)*fraction;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();ctx.strokeStyle='#926b3e';ctx.lineWidth=.7;ctx.stroke();
    }
    // Bark fibers follow the same twisted stalk and only show on its near side.
    for(let col=0;col<24;col++){
      const angle=col*Math.PI/12;if(Math.cos(angle-yaw)<0)continue;
      ctx.beginPath();for(let row=0;row<=18;row++){const p=stemPoint(row/18,angle+Math.sin(row*.7+col)*.025);row?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);}
      ctx.strokeStyle=col%2?'#49321c88':'#dfb96c66';ctx.lineWidth=col%2?1: .65;ctx.stroke();
    }
    ctx.restore();
    // Screen coordinates are pure projections of permanent geographic anchors.
    const locations=pins.flatMap(pin=>{
      const point=fixed.get(pin)!,distance=geoDistance(point,orientation),depth=Math.cos(distance);
      const shown=depth>.07;pin.hidden=!shown;pin.tabIndex=shown?0:-1;
      if(!shown)return [];
      const [px,py]=projection(point)!;
      const x=center+(px-center)*1.13,y=center+(py-center);
      return [{pin,x,y,diameter:Math.min(60,size*.145)*zoomScales[zoomLevel],depth}];
    });
    // Equal-sized portraits: no perspective/crowding-based shrinkage.
    // Geographic anchors remain stable through rotation and zoom.
    for(const a of locations){
      a.pin.style.width=`${a.diameter}px`;a.pin.style.height=`${a.diameter}px`;
      a.pin.style.opacity=String(Math.min(1,(a.depth-.07)/.14));
      a.pin.style.zIndex=String(Math.round(a.depth*100));
      a.pin.style.transform=`translate(${a.x}px, ${a.y}px) translate(-50%, -50%)`;
    }
    host.dataset.longitude=String(Math.round(orientation[0]));
  }
  function rotate(amount: number) { restUntil=performance.now()+4000; orientation=[orientation[0]+amount,orientation[1]];schedule(); }
  const viewport=host.querySelector<HTMLElement>('.globe-viewport')!;
  const zoomIn=host.querySelector<HTMLButtonElement>('[data-zoom="in"]')!;
  const zoomOut=host.querySelector<HTMLButtonElement>('[data-zoom="out"]')!;
  const updateZoom=()=>{
    zoomIn.disabled=zoomLevel===2;zoomOut.disabled=zoomLevel===0;
    host.querySelector('.zoom-level')!.textContent=`${zoomLevel+1} / 3`;
    host.dataset.zoom=String(zoomLevel+1);schedule();
  };
  for(const [button,delta] of [[zoomIn,1],[zoomOut,-1]] as const)
    scopedListener(button,'click',()=>{zoomLevel=Math.max(0,Math.min(2,zoomLevel+delta));restUntil=performance.now()+4000;updateZoom();},{signal:signal.signal});
  updateZoom();
  const caption=host.parentElement?.querySelector<HTMLElement>('.globe-caption');
  const showCaption=(pin:HTMLButtonElement)=>{
    if(!caption)return;
    caption.querySelector('strong')!.textContent=pin.dataset.previewName || '';
    caption.querySelector('p')!.textContent=pin.dataset.previewDescription || '';
    caption.querySelector('p')!.title=pin.dataset.previewDescription || '';
    caption.classList.add('visible');
  };
  for(const pin of pins){
    // Keep the last introduction visible after touch, without moving the globe.
    for(const event of ['pointerenter','pointerdown','focus'] as const)
      scopedListener(pin,event,()=>showCaption(pin),{signal:signal.signal});
  }
  scopedListener(viewport,'pointerdown',ev=>{
    restUntil=performance.now()+4000;
    (ev.target as Element).closest('.globe-pin')?.classList.add('touched');
    if(ev.button!==0)return;
    start={x:ev.clientX,y:ev.clientY,lon:orientation[0],lat:orientation[1],id:ev.pointerId};dragged=false;
  },{signal:signal.signal});
  scopedListener(viewport,'pointermove',ev=>{
    if(!start||ev.pointerId!==start.id)return;
    const dx=ev.clientX-start.x,dy=ev.clientY-start.y;
    if(!dragged&&Math.abs(dx)>7){dragged=true;viewport.setPointerCapture(ev.pointerId);viewport.classList.add('dragging');}
    if(!dragged)return;
    orientation=[start.lon-dx*180/(size*zoomScales[zoomLevel]),Math.max(-40,Math.min(55,start.lat+dy*65/(size*zoomScales[zoomLevel])))];schedule();
  },{signal:signal.signal});
  const end=()=>{restUntil=performance.now()+4000;start=null;viewport.classList.remove('dragging');pins.forEach(p=>p.classList.remove('touched'));};
  scopedListener(viewport,'pointerup',end,{signal:signal.signal});scopedListener(viewport,'pointercancel',()=>{end();dragged=false;},{signal:signal.signal});
  scopedListener(viewport,'click',ev=>{if(dragged){ev.preventDefault();ev.stopPropagation();dragged=false;}},{capture:true,signal:signal.signal});
  scopedListener(viewport,'keydown',ev=>{
    if(ev.target!==viewport)return;
    if(ev.key==='ArrowLeft'||ev.key==='ArrowRight'){ev.preventDefault();rotate(ev.key==='ArrowLeft'?-35:35);}
  },{signal:signal.signal});
  scopedListener(picker,'change',()=>{
    const pin=pins.find(p=>p.dataset.region===picker.value);if(!pin)return;
    orientation=[anchors[picker.value][0],Math.max(-15,Math.min(40,anchors[picker.value][1]-8))];schedule();pin.click();
  },{signal:signal.signal});
  const observer=new ResizeObserver(schedule);observer.observe(viewport);
  scopedListener(document,'visibilitychange',schedule,{signal:signal.signal});
  landPromise ??= fetch('/geo/land.json').then(r=>{if(!r.ok)throw new Error('Land unavailable');return r.json();}).catch(err=>{landPromise=undefined;throw err;});
  landPromise.then(value=>{if(dead)return;land=value;relief=terrainField(value);schedule();}).catch(()=>{if(!dead){const caption=host.parentElement?.querySelector('.globe-caption');if(caption){caption.querySelector('p')!.textContent=t("Globe details unavailable. You can still choose a region.");caption.classList.add('visible');}}});
  scopedListener(viewport,'pointerenter',ev=>{if(ev.pointerType==='mouse')hovering=true;},{signal:signal.signal});
  scopedListener(viewport,'pointerleave',()=>{hovering=false;},{signal:signal.signal});
  let lastTick=performance.now();
  const spin=setInterval(()=>{
    const now=performance.now(),elapsed=Math.min(now-lastTick,150);lastTick=now;
    if(dead||document.hidden||reduced.matches||start||hovering||now<restUntil||document.querySelector('dialog[open], .play-lock')||viewport.querySelector(focusedPinSelector))return;
    orientation=[orientation[0]+elapsed*.002,orientation[1]];schedule();
  },80);
  schedule();
  return ()=>{dead=true;clearInterval(spin);cancelAnimationFrame(frame);signal.abort();observer.disconnect();};
}
