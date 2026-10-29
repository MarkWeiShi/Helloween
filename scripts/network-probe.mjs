import { mkdirSync, writeFileSync } from "node:fs";
import { loadCatalog } from "../server/content.mjs";
const expectedCharacters = loadCatalog().spirits.length;
const origin =
  process.env.PROBE_ORIGIN || "https://boo-around-the-world.fly.dev";
const session = await fetch(origin + "/api/session", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: origin },
  body: "{}",
});
if (!session.ok) throw new Error(`Session HTTP ${session.status}`);
const cookie = session.headers.get("set-cookie")?.split(";")[0];
if (!cookie) throw new Error("No guest session was issued.");
const times = [],
  failures = [];
for (let i = 0; i < 60; i++) {
  const start = performance.now();
  try {
    const r = await fetch(origin + "/api/catalog", {
      signal: AbortSignal.timeout(10000),
      headers: { Cookie: cookie },
    });
    const body = await r.json();
    if (!r.ok || body.spirits?.length !== expectedCharacters)
      throw new Error(`HTTP ${r.status}`);
    times.push(performance.now() - start);
  } catch (e) {
    failures.push(e.message);
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
times.sort((a, b) => a - b);
const report = {
  environment: process.env.FLY_REGION
    ? `Fly ${process.env.FLY_REGION} to the public HTTPS catalog endpoint`
    : "Development host to public HTTPS catalog endpoint",
  requests: 60,
  failures,
  p50Ms: times[Math.floor(times.length * 0.5)],
  p95Ms: times[Math.floor(times.length * 0.95)],
  p99Ms: times[Math.floor(times.length * 0.99)],
  passed: failures.length === 0 && times[Math.floor(times.length * 0.95)] < 800,
};
mkdirSync("artifacts", { recursive: true });
writeFileSync(
  "artifacts/regional-network.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
