import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { ApiError } from './store.mjs';

const hash = value => createHash('sha256').update(value).digest();
const TTL = 24 * 60 * 60 * 1000;
export function createBranchUnlock(store, options = {}) {
  const enabled = options.enabled ?? process.env.BRANCH_UNLOCK_ENABLED === 'true';
  const baseLink = options.link ?? process.env.BRANCH_UNLOCK_LINK ?? 'https://brc.hellotalk.com/Helloween2026';
  let validLink=false;
  try { const url=new URL(baseLink);validLink=url.origin==='https://brc.hellotalk.com' && !url.username && !url.password && !url.hash && url.pathname!=='/'; } catch {}
  const secret = options.secret ?? process.env.BRANCH_WEBHOOK_SECRET ?? '';
  const now = options.now ?? (() => store.now());
  const configured = validLink && secret.length >= 32;
  const campaign = 'halloween_2026', feature = 'friends_screams', channel = 'game_tab2';
  const db = store.db;
  db.exec(`CREATE TABLE IF NOT EXISTS branch_unlock_requests (
    player_id TEXT PRIMARY KEY REFERENCES players(id), token_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, link_url TEXT);
    CREATE TABLE IF NOT EXISTS branch_unlock_grants (
    player_id TEXT PRIMARY KEY REFERENCES players(id), event_id TEXT NOT NULL UNIQUE,
    event_name TEXT NOT NULL, unlocked_at INTEGER NOT NULL);`);
  const inflight = new Map();
  const signedIn = id => !!db.prepare('SELECT 1 FROM accounts WHERE player_id=?').get(id);
  const granted = id => !!db.prepare('SELECT 1 FROM branch_unlock_grants WHERE player_id=?').get(id);
  function status(id) {
    const request = db.prepare('SELECT expires_at,link_url FROM branch_unlock_requests WHERE player_id=?').get(id);
    return { enabled, available: enabled && configured, signedIn: signedIn(id),
      unlocked: granted(id), pending: !!request?.link_url && request.expires_at > now(),
      expiresAt: request?.expires_at > now() ? request.expires_at : null };
  }
  function requireAccess(id) {
    if (enabled && !granted(id)) throw new ApiError(403, 'Open HelloTalk to unlock friends’ screams.');
  }
  async function issue(id) {
    if (!enabled || !configured) throw new ApiError(503, 'HelloTalk verification is not available yet. Please try again later.');
    if (!signedIn(id)) throw new ApiError(401, 'Sign in before unlocking friends’ screams.');
    if (granted(id)) return status(id);
    const old = db.prepare('SELECT expires_at,link_url FROM branch_unlock_requests WHERE player_id=?').get(id);
    if (old?.link_url && old.expires_at > now() && new URL(old.link_url).pathname === new URL(baseLink).pathname) return {...status(id), url: old.link_url};
    const token = randomBytes(32).toString('base64url'), created = now();
    db.prepare('INSERT OR REPLACE INTO branch_unlock_requests VALUES(?,?,?,?,NULL)').run(id, hash(token).toString('hex'), created, created + TTL);
    try {
      const link = new URL(baseLink);
      link.searchParams.set('unlock_id',token);
      link.searchParams.set('~campaign',campaign);
      link.searchParams.set('~feature',feature);
      link.searchParams.set('~channel',channel);
      db.prepare('UPDATE branch_unlock_requests SET link_url=? WHERE player_id=?').run(link.href, id);
      store.event('hellotalk_unlock_requested', 'game_tab2');
      return {...status(id), url: link.href};
    } catch {
      db.prepare('DELETE FROM branch_unlock_requests WHERE player_id=?').run(id);
      throw new ApiError(502, 'Could not create the HelloTalk link. Please try again.');
    }
  }
  function start(id) {
    if (!inflight.has(id)) inflight.set(id, issue(id).finally(() => inflight.delete(id)));
    return inflight.get(id);
  }
  function authorize(req, url) {
    if (!enabled || !configured) throw new ApiError(503, 'Verification unavailable.');
    // A dedicated webhook credential, never the Branch key or a game session.
    const supplied = req.headers.authorization?.replace(/^Bearer /, '') || url.searchParams.get('token') || '';
    if (!timingSafeEqual(hash(supplied), hash(secret))) throw new ApiError(401, 'Invalid webhook credential.');
  }
  function receive(body) {
    const data = body.last_attributed_touch_data;
    if (!['install','reinstall','open'].includes(body.name) ||
        !['iOS','Android'].includes(body.user_data?.os) ||
        data?.['~campaign'] !== campaign || data?.['~feature'] !== feature || data?.['~channel'] !== channel) return {ok:true, ignored:true};
    if (typeof body.id !== 'string' || !body.id || body.id.length > 200 ||
        typeof data.unlock_id !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(data.unlock_id) ||
        !Number.isSafeInteger(body.timestamp)) throw new ApiError(400, 'Invalid unlock event.');
    return store.transaction(() => {
      if (db.prepare('SELECT 1 FROM branch_unlock_grants WHERE event_id=?').get(body.id)) return {ok:true, duplicate:true};
      const request = db.prepare('SELECT * FROM branch_unlock_requests WHERE token_hash=?').get(hash(data.unlock_id).toString('hex'));
      if (!request || request.expires_at <= now() || body.timestamp < request.created_at - 5000 ||
          body.timestamp > now() + 300000 || body.timestamp > request.expires_at) return {ok:true, ignored:true};
      if (granted(request.player_id)) return {ok:true, duplicate:true};
      db.prepare('INSERT INTO branch_unlock_grants VALUES(?,?,?,?)').run(request.player_id,body.id,body.name,now());
      db.prepare('DELETE FROM branch_unlock_requests WHERE player_id=?').run(request.player_id);
      store.event('hellotalk_unlocked',body.name);
      return {ok:true, unlocked:true};
    });
  }
  return {status, start, requireAccess, authorize, receive};
}
