import {
  S3Client,
  PutObjectCommand,
  PutBucketCorsCommand,
} from "@aws-sdk/client-s3";
import { readFileSync, existsSync } from "node:fs";
export async function publishAssets(env = process.env) {
  const accessKeyId = env.MEDIA_ACCESS_KEY_ID || env.AWS_ACCESS_KEY_ID;
  const secretAccessKey =
    env.MEDIA_SECRET_ACCESS_KEY || env.AWS_SECRET_ACCESS_KEY;
  if (!env.MEDIA_BUCKET || !accessKeyId || !secretAccessKey)
    throw new Error("Configure media bucket credentials before publishing.");
  const s3 = new S3Client({
    region: env.AWS_REGION || "auto",
    endpoint: env.AWS_ENDPOINT_URL_S3,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
  const manifest = JSON.parse(readFileSync("public/art/manifest.json", "utf8"));
  const paths = [
    manifest.worldMap,
    ...Object.values(manifest.spirits).flatMap((art) => Object.values(art)),
  ];
  for (let i = 0; i < paths.length; i += 6)
    await Promise.all(
      paths.slice(i, i + 6).map((path) =>
        s3.send(
          new PutObjectCommand({
            Bucket: env.MEDIA_BUCKET,
            Key: path.replace(/^\//, ""),
            Body: readFileSync(
              (existsSync("public" + path) ? "public" : "dist") + path,
            ),
            ContentType: path.endsWith(".webp") ? "image/webp" : "image/jpeg",
            CacheControl: "public,max-age=31536000,immutable",
          }),
        ),
      ),
    );
  await s3.send(
    new PutObjectCommand({
      Bucket: env.MEDIA_BUCKET,
      Key: "art/manifest.json",
      Body: JSON.stringify(manifest),
      ContentType: "application/json",
      CacheControl: "public,max-age=60",
    }),
  );
  try {
    await s3.send(
      new PutBucketCorsCommand({
        Bucket: env.MEDIA_BUCKET,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedMethods: ["GET", "HEAD"],
              AllowedOrigins: ["*"],
              AllowedHeaders: ["*"],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      }),
    );
  } catch {
    console.log(
      "Public image URLs are ready; download CORS configuration needs verification.",
    );
  }
  return {
    files: paths.length + 1,
    characters: Object.keys(manifest.spirits).length,
  };
}
if (process.argv[1]?.endsWith("publish-assets.mjs"))
  console.log(JSON.stringify(await publishAssets()));
