export const RULES = Object.freeze({
  roundMs: 5000,
  roundCount: 3,
  matchMs: 15000,
  inviteLifetimeMs: 7 * 86400000,
});
export const CHANNELS = ["x", "line", "facebook", "whatsapp", "messenger", "kakao", "wechat", "copy", "system"];
export function makeChallenge(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const targets = Array.from({ length: 3 }, () =>
    Math.round(2800 + next() * 900),
  );
  const opponentScores = Array.from({ length: 3 }, () =>
    Math.round(45 + next() * 40),
  );
  return {
    targets,
    opponentScores,
    roundMs: RULES.roundMs,
    durationMs: RULES.matchMs,
  };
}
export function scoreTap(tap, target) {
  return tap === null
    ? 0
    : Math.max(0, Math.round(100 - Math.abs(tap - target) / 9));
}
export function scoreMatch(taps, challenge) {
  if (
    !Array.isArray(taps) ||
    taps.length !== 3 ||
    taps.some(
      (t) => t !== null && (!Number.isFinite(t) || t < 0 || t > RULES.roundMs),
    )
  )
    throw new Error("Invalid tap timings");
  const scores = taps.map((t, i) => scoreTap(t, challenge.targets[i]));
  const score = scores.reduce((a, b) => a + b, 0),
    opponentScore = challenge.opponentScores.reduce((a, b) => a + b, 0);
  return {
    scores,
    score,
    opponentScore,
    outcome:
      score > opponentScore ? "win" : score === opponentScore ? "draw" : "loss",
    active: taps.some((t) => t !== null),
  };
}
