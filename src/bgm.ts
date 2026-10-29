/** One decoded buffer and one source: sample-accurate, gapless background music. */
export function createBgm(canPlay: () => boolean) {
  let context: AudioContext | undefined, buffer: AudioBuffer | undefined;
  let source: AudioBufferSourceNode | undefined, gain: GainNode | undefined;
  let loading: Promise<void> | undefined, offset = 0, startedAt = 0;
  const allowed = () => canPlay() && !document.hidden && !document.querySelector('dialog[open]');
  function sync() {
    if (!context || !buffer) return;
    if (!allowed()) {
      if(source){ offset=(offset+context.currentTime-startedAt)%buffer.duration;source.stop();source.disconnect();source=undefined; }
      return;
    }
    if(source || context.state !== 'running')return;
    source=context.createBufferSource();source.buffer=buffer;source.loop=true;
    if(!gain){gain=context.createGain();gain.connect(context.destination);}
    gain.gain.setValueAtTime(.22,context.currentTime);
    source.connect(gain);
    startedAt=context.currentTime;source.start(0,offset);
  }
  function start(audioContext: AudioContext) {
    context=audioContext;
    loading ??= fetch('/audio/halloween-loop.mp3').then(r=>{if(!r.ok)throw Error('BGM unavailable');return r.arrayBuffer();})
      .then(bytes=>audioContext.decodeAudioData(bytes)).then(decoded=>{buffer=decoded;sync();})
      .catch(()=>{loading=undefined;});
    sync();
  }
  document.addEventListener('visibilitychange',sync);
  window.addEventListener('boo:sound',sync);
  // Pause before microphone/video use in any dialog; resume when it closes.
  new MutationObserver(sync).observe(document.querySelector('#overlay-root')!,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
  return {start,sync};
}
