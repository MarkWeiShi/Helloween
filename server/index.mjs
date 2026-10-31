import {findShareCharacter} from '../shared/preview-characters.mjs';
import {createBranchUnlock} from "./branch-unlock.mjs";
import {createXPublisher} from './x-publish.mjs';
import {createTelemetry} from './telemetry.mjs';
import {facebookShareDocument} from './facebook-share.mjs';
import {createAuth} from "./auth.mjs";
import {loadPublicContent,publicCatalog} from './public-content.mjs';
import { socialConfig, createWechatSigner } from './social.mjs';
import { createServer } from "node:http";
import {
  readFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
} from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { backup } from "node:sqlite";
import { BooStore, ApiError } from "./store.mjs";
import { loadCatalog } from "./content.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const clientEvents = new Set(["entered", "story_read", "hellotalk_clicked"]);
export function createApp({
  databasePath = process.env.DATABASE_PATH || join(ROOT, ".data/boo.sqlite"),
  catalog = loadCatalog(),
  now,
  authOptions,
  branchOptions,
  xPublisherOptions,
  rateLimits = true,
  publicContent = loadPublicContent(ROOT),
  trustedProxy = process.env.TRUST_PROXY === "true",
} = {}) {
  const store = new BooStore(databasePath, catalog, {
    now,
  });
  const branchUnlock = createBranchUnlock(store, branchOptions);
  const auth = createAuth({db:store.db,...authOptions});
  const publishX=createXPublisher(xPublisherOptions);
  store.db.exec("CREATE TABLE IF NOT EXISTS x_posts(invite_id TEXT PRIMARY KEY,player_id TEXT NOT NULL,status TEXT NOT NULL,result TEXT)");
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
  const telemetry=createTelemetry();
  const metricsInterval=Number(process.env.METRICS_INTERVAL_MS || 0);
  const metricsTimer=metricsInterval>=1000?setInterval(()=>console.log(JSON.stringify(telemetry.snapshot())),metricsInterval):null;
  metricsTimer?.unref();
  const server = createServer(async (req, res) => {
    telemetry.track(req,res);
    const url = new URL(req.url, "http://localhost");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(self), geolocation=()",
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
          release: publicContent?.release || null,
          characters: catalog.spirits.length,
          buildId: process.env.APP_BUILD_ID || "local",
        });
        return;
      }
      const facebookShare=url.pathname.match(/^\/api\/share\/(?:facebook|card)\/([\w-]+)$/) || url.pathname.match(/^\/i\/([\w-]+)$/);
      if (req.method==='GET' && facebookShare) {
        const invite=store.invite(facebookShare[1]);
        const spirit=findShareCharacter(catalog,invite.spiritId);
        if(!spirit)throw new ApiError(404,'This invitation could not be found.');
        const origin=process.env.PUBLIC_ORIGIN || `http://${req.headers.host}`;
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
        res.end(facebookShareDocument(invite,spirit,origin,url.searchParams.get('lang')));return;
      }
      if (url.pathname === '/api/branch/webhook') {
        if (req.method !== 'POST') throw new ApiError(405, 'Use POST.');
        branchUnlock.authorize(req,url);
        if (!req.headers['content-type']?.startsWith('application/json')) throw new ApiError(415,'Send JSON.');
        let raw = '';
        for await (const chunk of req) {
          raw += chunk;
          if (Buffer.byteLength(raw) > 65536) throw new ApiError(413,'Webhook too large.');
        }
        let body;
        try { body = JSON.parse(raw); } catch { throw new ApiError(400,'Invalid JSON.'); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400,'Invalid event.');
        send(200,branchUnlock.receive(body));
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
        // The ingress must overwrite this header and the API must not be publicly reachable.
        const forwarded = trustedProxy && req.headers['x-real-ip'];
        const ip = typeof forwarded === 'string' && forwarded.length < 64 ? forwarded : req.socket.remoteAddress || 'unknown';
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
        if (req.method === "GET" && url.pathname === "/api/character-scares") { send(200,store.globalScares()); return; }
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
        if (req.method === "GET" && url.pathname === "/api/config") {
          send(200,{contentVersion:catalog.version,release:publicContent?.release || null});return;
        }
        if (req.method === "GET" && url.pathname === "/api/motions") {
          send(200, publicContent?.motions || {motions:{}});return;
        }
        if (req.method === "GET" && url.pathname === "/api/catalog") {
          const arts = {spirits:Object.fromEntries((publicContent?.catalog.spirits || []).map(s=>[s.id,s.art])),worldMap:publicContent?.catalog.worldMap};
          send(200,publicCatalog(catalog,arts));return;
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
        const subject=store.db.prepare('SELECT subject FROM accounts WHERE player_id=?').get(playerId)?.subject;
        if(req.method==='GET' && url.pathname==='/api/social/x/status') {send(200,{connected:!!(await auth.xToken(subject))});return;}
        if(req.method==='POST' && url.pathname==='/api/social/x/publish') {
          limit(`x-post:${playerId}`,5);
          if(body.confirm!==true)throw new ApiError(400,'Confirm before publishing.');
          const invite=store.invite(body.inviteId);
          if(invite.expired)throw new ApiError(410,'This invitation has expired.');
          if(invite.senderId!==playerId)throw new ApiError(403,'This invitation belongs to another account.');
          const existing=store.db.prepare('SELECT * FROM x_posts WHERE invite_id=?').get(invite.id);
          if(existing?.status==='complete'){send(200,JSON.parse(existing.result));return;}
          if(existing){const error=new ApiError(409,'Publishing is pending or unconfirmed. Check your X profile before trying again.');error.code='X_UNCONFIRMED';throw error;}
          const token=await auth.xToken(subject);if(!token)throw new ApiError(401,'Sign in to X again to authorize publishing.');
          const text=String(body.text||'').trim();
          if(!text || [...text].length>280)throw new ApiError(400,'Use a post of up to 280 characters.');
          const origin=process.env.PUBLIC_ORIGIN || `http://${req.headers.host}`;
          if(!text.includes(`${origin}/api/share/card/${invite.id}`))throw new ApiError(400,'Keep your invitation link in the post.');
          store.db.prepare('INSERT INTO x_posts VALUES(?,?,?,NULL)').run(invite.id,playerId,'preparing');
          let posting=false;
          try {
            const result=await publishX({token,spiritId:invite.spiritId,language:body.language,text,origin,cardSha:body.cardSha,beforePost:()=>{posting=true;store.db.prepare("UPDATE x_posts SET status='posting' WHERE invite_id=?").run(invite.id);}});
            store.db.prepare("UPDATE x_posts SET status='complete',result=? WHERE invite_id=?").run(JSON.stringify(result),invite.id);
            send(200,result);
          } catch(error) {
            console.warn('x_publish_failed',JSON.stringify({stage:posting?'post':'prepare',code:error.code||'X_UNCONFIRMED',status:error.status||502,retryable:!posting||!!error.postRejected}));
            if(!posting || error.postRejected)store.db.prepare('DELETE FROM x_posts WHERE invite_id=?').run(invite.id);
            if(error.status===401)auth.forget(subject);
            throw error;
          }return;
        }
        if(req.method==='GET' && url.pathname==='/api/hellotalk-unlock') {
          send(200,branchUnlock.status(playerId));return;
        }
        if(req.method==='POST' && url.pathname==='/api/hellotalk-unlock') {
          limit(`ht-unlock:${playerId}`,6);
          send(200,await branchUnlock.start(playerId));return;
        }
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
          auth.forget(subject);store.logout(token);const guest=store.createGuest();setSession(guest.token);send(200,{player:guest.player});return;
        }
        if(req.method==='GET' && url.pathname==='/api/my-links') {
          const offset=Number(url.searchParams.get('offset') || 0);
          if(!Number.isSafeInteger(offset) || offset<0)throw new ApiError(400,'Invalid page.');
          send(200,store.ghostLinks(playerId,offset,url.searchParams.get("spirit") || ""));return;
        }

        if (req.method === 'GET' && url.pathname === '/api/friend-voices') {
          send(200,store.friendVoices(playerId));return;
        }
        const audioDelete = url.pathname.match(/^\/api\/invites\/([\w-]+)\/audio\/([\w-]+)\/delete$/);
        if (req.method === 'POST' && audioDelete) {
          send(200,store.deleteRecording(playerId,audioDelete[1],audioDelete[2]));return;
        }
        const audioGet = url.pathname.match(/^\/api\/invites\/([\w-]+)\/audio\/([\w-]+)$/);
        if (req.method === 'GET' && audioGet) {
          branchUnlock.requireAccess(playerId);
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
        if (req.method === 'POST' && /^\/api\/spirits\/[\w-]+\/scare$/.test(url.pathname)) {
          limit(`scare:${playerId}`, 30);
          send(200,store.recordScare(playerId,url.pathname.split('/')[3],body));
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
      send(404, {error:"That route is not available."});
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 429) res.setHeader("Retry-After", "60");
        send(error.status, { error: error.message, ...(error.code?.startsWith('X_')?{code:error.code}:{}) });
      } else {
        console.error("request_failed", error.message);
        send(500, { error: "The lanterns flickered. Please try again." });
      }
    }
  });
  return {
    server,
    store,
    telemetry,
    close: () => {
      clearInterval(clean);
      if(metricsTimer)clearInterval(metricsTimer);
      telemetry.close();
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
