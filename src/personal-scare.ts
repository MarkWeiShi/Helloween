import {t, msg} from "../shared/i18n.mjs";
import {locale} from './i18n';
import { api } from './api';
import { recordReaction } from './reaction-capture';
import { mountTransformation, markTransformationPlayed } from './transformation-player';
import { prepareMicrophone } from './microphone';
import { personalScareScore } from '../shared/reactions.mjs';
export type SharedReaction = {inviteId: string};
type Result = { score: number | null; meanHz: number | null; meanRms: number | null };
const memory = new Map<string, Result>();
const key = (player: string, spirit: string) => `boo:personal-scare:v1:${player}:${spirit}`;
export function readScare(player: string, spirit: string): Result | undefined {
  const id = key(player, spirit);
  try { const raw = localStorage.getItem(id); if (raw) { const result = JSON.parse(raw); if (result && (result.score === null || Number.isFinite(result.score))) return result; } } catch {}
  return memory.get(id);
}
export function scareLabel(result: Result | undefined) {
  return result?.score != null ? msg`My Scariness Score ${result.score} / 100` : result ? t("No Voice Detected") : t("My Scariness Score — / 100");
}
export function mountPersonalScare(root: HTMLElement, player: string, spirit: string, _scareSrc: string, lock: (value: boolean) => void, sound: () => boolean = () => false, toggleSound?: () => void, shared?: SharedReaction) {
  const button = root.querySelector<HTMLButtonElement>('[data-play-transform]')!;
  const status = root.querySelector<HTMLElement>('[data-personal-scare]')!;
  let dead = false, busy = false, generation = 0, capture: Awaited<ReturnType<typeof prepareMicrophone>> | undefined;
  let first = false, sent = false, sending = false;
  let recording: ReturnType<typeof recordReaction> | undefined;
  let pending: {audio:string;mime:string;durationMs:number;consent:boolean;language:string;amplitudeRms:number|null;score:number|null;meanHz:number|null;peakHz:number|null;frames:number} | undefined;
  const controls = document.createElement('div'); controls.className = 'reaction-capture-controls';
  const cancel = document.createElement('button'); cancel.className = 'button text-button'; cancel.textContent = t("取消录音及发送"); cancel.hidden = true;
  const retry = document.createElement('button'); retry.className = 'button secondary'; retry.textContent = t("重试发送录音"); retry.hidden = true;
  controls.append(cancel, retry); status.after(controls);
  const label = () => scareLabel(readScare(player, spirit));
  async function upload() {
    if (!pending || !shared || dead || sending) return;
    sending = true; retry.hidden = true; cancel.hidden = true; button.disabled = true;
    status.textContent = t("Sending…");
    try {
      const result = await api<{alreadySent?: boolean; full?: boolean}>(`/invites/${shared.inviteId}/audio`, pending);
      pending = undefined; sent = true;
      if (!dead) status.textContent = result.full ? t("Link full · not sent") : result.alreadySent ? t("Already sent") : t("Voice sent");
    } catch {
      if (!dead) { status.textContent = t("Send failed · retry"); retry.hidden = false; cancel.hidden = false; }
    } finally { sending = false; if (!dead) button.disabled = false; }
  }
  retry.onclick = () => { void upload(); };
  cancel.onclick = () => { release(); pending = undefined; shared = undefined; retry.hidden = true; cancel.hidden = true; status.textContent = t("Recording cancelled"); };
  let microphoneRequest: AbortController | undefined;
  const release = () => { generation++; microphoneRequest?.abort(); microphoneRequest = undefined; recording?.cancel(); recording = undefined; capture?.stop(); capture = undefined; cancel.hidden = true; busy = false; button.disabled = false; };
  const motion = mountTransformation(root.querySelector<HTMLElement>('.character-stage')!, spirit, {
    sound: () => true, fillCharacter: false,
    onIntroEnd: () => { button.hidden = false; if(first && !capture && !readScare(player,spirit)) status.textContent=t("No Voice Detected"); },
    onStart: () => { markTransformationPlayed(player, spirit); status.textContent = first ? (capture ? t("Get ready…") : t("Mic unavailable")) : label(); },
    onPause: () => { release(); button.hidden = false; if (!dead && document.hidden && !sending) { status.textContent = pending ? t("Not sent · retry") : t("Paused · replay"); if (pending) { retry.hidden = false; cancel.hidden = false; } } },
    onError: () => { button.hidden = false; status.textContent = t("Video failed · retry"); },
    onCaptureStart: () => {
      if (!first || !capture) return;
      const ticket = generation;
      const shouldSend = !!shared && !sent && !pending;
      let audio: Promise<Blob | null> = Promise.resolve(null);
      if (shouldSend) {
        try { recording = recordReaction(capture.stream); audio = recording.result; }
        catch { /* Local scoring still works without MediaRecorder. */ }
      }
      status.textContent = shouldSend && recording ? t("● 5s · record & send") : t("● 5s · local only");
      cancel.hidden = !recording;
      void Promise.all([capture.measure(5000, false), audio]).then(async ([m, blob]) => {
        if (dead || ticket !== generation) return;
        capture?.stop();
        const result = {score: personalScareScore(m.meanHz, m.meanRms), meanHz:m.meanHz, meanRms:m.meanRms};
        memory.set(key(player, spirit), result);
        try { localStorage.setItem(key(player, spirit), JSON.stringify(result)); } catch {}
        status.textContent = scareLabel(result); capture = undefined; recording = undefined; cancel.hidden = true;
        if (!shouldSend || !shared) return;
        if (!blob?.size || blob.size > 512000) { status.textContent = t("No recording · retry"); return; }
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (dead || ticket !== generation || !shared) return;
        let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
        pending = {audio:btoa(binary),mime:blob.type.split(';')[0],durationMs:5000,consent:true,language:locale,amplitudeRms:m.amplitudeRms,score:result.score,meanHz:m.meanHz,peakHz:m.peakHz,frames:m.frames};
        await upload();
      });
    },
  });
  async function play() {
    if (busy || dead || sending || pending) return;
    // Pause the old playback before preparing a new microphone session.
    motion.pause(); busy = true; button.disabled = true; button.hidden = true;
    first = !readScare(player, spirit) || (!!shared && !sent);
    const ticket = generation;
    if (first) {
      status.textContent = t("Starting mic…");
      let expired = false;
      const request = new AbortController(); microphoneRequest = request;
      const pending = prepareMicrophone(request.signal);
      void pending.then(m => { if (dead || expired || ticket !== generation) m.stop(); }, () => {});
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const prepared = await Promise.race([pending, new Promise<never>((_, reject) => { timer = setTimeout(() => { expired = true; request.abort(); reject(Error('Microphone timeout')); }, 8000); })]);
        if (dead || ticket !== generation) { prepared.stop(); return; }
        capture = prepared;
      }
      catch { status.textContent = t("Mic unavailable"); }
      finally { clearTimeout(timer); }
    }
    if (dead || ticket !== generation) return;
    const started = await motion.play();
    if (dead || ticket !== generation) return;
    if (!started) { capture?.stop(); capture = undefined; }
    if (!dead) { busy = false; button.disabled = false; if (!started) button.hidden = false; }
  }
  button.onclick = () => { void play(); };
  lock(false);
  void play();
  return () => { dead = true; pending = undefined; release(); controls.remove(); motion.dispose(); lock(false); };
}
