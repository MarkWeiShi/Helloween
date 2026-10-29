import test from "node:test";
import assert from "node:assert/strict";
import { loadCatalog, mergePacks } from "../server/content.mjs";
import { readFileSync } from "node:fs";
test("additive content packs preserve launch IDs and reject ID reuse", () => {
  const base = JSON.parse(readFileSync(new URL('../content/catalog.json', import.meta.url), 'utf8'));
  assert.equal(base.spirits.length, 40);
  const next = { ...base.spirits[0], id: "new-test-character" };
  const merged = mergePacks(base, [{ version: base.version + 1, spirits: [next] }]);
  assert.equal(merged.spirits.length, 41);
  assert.deepEqual(merged.spirits.slice(0, 40), base.spirits);
  assert.equal(base.spirits.length, 40);
  assert.throws(
    () => mergePacks(base, [{ version: base.version + 1, spirits: [base.spirits[0]] }]),
    /new stable/,
  );
  assert.throws(
    () => mergePacks(base, [{ version: base.version, spirits: [next] }]),
    /increase/,
  );
  assert.throws(
    () =>
      mergePacks(base, [
        { version: base.version + 1, spirits: [{ ...next, regionId: "missing" }] },
      ]),
    /Incomplete/,
  );
});

test("twenty discovery regions preserve original cultures and asset provenance", () => {
  const c = loadCatalog();
  assert.equal(c.regions.length, 20);
  assert.equal(new Set(c.regions.map(r => r.id)).size, 20);
  assert.ok(!c.regions.some(r => r.id === "IE"));
  const areas = new Set(c.regions.flatMap(r => r.areaIds));
  assert.equal(areas.size, 6);
  for (const s of c.spirits) {
    assert.ok(c.regions.some(r => r.id === s.regionId));
    assert.ok(s.atlasId && Number.isInteger(s.atlasRow));
  }
  assert.equal(c.spirits.filter(s => s.regionId === "SEA").length, 8);
  assert.ok(c.spirits.filter(s => s.originCountry === "IE").every(s => s.regionId === "EUR"));
  assert.deepEqual(c.regions.find(r => r.id === "ARAB").areaIds, ["asia", "africa"]);
});

test("regional expansion matches four-character regions and preserves the launch catalog", () => {
  const original = JSON.parse(readFileSync(new URL('../content/catalog.json', import.meta.url), 'utf8'));
  const catalog = loadCatalog();
  assert.equal(catalog.spirits.length, 56);
  assert.deepEqual(catalog.spirits.slice(0, original.spirits.length), original.spirits);
  for (const s of original.spirits) assert.equal(s.atlasId, s.originCountry.toLowerCase());
  for (const regionId of ['AFR', 'ARAB', 'WAS', 'ECA']) {
    const friends = catalog.spirits.filter(s => s.regionId === regionId);
    assert.equal(friends.length, 4, regionId);
    assert.equal(new Set(friends.map(s => s.atlasRow)).size, 4);
    for (const s of friends) {
      assert.equal(s.story.length, 3);
      assert.ok(s.folklore.length >= 200);
      assert.ok(s.sources.every(source => source.url.startsWith('https://')));
    }
  }
});
