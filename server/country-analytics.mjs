import { AsyncLocalStorage } from 'node:async_hooks';
import { isIP } from 'node:net';
import geoip from 'geoip-country';

const context = new AsyncLocalStorage();
export const withCountry = (country, fn) => context.run(/^[A-Z]{2}$/.test(country) ? country : 'ZZ', fn);
export function requestCountry(req, { trustedFlyProxy = !!process.env.FLY_APP_NAME, lookup = geoip.lookup } = {}) {
  // Only trust Fly's client address when the app is behind its local Nginx proxy.
  const peer = req.socket.remoteAddress;
  const localProxy = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer);
  let ip = trustedFlyProxy && localProxy ? req.headers['fly-client-ip'] : peer;
  if (typeof ip !== 'string') return 'ZZ';
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (!isIP(ip)) return 'ZZ';
  try { const country = lookup(ip)?.country; return /^[A-Z]{2}$/.test(country) ? country : 'ZZ'; }
  catch { return 'ZZ'; }
}

// TEMP triggers belong to this connection only. Old releases and administrative
// connections can continue writing without depending on a registered JS function.
export function installCountryAnalytics(db) {
  db.function('request_country', () => context.getStore() || 'ZZ');
  db.exec(`CREATE TABLE IF NOT EXISTS analytics_country_metadata(key TEXT PRIMARY KEY,value INTEGER NOT NULL);
    INSERT OR IGNORE INTO analytics_country_metadata VALUES('started_at',CAST(unixepoch('subsec')*1000 AS INTEGER));
    CREATE TABLE IF NOT EXISTS analytics_country_records(kind TEXT NOT NULL,record_key TEXT NOT NULL,country TEXT NOT NULL,PRIMARY KEY(kind,record_key));
    CREATE INDEX IF NOT EXISTS analytics_country_lookup ON analytics_country_records(country,kind);
    CREATE TABLE IF NOT EXISTS analytics_country_hourly(hour INTEGER NOT NULL,event TEXT NOT NULL,country TEXT NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(hour,event,country));`);
  const hour = 'CAST(unixepoch()/3600 AS INTEGER)';
  const count = (event, delta) => `INSERT INTO analytics_country_hourly VALUES(${hour},${event},request_country(),${delta}) ON CONFLICT(hour,event,country) DO UPDATE SET count=count+excluded.count;`;
  db.exec(`CREATE TEMP TRIGGER IF NOT EXISTS country_event_insert AFTER INSERT ON main.analytics BEGIN ${count("'event:'||NEW.event", 'NEW.count')} END;
    CREATE TEMP TRIGGER IF NOT EXISTS country_event_update AFTER UPDATE OF count ON main.analytics WHEN NEW.count>OLD.count BEGIN ${count("'event:'||NEW.event", 'NEW.count-OLD.count')} END;
    CREATE TEMP TRIGGER IF NOT EXISTS country_initialized AFTER UPDATE OF initialized ON main.players WHEN OLD.initialized=0 AND NEW.initialized=1 BEGIN ${count("'initialized'", '1')} INSERT OR REPLACE INTO analytics_country_records VALUES('initialized',json_array(NEW.id),request_country()); END;`);
  const tables = {players:['id'],accounts:['subject'],invites:['id'],invite_visits:['invite_id','player_id'],reaction_audio:['invite_id','player_id'],page_dwell:['visit_id','hour'],card_views:['player_id','view_id'],funnel_events:['player_id','event_id']};
  for (const [table, keys] of Object.entries(tables)) {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) continue;
    const key = prefix => `json_array(${keys.map(k=>`${prefix}.${k}`).join(',')})`;
    db.exec(`CREATE TEMP TRIGGER IF NOT EXISTS country_${table}_insert AFTER INSERT ON main.${table} BEGIN
      INSERT OR REPLACE INTO analytics_country_records VALUES('${table}',${key('NEW')},request_country()); END;
      CREATE TEMP TRIGGER IF NOT EXISTS country_${table}_delete AFTER DELETE ON main.${table} BEGIN
      DELETE FROM analytics_country_records WHERE kind='${table}' AND record_key=${key('OLD')}; END;`);
  }
}
