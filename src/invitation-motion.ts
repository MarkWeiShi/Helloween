import { api } from "./api";
import { mountTransformation } from "./transformation-player";

export function mountInvitationMotion(root: HTMLElement, inviteId: string, spiritId: string, sound: () => boolean, toggleSound?: () => void) {
const replay = root.querySelector<HTMLButtonElement>('[data-replay]')!;
let disposed = false;
const consent = root.querySelector<HTMLElement>('.invitation-consent')!;
const status = root.querySelector<HTMLElement>('.recording-status')!;
const start = root.querySelector<HTMLButtonElement>('[data-record-start]');
const cancel = root.querySelector<HTMLButtonElement>('[data-cancel-record]')!;
const retry = root.querySelector<HTMLButtonElement>('[data-retry-audio]')!;
let stream: MediaStream | undefined, recorder: MediaRecorder | undefined;
let recordingTimer: ReturnType<typeof setTimeout> | undefined;
let armed = false, cancelled = false, busy = false, recordingStarted = false;
let pendingAudio: {audio:string;mime:string;durationMs:number;consent:boolean} | undefined;
let requestGeneration = 0;
function releaseMic() { stream?.getTracks().forEach(track => track.stop()); stream = undefined; }
function cancelRecording() {
  requestGeneration++; armed = false; cancelled = true;
  clearTimeout(recordingTimer);
  if (recorder?.state === 'recording') recorder.stop();
  releaseMic(); cancel.hidden = true;
  pendingAudio = undefined; retry.hidden = true;
}
async function upload() {
  if (!pendingAudio || disposed) return;
  retry.hidden = true; cancel.hidden = true; replay.disabled = true;
  status.textContent = '正在发送给邀请人…';
  try {
    await api(`/invites/${inviteId}/audio`, pendingAudio);
    pendingAudio = undefined;
    if (!disposed) status.textContent = '已将 5 秒惊吓录音发送给邀请人。';
  } catch {
    if (!disposed) { status.textContent = '发送失败，录音暂留本页。可重试发送，或取消删除。'; retry.hidden = false; cancel.hidden = false; }
  } finally { replay.disabled = false; }
}
function beginRecording() {
  if (!armed || !stream || disposed || recordingStarted) return;
  armed = false; recordingStarted = true;
  const chunks: Blob[] = [];
  cancelled = false;
  const mime = ['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
  try {
    recorder = new MediaRecorder(stream, {...(mime ? {mimeType:mime} : {}), audioBitsPerSecond:64000});
    const activeRecorder = recorder;
    const recordingGeneration = requestGeneration;
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => { cancelRecording(); status.textContent = '录音失败，未发送任何声音。'; replay.disabled = false; };
    recorder.onstop = async () => {
      releaseMic(); clearTimeout(recordingTimer);
      if (cancelled || disposed || recordingGeneration !== requestGeneration) { replay.disabled = false; return; }
      const blob = new Blob(chunks, {type:activeRecorder.mimeType});
      if (!blob.size || blob.size > 512000) { status.textContent = '录音无效，未发送。'; replay.disabled = false; cancel.hidden = true; return; }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (cancelled || disposed || recordingGeneration !== requestGeneration) return;
      let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
      pendingAudio = {audio:btoa(binary),mime:blob.type.split(';')[0],durationMs:5000,consent:true};
      await upload();
    };
    recorder.start();
    replay.disabled = true;
    status.textContent = '● 正在录音 5 秒，随后自动发送给邀请人…';
    recordingTimer = setTimeout(() => { if (recorder?.state === 'recording') recorder.stop(); }, 5000);
  } catch { cancelRecording(); status.textContent = '此浏览器无法录音，未发送任何声音。'; }
}
async function startWithConsent() {
  if (busy) return;
  busy = true; if (start) start.disabled = true;
  const ticket = ++requestGeneration;
  try {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw Error('unsupported');
    status.textContent = '请允许麦克风访问；变身前不会开始录音。';
    const capture = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
    if (disposed || ticket !== requestGeneration || document.hidden) { capture.getTracks().forEach(t=>t.stop()); return; }
    stream = capture; armed = true; recordingStarted = false; cancelled = false; cancel.hidden = false;
    await play();
  } catch { status.textContent = '麦克风未获授权或不可用。请允许麦克风后重试，或关闭邀请。'; }
  finally { busy = false; if (start) start.disabled = false; }
}
if (start) start.onclick = startWithConsent;
cancel.onclick = () => { cancelRecording(); replay.disabled = false; status.textContent = '已取消，录音不会发送。'; };
retry.onclick = () => { void upload(); };
const motion = mountTransformation(root.querySelector<HTMLElement>('.invitation-stage')!, spiritId, {
  sound, toggleSound, onReveal: beginRecording, onIntroEnd: () => root.classList.add('finished'),
  onPause: () => { if (busy || armed || recorder?.state === 'recording') { cancelRecording(); replay.disabled = false; status.textContent = '播放已暂停，录音已取消，未发送。'; } else if (!disposed && document.hidden) status.textContent = '播放已暂停；点击再看一次可重新观看。'; },
  onError: () => { cancelRecording(); replay.disabled = false; status.textContent = '变身素材暂不可用，请重试播放。'; },
});
async function play() {
  // The shared player cancels prior playback; preserve consent for this new run only.
  const recordingArmed = armed; armed = false;
  const generation = requestGeneration;
  const started = motion.play(); armed = recordingArmed;
  root.classList.remove('finished');
  consent.hidden = true; replay.style.display = 'block';
  if (!await started && !disposed && generation === requestGeneration) { cancelRecording(); replay.disabled = false; }
}
root.querySelector<HTMLButtonElement>('[data-invite-play]')!.onclick = () => { cancelRecording(); void play(); };
replay.onclick = () => { cancelRecording(); status.textContent = '再次播放，不录音或发送。'; void play(); };
return () => { disposed = true; cancelRecording(); motion.dispose(); };
}
