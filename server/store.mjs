import {languages} from '../shared/i18n.mjs';
import { pitchLevel } from "../shared/reactions.mjs";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  RULES,
  CHANNELS,
} from "../shared/rules.mjs";
import { COUNTRY_CODES } from "../shared/countries.mjs";

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new ApiError(status, message);
};
const digest = (s) => createHash("sha256").update(s).digest("hex");
export class BooStore {
  constructor(
    path,
    catalog,
    { now = () => Date.now() } = {},
  ) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.catalog = catalog;
    this.now = now;
    this.spirits = new Map(catalog.spirits.map((s) => [s.id, s]));
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY,name TEXT NOT NULL,country TEXT,selected TEXT,peace_count INTEGER NOT NULL DEFAULT 0,initialized INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS accounts(subject TEXT PRIMARY KEY,player_id TEXT NOT NULL REFERENCES players(id),created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS account_members(player_id TEXT PRIMARY KEY REFERENCES players(id),subject TEXT NOT NULL REFERENCES accounts(subject));
      CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,player_id TEXT NOT NULL REFERENCES players(id),created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS progress(player_id TEXT NOT NULL REFERENCES players(id),spirit_id TEXT NOT NULL,peace_at INTEGER,PRIMARY KEY(player_id,spirit_id));
      CREATE TABLE IF NOT EXISTS invites(id TEXT PRIMARY KEY,sender_id TEXT NOT NULL REFERENCES players(id),spirit_id TEXT NOT NULL,channel TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS invite_visits(invite_id TEXT NOT NULL REFERENCES invites(id),player_id TEXT NOT NULL REFERENCES players(id),created_at INTEGER NOT NULL,PRIMARY KEY(invite_id,player_id));
      CREATE TABLE IF NOT EXISTS responses(invite_id TEXT NOT NULL REFERENCES invites(id),player_id TEXT NOT NULL REFERENCES players(id),result TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(invite_id,player_id));
      CREATE TABLE IF NOT EXISTS analytics(day TEXT NOT NULL,event TEXT NOT NULL,detail TEXT NOT NULL,count INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(day,event,detail));
      CREATE TABLE IF NOT EXISTS story_reads(player_id TEXT NOT NULL REFERENCES players(id),spirit_id TEXT NOT NULL,read_at INTEGER NOT NULL,PRIMARY KEY(player_id,spirit_id));
      CREATE TABLE IF NOT EXISTS reactions(invite_id TEXT NOT NULL REFERENCES invites(id),player_id TEXT NOT NULL REFERENCES players(id),mean_hz INTEGER,peak_hz INTEGER,frames INTEGER NOT NULL,created_at INTEGER NOT NULL,seen_at INTEGER,PRIMARY KEY(invite_id,player_id));
      CREATE TABLE IF NOT EXISTS reaction_audio(invite_id TEXT NOT NULL REFERENCES invites(id),player_id TEXT NOT NULL REFERENCES players(id),mime TEXT NOT NULL,audio BLOB NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(invite_id,player_id));
      CREATE TABLE IF NOT EXISTS reaction_intensity(invite_id TEXT NOT NULL,player_id TEXT NOT NULL,language TEXT NOT NULL,rms REAL CHECK(rms IS NULL OR (rms>=0 AND rms<=1)),PRIMARY KEY(invite_id,player_id),FOREIGN KEY(invite_id,player_id) REFERENCES reaction_audio(invite_id,player_id));
      CREATE TABLE IF NOT EXISTS invite_labels(invite_id TEXT PRIMARY KEY REFERENCES invites(id),friend_name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reaction_details(invite_id TEXT NOT NULL,player_id TEXT NOT NULL,name TEXT NOT NULL,score INTEGER,duration_ms INTEGER NOT NULL,PRIMARY KEY(invite_id,player_id),FOREIGN KEY(invite_id,player_id) REFERENCES reaction_audio(invite_id,player_id));
      CREATE INDEX IF NOT EXISTS players_peace ON players(peace_count DESC);
      CREATE INDEX IF NOT EXISTS players_country ON players(country);
      `);
    if(this.db.prepare('PRAGMA user_version').get().user_version<2)this.retireEconomy();
  }
  retireEconomy() {
    this.transaction(()=>{
      this.db.exec('DROP INDEX IF EXISTS players_candies; DROP TABLE IF EXISTS ledger; DROP TABLE IF EXISTS daily; DROP TABLE IF EXISTS first_invites; DROP TABLE IF EXISTS matches; DROP TABLE IF EXISTS operations;');
      for(const [table,column] of [['players','wallet'],['players','candies'],['progress','donated'],['invites','eligible']]) {
        if(this.db.prepare(`PRAGMA table_info(${table})`).all().some(c=>c.name===column))this.db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
      }
      for(const row of this.db.prepare('SELECT rowid,result FROM responses').all()) {
        const {name,expired}=JSON.parse(row.result);
        this.db.prepare('UPDATE responses SET result=? WHERE rowid=?').run(JSON.stringify({name,expired}),row.rowid);
      }
      this.db.exec('PRAGMA user_version=2');
    });
  }
  close() {
    this.db.close();
  }
  transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  day() {
    return new Date(this.now()).toISOString().slice(0, 10);
  }
  rawPlayer(id) {
    return (
      this.db.prepare("SELECT * FROM players WHERE id=?").get(id) ||
      fail(401, "Your visit has expired. Please reload.")
    );
  }
  ready(id) {
    const p = this.rawPlayer(id);
    if (!p.initialized)
      fail(409, "Choose your character and home country first.");
    return p;
  }
  spirit(id) {
    return (
      this.spirits.get(id) || fail(400, "That character is not available.")
    );
  }
  state(id) {
    const p = this.rawPlayer(id);
    return {
      id: p.id,
      account: !!this.db.prepare("SELECT 1 FROM accounts WHERE player_id=?").get(id),
      name: p.name,
      country: p.country,
      selected: p.selected,
      peaceCount: p.peace_count,
      friendScreamScore: this.friendScreamScore(id),
      shareCount: this.db.prepare("SELECT COUNT(*) AS count FROM invites WHERE sender_id=?").get(id).count,
      shareVisits: this.db.prepare("SELECT COUNT(*) AS count FROM invite_visits v JOIN invites i ON i.id=v.invite_id WHERE i.sender_id=?").get(id).count,
      initialized: !!p.initialized,
      reactions: this.reactionSummary(id),
      progress: this.db
        .prepare(
          "SELECT spirit_id AS spiritId,peace_at AS peaceAt FROM progress WHERE player_id=?",
        )
        .all(id),

    };
  }
  // Each known friend has equal weight, even across links or signed-in devices.
  // Missing measurements are not zero; only saved, scored recordings count.
  friendScreamScore(id) {
    return this.db.prepare(`SELECT ROUND(AVG(score)) AS score FROM (
      SELECT AVG(d.score) AS score
      FROM reaction_audio a
      JOIN reaction_details d ON d.invite_id=a.invite_id AND d.player_id=a.player_id
      JOIN invites i ON i.id=a.invite_id
      LEFT JOIN account_members m ON m.player_id=a.player_id
      LEFT JOIN account_members owner ON owner.player_id=i.sender_id
      WHERE i.sender_id=? AND a.player_id<>i.sender_id AND d.score IS NOT NULL
        AND (m.subject IS NULL OR owner.subject IS NULL OR m.subject<>owner.subject)
      GROUP BY CASE WHEN m.subject IS NULL THEN 'guest:' || a.player_id ELSE 'account:' || m.subject END
    )`).get(id).score;
  }
  createGuest() {
    const id = randomUUID(),
      token = randomBytes(32).toString("base64url");
    this.transaction(() => {
      this.db
        .prepare("INSERT INTO players(id,name,created_at) VALUES(?,?,?)")
        .run(
          id,
          `Little Boo ${randomBytes(2).toString("hex").toUpperCase()}`,
          this.now(),
        );
      this.db
        .prepare(
          "INSERT INTO sessions(hash,player_id,created_at) VALUES(?,?,?)",
        )
        .run(digest(token), id, this.now());
    });
    return { token, player: this.state(id) };
  }
  authenticate(token) {
    if (!token || token.length > 100) return null;
    return (
      this.db
        .prepare("SELECT s.player_id FROM sessions s WHERE s.hash=? AND s.created_at > ? - CASE WHEN EXISTS(SELECT 1 FROM accounts a WHERE a.player_id=s.player_id) THEN 2592000000 ELSE 31536000000 END")
        .get(digest(token),this.now())?.player_id || null
    );
  }
  accountLogin(guestId, subject) {
    if (typeof subject !== 'string' || !subject || subject.length > 200) fail(401, 'Invalid account.');
    return this.transaction(() => {
      const membership = this.db.prepare('SELECT subject FROM account_members WHERE player_id=?').get(guestId);
      if (membership && membership.subject !== subject) fail(409, 'Sign out before using another account.');
      const existing = this.db.prepare('SELECT player_id FROM accounts WHERE subject=?').get(subject);
      const id = existing?.player_id || guestId;
      if (!existing) this.db.prepare('INSERT INTO accounts VALUES(?,?,?)').run(subject,id,this.now());
      this.db.prepare('INSERT OR IGNORE INTO account_members VALUES(?,?)').run(guestId,subject);
      if (id !== guestId) {
        const guest = this.rawPlayer(guestId), owner = this.rawPlayer(id);
        this.db.prepare('UPDATE invites SET sender_id=? WHERE sender_id=?').run(id,guestId);
        // Keep the more advanced progress, without stacking repeat welcome bonuses.
        this.db.prepare(`INSERT INTO progress SELECT ?,spirit_id,peace_at FROM progress WHERE player_id=?
          ON CONFLICT(player_id,spirit_id) DO UPDATE SET peace_at=COALESCE(progress.peace_at,excluded.peace_at)`).run(id,guestId);
        this.db.prepare(`UPDATE players SET peace_count=(SELECT COUNT(*) FROM progress WHERE player_id=? AND peace_at IS NOT NULL) WHERE id=?`).run(id,id);
        if (!owner.initialized && guest.initialized) this.db.prepare('UPDATE players SET name=?,country=?,selected=?,initialized=1 WHERE id=?').run(guest.name,guest.country,guest.selected,id);
      }
      // A guest cookie must never become a reusable credential for a permanent account.
      this.db.prepare('DELETE FROM sessions WHERE player_id=?').run(guestId);
      const token = randomBytes(32).toString('base64url');
      this.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),id,this.now());
      return {token,player:this.state(id)};
    });
  }
  logout(token) {
    if (token) this.db.prepare('DELETE FROM sessions WHERE hash=?').run(digest(token));
  }
  ghostLinks(id, offset = 0, spiritId = "") {
    const links = this.db.prepare(`SELECT i.id AS inviteId,i.spirit_id AS spiritId,i.created_at AS createdAt,l.friend_name AS friendName,
      (SELECT COUNT(*) FROM invite_visits v WHERE v.invite_id=i.id) AS visits
      FROM invites i LEFT JOIN invite_labels l ON l.invite_id=i.id WHERE i.sender_id=? AND (?='' OR i.spirit_id=?) ORDER BY i.created_at DESC,i.id DESC LIMIT 21 OFFSET ?`).all(id,spiritId,spiritId,offset);
    const hasMore=links.length>20;
    return {hasMore,spirits:this.db.prepare('SELECT DISTINCT spirit_id FROM invites WHERE sender_id=? ORDER BY spirit_id').all(id).map(r=>r.spirit_id),links:links.slice(0,20).map(link=>({...link,recordings:this.db.prepare(`SELECT a.player_id AS receiverId,COALESCE(d.name,p.name) AS name,COALESCE(d.duration_ms,5000) AS durationMs,a.created_at AS createdAt
      FROM reaction_audio a JOIN players p ON p.id=a.player_id LEFT JOIN reaction_details d ON d.invite_id=a.invite_id AND d.player_id=a.player_id
      WHERE a.invite_id=? ORDER BY a.created_at ASC,a.rowid ASC LIMIT 5`).all(link.inviteId)}))};
  }
  onboard(id, { name, country, spiritId }) {
    this.spirit(spiritId);
    if (!COUNTRY_CODES.includes(country))
      fail(400, "Choose a country or region from the list.");
    name = String(name || "")
      .normalize("NFKC")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim();
    if (name.length < 1 || name.length > 24)
      fail(400, "Use a name between 1 and 24 characters.");
    return this.transaction(() => {
      const p = this.rawPlayer(id);
      if (p.initialized) {
        if (p.country !== country)
          fail(409, "Your country is fixed after joining.");
        return this.state(id);
      }
      this.db
        .prepare(
          "UPDATE players SET name=?,country=?,selected=?,initialized=1 WHERE id=?",
        )
        .run(name, country, spiritId, id);

      this.event("character_selected", spiritId);
      return this.state(id);
    });
  }
  select(id, spiritId) {
    this.ready(id);
    this.spirit(spiritId);
    this.db
      .prepare("UPDATE players SET selected=? WHERE id=?")
      .run(spiritId, id);
    return this.state(id);
  }
  gift() {fail(410,'This feature has retired.');}
  startMatch() {fail(410,'This feature has retired.');}
  finishMatch() {fail(410,'This feature has retired.');}
  cancelMatch() {fail(410,'This feature has retired.');}
  createInvite(id, { spiritId, channel, friendName = "" }) {
    this.rawPlayer(id);
    this.spirit(spiritId);
    if (!CHANNELS.includes(channel))
      fail(400, "Choose a supported sharing option.");
    if (typeof friendName !== 'string' || friendName.trim().length > 24 || /[\u0000-\u001f\u007f]/.test(friendName)) fail(400, 'Use a friend name of up to 24 characters.');
    friendName = friendName.trim();
    const token = randomBytes(16).toString("base64url");
    this.db
      .prepare("INSERT INTO invites VALUES(?,?,?,?,?)")
      .run(token, id, spiritId, channel, this.now());
    if (friendName) this.db.prepare('INSERT INTO invite_labels VALUES(?,?)').run(token,friendName);
    this.event("share_started", channel);
    return { id: token, spiritId, channel };
  }
  invite(token) {
    if (typeof token !== "string" || token.length > 80)
      fail(404, "This invitation could not be found.");
    const row = this.db
      .prepare(
        "SELECT i.*,p.name,p.country FROM invites i JOIN players p ON p.id=i.sender_id WHERE i.id=?",
      )
      .get(token);
    if (!row) fail(404, "This invitation could not be found.");
    return {
      id: row.id,
      senderId: row.sender_id,
      name: row.name,
      country: row.country,
      spiritId: row.spirit_id,
      channel: row.channel,
      expired: this.now() - row.created_at > RULES.inviteLifetimeMs,
      recordingFull: this.db.prepare("SELECT COUNT(*) AS n FROM reaction_audio WHERE invite_id=?").get(token).n >= 5,
    };
  }
  recordInviteVisit(id, token) {
    this.rawPlayer(id);
    const invite = this.invite(token);
    if (invite.senderId === id || invite.expired) return { counted: false };
    const result = this.db.prepare("INSERT OR IGNORE INTO invite_visits VALUES(?,?,?)").run(token,id,this.now());
    return { counted: result.changes > 0 };
  }
  reactionSummary(id) {
    const stats = this.db.prepare(`SELECT i.spirit_id AS spiritId, ROUND(AVG(r.mean_hz)) AS meanHz, COUNT(r.mean_hz) AS measured, COUNT(*) AS views FROM reactions r JOIN invites i ON i.id=r.invite_id WHERE i.sender_id=? GROUP BY i.spirit_id`).all(id);
    const recent = this.db.prepare(`SELECT r.invite_id AS inviteId,r.player_id AS receiverId,COALESCE(d.name,p.name) AS name,d.score,COALESCE(d.duration_ms,5000) AS durationMs,l.friend_name AS friendName,i.spirit_id AS spiritId,r.mean_hz AS meanHz,r.peak_hz AS peakHz,r.created_at AS createdAt,r.seen_at AS seenAt, EXISTS(SELECT 1 FROM reaction_audio a WHERE a.invite_id=r.invite_id AND a.player_id=r.player_id) AS hasAudio FROM reactions r JOIN invites i ON i.id=r.invite_id JOIN players p ON p.id=r.player_id LEFT JOIN reaction_details d ON d.invite_id=r.invite_id AND d.player_id=r.player_id LEFT JOIN invite_labels l ON l.invite_id=i.id WHERE i.sender_id=? ORDER BY r.created_at DESC LIMIT 30`).all(id).map(r=>({...r,level:pitchLevel(r.meanHz)}));
    const links = this.db.prepare(`SELECT i.id AS inviteId,i.spirit_id AS spiritId,l.friend_name AS friendName,i.created_at AS createdAt,
      (SELECT COUNT(*) FROM invite_visits v WHERE v.invite_id=i.id) AS visits,
      (SELECT COUNT(*) FROM reaction_audio a WHERE a.invite_id=i.id) AS recordings
      FROM invites i LEFT JOIN invite_labels l ON l.invite_id=i.id WHERE i.sender_id=? ORDER BY i.created_at DESC LIMIT 50`).all(id);
    return {stats,recent,links};
  }
  recordReaction(id, token, body) {
    this.rawPlayer(id);
    const invite = this.invite(token);
    if(invite.senderId === id) fail(409, 'Send this surprise to a friend.');
    if(invite.expired) fail(410, 'This invitation has expired.');
    if(body.consent !== true) fail(400, 'Reaction sharing requires your consent.');
    const {meanHz,peakHz,frames} = body;
    if(!Number.isInteger(frames) || frames < 0 || frames > 100) fail(400, 'Invalid sample count.');
    if(meanHz === null && peakHz === null ? frames !== 0 :
      !Number.isInteger(meanHz) || !Number.isInteger(peakHz) || meanHz < 70 || peakHz > 1200 || peakHz < meanHz || frames < 5)
      fail(400, 'Invalid pitch measurement.');
    this.db.prepare('INSERT OR IGNORE INTO reactions(invite_id,player_id,mean_hz,peak_hz,frames,created_at) VALUES(?,?,?,?,?,?)').run(token,id,meanHz,peakHz,frames,this.now());
    return {ok:true};
  }
  recordAudio(id, token, body) {
    this.rawPlayer(id);
    const invite = this.invite(token);
    if (invite.senderId === id) fail(409, 'Send this surprise to a friend.');
    if (invite.expired) fail(410, 'This invitation has expired.');
    if (body.consent !== true) fail(400, 'Recording and sending requires consent.');
    if (!['audio/webm', 'audio/ogg', 'audio/mp4'].includes(body.mime)) fail(415, 'Unsupported audio format.');
    if (![2000,3000,5000,6000].includes(body.durationMs) || typeof body.audio !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.audio)) fail(400, 'Invalid recording.');
    const receiver = this.rawPlayer(id);
    const label = this.db.prepare('SELECT friend_name FROM invite_labels WHERE invite_id=?').get(token)?.friend_name;
    // New clients use the unlock notice and do not ask visitors for a name.
    // Preserve supplied names from older clients and existing recordings.
    const name = body.durationMs <= 3000 && body.name !== undefined ? body.name :
      receiver.initialized ? receiver.name : label || receiver.name;
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 24 || /[\u0000-\u001f\u007f]/.test(name)) fail(400, 'Enter your name (1–24 characters).');
    const hasMeasurement = body.durationMs <= 3000 || ['score','meanHz','peakHz','frames'].some(key=>Object.hasOwn(body,key));
    const score = hasMeasurement ? body.score ?? null : null;
    if (score !== null && (!Number.isInteger(score) || score < 0 || score > 100)) fail(400, 'Invalid local score.');
    if (hasMeasurement) {
      const {meanHz,peakHz,frames} = body;
      if (!Number.isInteger(frames) || frames < 0 || frames > 100 ||
          (meanHz === null && peakHz === null ? frames !== 0 || score !== null :
          !Number.isInteger(meanHz) || !Number.isInteger(peakHz) || meanHz < 70 || peakHz > 1200 || peakHz < meanHz || frames < 5)) fail(400, 'Invalid pitch measurement.');
    }
    const language=body.language ?? null, rms=body.amplitudeRms ?? null;
    if(language!==null && !languages.some(([code])=>code===language))fail(400,'Invalid recording language.');
    if(rms!==null && (typeof rms!=='number' || !Number.isFinite(rms) || rms<0 || rms>1 || language===null))fail(400,'Invalid recording intensity.');
    const audio = Buffer.from(body.audio, 'base64');
    if (!audio.length || audio.length > 512000) fail(413, 'Recording too large.');
    const valid = body.mime === 'audio/webm' ? audio.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])) : body.mime === 'audio/ogg' ? audio.toString('ascii',0,4) === 'OggS' : audio.toString('ascii',4,8) === 'ftyp';
    if (!valid) fail(400, 'Invalid audio container.');
    return this.transaction(() => {
      if (this.db.prepare('SELECT 1 FROM reaction_audio WHERE invite_id=? AND player_id=?').get(token,id)) return {ok:true, alreadySent:true};
      const member = this.db.prepare('SELECT subject FROM account_members WHERE player_id=?').get(id);
      if(member && this.db.prepare(`SELECT 1 FROM reaction_audio a JOIN account_members m ON m.player_id=a.player_id WHERE a.invite_id=? AND m.subject=?`).get(token,member.subject)) return {ok:true,alreadySent:true};
      if(this.db.prepare('SELECT COUNT(*) AS n FROM reaction_audio WHERE invite_id=?').get(token).n >= 5) return {ok:true,full:true};
      const count = this.db.prepare('SELECT COUNT(*) AS n FROM reaction_audio WHERE player_id=? AND created_at>?').get(id,this.now()-86400000).n;
      if (count >= 20) fail(429, 'Daily recording limit reached.');
      this.db.prepare('INSERT INTO reaction_audio VALUES(?,?,?,?,?)').run(token,id,body.mime,audio,this.now());
      this.db.prepare('INSERT INTO reaction_details VALUES(?,?,?,?,?)').run(token,id,name.trim(),score,body.durationMs);
      if(language!==null)this.db.prepare('INSERT INTO reaction_intensity VALUES(?,?,?,?)').run(token,id,language,rms);
      if (hasMeasurement) this.db.prepare(`INSERT INTO reactions(invite_id,player_id,mean_hz,peak_hz,frames,created_at) VALUES(?,?,?,?,?,?)
        ON CONFLICT(invite_id,player_id) DO UPDATE SET mean_hz=excluded.mean_hz,peak_hz=excluded.peak_hz,frames=excluded.frames`).run(token,id,body.meanHz,body.peakHz,body.frames,this.now());
      else this.db.prepare('INSERT OR IGNORE INTO reactions(invite_id,player_id,mean_hz,peak_hz,frames,created_at) VALUES(?,?,NULL,NULL,0,?)').run(token,id,this.now());
      this.db.prepare('UPDATE reactions SET seen_at=NULL,created_at=? WHERE invite_id=? AND player_id=?').run(this.now(),token,id);
      return {ok:true};
    });
  }
  reactionAudio(id, token, receiver) {
    const row = this.db.prepare('SELECT a.mime,a.audio FROM reaction_audio a JOIN invites i ON i.id=a.invite_id WHERE a.invite_id=? AND a.player_id=? AND i.sender_id=?').get(token,receiver,id);
    if (!row) fail(404, 'Recording unavailable.');
    return row;
  }
  readReactions(id) {
    this.db.prepare('UPDATE reactions SET seen_at=? WHERE invite_id IN (SELECT id FROM invites WHERE sender_id=?) AND seen_at IS NULL').run(this.now(),id);
    return {player:this.state(id)};
  }
  respond(id, token) {
    this.ready(id);
    return this.transaction(() => {
      const invite = this.invite(token);
      if (invite.senderId === id)
        fail(409, "This is your own surprise. Send it to a friend!");
      const old = this.db
        .prepare(
          "SELECT result FROM responses WHERE invite_id=? AND player_id=?",
        )
        .get(token, id);
      if (old) return { ...JSON.parse(old.result), player: this.state(id) };
      const result = {name:invite.name,expired:invite.expired};
      this.db
        .prepare("INSERT INTO responses VALUES(?,?,?,?)")
        .run(token, id, JSON.stringify(result), this.now());
      this.event("invite_responded", invite.channel);
      return { ...result, player: this.state(id) };
    });
  }
  screamRankings(id, scope='trick') {
    if(!['trick','intensity'].includes(scope))fail(400,'Choose a valid leaderboard.');
    // Only saved audio contributes. Retries and full-link submissions add no rows.
    // Each participant has equal weight within a language, across all their recordings.
    const scores=scope==='trick' ? `SELECT p.id,p.name,COUNT(*) AS score,COUNT(*) AS recordings
      FROM reaction_audio a JOIN invites i ON i.id=a.invite_id JOIN players p ON p.id=i.sender_id
      WHERE a.player_id<>i.sender_id GROUP BY p.id` :
      `WITH participant_scores AS (
        SELECT r.language,COALESCE(m.subject,r.player_id) AS participant,AVG(r.rms) AS intensity,COUNT(*) AS recordings
        FROM reaction_intensity r LEFT JOIN account_members m ON m.player_id=r.player_id
        WHERE r.rms IS NOT NULL GROUP BY r.language,participant)
      SELECT language AS id,language AS name,ROUND(AVG(intensity)*100,2) AS score,COUNT(*) AS participants,SUM(recordings) AS recordings
      FROM participant_scores GROUP BY language`;
    const ranked=`WITH scores AS (${scores}),ranked AS (SELECT *,RANK() OVER(ORDER BY score DESC) AS rank FROM scores)`;
    return {scope,rows:this.db.prepare(`${ranked} SELECT * FROM ranked ORDER BY score DESC,id LIMIT 100`).all(),
      self:scope==='trick'?this.db.prepare(`${ranked} SELECT * FROM ranked WHERE id=?`).get(id)||null:null,updatedAt:this.now()};
  }
  leaderboard() {fail(410,'This feature has retired.');}
  story(id, spiritId) {
    const spirit = this.spirit(spiritId);
    const progress = this.db
      .prepare(
        "SELECT peace_at FROM progress WHERE player_id=? AND spirit_id=?",
      )
      .get(id, spiritId);
    if (progress?.peace_at == null)
      fail(403, "Complete this wish to discover the ending.");
    return { story: spirit.story, peaceLabel: spirit.peaceLabel };
  }
  readStory(id, spiritId) {
    this.story(id, spiritId);
    return this.transaction(() => {
      const first =
        this.db
          .prepare("INSERT OR IGNORE INTO story_reads VALUES(?,?,?)")
          .run(id, spiritId, this.now()).changes > 0;
      if (first) this.event("story_read", spiritId);
      return first;
    });
  }
  event(event, detail = "") {
    this.db
      .prepare(
        "INSERT INTO analytics(day,event,detail,count) VALUES(?,?,?,1) ON CONFLICT(day,event,detail) DO UPDATE SET count=count+1",
      )
      .run(this.day(), event, String(detail).slice(0, 100));
  }
}
