import sharp from "sharp";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { loadCatalog } from "../server/content.mjs";
const catalog = loadCatalog();
mkdirSync("public/art/characters", { recursive: true });
mkdirSync("public/art/cards", { recursive: true });
mkdirSync("artifacts", { recursive: true });
const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  spirits: {},
};
const hash = (b) => createHash("sha256").update(b).digest("hex").slice(0, 10);
const save = (dir, name, ext, data) => {
  const path = `/art/${dir ? dir + "/" : ""}${name}.${hash(data)}.${ext}`;
  writeFileSync("public" + path, data);
  return path;
};
const escape = (s) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
// Asset extraction only: retain generated alpha and every pose; no semantic repainting.
function cuts(
  data,
  w,
  h,
  channels,
  count,
  axis,
  start = 0,
  end = axis === "x" ? h : w,
) {
  const len = axis === "x" ? w : h;
  const cell = len / count;
  const values = new Float64Array(len);
  for (let a = 0; a < len; a++)
    for (let b = start; b < end; b++) {
      const x = axis === "x" ? a : b,
        y = axis === "x" ? b : a;
      const alpha = data[(y * w + x) * channels + channels - 1];
      if (alpha > 22) values[a]++;
    }
  const out = [0];
  for (let n = 1; n < count; n++) {
    const center = Math.round(n * cell),
      lo = Math.max(out.at(-1) + 20, Math.round(center - cell * 0.25)),
      hi = Math.min(len - 20, Math.round(center + cell * 0.25));
    let best = center,
      bestCost = Infinity;
    for (let i = lo; i < hi; i++) {
      let occupancy = 0;
      for (let k = -3; k <= 3; k++) occupancy += values[i + k] || 0;
      const cost = occupancy + Math.abs(i - center) * 0.018;
      if (cost < bestCost) {
        bestCost = cost;
        best = i;
      }
    }
    out.push(best);
  }
  out.push(len);
  return out;
}
const report = [];
for (const region of catalog.regions) {
  for (const s of catalog.spirits.filter((s) => s.regionId === region.id)) {
    const atlasSource = `public/art/source/${s.atlasId || s.regionId.toLowerCase()}-atlas.png`;
    const strip = `public/art/source/${s.id}-strip.png`;
    const isStrip = existsSync(strip),
      source = isStrip ? strip : atlasSource;
    if (!existsSync(source)) {
      console.log(`Awaiting ${s.id} art`);
      continue;
    }
    const { data, info } = await sharp(source)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const ys = isStrip
      ? [0, info.height]
      : cuts(data, info.width, info.height, 4, 4, "y");
    const row = isStrip ? 0 : s.atlasRow;
    const xs = cuts(
      data,
      info.width,
      info.height,
      4,
      3,
      "x",
      ys[row],
      ys[row + 1],
    );
    const poses = [];
    for (let c = 0; c < 3; c++) {
      const box = {
        left: xs[c],
        top: ys[row],
        width: xs[c + 1] - xs[c],
        height: ys[row + 1] - ys[row],
      };
      const cell = await sharp(source).extract(box).png().toBuffer();
      const extracted = await sharp(cell)
        .trim({ threshold: 12 })
        .png()
        .toBuffer();
      const meta = await sharp(extracted).metadata();
      poses.push({ buffer: extracted, width: meta.width, height: meta.height });
    }
    const factor = Math.min(
      422 / Math.max(...poses.map((p) => p.width)),
      422 / Math.max(...poses.map((p) => p.height)),
    );
    const art = {};
    for (let c = 0; c < 3; c++) {
      const p = poses[c],
        width = Math.round(p.width * factor),
        height = Math.round(p.height * factor);
      const resized = await sharp(p.buffer)
        .resize(width, height)
        .png()
        .toBuffer();
      const canvas = await sharp({
        create: {
          width: 480,
          height: 480,
          channels: 4,
          background: "#00000000",
        },
      })
        .composite([
          {
            input: resized,
            left: Math.round((480 - width) / 2),
            top: 450 - height,
          },
        ])
        .png()
        .toBuffer();
      const webp = await sharp(canvas)
        .webp({ quality: 83, alphaQuality: 95, effort: 5 })
        .toBuffer();
      art[["idle", "scare", "peace"][c]] = save(
        "characters",
        `${s.id}-${["idle", "scare", "peace"][c]}`,
        "webp",
        webp,
      );
      if (c === 0) {
        const thumb = await sharp(canvas)
          .resize(160, 160)
          .webp({ quality: 78 })
          .toBuffer();
        art.thumb = save("characters", `${s.id}-thumb`, "webp", thumb);
      }
    }
    const titleLines =
      s.name.length > 19 ? s.name.split(/ (?=[^ ]+$)/) : [s.name];
    const card = Buffer.from(
      `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="630" fill="#121b32"/><circle cx="290" cy="325" r="242" fill="#1d2b44"/><text x="570" y="125" font-family="sans-serif" font-size="25" fill="#a8dac8">BOO AROUND THE WORLD</text><text x="570" y="220" font-family="sans-serif" font-weight="bold" font-size="48" fill="#ffb66d">${escape(titleLines[0])}</text>${titleLines[1] ? `<text x="570" y="278" font-family="sans-serif" font-weight="bold" font-size="48" fill="#ffb66d">${escape(titleLines[1])}</text>` : ""}<text x="570" y="${titleLines[1] ? 332 : 282}" font-family="sans-serif" font-size="23" fill="#c3cbd9">${escape(s.culture)}</text><text x="570" y="412" font-family="sans-serif" font-size="29" fill="#f7f0df">A little fright.</text><text x="570" y="457" font-family="sans-serif" font-size="29" fill="#f7f0df">A world of friendship.</text><text x="570" y="550" font-family="sans-serif" font-size="20" fill="#aebacd">Meet ${catalog.spirits.length} folklore friends. Make a wish.</text></svg>`,
    );
    const pose = await sharp("public" + art.scare)
      .resize(480, 480)
      .png()
      .toBuffer();
    const share = await sharp(card)
      .composite([{ input: pose, left: 50, top: 78 }])
      .jpeg({ quality: 85 })
      .toBuffer();
    art.share = save("cards", s.id, "jpg", share);
    manifest.spirits[s.id] = art;
    report.push({
      id: s.id,
      source,
      cuts: { ys, xs },
      poses: poses.map(({ width, height }) => ({ width, height })),
      art,
    });
  }
}
const mapSource = "public/art/source/world-map.png";
if (existsSync(mapSource))
  manifest.worldMap = save(
    "",
    "world-map",
    "webp",
    await sharp(mapSource)
      .resize(1200)
      .webp({ quality: 82, effort: 6 })
      .toBuffer(),
  );
writeFileSync("public/art/manifest.json", JSON.stringify(manifest, null, 2));
writeFileSync(
  "artifacts/asset-extraction.json",
  JSON.stringify(report, null, 2),
);
const previews = Object.entries(manifest.spirits);
const columns = 8,
  rows = Math.ceil(previews.length / columns);
if (rows) {
  const tiles = [];
  for (let i = 0; i < previews.length; i++) {
    const [id, art] = previews[i];
    const img = await sharp("public" + art.idle)
      .resize(140, 140)
      .png()
      .toBuffer();
    tiles.push({
      input: img,
      left: (i % columns) * 160 + 10,
      top: Math.floor(i / columns) * 175,
    });
    const label = Buffer.from(
      `<svg width="160" height="25" xmlns="http://www.w3.org/2000/svg"><text x="80" y="15" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#fff">${escape(id)}</text></svg>`,
    );
    tiles.push({
      input: label,
      left: (i % columns) * 160,
      top: Math.floor(i / columns) * 175 + 145,
    });
  }
  await sharp({
    create: {
      width: columns * 160,
      height: rows * 175,
      channels: 4,
      background: "#19253d",
    },
  })
    .composite(tiles)
    .png()
    .toFile("artifacts/character-contact-sheet.png");
}
console.log(
  `Prepared ${Object.keys(manifest.spirits).length} characters, three poses each, with thumbnails and share cards.`,
);
