// A game-only pitch scale, not a psychological measure of fear.
export function pitchLevel(hz) {
  if (hz == null) return 'Not measured';
  return hz >= 700 ? 'Mega Boo' : hz >= 400 ? 'Big Boo' : hz >= 220 ? 'Little Boo' : 'Low Boo';
}
export function pitchScore(hz) { return Math.max(0, Math.min(100, Math.round((hz || 0) / 1200 * 100))); }
// Normalized autocorrelation over voiced frames; ignores silence/unpitched noise.
export function detectPitch(samples, sampleRate) {
  let energy = 0, mean = 0;
  for (const v of samples) mean += v;
  mean /= samples.length;
  for (const v of samples) energy += (v - mean) ** 2;
  if (Math.sqrt(energy / samples.length) < .015) return null;
  const min = Math.floor(sampleRate / 1200), max = Math.min(Math.ceil(sampleRate / 70), samples.length / 2);
  let best = 0, lag = 0;
  for (let offset = min; offset <= max; offset++) {
    let cross = 0, a = 0, b = 0;
    for (let i = 0; i < samples.length - max; i++) {
      const x = samples[i] - mean, y = samples[i + offset] - mean;
      cross += x * y; a += x * x; b += y * y;
    }
    const correlation = cross / Math.sqrt(a * b || 1);
    if (correlation > best) { best = correlation; lag = offset; }
    // First strong period avoids preferring subharmonics.
    if (best > .9 && correlation < best - .02) break;
  }
  const hz = sampleRate / lag;
  return best > .8 && hz >= 70 && hz <= 1200 ? Math.round(hz) : null;
}

// Equal contributions from voiced pitch and logarithmic microphone level.
export function personalScareScore(hz, rms) {
  if (!Number.isFinite(hz) || !Number.isFinite(rms) || hz <= 0 || rms <= 0) return null;
  const pitch = Math.max(0, Math.min(1, (hz - 70) / 1130));
  const loudness = Math.max(0, Math.min(1, (20 * Math.log10(rms) + 40) / 40));
  return Math.round(100 * (pitch * .5 + loudness * .5));
}
