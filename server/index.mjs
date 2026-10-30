import {createAuth} from "./auth.mjs";
import {requestLanguage,serverTranslator} from './localization.mjs';
import { socialConfig, createWechatSigner } from './social.mjs';
import { loadCuteMotions } from "./motions.mjs";
import { createServer } from "node:http";
import {
  readFileSync,
  existsSync,
  createReadStream,
  statSync,
  mkdirSync,
  unlinkSync,
} from "node:fs";
import { resolve, extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { backup } from "node:sqlite";
import { createGzip, gzipSync } from "node:zlib";
import { BooStore, ApiError } from "./store.mjs";
import { loadCatalog } from "./content.mjs";
import { RULES } from "../shared/rules.mjs";
import { countries } from "../shared/countries.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};
const clientEvents = new Set(["entered", "story_read", "hellotalk_clicked"]);
export function createApp({
  databasePath = process.env.DATABASE_PATH || join(ROOT, ".data/boo.sqlite"),
  catalog = loadCatalog(),
  now,
  authOptions,
  rateLimits = true,
  staticRoot = join(ROOT, "dist"),
} = {}) {
  const store = new BooStore(databasePath, catalog, {
    now,
    inviteRewards: process.env.INVITE_REWARDS_ENABLED !== "false",
  });
  const auth = createAuth(authOptions);
  const signWechat = createWechatSigner();
  const windows = new Map();
  const limit = (key, max) => {
    if (!rateLimits) return;
    const time = Date.now();
    let value = windows.get(key);
    if (!value || time - value.time > 60000) {
      value = { time, count: 0 };
      windows.set(key, value);
    }
    if (++value.count > max)
      throw new ApiError(
        429,
        "A lot of little boos at once. Please try again in a minute.",
      );
  };
  const clean = setInterval(() => {
    for (const [key, v] of windows)
      if (Date.now() - v.time > 60000) windows.delete(key);
  }, 60000);
  clean.unref();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(self), geolocation=()",
    );
    const assetOrigin = (process.env.ASSET_ORIGIN || "").replace(/\/$/, "");
    const imageOrigins = assetOrigin ? new URL(assetOrigin).origin : "";
    res.setHeader(
      "Content-Security-Policy",
      `default-src 'self'; script-src 'self' https://t1.kakaocdn.net https://res.wx.qq.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${imageOrigins}; font-src 'self'; connect-src 'self' https://*.kakao.com ${imageOrigins}; frame-src 'self' https://*.kakao.com; media-src 'self' blob:; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`,
    );
    const send = (status, data) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(data));
    };
    try {
      if (url.pathname === "/healthz") {
        send(200, {
          ok: true,
          contentVersion: catalog.version,
          characters: catalog.spirits.length,
          buildId: process.env.APP_BUILD_ID || "local",
        });
        return;
      }
      const token = (req.headers.cookie || "")
        .split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("boo_session="))
        ?.slice(12);
      let playerId = store.authenticate(token);
      const setSession = value => res.setHeader('Set-Cookie',`boo_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
      if(req.method==='GET' && url.pathname==='/api/auth/callback') {
        try {
          if(!playerId) throw new Error('Missing session');
          const subject=await auth.finish(token,url.searchParams.get('state'),url.searchParams.get('code'));
          const login=store.accountLogin(playerId,subject);setSession(login.token);
          res.writeHead(303,{Location:'/my-links?signin=success','Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();
        } catch {res.writeHead(303,{Location:'/my-links?signin=failed','Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();}
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        const ip =
          req.headers["fly-client-ip"] || req.socket.remoteAddress || "unknown";
        if (req.method !== "GET") {
          // Same-origin JSON POSTs prevent third-party sites from spending a guest's candy.
          const expectedOrigin =
            process.env.PUBLIC_ORIGIN || `http://${req.headers.host}`;
          const origin = req.headers.origin;
          if (
            origin &&
            origin !== expectedOrigin &&
            !(
              !process.env.NODE_ENV &&
              ["http://localhost:5173", "http://127.0.0.1:5173"].includes(
                origin,
              )
            )
          )
            throw new ApiError(
              403,
              "Please open the game directly to continue.",
            );
          if (req.headers["sec-fetch-site"] === "cross-site")
            throw new ApiError(
              403,
              "Please open the game directly to continue.",
            );
          if (!req.headers["content-type"]?.startsWith("application/json"))
            throw new ApiError(415, "Send this action as JSON.");
        }
        limit(playerId ? `p:${playerId}` : `ip:${ip}`, playerId ? 180 : 40);
        let body = {};
        if (req.method === "POST") {
          let raw = "";
          for await (const chunk of req) {
            raw += chunk;
            if (Buffer.byteLength(raw) > (playerId && /^\/api\/invites\/[\w-]+\/audio$/.test(url.pathname) ? 700000 : 8192))
              throw new ApiError(413, "That request was too large.");
          }
          try {
            body = JSON.parse(raw || "{}");
            if (!body || typeof body !== "object" || Array.isArray(body))
              throw new Error();
          } catch {
            throw new ApiError(400, "The request could not be read.");
          }
        }
        if (req.method === "GET" && url.pathname === "/api/social/config") { send(200,socialConfig()); return; }
        if (req.method === "POST" && url.pathname === "/api/social/wechat-signature") {
          if (!playerId) throw new ApiError(401,"Open the game before sharing.");
          try { send(200,await signWechat(body.url)); }
          catch (error) { throw new ApiError(error.status || 502,error.message); }
          return;
        }
        if (req.method === "POST" && url.pathname === "/api/session") {
          if (!playerId) {
            limit(`signup:${ip}`, 30);
            const guest = store.createGuest();
            playerId = guest.player.id;
            const secure =
              process.env.NODE_ENV === "production" ? "; Secure" : "";
            res.setHeader(
              "Set-Cookie",
              `boo_session=${guest.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`,
            );
          }
          send(200, { player: store.state(playerId) });
          return;
        }
        if (req.method === "GET" && url.pathname === "/api/motions") {
          send(200, {motions:loadCuteMotions(staticRoot,store.spirits)});
          return;
        }
        if (req.method === "GET" && url.pathname === "/api/catalog") {
          const arts = existsSync(join(ROOT, "public/art/manifest.json"))
            ? JSON.parse(
                readFileSync(join(ROOT, "public/art/manifest.json"), "utf8"),
              )
            : {};
          // Sources and original stories are deliberately distinct in this public catalog.
          const payload = {
            ...catalog,
            spirits: catalog.spirits.map(({ story, reviewNotes, ...s }) => ({
              ...s,
              art: arts.spirits?.[s.id] || null,
            })),
            countries,
            rules: RULES,
            assetOrigin,
            worldMap: arts.worldMap || "/art/world-map.webp",
            inviteRewards: store.inviteRewards,
          };
          const compressed = /\bgzip\b/.test(
            req.headers["accept-encoding"] || "",
          );
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public,max-age=60",
            Vary: "Accept-Encoding",
            ...(compressed ? { "Content-Encoding": "gzip" } : {}),
          });
          const json = JSON.stringify(payload);
          res.end(compressed ? gzipSync(json) : json);
          return;
        }
        const inviteGet = url.pathname.match(/^\/api\/invites\/([\w-]+)$/);
        if (req.method === "GET" && inviteGet) {
          const invite = store.invite(inviteGet[1]);
          delete invite.senderId;
          send(200, invite);
          return;
        }
        if(req.method==='GET' && url.pathname==='/api/auth/config') {send(200,auth.config());return;}
        if (!playerId)
          throw new ApiError(401, "Please reload to start your visit.");
        if(req.method==='POST' && url.pathname==='/api/auth/start') {
          limit(`auth:${ip}`,10);
          send(200,await auth.start(token,body,process.env.PUBLIC_ORIGIN || `http://${req.headers.host}`));return;
        }
        if(req.method==='POST' && url.pathname==='/api/auth/verify') {
          limit(`verify:${ip}`,20);
          const subject=await auth.finish(token,body.state,body.code);
          const login=store.accountLogin(playerId,subject);setSession(login.token);send(200,{player:login.player});return;
        }
        if(req.method==='POST' && url.pathname==='/api/auth/logout') {
          store.logout(token);const guest=store.createGuest();setSession(guest.token);send(200,{player:guest.player});return;
        }
        if(req.method==='GET' && url.pathname==='/api/my-links') {
          const offset=Number(url.searchParams.get('offset') || 0);
          if(!Number.isSafeInteger(offset) || offset<0)throw new ApiError(400,'Invalid page.');
          send(200,store.ghostLinks(playerId,offset,url.searchParams.get("spirit") || ""));return;
        }

        const audioGet = url.pathname.match(/^\/api\/invites\/([\w-]+)\/audio\/([\w-]+)$/);
        if (req.method === 'GET' && audioGet) {
          const recording = store.reactionAudio(playerId,audioGet[1],audioGet[2]);
          res.writeHead(200, {'Content-Type':recording.mime,'Cache-Control':'private, no-store','Content-Length':recording.audio.length});
          res.end(Buffer.from(recording.audio));
          return;
        }
        if (req.method === 'POST' && /^\/api\/invites\/[\w-]+\/audio$/.test(url.pathname)) {
          limit(`audio:${playerId}`, 6);
          send(200, store.recordAudio(playerId,url.pathname.split('/')[3],body));
          return;
        }
        let result;
        if (req.method === "GET" && url.pathname === "/api/me")
          result = { player: store.state(playerId) };
        else if (
          req.method === "GET" &&
          /^\/api\/spirits\/[\w-]+\/story$/.test(url.pathname)
        )
          result = store.story(playerId, url.pathname.split("/")[3]);
        else if (req.method === "POST" && url.pathname === "/api/onboard")
          result = { player: store.onboard(playerId, body) };
        else if (req.method === "POST" && url.pathname === "/api/select")
          result = { player: store.select(playerId, body.spiritId) };
        else if (req.method === "POST" && url.pathname === "/api/invites") {
          if(!store.state(playerId).account) throw new ApiError(401,"Sign in to save your ghost links and friends’ recordings.");
          result = store.createInvite(playerId, body);
          result.url = `${process.env.PUBLIC_ORIGIN || `http://${req.headers.host}`}/i/${result.id}`;
        } else if (
          req.method === "POST" &&
          /^\/api\/invites\/[\w-]+\/respond$/.test(url.pathname)
        )
          result = store.respond(playerId, url.pathname.split("/")[3]);
        else if (req.method === "POST" && /^\/api\/invites\/[\w-]+\/visit$/.test(url.pathname))
          result = store.recordInviteVisit(playerId,url.pathname.split("/")[3]);
        else if (req.method === "POST" && /^\/api\/invites\/[\w-]+\/reaction$/.test(url.pathname))
          result = store.recordReaction(playerId,url.pathname.split("/")[3],body);
        else if (req.method === "POST" && url.pathname === "/api/reactions/read")
          result = store.readReactions(playerId);
        else if (url.pathname.startsWith("/api/matches"))
          throw new ApiError(410, "Lantern Duel has retired. Share a friendly fright instead.");
        else if (
          req.method === "POST" &&
          /^\/api\/spirits\/[\w-]+\/gifts$/.test(url.pathname)
        )
          result = store.gift(
            playerId,
            url.pathname.split("/")[3],
            body.amount,
            body.requestId,
          );
        else if (req.method === "GET" && url.pathname === "/api/scream-rankings")
          result = store.screamRankings(playerId,url.searchParams.get('scope') || 'trick',url.searchParams.get('group') || 'players');
        else if (req.method === "GET" && url.pathname === "/api/leaderboards")
          result = store.leaderboard(
            playerId,
            url.searchParams.get("scope") || "players",
            url.searchParams.get("metric") || "candies",
          );
        else if (req.method === "POST" && url.pathname === "/api/events") {
          if (!clientEvents.has(body.event))
            throw new ApiError(400, "Unknown event.");
          const detail =
            body.event === "story_read"
              ? (store.spirit(body.detail), body.detail)
              : body.event === "hellotalk_clicked"
                ? ["map", "story", "store"].includes(body.detail)
                  ? body.detail
                  : "map"
                : "";
          if (body.event === "story_read") store.readStory(playerId, detail);
          else store.event(body.event, detail);
          result = { ok: true };
        } else throw new ApiError(404, "That route is not available.");
        // Idempotent retries keep their original reward result but return current progress.
        if (result?.player) result.player = store.state(playerId);
        send(200, result);
        return;
      }
      if (req.method !== "GET" && req.method !== "HEAD") {
        send(405, { error: "Use GET for this page." });
        return;
      }
      const path = decodeURIComponent(url.pathname);
      let file = resolve(staticRoot, `.${path}`);
      if (!file.startsWith(resolve(staticRoot) + "/"))
        file = join(staticRoot, "index.html");
      const isInvite = /^\/i\/[\w-]+$/.test(path);
      if (!existsSync(file) || !statSync(file).isFile()) {
        if (extname(path)) {
          send(404, { error: "This asset could not be found." });
          return;
        }
        file = join(staticRoot, "index.html");
      }
      if (!existsSync(file)) {
        res.writeHead(503, { "Content-Type": "text/plain" });
        res.end("Run npm run build, then open this page again.");
        return;
      }
      if (isInvite || file === join(staticRoot, "index.html")) {
        const locale=requestLanguage(url,req.headers["accept-language"]);
        const t=serverTranslator(locale);
        let html = readFileSync(file, "utf8");
        let invite;
        try {
          if(isInvite)invite = store.invite(path.split("/")[2]);
        } catch {}
        const spirit = invite && store.spirits.get(invite.spiritId);
        const title = invite
          ? t("{{0}} sent {{1}} to say Boo!",invite.name,t(spirit.name))
          : "Boo Around the World";
        const description =
          t("A little fright. A world of friendship. Meet a folklore friend and help their Halloween wish come true.");
        const origin =
          process.env.PUBLIC_ORIGIN || `http://${req.headers.host}`;
        const art = existsSync(join(ROOT, "public/art/manifest.json"))
          ? JSON.parse(
              readFileSync(join(ROOT, "public/art/manifest.json"), "utf8"),
            )
          : {};
        const image = `${assetOrigin || origin}${art.spirits?.[spirit?.id]?.share || art.share || "/art/world-map.webp"}`;
        html = html
          .replace(/<html lang="[^"]*">/, `<html lang="${locale}" dir="${locale==='ar'?'rtl':'ltr'}">`)
          .replace("Lighting the lanterns…",escape(t("Lighting the lanterns…")))
          .replace(/(<meta name="description" content=")[^"]*/,`$1${escape(description)}`)
          .replace(/<title>.*?<\/title>/, `<title>${escape(title)}</title>`)
          .replace(
            "</head>",
            `<meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:type" content="website"><meta property="og:url" content="${escape(origin + path)}"><meta property="og:image" content="${escape(image)}"><meta name="twitter:card" content="summary_large_image"></head>`,
          );
        res.writeHead(200, {
          "Content-Type": MIME[".html"],
          "Cache-Control": "no-cache",
          "Vary": "Accept-Language",
          "Content-Language": locale,
        });
        res.end(req.method === "HEAD" ? "" : html);
        return;
      }
      const ext = extname(file);
      if ([".mp4", ".webm"].includes(ext)) {
        const size = statSync(file).size;
        const headers = {"Content-Type":MIME[ext], "Accept-Ranges":"bytes", "Cache-Control":/\.[a-f0-9]{10,64}\./.test(file) ? "public,max-age=31536000,immutable" : "public,max-age=3600"};
        let start = 0, end = size - 1, partial = false;
        // A single byte range covers browser seeking; unsupported multipart ranges are ignored.
        const range = req.method === "GET" && !req.headers["if-range"] && req.headers.range;
        if (range && /^bytes=/.test(range) && !range.includes(',')) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(range);
          if (match && (match[1] || match[2])) {
            start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
            end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
            if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
              res.writeHead(416, {...headers, "Content-Range":`bytes */${size}`, "Content-Length":0}); res.end(); return;
            }
            partial = true;
          }
        }
        res.writeHead(partial ? 206 : 200, {...headers, "Content-Length":size ? end-start+1 : 0, ...(partial ? {"Content-Range":`bytes ${start}-${end}/${size}`} : {})});
        if (req.method === "HEAD" || !size) res.end();
        else { const stream = createReadStream(file, {start,end}); stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res); }
        return;
      }
      const compressed =
        [".js", ".css", ".svg", ".json", ".html"].includes(ext) &&
        /\bgzip\b/.test(req.headers["accept-encoding"] || "");
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        Vary: "Accept-Encoding",
        ...(compressed ? { "Content-Encoding": "gzip" } : {}),
        "Cache-Control":
          ext === ".html" || path === "/art/transformations/manifest.json"
            ? "no-cache"
            : /\.[a-f0-9]{10,64}\./.test(file) || file.includes("/assets/")
              ? "public,max-age=31536000,immutable"
              : "public,max-age=3600",
      });
      if (req.method === "HEAD") res.end();
      else if (compressed) createReadStream(file).pipe(createGzip()).pipe(res);
      else createReadStream(file).pipe(res);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 429) res.setHeader("Retry-After", "60");
        send(error.status, { error: error.message });
      } else {
        console.error("request_failed", error.message);
        send(500, { error: "The lanterns flickered. Please try again." });
      }
    }
  });
  return {
    server,
    store,
    close: () => {
      clearInterval(clean);
      server.close();
      store.close();
    },
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const app = createApp();
  const port = Number(process.env.PORT || 8787),
    host = process.env.HOST || "127.0.0.1";
  app.server.listen(port, host, () =>
    console.log(`Boo Around the World: http://${host}:${port}`),
  );
  let backupTask;
  const doBackup = async () => {
    let file;
    try {
      const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
      const dir = join(ROOT, ".data/backups");
      mkdirSync(dir, { recursive: true });
      file = join(dir, `boo-${Date.now()}.sqlite`);
      await backup(app.store.db, file);
      const client = new S3Client({
        region: process.env.AWS_REGION || "auto",
        endpoint:
          process.env.BACKUP_ENDPOINT || process.env.AWS_ENDPOINT_URL_S3,
        credentials: process.env.BACKUP_ACCESS_KEY_ID
          ? {
              accessKeyId: process.env.BACKUP_ACCESS_KEY_ID,
              secretAccessKey: process.env.BACKUP_SECRET_ACCESS_KEY,
            }
          : undefined,
      });
      await client.send(
        new PutObjectCommand({
          Bucket: process.env.BACKUP_BUCKET,
          Key: `backups/${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`,
          Body: readFileSync(file),
          ContentType: "application/vnd.sqlite3",
        }),
      );
      console.log("backup_completed");
    } catch (error) {
      console.error("backup_failed", error.message);
    } finally {
      if (file && existsSync(file)) unlinkSync(file);
    }
  };
  const saveBackup = () => {
    if (!process.env.BACKUP_BUCKET) return Promise.resolve();
    if (!backupTask)
      backupTask = doBackup().finally(() => {
        backupTask = undefined;
      });
    return backupTask;
  };
  const timer = setInterval(saveBackup, 3600000);
  timer.unref();
  process.on("SIGTERM", () => {
    clearInterval(timer);
    app.server.close(async () => {
      await saveBackup();
      app.store.close();
      process.exit(0);
    });
  });
}
