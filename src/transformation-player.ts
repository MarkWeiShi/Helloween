import {fetchJson} from '../packages/ghost-sdk/request-signal';
import {publicAssetData} from './public-assets';
import {t} from "../shared/i18n.mjs";
export type Transformation = { entrance: string; loop: string; entranceAlpha?: string; loopAlpha?: string; poster: string; duration: number; loopDuration: number; revealAt: number };
export function validTransformation(value: unknown): value is Transformation {
  const v = value as Transformation;
  return !!v && [v.entrance, v.loop, v.poster].every(p => typeof p === 'string' && /^\/(?:releases\/[a-f0-9]{20}\/)?art\/transformations\/[a-z0-9-]+\/[a-z0-9.-]+$/.test(p)) && [v.duration, v.loopDuration, v.revealAt].every(Number.isFinite) && v.duration > 0 && v.loopDuration > 0 && v.revealAt >= 0 && v.revealAt < v.duration;
}
let manifest: Promise<Record<string, Transformation>> | undefined;
export async function loadTransformation(id: string) {
  if (!manifest) manifest = fetchJson<{version:number;characters:Record<string,Transformation>}>('/art/transformations/manifest.json', {cache:'no-cache'},10000).then(data => {
    if (data.version !== 1 || !data.characters) throw Error('Invalid transformation manifest');
    return data.characters as Record<string, Transformation>;
  }).catch(error => { manifest = undefined; throw error; });
  const entry = (await manifest)[id];
  if (!validTransformation(entry)) { manifest = undefined; throw Error('Transformation not ready'); }
  return publicAssetData(entry);
}
const seen = new Set<string>();
const seenKey = (player: string, id: string) => `boo:transformation:v1:${player}:${id}`;
export function hasPlayedTransformation(player: string, id: string) {
  const key = seenKey(player, id);
  try { return localStorage.getItem(key) === '1' || seen.has(key); } catch { return seen.has(key); }
}
export function markTransformationPlayed(player: string, id: string) {
  const key = seenKey(player, id); seen.add(key);
  try { localStorage.setItem(key, '1'); } catch {}
}
export function mountTransformation(stage: HTMLElement, id: string, options: {
  sound: () => boolean; fillCharacter?: boolean; toggleSound?: () => void; onReveal?: () => void; onCaptureStart?: () => void; onIntroEnd?: () => void; onStart?: () => void; onError?: () => void; onPause?: () => void;
}) {
  const host = document.createElement('div'); host.className = 'transformation-player'; if(options.fillCharacter)host.classList.add('fill-character');
  const poster = document.createElement('img'); poster.alt = ''; poster.hidden = true;
  const canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 1280;
  const videos = [document.createElement('video'), document.createElement('video')];
  const [intro, loop] = videos;
  for (const media of videos) { media.playsInline = true; media.preload = 'auto'; media.crossOrigin = 'anonymous'; media.hidden = true; }
  intro.dataset.phase = 'intro'; loop.dataset.phase = 'loop'; loop.loop = true;
  let video = intro;
  const soundButton = document.createElement('button'); soundButton.type = 'button'; soundButton.className = 'transformation-sound button secondary';
  soundButton.onclick = () => { options.toggleSound?.(); audio(); };
  soundButton.hidden = !options.toggleSound;
  const loading = document.createElement('div'); loading.className = 'transformation-loading';
  loading.setAttribute('role','status');
  const spinner = document.createElement('span'); spinner.className = 'transformation-spinner'; spinner.setAttribute('aria-hidden','true');
  const loadingLabel = document.createElement('span'); loadingLabel.textContent = 'Loading…';
  loading.append(spinner,loadingLabel);
  host.append(poster, canvas, ...videos, soundButton, loading); stage.append(host);
  // Place immersive playback directly in the dialog's top layer, outside stage clipping.
  const immersive = stage.closest?.<HTMLDialogElement>('dialog.character-immersive');
  const controls = immersive ? stage.closest<HTMLElement>('.globe-character') : null;
  if (immersive) {
    host.classList.add('immersive-video-layer');
    immersive.append(host);
    // A manual popover paints in the browser top layer, above even transformed,
    // clipped or independently stacked UI frames. It stays inside the dialog's
    // DOM for lifecycle/inert handling, without taking focus or catching input.
    if (typeof host.showPopover === 'function') {
      host.setAttribute('popover', 'manual');
      try { host.showPopover(); } catch { host.removeAttribute('popover'); }
    }
    stage.classList.add('has-immersive-player');
    // Open the transparent UI after the video so its existing buttons and labels
    // paint above the full-screen media, without moving or cloning any controls.
    if (controls) {
      controls.classList.add('immersive-controls-layer');
      if (typeof controls.showPopover === 'function') {
        controls.setAttribute('popover', 'manual');
        try { controls.showPopover(); } catch { controls.removeAttribute('popover'); }
      }
    }
  }
  const needsMediaClass=typeof CSS==='undefined' || !CSS.supports('selector(:has(*))');
  const setMedia=(value:boolean)=>{host.classList.toggle('has-media',value);if(needsMediaClass)stage.classList.toggle('compat-has-media',value);};
  poster.onerror = () => { poster.hidden = true; if (canvas.hidden) setMedia(false); };
  const gl = canvas.getContext('webgl', {alpha:true, premultipliedAlpha:false});
  let dead = false, ticket = 0, frame = 0, revealed = false, captureStarted = false, entry: Transformation | undefined, phase: 'idle'|'intro'|'loop' = 'idle';
  let program: WebGLProgram | null = null, buffer: WebGLBuffer | null = null, texture: WebGLTexture | null = null;
  const shaders: WebGLShader[] = [];
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  let ready = false;
  if (gl) try {
    program = gl.createProgram();
    for (const [type, source] of [
      [gl.VERTEX_SHADER, 'attribute vec2 p;varying vec2 uv;void main(){uv=vec2((p.x+1.0)*0.5,(1.0-p.y)*0.5);gl_Position=vec4(p,0.,1.);}'],
      [gl.FRAGMENT_SHADER, 'precision mediump float;varying vec2 uv;uniform sampler2D image;uniform vec4 crop;void main(){vec4 c=texture2D(image,crop.xy+uv*crop.zw);float d=c.g-max(c.r,c.b);float a=1.-smoothstep(.10,.34,d);c.g=min(c.g,max(c.r,c.b)+.035);gl_FragColor=vec4(c.rgb,a);}'],
    ] as const) {
      const shader = gl.createShader(type)!; shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error('Shader failed');
      gl.attachShader(program!, shader);
    }
    gl.linkProgram(program!); if (!gl.getProgramParameter(program!, gl.LINK_STATUS)) throw Error('Program failed'); gl.useProgram(program);
    buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    const location = gl.getAttribLocation(program!, 'p'); gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D,p,gl.LINEAR);
    gl.viewport(0,0,canvas.width,canvas.height); ready = true;
  } catch { ready = false; }
  // Embedded browsers and disabled GPU acceleration can reject WebGL entirely.
  // Keep the same video/audio flow and composite the green background in 2D.
  const software = !gl ? canvas.getContext('2d', {willReadFrequently:true}) : null;
  if (software) { canvas.width = 360; canvas.height = 640; ready = true; }
  function pause() { clearTimeout(stallTimer); phase = 'idle'; ticket++; videos.forEach(media => media.pause()); cancelAnimationFrame(frame); options.onPause?.(); }
  function fail() { pause(); phase = 'idle'; canvas.hidden = true; loading.hidden = false; poster.hidden = !entry || !revealed; setMedia(!!entry && revealed); options.onError?.(); }
  const sample = document.createElement('canvas'); sample.width=96;sample.height=170;
  const sampleContext=options.fillCharacter?sample.getContext('2d',{willReadFrequently:true}):null;
  function framing() {
    let crop=[0,0,1,1];
    if(sampleContext){
      sampleContext.drawImage(video,0,0,96,170);
      const pixels=sampleContext.getImageData(0,0,96,170).data;
      let left=96,right=0,top=170,bottom=0;
      for(let y=0;y<170;y++)for(let x=0;x<96;x++){
        const i=(y*96+x)*4;
        if(pixels[i+1]-Math.max(pixels[i],pixels[i+2])<26){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
      }
      if(right>left && bottom>top){
        const aspect=stage.clientWidth/Math.max(1,stage.clientHeight);
        const sourceAspect=video.videoWidth/video.videoHeight;
        const h=Math.max((bottom-top+1)/170*1.08,(right-left+1)/96*sourceAspect/aspect*1.08);
        const w=h*aspect/sourceAspect;
        crop=[(left+right+1)/192-w/2,(top+bottom+1)/340-h/2,w,h];
      }
    }
    return crop;
  }
  function draw() {
    if (dead || video.paused || video.ended) return;
    if (phase === 'intro' && !captureStarted && entry && video.currentTime >= 3) { captureStarted = true; options.onCaptureStart?.(); }
    if (phase === 'intro' && !revealed && entry && video.currentTime >= entry.revealAt) { revealed = true; options.onReveal?.(); }
    if (ready && video.readyState >= 2) try {
      const crop = framing();
      if (gl) {
        gl.uniform4fv(gl.getUniformLocation(program!,'crop'),crop);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,video); gl.drawArrays(gl.TRIANGLES,0,6);
      } else if (software) {
        software.clearRect(0,0,canvas.width,canvas.height);
        software.drawImage(video,crop[0]*video.videoWidth,crop[1]*video.videoHeight,crop[2]*video.videoWidth,crop[3]*video.videoHeight,0,0,canvas.width,canvas.height);
        const image=software.getImageData(0,0,canvas.width,canvas.height), data=image.data;
        for(let i=0;i<data.length;i+=4){
          const other=Math.max(data[i],data[i+2]);
          const t=Math.max(0,Math.min(1,((data[i+1]-other)/255-.10)/.24));
          data[i+3]=Math.round(data[i+3]*(1-t*t*(3-2*t)));
          data[i+1]=Math.min(data[i+1],other+9);
        }
        software.putImageData(image,0,0);
      }
      canvas.hidden = false; if(video.readyState >= 3) loading.hidden = true; setMedia(true); poster.hidden = true;
    } catch { fail(); return; }
    frame = requestAnimationFrame(draw);
  }
  const attempts = new WeakMap<HTMLVideoElement, number>();
  async function source(media: HTMLVideoElement, generation: number) {
    attempts.set(media, generation); media.muted = !options.sound(); media.volume = .65;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([media.play(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('Playback timeout')), 10000); })]); }
    finally { clearTimeout(timer); }
    if (dead || generation !== ticket || document.hidden) {
      // A stale play must not pause a newer play using the same element.
      if (attempts.get(media) === generation) media.pause();
      return false;
    }
    clearTimeout(stallTimer); video = media; cancelAnimationFrame(frame); draw(); return true;
  }
  async function play() {
    clearTimeout(stallTimer); ticket++; videos.forEach(media => media.pause()); cancelAnimationFrame(frame); const generation = ticket; phase = 'intro'; revealed = false; captureStarted = false;
    // Hide the previous result while a replay or retry waits for its first frame.
    poster.hidden = true; canvas.hidden = true; loading.hidden = false; setMedia(false);
    try {
      entry = await loadTransformation(id);
      if (dead || generation !== ticket || document.hidden) return false;
      poster.src = entry.poster;
      if (!ready) { fail(); return false; }
      // Fetch both sources at the beginning, keeping the final intro frame while the loop becomes ready.
      if (intro.getAttribute('src') !== entry.entrance || intro.error) { intro.src = entry.entrance; intro.load(); }
      if (loop.getAttribute('src') !== entry.loop || loop.error) { loop.src = entry.loop; loop.load(); }
      intro.currentTime = 0; loop.currentTime = 0; video = intro;
      if (!await source(intro, generation)) return false;
      options.onStart?.(); return true;
    } catch { if (!dead && generation === ticket) fail(); return false; }
  }
  intro.onended = () => {
    if (phase !== 'intro' || !entry || dead || document.hidden || video !== intro) return;
    options.onIntroEnd?.();
    phase = 'loop';
    const generation = ticket;
    void source(loop, generation).catch(() => { if (!dead && generation === ticket) fail(); });
  };
  for (const media of videos) {
    media.onerror = () => { if (!dead && media === video) fail(); };
    media.onwaiting = () => { if (media !== video) return; loading.hidden = false; clearTimeout(stallTimer); stallTimer = setTimeout(() => { if (!dead) fail(); }, 10000); };
    media.onplaying = () => { if (media === video) clearTimeout(stallTimer); };
  }
  const hidden = () => { if (document.hidden) pause(); };
  function audio() {
    for (const media of videos) { media.muted = !options.sound(); media.volume = .65; }
    soundButton.textContent = options.sound() ? t("声音：开") : t("声音：关");
    soundButton.setAttribute('aria-label', options.sound() ? t("关闭变身声音") : t("开启变身声音"));
    soundButton.setAttribute('aria-pressed', String(options.sound()));
  }
  audio();
  document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', pause); window.addEventListener('boo:sound', audio);
  return {play, pause, dispose() {
    if (dead) return; dead = true; setMedia(false); pause(); for (const media of videos) { media.onended = null; media.onerror = null; media.onwaiting = null; media.onplaying = null; media.removeAttribute('src'); media.load(); }
    document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', pause); window.removeEventListener('boo:sound', audio);
    if (gl) { gl.deleteTexture(texture); gl.deleteBuffer(buffer); gl.deleteProgram(program); shaders.forEach(s => gl.deleteShader(s)); gl.getExtension('WEBGL_lose_context')?.loseContext(); }
    if (immersive) stage.classList.remove('has-immersive-player');
    if (controls) {
      if (typeof controls.hidePopover === 'function' && controls.matches(':popover-open')) controls.hidePopover();
      controls.removeAttribute('popover'); controls.classList.remove('immersive-controls-layer');
    }
    if (typeof host.hidePopover === 'function' && host.matches(':popover-open')) host.hidePopover();
    host.remove();
  }};
}
