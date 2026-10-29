import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "../content");
export function mergePacks(base, packs) {
  const result = structuredClone(base);
  const ids = new Set(result.spirits.map((s) => s.id));
  const regions = new Set(result.regions.map((r) => r.id));
  for (const pack of [...packs].sort((a, b) => a.version - b.version)) {
    if (!Number.isInteger(pack.version) || pack.version <= result.version)
      throw new Error("Content packs must increase the catalog version.");
    for (const region of pack.regions || []) {
      if (regions.has(region.id))
        throw new Error(`Content pack repeats region ${region.id}.`);
      regions.add(region.id);
      result.regions.push(region);
    }
    for (const s of pack.spirits || []) {
      if (!/^[a-z0-9-]+$/.test(s.id) || ids.has(s.id))
        throw new Error(
          `Content pack must use a new stable character ID: ${s.id}`,
        );
      if (
        !regions.has(s.regionId) ||
        !Array.isArray(s.story) ||
        s.story.length !== 3 ||
        !s.sources?.length
      )
        throw new Error(`Incomplete content pack character: ${s.id}`);
      ids.add(s.id);
      result.spirits.push(s);
    }
    result.version = pack.version;
  }
  return result;
}
export function loadCatalog(directory = root) {
  const base = JSON.parse(
    readFileSync(join(directory, "catalog.json"), "utf8"),
  );
  const packs = join(directory, "packs");
  return mergePacks(
    base,
    existsSync(packs)
      ? readdirSync(packs)
          .filter((f) => f.endsWith(".json"))
          .map((f) => JSON.parse(readFileSync(join(packs, f), "utf8")))
      : [],
  );
}
