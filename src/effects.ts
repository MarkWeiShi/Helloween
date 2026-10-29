// Short decorative bursts never participate in game timing or scoring.
export function burst(
  host: HTMLElement | null,
  kind: "candy" | "mist" | "light" = "light",
) {
  if (
    !host ||
    document.hidden ||
    matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    return;
  const canvas = document.createElement("canvas");
  canvas.className = "particle-canvas";
  canvas.setAttribute("aria-hidden", "true");
  host.append(canvas);
  const { width, height } = host.getBoundingClientRect();
  const ratio = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.ceil(width * ratio);
  canvas.height = Math.ceil(height * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }
  ctx.scale(ratio, ratio);
  const particles = Array.from(
    { length: kind === "mist" ? 12 : 20 },
    (_, i) => ({
      angle: (i / 20) * Math.PI * 2,
      speed: 40 + Math.random() * 100,
      size: kind === "mist" ? 20 + Math.random() * 30 : 2 + Math.random() * 4,
      color: ["#ffb66d", "#a8dac8", "#fff3ce"][i % 3],
    }),
  );
  const start = performance.now();
  const paint = (now: number) => {
    const t = (now - start) / 900;
    if (t >= 1 || !host.isConnected || document.hidden) {
      canvas.remove();
      return;
    }
    ctx.clearRect(0, 0, width, height);
    for (const p of particles) {
      const x = width / 2 + Math.cos(p.angle) * p.speed * t;
      const y =
        height / 2 +
        Math.sin(p.angle) * p.speed * t +
        (kind === "candy" ? 70 * t * t : -30 * t);
      ctx.globalAlpha = (1 - t) * (kind === "mist" ? 0.08 : 0.8);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      if (kind === "candy") ctx.roundRect(x, y, p.size * 2, p.size, 2);
      else
        ctx.arc(x, y, p.size * (kind === "mist" ? 1 + t : 1), 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(paint);
  };
  requestAnimationFrame(paint);
}
