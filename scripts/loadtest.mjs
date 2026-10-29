import { createApp } from "../server/index.mjs";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const users = Number(process.env.LOAD_USERS || 500),
  durationMs = Number(process.env.LOAD_DURATION_MS || 900000);
const dir = mkdtempSync(join(tmpdir(), "boo-load-"));
const app = createApp({
  databasePath: join(dir, "load.sqlite"),
  rateLimits: false,
});
const guests = Array.from({ length: users }, (_, i) => {
  const g = app.store.createGuest();
  app.store.onboard(g.player.id, {
    name: `Load visitor ${i}`,
    country: ["JP", "CN", "US", "BR", "TH"][i % 5],
    spiritId: "kappa",
  });
  return g;
});
await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${app.server.address().port}`,
  latencies = [],
  failures = [];
let total = 0,
  matches = 0,
  failedRequests = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const started = Date.now(),
  stopAt = started + durationMs;
async function call(guest, path, body) {
  const begin = performance.now();
  total++;
  let response;
  try {
    response = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Cookie: `boo_session=${guest.token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    latencies.push(performance.now() - begin);
    if (!response.ok) throw new Error(`${response.status}: ${data.error}`);
    return data;
  } catch (error) {
    failedRequests++;
    if (failures.length < 50) failures.push({ path, message: error.message });
    return null;
  }
}
const reporter = setInterval(
  () =>
    console.log(
      JSON.stringify({
        elapsedSeconds: Math.round((Date.now() - started) / 1000),
        requests: total,
        matches,
        failures: failedRequests,
      }),
    ),
  60000,
);
await Promise.all(
  guests.map(async (g, i) => {
    await sleep((i / users) * 30000);
    let round = 0;
    while (Date.now() + 16000 < stopAt) {
      const begin = Date.now();
      const m = await call(g, "/api/matches", {
        spiritId: "kappa",
        opponentId: "jiangshi",
      });
      if (m) {
        await sleep(15050);
        const result = await call(g, `/api/matches/${m.id}/finish`, {
          taps: m.targets,
        });
        if (result) matches++;
        if (round % 5 === 0)
          await call(g, `/api/matches/${m.id}/finish`, { taps: m.targets });
      }
      if (round % 2 === 0)
        await call(g, "/api/leaderboards?scope=countries&metric=candies");
      if (round % 4 === 0) await call(g, "/api/me");
      round++;
      await sleep(Math.min(30000 - (Date.now() - begin), stopAt - Date.now()));
    }
  }),
);
clearInterval(reporter);
const mismatches = app.store.db
  .prepare(
    `SELECT p.id FROM players p LEFT JOIN (SELECT player_id,SUM(delta) balance,SUM(CASE WHEN delta>0 THEN delta ELSE 0 END) earned FROM ledger GROUP BY player_id) l ON l.player_id=p.id WHERE p.wallet!=l.balance OR p.candies!=l.earned`,
  )
  .all();
const paid = app.store.db
  .prepare("SELECT COUNT(*) AS count FROM ledger WHERE reason='battle'")
  .get().count;
const capViolations = app.store.db
  .prepare(
    "SELECT d.player_id FROM daily d LEFT JOIN (SELECT player_id,date(created_at/1000,'unixepoch') day,COUNT(*) paid FROM ledger WHERE reason='battle' GROUP BY player_id,day) l ON l.player_id=d.player_id AND l.day=d.day WHERE COALESCE(l.paid,0)!=MIN(20,d.matches) OR d.invites>10",
  )
  .all();
latencies.sort((a, b) => a - b);
const report = {
  environment:
    process.env.LOAD_ENVIRONMENT ||
    "local loopback on development host; not a Fly.io or global network capacity measurement",
  users,
  durationSeconds: Math.round((Date.now() - started) / 1000),
  requests: total,
  matches,
  paidMatches: paid,
  failedRequests,
  failures,
  errorRate: failedRequests / Math.max(1, total),
  p50Ms: latencies[Math.floor(latencies.length * 0.5)],
  p95Ms: latencies[Math.floor(latencies.length * 0.95)],
  p99Ms: latencies[Math.floor(latencies.length * 0.99)],
  ledgerMismatches: mismatches.length,
  dailyCapCorrect: capViolations.length === 0,
  passed:
    failedRequests === 0 &&
    capViolations.length === 0 &&
    mismatches.length === 0 &&
    latencies[Math.floor(latencies.length * 0.95)] < 800,
};
mkdirSync("artifacts", { recursive: true });
writeFileSync(
  process.env.LOAD_REPORT || "artifacts/loadtest.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
await new Promise((resolve) => app.server.close(resolve));
app.close();
rmSync(dir, { recursive: true, force: true });
if (!report.passed) process.exitCode = 1;
