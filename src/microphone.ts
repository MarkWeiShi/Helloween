import {audioContext} from './browser-compat';
import {t} from "../shared/i18n.mjs";
import { detectPitch } from '../shared/reactions.mjs';
export async function prepareMicrophone(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Microphone cancelled', 'AbortError');
  if (!navigator.mediaDevices?.getUserMedia) throw new Error(t("Microphone unavailable. Please use HTTPS and a supported browser."));
  const stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:false},video:false});
  let context: AudioContext | undefined;
  const abort = () => { stream.getTracks().forEach(t=>t.stop()); void context?.close().catch(() => {}); };
  signal?.addEventListener('abort', abort, {once:true});
  try {
    if (signal?.aborted) throw new DOMException('Microphone cancelled', 'AbortError');
    context = audioContext(); await context.resume();
    if (signal?.aborted) throw new DOMException('Microphone cancelled', 'AbortError');
  } catch (err) { abort(); throw err; }
  finally { signal?.removeEventListener('abort', abort); }
  const activeContext = context;
  const source = activeContext.createMediaStreamSource(stream), analyser = activeContext.createAnalyser();
  analyser.fftSize = 2048; source.connect(analyser);
  let stopped = false, timer: ReturnType<typeof setInterval> | undefined;
  let cancel: (() => void) | undefined;
  const stop = () => { if(stopped)return; stopped = true; cancel?.(); cancel=undefined; clearInterval(timer); stream.getTracks().forEach(t=>t.stop()); source.disconnect(); void activeContext.close(); };
  return {
    stop,
    stream,
    echoCancellation: stream.getAudioTracks()[0]?.getSettings?.().echoCancellation === true,
    measure: (duration = 3500, releaseStream = true) => new Promise<{meanHz:number|null;peakHz:number|null;frames:number;meanRms:number|null;amplitudeRms:number|null}>(resolve => {
      cancel=()=>resolve({meanHz:null,peakHz:null,frames:0,meanRms:null,amplitudeRms:null});
      const values:number[] = [], levels:number[] = [], amplitudes:number[] = [], data = new Float32Array(analyser.fftSize);
      const start = performance.now();
      timer = setInterval(() => {
        if (!stopped && !document.hidden) { analyser.getFloatTimeDomainData(data); amplitudes.push(Math.sqrt(data.reduce((sum,v)=>sum+v*v,0)/data.length)); const hz=detectPitch(data,activeContext.sampleRate); if(hz){values.push(hz);levels.push(Math.sqrt(data.reduce((sum,v)=>sum+v*v,0)/data.length));} }
        if(stopped || document.hidden || performance.now()-start >= duration) {
          const interrupted=stopped || document.hidden; cancel=undefined; clearInterval(timer); if(releaseStream)stop();
          const valid=!interrupted && values.length >= 5;
          resolve({meanHz:valid?Math.round(values.reduce((a,b)=>a+b,0)/values.length):null,peakHz:valid?Math.max(...values):null,frames:valid?values.length:0,meanRms:valid?levels.reduce((a,b)=>a+b,0)/levels.length:null,amplitudeRms:!interrupted && amplitudes.length>=5?amplitudes.reduce((a,b)=>a+b,0)/amplitudes.length:null});
        }
      },50);
    }),
  };
}

let microphoneChoiceMemory='';
export function microphoneChoice(){try{return localStorage.getItem('boo:microphone-choice:v1')||microphoneChoiceMemory;}catch{return microphoneChoiceMemory;}}
export function saveMicrophoneChoice(value:string){microphoneChoiceMemory=value;try{localStorage.setItem('boo:microphone-choice:v1',value);}catch{}}
