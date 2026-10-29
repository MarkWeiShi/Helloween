import { mountTransformation, hasPlayedTransformation, markTransformationPlayed } from './transformation-player';
import { prepareMicrophone } from './microphone';
import { personalScareScore } from '../shared/reactions.mjs';
type Result = { score: number | null; meanHz: number | null; meanRms: number | null };
const memory = new Map<string, Result>();
const key = (player: string, spirit: string) => `boo:personal-scare:v1:${player}:${spirit}`;
export function readScare(player: string, spirit: string): Result | undefined {
  const id = key(player, spirit);
  try { const raw = localStorage.getItem(id); if (raw) { const result = JSON.parse(raw); if (result && (result.score === null || Number.isFinite(result.score))) return result; } } catch {}
  return memory.get(id);
}
export function scareLabel(result: Result | undefined) {
  return result?.score != null ? `对我的可怕程度 · ${result.score} / 100` : result ? '对我的可怕程度 · 未测得有效声音' : '首次变身时录音 3 秒，测测它有多吓人';
}
export function mountPersonalScare(root: HTMLElement, player: string, spirit: string, _scareSrc: string, lock: (value: boolean) => void, sound: () => boolean = () => false, toggleSound?: () => void) {
  const button = root.querySelector<HTMLButtonElement>('[data-play-transform]')!;
  const status = root.querySelector<HTMLElement>('[data-personal-scare]')!;
  let dead = false, busy = false, generation = 0, capture: Awaited<ReturnType<typeof prepareMicrophone>> | undefined;
  let first = false;
  let microphoneRequest: AbortController | undefined;
  const release = () => { generation++; microphoneRequest?.abort(); microphoneRequest = undefined; capture?.stop(); capture = undefined; busy = false; button.disabled = false; };
  const motion = mountTransformation(root.querySelector<HTMLElement>('.character-stage')!, spirit, {
    sound: () => true, fillCharacter: false,
    onIntroEnd: () => { button.hidden = false; },
    onStart: () => { markTransformationPlayed(player, spirit); status.textContent = first ? '正在变身…' : scareLabel(readScare(player, spirit)); },
    onPause: () => { release(); button.hidden = false; if (!dead && document.hidden) status.textContent = '播放已暂停；点击播放变身可重新观看。'; },
    onError: () => { button.hidden = false; status.textContent = '变身素材暂不可用，请点击播放重试。'; },
    onReveal: () => {
      if (!first || !capture) return;
      const ticket = generation;
      status.textContent = '● 正在录音 3 秒，仅在本机计算评分…';
      void capture.measure(3000).then(m => {
        if (dead || ticket !== generation) return;
        const result = {score: personalScareScore(m.meanHz, m.meanRms), meanHz:m.meanHz, meanRms:m.meanRms};
        memory.set(key(player, spirit), result);
        try { localStorage.setItem(key(player, spirit), JSON.stringify(result)); } catch {}
        status.textContent = scareLabel(result); capture = undefined;
      });
    },
  });
  async function play() {
    if (busy || dead) return;
    // Pause the old playback before preparing a new microphone session.
    motion.pause(); busy = true; button.disabled = true; button.hidden = true;
    first = !readScare(player, spirit);
    const ticket = generation;
    if (first) {
      status.textContent = '正在准备麦克风…';
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
      catch { status.textContent = '麦克风不可用，本次仅播放动画。'; }
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
  return () => { dead = true; release(); motion.dispose(); lock(false); };
}
