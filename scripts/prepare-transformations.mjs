import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '../server/content.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'public/art/transformations');
const roots = ['ghost-horror-40-v1', 'ghost-horror-regional-v1'].map(name => join(root, 'artifacts', name));
const files = {
  entrance: ['entrance-playback.mp4', 'entrance', 'mp4'],
  loop: ['horror-loop-playback.mp4', 'loop', 'mp4'],
  entranceAlpha: ['entrance-alpha.webm', 'entrance', 'webm'],
  loopAlpha: ['horror-loop-alpha.webm', 'loop', 'webm'],
  poster: ['poster.png', 'poster', 'png'],
};
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const atomicJSON = (path, value) => {
  writeFileSync(path + '.tmp', JSON.stringify(value, null, 2) + '\n');
  renameSync(path + '.tmp', path);
};

// This publishes only local, verified production outputs. It never submits or
// retries a generation job and never includes access-bearing provider URLs.
export function prepareTransformations({ requireAll = false } = {}) {
  const catalog = loadCatalog();
  const characters = {}, pending = [], provenance = [];
  mkdirSync(output, { recursive: true });
  for (const spirit of catalog.spirits) {
    const folder = roots.map(base => join(base, spirit.id)).find(path => existsSync(join(path, 'manifest.json')));
    if (!folder) { pending.push(spirit.id); continue; }
    const manifest = read(join(folder, 'manifest.json'));
    const verification = read(join(folder, 'verification.json'));
    if (manifest.state !== 'ready_for_review' || verification.passed !== true)
      throw new Error(`Unverified transformation: ${spirit.id}`);
    const descriptor = { duration: 6, loopDuration: 2, revealAt: 2.3 };
    const published = [];
    mkdirSync(join(output, spirit.id), { recursive: true });
    for (const [key, [source, stem, extension]] of Object.entries(files)) {
      const from = join(folder, source);
      const data = readFileSync(from);
      const sha256 = createHash('sha256').update(data).digest('hex');
      const filename = `${stem}.${sha256.slice(0, 12)}.${extension}`;
      const to = join(output, spirit.id, filename);
      if (!existsSync(to)) copyFileSync(from, to);
      descriptor[key] = `/art/transformations/${spirit.id}/${filename}`;
      published.push({ role: key, file: descriptor[key], bytes: data.length, sha256 });
    }
    characters[spirit.id] = descriptor;
    provenance.push({ id: spirit.id, source: folder.slice(root.length + 1), model: manifest.model, files: published });
  }
  if (requireAll && pending.length) throw new Error(`Missing ${pending.length} transformations: ${pending.join(', ')}`);
  const manifest = { version: 1, characters };
  atomicJSON(join(output, 'manifest.json'), manifest);
  const report = {
    catalogTotal: catalog.spirits.length, published: Object.keys(characters).length,
    pending, generatedAt: new Date().toISOString(),
    scope: 'Local production assets; no deployment performed', provenance,
  };
  atomicJSON(join(root, 'artifacts', 'transformation-publication.json'), report);
  return { catalogTotal: report.catalogTotal, published: report.published, pending };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(JSON.stringify(prepareTransformations({ requireAll: process.argv.includes('--require-all') })));
