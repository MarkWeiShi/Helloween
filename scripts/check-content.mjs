import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { globSync } from "node:fs";
import { loadCatalog } from "../server/content.mjs";
const catalog = loadCatalog();
assert.ok(catalog.regions.length >= 20);
assert.ok(catalog.spirits.length >= 40);
assert.equal(
  new Set(catalog.spirits.map((s) => s.id)).size,
  catalog.spirits.length,
);
for (const region of catalog.regions) {
  assert.ok(region.areaIds.length >= 1);
}
for (const s of catalog.spirits) {
  assert.ok(catalog.regions.some((r) => r.id === s.regionId));
  assert.match(s.originCountry, /^[A-Z]{2}$/);
  for (const key of [
    "name",
    "nativeName",
    "kind",
    "culture",
    "shortDescription",
    "folklore",
    "wish",
    "peaceLabel",
    "prop",
  ])
    assert.ok(typeof s[key] === "string" && s[key].length, `${s.id}.${key}`);
  assert.equal(s.story.length, 3);
  assert.ok(s.sources.length);
  for (const source of s.sources)
    assert.equal(new URL(source.url).protocol, "https:");
  for (const frame of s.story) assert.ok(frame.title && frame.text);
  assert.ok(["float", "hop", "sway"].includes(s.animation));
  assert.doesNotMatch(
    JSON.stringify(s),
    /[—–]/,
    `${s.id}: unexpected dash typography`,
  );
}
if (!existsSync("public/art/manifest.json"))
  throw new Error("Prepare all character art before release.");
const art = JSON.parse(readFileSync("public/art/manifest.json", "utf8"));
assert.equal(
  Object.keys(art.spirits).length,
  catalog.spirits.length,
  "Every published character needs production art",
);
for (const s of catalog.spirits)
  for (const pose of ["idle", "scare", "peace", "thumb", "share"])
    assert.ok(
      existsSync("public" + art.spirits[s.id][pose]),
      `${s.id} ${pose}`,
    );
assert.ok(existsSync("public" + art.worldMap));
const scripts = globSync("dist/assets/*.js");
const manifest = scripts.length ? JSON.parse(readFileSync("dist/.vite/manifest.json", "utf8")) : {};
// Locale dictionaries are mutually exclusive on-demand imports. Count all other
// JS conservatively, plus the largest single locale and its static dependencies.
const localeChunks = Object.values(manifest).filter(entry => /^src\/locales\/[^/]+\.json$/.test(entry.src || ""));
const localeFiles = new Set(localeChunks.map(entry => `dist/${entry.file}`));
const sizes = new Map(scripts.map(path => [path, gzipSync(readFileSync(path)).length]));
const commonJsGzip = scripts.filter(path => !localeFiles.has(path)).reduce((sum, path) => sum + sizes.get(path), 0);
const largestLocaleGzip = Math.max(0, ...[...localeFiles].map(path => {
  assert.ok(sizes.has(path), `Missing locale chunk ${path}`);
  return sizes.get(path);
}));
const allJsGzip = [...sizes.values()].reduce((sum, size) => sum + size, 0);
const jsGzip = commonJsGzip + largestLocaleGzip;
if (scripts.length) assert.ok(jsGzip < 250 * 1024, `Per-language JS gzip budget ${jsGzip}`);
console.log(
  JSON.stringify(
    {
      characters: catalog.spirits.length,
      regions: catalog.regions.length,
      storyFrames: catalog.spirits.length * 3,
      poses: catalog.spirits.length * 3,
      shareCards: catalog.spirits.length,
      jsGzipBytes: jsGzip,
      commonJsGzipBytes: commonJsGzip,
      largestLocaleGzipBytes: largestLocaleGzip,
      allJsGzipBytes: allJsGzip,
      mapBytes: statSync("public" + art.worldMap).size,
      culturalHumanReview: false,
    },
    null,
    2,
  ),
);
