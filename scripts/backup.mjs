import { DatabaseSync, backup } from "node:sqlite";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
const db = new DatabaseSync(process.env.DATABASE_PATH || ".data/boo.sqlite", {
  readOnly: true,
});
mkdirSync(".data/backups", { recursive: true });
const file = join(".data/backups", `boo-${Date.now()}.sqlite`);
try {
  await backup(db, file);
  if (process.env.BACKUP_BUCKET) {
    const s3 = new S3Client({
      region: process.env.AWS_REGION || "auto",
      endpoint: process.env.BACKUP_ENDPOINT || process.env.AWS_ENDPOINT_URL_S3,
      credentials: process.env.BACKUP_ACCESS_KEY_ID
        ? {
            accessKeyId: process.env.BACKUP_ACCESS_KEY_ID,
            secretAccessKey: process.env.BACKUP_SECRET_ACCESS_KEY,
          }
        : undefined,
    });
    const key = `backups/${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`;
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.BACKUP_BUCKET,
        Key: key,
        Body: readFileSync(file),
        ContentType: "application/vnd.sqlite3",
      }),
    );
    unlinkSync(file);
    console.log(JSON.stringify({ backedUp: true, remote: true, key }));
  } else
    console.log(JSON.stringify({ backedUp: true, remote: false, path: file }));
} finally {
  db.close();
}
