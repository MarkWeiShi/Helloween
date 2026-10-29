import { BooStore } from "../server/store.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
const root = dirname(process.env.DATABASE_PATH || ".data/boo.sqlite");
const receipt = join(root, "release-probe.json");
const catalog = JSON.parse(readFileSync("content/catalog.json", "utf8"));
const store = new BooStore(join(root, "release-probe.sqlite"), catalog);
try {
  if (!existsSync(receipt)) {
    const guest = store.createGuest();
    store.onboard(guest.player.id, {
      name: "Persistence probe",
      country: "NZ",
      spiritId: "kappa",
    });
    store.gift(guest.player.id, "kappa", 10, "volume-probe-gift");
    writeFileSync(receipt, JSON.stringify({ id: guest.player.id }), {
      mode: 0o600,
    });
  }
  const p = store.state(JSON.parse(readFileSync(receipt)).id);
  const integrity = store.db
    .prepare("PRAGMA integrity_check")
    .get().integrity_check;
  const passed =
    p.wallet === 20 &&
    p.candies === 30 &&
    p.progress[0].donated === 10 &&
    integrity === "ok";
  console.log(
    JSON.stringify({
      isolatedProbe: true,
      wallet: p.wallet,
      candies: p.candies,
      donated: p.progress[0].donated,
      integrity,
      passed,
    }),
  );
  if (!passed) process.exitCode = 1;
} finally {
  store.close();
}
