// Database triggers preserve hourly event deltas even when another app version
// writes the existing daily aggregate. No player identifiers are collected.
export function installHourlyAnalytics(db) {
  db.exec(`
    BEGIN IMMEDIATE;
    CREATE TABLE IF NOT EXISTS analytics_hourly (
      hour INTEGER NOT NULL, event TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(hour,event)
    );
    CREATE TABLE IF NOT EXISTS analytics_metadata (key TEXT PRIMARY KEY,value INTEGER NOT NULL);
    INSERT OR IGNORE INTO analytics_metadata VALUES('hourly_started_at',CAST(unixepoch('subsec')*1000 AS INTEGER));
    CREATE TRIGGER IF NOT EXISTS analytics_hourly_insert AFTER INSERT ON analytics BEGIN
      INSERT INTO analytics_hourly VALUES(CAST(unixepoch()/3600 AS INTEGER),'event:'||NEW.event,NEW.count)
      ON CONFLICT(hour,event) DO UPDATE SET count=count+excluded.count;
    END;
    CREATE TRIGGER IF NOT EXISTS analytics_hourly_update AFTER UPDATE OF count ON analytics WHEN NEW.count>OLD.count BEGIN
      INSERT INTO analytics_hourly VALUES(CAST(unixepoch()/3600 AS INTEGER),'event:'||NEW.event,NEW.count-OLD.count)
      ON CONFLICT(hour,event) DO UPDATE SET count=count+excluded.count;
    END;
    CREATE TRIGGER IF NOT EXISTS analytics_hourly_initialized AFTER UPDATE OF initialized ON players WHEN OLD.initialized=0 AND NEW.initialized=1 BEGIN
      INSERT INTO analytics_hourly VALUES(CAST(unixepoch()/3600 AS INTEGER),'initialized',1)
      ON CONFLICT(hour,event) DO UPDATE SET count=count+1;
    END;
    COMMIT;
  `);
}
