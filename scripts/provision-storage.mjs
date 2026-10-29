// Run only for the explicitly selected, new Fly app. Credentials stay in memory.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { spawn } from "node:child_process";
import { publishAssets } from "./publish-assets.mjs";
import { verifyBackup } from "./verify-backup.mjs";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
const exec = promisify(execFile),
  app = "boo-around-the-world";
async function create(name, isPublic) {
  let result;
  try {
    result = await exec(
      "fly",
      [
        "storage",
        "create",
        ...(isPublic ? ["--app", app] : []),
        "--org",
        "personal",
        "--name",
        name,
        "--yes",
        ...(isPublic ? ["--public"] : []),
      ],
      { maxBuffer: 1024 * 1024, ...(isPublic ? {} : { cwd: tmpdir() }) },
    );
  } catch (error) {
    const reason = String(error.stderr || "")
      .split("\n")
      .filter((line) => /^Error:/.test(line))
      .map((line) =>
        line.replace(/(token|key|secret)[=: ]+\S+/gi, "$1=[redacted]"),
      )
      .join(" ");
    throw new Error(
      `Storage provisioning did not complete for ${name}. Inspect the bucket list before retrying. ${reason}`,
    );
  }
  const output = result.stdout + "\n" + result.stderr,
    env = {};
  for (const line of output.split("\n")) {
    const match = line.match(
      /^\s*(BUCKET_NAME|AWS_ENDPOINT_URL_S3|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_REGION)\s*[:=]\s*(.*?)\s*$/,
    );
    if (match) env[match[1]] = match[2];
  }
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY)
    throw new Error(
      `Bucket ${name} provisioned but CLI credentials were not returned in the expected format. Do not recreate it.`,
    );
  console.log(
    `Provisioned ${isPublic ? "public media" : "private backup"} bucket: ${name}`,
  );
  return env;
}
function importVars(values) {
  return new Promise((resolve, reject) => {
    const child = spawn("fly", ["secrets", "import", "--app", app], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdout.resume();
    child.stderr.resume();
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error("Could not attach storage settings.")),
    );
    child.stdin.end(
      Object.entries(values)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n") + "\n",
    );
  });
}
try {
  if (!process.argv.includes("--resume-backups")) {
    const media = await create("boo-world-art-20261028", true);
    const uploaded = await publishAssets({
      ...media,
      MEDIA_BUCKET: "boo-world-art-20261028",
    });
    console.log(JSON.stringify(uploaded));
  }
  const backups = await create("boo-world-backups-20261028", false);
  await importVars({
    BACKUP_ACCESS_KEY_ID: backups.AWS_ACCESS_KEY_ID,
    BACKUP_SECRET_ACCESS_KEY: backups.AWS_SECRET_ACCESS_KEY,
    BACKUP_ENDPOINT:
      backups.AWS_ENDPOINT_URL_S3 || "https://fly.storage.tigris.dev",
    MEDIA_BUCKET: "boo-world-art-20261028",
    BACKUP_BUCKET: "boo-world-backups-20261028",
    ASSET_ORIGIN: "https://boo-world-art-20261028.t3.tigrisfiles.io",
  });
  console.log("Public media and private hourly backups configured.");
  const report = await verifyBackup({
    ...backups,
    BACKUP_BUCKET: "boo-world-backups-20261028",
  });
  writeFileSync(
    "artifacts/remote-backup-restore.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
