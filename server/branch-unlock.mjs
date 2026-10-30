import { randomBytes } from 'node:crypto';
import { ApiError } from './store.mjs';

// A promotional first-play redirect, not verification of an install or app open.
export function createBranchUnlock(store, options = {}) {
  const enabled = options.enabled ?? process.env.BRANCH_UNLOCK_ENABLED === 'true';
  const baseLink = options.link ?? process.env.BRANCH_UNLOCK_LINK ?? 'https://brc.hellotalk.com/Helloween2026';
  let validLink = false;
  try { const url = new URL(baseLink); validLink = url.origin === 'https://brc.hellotalk.com' && !url.username && !url.password && !url.hash && url.pathname !== '/'; } catch {}
  const now = options.now ?? (() => store.now());
  const db = store.db;
  // Preserve grants issued by the former callback flow.
  db.exec(`CREATE TABLE IF NOT EXISTS branch_unlock_grants (
    player_id TEXT PRIMARY KEY REFERENCES players(id), event_id TEXT NOT NULL UNIQUE,
    event_name TEXT NOT NULL, unlocked_at INTEGER NOT NULL);`);
  const signedIn = id => !!db.prepare('SELECT 1 FROM accounts WHERE player_id=?').get(id);
  const granted = id => !!db.prepare(`SELECT 1 FROM branch_unlock_grants g WHERE g.player_id=? OR g.player_id IN (
    SELECT m.player_id FROM account_members m JOIN accounts a ON a.subject=m.subject WHERE a.player_id=?) LIMIT 1`).get(id,id);
  function status(id) {
    return { enabled, available: enabled && validLink, signedIn: signedIn(id),
      unlocked: granted(id), pending: false, expiresAt: null };
  }
  function requireAccess(id) {
    if (enabled && !granted(id)) throw new ApiError(403, 'Open HelloTalk to unlock friends’ screams.');
  }
  async function start(id) {
    if (!enabled || !validLink) throw new ApiError(503, 'HelloTalk link is unavailable. Please try again later.');
    return store.transaction(() => {
      if (granted(id)) return status(id);
      const link = new URL(baseLink);
      link.searchParams.set('~campaign','halloween_2026');
      link.searchParams.set('~feature','friends_screams');
      link.searchParams.set('~channel','game_tab2');
      db.prepare('INSERT INTO branch_unlock_grants VALUES(?,?,?,?)').run(id,'click:'+randomBytes(24).toString('hex'),'play_click',now());
      store.event('hellotalk_unlocked','play_click');
      return {...status(id), url: link.href};
    });
  }
  const retired = () => { throw new ApiError(410, 'HelloTalk playback now unlocks on the first play click; callbacks are no longer used.'); };
  return {status, start, requireAccess, authorize: retired, receive: retired};
}
