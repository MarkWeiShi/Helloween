import {t} from "../shared/i18n.mjs";
export function recordReaction(stream: MediaStream) {
  const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus']
    .find(type => MediaRecorder.isTypeSupported(type));
  if (!mimeType) throw Error(t("Recording is not supported"));
  const recorder = new MediaRecorder(stream, {mimeType, audioBitsPerSecond:64000});
  const chunks: Blob[] = [];
  let cancelled = false, complete = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settle: (blob: Blob | null) => void;
  const result = new Promise<Blob | null>(resolve => { settle = resolve; });
  recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
  recorder.onerror = () => { cancelled = true; settle(null); };
  recorder.onstop = () => { clearTimeout(timer); settle(cancelled || !complete ? null : new Blob(chunks, {type:recorder.mimeType})); };
  recorder.start();
  // The caller releases the stream only after both recording and scoring finish.
  timer = setTimeout(() => { if (recorder.state !== 'inactive') { complete = true; recorder.stop(); } }, 6000);
  return {
    result,
    cancel() {
      cancelled = true; clearTimeout(timer);
      if (recorder.state !== 'inactive') recorder.stop();
      settle(null);
    },
  };
}
