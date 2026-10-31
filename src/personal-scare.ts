import {trackFunnel} from './engagement';
import {submitGlobalScare} from './global-scare';
import {setInert} from './browser-compat';
import {t, msg} from "../shared/i18n.mjs";
import {locale} from './i18n';
import { api } from './api';
import { recordReaction } from './reaction-capture';
import { mountTransformation, markTransformationPlayed } from './transformation-player';
import { prepareMicrophone, microphoneChoice, saveMicrophoneChoice } from './microphone';
import { personalScareScore } from '../shared/reactions.mjs';
export type SharedReaction = {inviteId: string;recordingFull?:boolean};
type Result = { score: number | null; meanHz: number | null; meanRms: number | null; globalSubmitted?: boolean };
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
export function mountPersonalScare(root: HTMLElement, player: string, spirit: string, _scareSrc: string, lock: (value: boolean) => void, sound: () => boolean = () => false, toggleSound?: () => void, shared?: SharedReaction, requireComplete = false) {
  const button = root.querySelector<HTMLButtonElement>('[data-play-transform]')!;
  const status = root.querySelector<HTMLElement>('[data-personal-scare]')!;
  let dead = false, busy = false, generation = 0, capture: Awaited<ReturnType<typeof prepareMicrophone>> | undefined;
  let first = false, sent = false, sending = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined, retryAttempts = 0;
  let recording: ReturnType<typeof recordReaction> | undefined;
  let pending: {scoringVersion:number;echoCancellation:boolean;meanRms:number|null;audio:string;mime:string;durationMs:number;consent:boolean;language:string;amplitudeRms:number|null;score:number|null;meanHz:number|null;peakHz:number|null;frames:number} | undefined;
  let countdownTimer:ReturnType<typeof setInterval>|undefined;
  const stopCountdown=()=>{clearInterval(countdownTimer);countdownTimer=undefined;};
  const metric=(step:string)=>trackFunnel(step,{inviteId:shared?.inviteId,spiritId:spirit});
  // Browsing and sharing remain available during playback and recording.
  let awaitingCompletion = false;
  const gatedControls = root.querySelectorAll<HTMLElement>('.character-navigation, .character-info');
  const setLocked = (value: boolean) => {
    awaitingCompletion = value;
    gatedControls.forEach(element => { setInert(element,value); });
    root.toggleAttribute('data-playback-locked', value);
    lock(value);
  };
  const label = () => scareLabel(readScare(player, spirit));
  async function upload() {
    if (!pending || !shared || dead || sending) return;
    sending = true; button.disabled = true;
    status.textContent = t("Sending…");metric("upload_started");stopCountdown();
    try {
      const result = await api<{alreadySent?: boolean; full?: boolean}>(`/invites/${shared.inviteId}/audio`, pending);
      if (result.full) {
        metric("upload_full");
        if (!dead) { status.textContent = t("Storage full (50 voices). Ask your friend to delete a voice, then retry. Keep this page open to retain your recording."); }
        return;
      }
      pending = undefined; sent = true;
      if (!dead) status.textContent = result.alreadySent ? t("Already sent") : t("Voice sent");
    } catch {
      metric("upload_failed");
      if (!dead) { status.textContent = t("Send failed · retry"); }
    } finally { sending = false;stopCountdown(); if (!dead) {button.disabled = false;} }
  }
  let microphoneRequest: AbortController | undefined;
  const release = () => { stopCountdown();if(recording)metric("recording_cancelled");clearTimeout(retryTimer); retryTimer = undefined; generation++; microphoneRequest?.abort(); microphoneRequest = undefined; recording?.cancel(); recording = undefined; capture?.stop(); capture = undefined; busy = false; button.disabled = false; };
  const motion = mountTransformation(root.querySelector<HTMLElement>('.character-stage')!, spirit, {
    sound: () => true, fillCharacter: false,
    onIntroEnd: () => { retryAttempts = 0; setLocked(false); button.hidden = false; if(first && !capture && !readScare(player,spirit)) status.textContent=t("No Voice Detected"); },
    onStart: () => { markTransformationPlayed(player, spirit); status.textContent = first ? (capture ? t("Get ready…") : t("Mic unavailable")) : label(); },
    onPause: () => { release(); button.hidden = false; if (!dead && document.hidden && !sending) { status.textContent = pending ? t("Not sent · retry") : t("Paused · replay"); } },
    onError: () => {
      button.hidden = false; status.textContent = 'Loading…';
      // Keep retrying with a bounded backoff while this card remains open.
      // play() reacquires microphone capture so recovered invitations still record.
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => { if (!dead && !document.hidden) void play(); }, Math.min(15000,1500 * 2 ** Math.min(retryAttempts++,4)));
    },
    onCaptureStart: () => {
      if (!first || !capture) return;
      const ticket = generation;
      const echoCancellation = capture.echoCancellation;
      const shouldSend = !!shared && !sent && !pending;
      let audio: Promise<Blob | null> = Promise.resolve(null);
      if (shouldSend) {
        try { recording = recordReaction(capture.stream); audio = recording.result; metric("recording_started"); }
        catch { metric("recording_failed"); /* Numeric measurement can still complete. */ }
      }
      status.textContent = shouldSend && recording ? t("● 6s · record & send") : t("● 6s · measuring global score");
      stopCountdown();
      const captureStarted=performance.now();
      const tick=()=>{const elapsed=Math.min(6000,performance.now()-captureStarted),remaining=Math.max(0,Math.ceil((6000-elapsed)/1000));status.textContent=recording?msg`Recording… ${remaining}s`:msg`Measuring… ${remaining}s`;};
      tick();countdownTimer=setInterval(tick,250);

      void Promise.all([capture.measure(6000, false), audio]).then(async ([m, blob]) => {
        if (dead || ticket !== generation) return;
        capture?.stop();
        const result: Result = {score: personalScareScore(m.meanHz, m.meanRms), meanHz:m.meanHz, meanRms:m.meanRms};
        memory.set(key(player, spirit), result);
        try { localStorage.setItem(key(player, spirit), JSON.stringify(result)); } catch {}
        stopCountdown();status.textContent = scareLabel(result); capture = undefined; recording = undefined;
        void submitGlobalScare(spirit,{consent:true,scoringVersion:2,echoCancellation,meanHz:m.meanHz,meanRms:m.meanRms,frames:m.frames}).then(counted=>{
          result.globalSubmitted=counted;
          try { localStorage.setItem(key(player,spirit),JSON.stringify(result)); } catch {}
        }).catch(()=>{/* The global uploader already retries; retain the personal result. */});
        if (!shouldSend || !shared) return;
        if (!blob?.size || blob.size > 512000) { metric("recording_failed");status.textContent = t("No recording · retry"); return; }
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (dead || ticket !== generation || !shared) return;
        let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
        pending = {scoringVersion:2,echoCancellation:echoCancellation && m.meanRms !== null,meanRms:m.meanRms,audio:btoa(binary),mime:blob.type.split(';')[0],durationMs:6000,consent:true,language:locale,amplitudeRms:m.amplitudeRms,score:result.score,meanHz:m.meanHz,peakHz:m.peakHz,frames:m.frames};
        await upload();
      }).catch(()=>{
        if(dead||ticket!==generation)return;
        stopCountdown();metric('recording_failed');capture?.stop();capture=undefined;recording=undefined;status.textContent=t('No recording · retry');
      });
    },
  });
  async function play(withMicrophone=microphoneChoice()!=='denied') {
    if (busy || dead || sending || (pending && !awaitingCompletion)) return;
    // Pause the old playback before preparing a new microphone session.
    motion.pause(); busy = true; button.disabled = true; button.hidden = true;
    first = withMicrophone && !pending && (!shared || (!sent && !shared.recordingFull));

    const ticket = generation;
    if (first) {
      status.textContent = t("Starting mic…");metric("mic_requested");
      let expired = false;
      const request = new AbortController(); microphoneRequest = request;
      const pending = prepareMicrophone(request.signal);
      void pending.then(m => { if (dead || expired || ticket !== generation) m.stop(); }, () => {});
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const prepared = await Promise.race([pending, new Promise<never>((_, reject) => { timer = setTimeout(() => { expired = true; request.abort(); reject(Error('Microphone timeout')); }, 8000); })]);
        if (dead || ticket !== generation) { prepared.stop(); return; }
        capture = prepared;saveMicrophoneChoice('granted');metric("mic_granted");
      }
      catch { if(!dead && ticket===generation){saveMicrophoneChoice('denied');metric("mic_denied");status.textContent = t("Mic unavailable");} }
      finally { clearTimeout(timer); }
    }
    if (dead || ticket !== generation) return;
    const started = await motion.play();
    if (dead || ticket !== generation) return;
    if (!started) { capture?.stop(); capture = undefined; }
    if (!dead) { busy = false; button.disabled = false; if (!started) button.hidden = false; }
  }
  // Reuse the existing replay control for upload retries and microphone recovery.
  button.onclick = () => { if(pending)void upload();else void play(true); };
  setLocked(false);
  void play();
  return () => { if(pending)metric("recording_cancelled");dead = true; pending = undefined; release(); motion.dispose(); setLocked(false); };
}
