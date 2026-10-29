// Planning calculator only. No cloud calls, production data, or deployment changes.
// Run: node scripts/estimate-capacity.mjs [average-online] [session-minutes]
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const online = Number(process.argv[2] || 100000);
const sessionMinutes = Number(process.argv[3] || 10);
if (![online, sessionMinutes].every(n => Number.isFinite(n) && n > 0)) throw Error('Positive numeric arguments required');
const seconds = 72 * 3600, visits = online * seconds / (sessionMinutes * 60);
const size = p => statSync(resolve(root, 'public', p.replace(/^\//, ''))).size;
const manifest = JSON.parse(readFileSync(resolve(root, 'public/art/transformations/manifest.json')));
const packs = Object.entries(manifest.characters).map(([id, v]) => ({id, bytes: ['entrance', 'loop', 'poster'].reduce((sum, k) => sum + size(v[k]), 0)}));
const motionBytes = readdirSync(resolve(root, 'public/art/motions')).filter(f => f.endsWith('.webp')).reduce((n, f) => n + size('/art/motions/' + f), 0);
const price72h = (cpu, ram) => (cpu * 0.000012732 + (ram - cpu * 2) * 0.000002316) * 1.307692308 * seconds;
const machineCosts = {api12: 12 * price72h(4, 8), workers2: 2 * price72h(2, 4), redis3: 3 * price72h(2, 8)};
const clips = visits * 0.2, audioBytes = clips * 50000;
const fixedCosts = {
  ...machineCosts,
  managedPostgresPerformance: 1922 * 0.1,
  databaseStorage500GBConservative: 500 * 0.28 * 0.1,
  cacheVolumes30GB: 30 * 0.15 * 0.1,
  // Upper planning bound: final inventory charged for all 72h, not a daily-peak billing simulation.
  objectStorageConservative: (audioBytes / 2**30 + 1) * 0.02 * 0.1,
  audioPuts: clips / 1e6 * 5,
  audioOneHeadAndOnePlay: clips * 2 / 1e6 * 0.5,
  // 1 GB = 1e9 bytes here, conservatively budgeted; actual network meter governs invoice.
  flyApiEgress: visits * 80000 / 1e9 * 0.04,
};
const fixed = Object.values(fixedCosts).reduce((a, b) => a + b, 0);
const scenarios = [
  {name: 'lean', mediaMB: 15, publicGetsPerVisit: 60},
  {name: 'base', mediaMB: 30, publicGetsPerVisit: 100},
  {name: 'heavy', mediaMB: 60, publicGetsPerVisit: 160},
].map(s => {
  const mediaBytes = visits * s.mediaMB * 1e6;
  const publicReadCost = visits * s.publicGetsPerVisit / 1e6 * 0.5;
  const total = fixed + publicReadCost;
  return {...s, mediaTB: mediaBytes / 1e12, averageMediaGbps: mediaBytes * 8 / seconds / 1e9, publicGetRequests: visits * s.publicGetsPerVisit,
    publicReadCost, tigrisEgressCost: 0, totalUSD: total, budgetWith30PercentReserve: total * 1.3,
    counterfactualAllMediaViaFlyEgressUSD: mediaBytes / 1e9 * 0.04};
});
console.log(JSON.stringify({
  asOf: '2026-10-29', region: 'nrt', evidence: 'local source/files; no production telemetry or capacity benchmark',
  assumptions: {hours: 72, online, sessionMinutes, visits, recordingClipsPerVisit: 0.2, audioBytesPerClip: 50000, pollsPerSecond: online / 15,
    additionalApiCallsPerVisit: 20, totalApiRps: online / 15 + visits * 20 / seconds, apiResponseBytesPerVisit: 80000,
    allMachinesRun72Hours: true, mediaBytesAndGetCountsAreScenarioAssumptions: true, uniqueUsersUnknown: true},
  localAssets: {transformations: packs.length, meanTransformationBytes: packs.reduce((n, p) => n + p.bytes, 0) / packs.length,
    minTransformationBytes: Math.min(...packs.map(p => p.bytes)), maxTransformationBytes: Math.max(...packs.map(p => p.bytes)), motionBytes,
    invitationGreetingBytes: size('/art/invitations/pumpkin/greeting-static-v3.png')},
  audio: {clips, newStoredGBDecimal: audioBytes / 1e9, newStoredGiB: audioBytes / 2**30, uploadsPerSecond: clips / seconds},
  fixedCostsUSD: fixedCosts, fixedSubtotalUSD: fixed, extra8ApiMachines72HoursUSD: 8 * price72h(4, 8), scenarios,
  sources: ['https://docs.fly.io/about/pricing', 'https://docs.fly.io/postgres', 'https://www.tigrisdata.com/pricing/'],
}, null, 2));
