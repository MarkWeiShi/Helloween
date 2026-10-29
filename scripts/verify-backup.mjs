import { DatabaseSync, backup } from "node:sqlite";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
export async function verifyBackup(env = process.env) {
  if (!env.BACKUP_BUCKET) throw new Error("Configure a private backup bucket.");
  const endpoint = env.BACKUP_ENDPOINT || env.AWS_ENDPOINT_URL_S3;
  const accessKeyId = env.BACKUP_ACCESS_KEY_ID || env.AWS_ACCESS_KEY_ID;
  const secretAccessKey =
    env.BACKUP_SECRET_ACCESS_KEY || env.AWS_SECRET_ACCESS_KEY;
  const dir = mkdtempSync(join(tmpdir(), "boo-restore-"));
  const source = new DatabaseSync(env.DATABASE_PATH || ".data/boo.sqlite", {
    readOnly: true,
  });
  let restored;
  try {
    const file = join(dir, "snapshot.sqlite");
    await backup(source, file);
    source.close();
    const body = readFileSync(file);
    const s3 = new S3Client({
      region: env.AWS_REGION || "auto",
      endpoint,
      credentials: accessKeyId
        ? {
            accessKeyId,
            secretAccessKey,
          }
        : undefined,
    });
    const key = `restore-drills/${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`;
    await s3.send(
      new PutObjectCommand({
        Bucket: env.BACKUP_BUCKET,
        Key: key,
        Body: body,
        ContentType: "application/vnd.sqlite3",
      }),
    );
    const download = await s3.send(
      new GetObjectCommand({ Bucket: env.BACKUP_BUCKET, Key: key }),
    );
    const bytes = Buffer.from(await download.Body.transformToByteArray());
    const hash = (b) => createHash("sha256").update(b).digest("hex");
    if (hash(bytes) !== hash(body))
      throw new Error("Remote backup differs from the local snapshot.");
    const restorePath = join(dir, "restored.sqlite");
    writeFileSync(restorePath, bytes, { mode: 0o600 });
    restored = new DatabaseSync(restorePath, { readOnly: true });
    const integrity = restored
      .prepare("PRAGMA integrity_check")
      .get().integrity_check;
    const mismatches = restored
      .prepare(
        "SELECT COUNT(*) count FROM players p LEFT JOIN (SELECT player_id,SUM(delta) wallet,SUM(CASE WHEN delta>0 THEN delta ELSE 0 END) candies FROM ledger GROUP BY player_id) l ON p.id=l.player_id WHERE p.wallet!=COALESCE(l.wallet,0) OR p.candies!=COALESCE(l.candies,0)",
      )
      .get().count;
    const anonymous = await fetch(
      `${(endpoint || "https://fly.storage.tigris.dev").replace(/\/$/, "")}/${env.BACKUP_BUCKET}/${key}`,
      { method: "HEAD", signal: AbortSignal.timeout(15000) },
    );
    if (anonymous.ok) throw new Error("Backup object is publicly readable.");
    if (![401, 403].includes(anonymous.status))
      throw new Error(
        `Could not verify backup privacy: HTTP ${anonymous.status}`,
      );
    const report = {
      remoteRoundTrip: true,
      identicalBytes: true,
      integrity,
      ledgerMismatches: mismatches,
      anonymousStatus: anonymous.status,
      players: restored.prepare("SELECT COUNT(*) count FROM players").get()
        .count,
      passed: integrity === "ok" && mismatches === 0,
    };
    if (!report.passed)
      throw new Error(
        "Restored database failed integrity or ledger reconciliation.",
      );
    return report;
  } finally {
    if (source.isOpen) source.close();
    restored?.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
if (process.argv[1]?.endsWith("verify-backup.mjs"))
  console.log(JSON.stringify(await verifyBackup(), null, 2));
