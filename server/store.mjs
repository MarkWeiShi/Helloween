import { pitchLevel } from "../shared/reactions.mjs";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  RULES,
  CHANNELS,
  makeChallenge,
  scoreMatch,
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
    { now = () => Date.now(), inviteRewards = true } = {},
  ) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.catalog = catalog;
    this.now = now;
    this.inviteRewards = inviteRewards;
    this.spirits = new Map(catalog.spirits.map((s) => [s.id, s]));
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY,name TEXT NOT NULL,country TEXT,selected TEXT,wallet INTEGER NOT NULL DEFAULT 0 CHECK(wallet>=0),candies INTEGER NOT NULL DEFAULT 0 CHECK(candies>=0),peace_count INTEGER NOT NULL DEFAULT 0,initialized INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,player_id TEXT NOT NULL REFERENCES players(id),created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS progress(player_id TEXT NOT NULL REFERENCES players(id),spirit_id TEXT NOT NULL,donated INTEGER NOT NULL DEFAULT 0 CHECK(donated>=0 AND donated<=100),peace_at INTEGER,PRIMARY KEY(player_id,spirit_id));
      CREATE TABLE IF NOT EXISTS ledger(id TEXT PRIMARY KEY,player_id TEXT NOT NULL REFERENCES players(id),reason TEXT NOT NULL,delta INTEGER NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS matches(id TEXT PRIMARY KEY,player_id TEXT NOT NULL REFERENCES players(id),spirit_id TEXT NOT NULL,opponent_id TEXT NOT NULL,seed INTEGER NOT NULL,started_at INTEGER NOT NULL,result TEXT,cancelled INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS invites(id TEXT PRIMARY KEY,sender_id TEXT NOT NULL REFERENCES players(id),spirit_id TEXT NOT NULL,channel TEXT NOT NULL,eligible INTEGER NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS responses(invite_id TEXT NOT NULL REFERENCES invites(id),player_id TEXT NOT NULL REFERENCES players(id),result TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(invite_id,player_id));
      CREATE TABLE IF NOT EXISTS first_invites(player_id TEXT PRIMARY KEY REFERENCES players(id),invite_id TEXT NOT NULL REFERENCES invites(id));
      CREATE TABLE IF NOT EXISTS daily(player_id TEXT NOT NULL REFERENCES players(id),day TEXT NOT NULL,matches INTEGER NOT NULL DEFAULT 0,invites INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(player_id,day));
      CREATE TABLE IF NOT EXISTS operations(player_id TEXT NOT NULL REFERENCES players(id),kind TEXT NOT NULL,key TEXT NOT NULL,body_hash TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(player_id,kind,key));
      CREATE TABLE IF NOT EXISTS analytics(day TEXT NOT NULL,event TEXT NOT NULL,detail TEXT NOT NULL,count INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(day,event,detail));
      CREATE TABLE IF NOT EXISTS story_reads(player_id TEXT NOT NULL REFERENCES players(id),spirit_id TEXT NOT NULL,read_at INTEGER NOT NULL,PRIMARY KEY(player_id,spirit_id));
      CREATE TABLE IF NOT EXISTS reactions(invite_id TEXT NOT NULL REFERENCES invites(id),player_id TEXT NOT NULL REFERENCES players(id),mean_hz INTEGER,peak_hz INTEGER,frames INTEGER NOT NULL,created_at INTEGER NOT NULL,seen_at INTEGER,PRIMARY KEY(invite_id,player_id));
      CREATE TABLE IF NOT EXISTS reaction_audio(invite_id TEXT NOT NULL REFERENCES invites(id),player_id TEXT NOT NULL REFERENCES players(id),mime TEXT NOT NULL,audio BLOB NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(invite_id,player_id));
      CREATE INDEX IF NOT EXISTS matches_player ON matches(player_id,started_at);
      CREATE INDEX IF NOT EXISTS players_candies ON players(candies DESC);
      CREATE INDEX IF NOT EXISTS players_peace ON players(peace_count DESC);
      CREATE INDEX IF NOT EXISTS players_country ON players(country);
      CREATE INDEX IF NOT EXISTS ledger_player ON ledger(player_id,created_at);
      PRAGMA user_version=1;`);
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
    const daily = this.db
      .prepare("SELECT * FROM daily WHERE player_id=? AND day=?")
      .get(id, this.day());
    return {
      id: p.id,
      name: p.name,
      country: p.country,
      selected: p.selected,
      wallet: p.wallet,
      candies: p.candies,
      peaceCount: p.peace_count,
      initialized: !!p.initialized,
      reactions: this.reactionSummary(id),
      progress: this.db
        .prepare(
          "SELECT spirit_id AS spiritId,donated,peace_at AS peaceAt FROM progress WHERE player_id=?",
        )
        .all(id),
      remainingMatches: Math.max(0, RULES.matchDaily - (daily?.matches || 0)),
      remainingInvites: Math.max(0, RULES.inviteDaily - (daily?.invites || 0)),
      hasClaimedInvite: !!this.db
        .prepare("SELECT 1 FROM first_invites WHERE player_id=?")
        .get(id),
    };
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
        .prepare("SELECT player_id FROM sessions WHERE hash=?")
        .get(digest(token))?.player_id || null
    );
  }
  award(id, key, reason, amount) {
    const inserted = this.db
      .prepare(
        "INSERT OR IGNORE INTO ledger(id,player_id,reason,delta,created_at) VALUES(?,?,?,?,?)",
      )
      .run(key, id, reason, amount, this.now());
    if (inserted.changes) {
      this.db
        .prepare(
          "UPDATE players SET wallet=wallet+?,candies=candies+? WHERE id=?",
        )
        .run(amount, amount, id);
    }
    return !!inserted.changes;
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
          fail(409, "Your country is fixed after your first candy.");
        return this.state(id);
      }
      this.db
        .prepare(
          "UPDATE players SET name=?,country=?,selected=?,initialized=1 WHERE id=?",
        )
        .run(name, country, spiritId, id);
      this.award(id, `welcome:${id}`, "welcome", RULES.welcome);
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
  dailyRow(id) {
    this.db
      .prepare("INSERT OR IGNORE INTO daily(player_id,day) VALUES(?,?)")
      .run(id, this.day());
    return this.db
      .prepare("SELECT * FROM daily WHERE player_id=? AND day=?")
      .get(id, this.day());
  }
  operation(id, kind, key, body, fn) {
    if (typeof key !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(key))
      fail(400, "A valid request ID is required.");
    return this.transaction(() => {
      const hash = digest(JSON.stringify(body));
      const old = this.db
        .prepare(
          "SELECT * FROM operations WHERE player_id=? AND kind=? AND key=?",
        )
        .get(id, kind, key);
      if (old) {
        if (old.body_hash !== hash)
          fail(409, "That request ID was already used for a different action.");
        return JSON.parse(old.result);
      }
      const result = fn();
      this.db
        .prepare("INSERT INTO operations VALUES(?,?,?,?,?)")
        .run(id, kind, key, hash, JSON.stringify(result));
      return result;
    });
  }
  gift(id, spiritId, amount, key) {
    this.ready(id);
    this.spirit(spiritId);
    if (amount !== "complete" && amount !== 10)
      fail(400, "Choose ten candies or complete the wish.");
    return this.operation(id, "gift", key, { spiritId, amount }, () => {
      const p = this.rawPlayer(id);
      this.db
        .prepare(
          "INSERT OR IGNORE INTO progress(player_id,spirit_id) VALUES(?,?)",
        )
        .run(id, spiritId);
      const row = this.db
        .prepare("SELECT * FROM progress WHERE player_id=? AND spirit_id=?")
        .get(id, spiritId);
      if (row.peace_at !== null)
        fail(
          409,
          "This wish is already complete. You can replay the story for free.",
        );
      const need = RULES.peaceCost - row.donated;
      const cost = amount === "complete" ? need : Math.min(10, need);
      if (p.wallet < cost)
        fail(
          409,
          `You need ${cost - p.wallet} more candies. A lantern duel can help.`,
        );
      this.db
        .prepare("UPDATE players SET wallet=wallet-? WHERE id=?")
        .run(cost, id);
      this.db
        .prepare("INSERT INTO ledger VALUES(?,?,?,?,?)")
        .run(`gift:${id}:${key}`, id, "gift", -cost, this.now());
      const completed = row.donated + cost === RULES.peaceCost;
      this.db
        .prepare(
          "UPDATE progress SET donated=donated+?,peace_at=? WHERE player_id=? AND spirit_id=?",
        )
        .run(cost, completed ? this.now() : null, id, spiritId);
      if (completed) {
        this.db
          .prepare("UPDATE players SET peace_count=peace_count+1 WHERE id=?")
          .run(id);
        this.event("wish_completed", spiritId);
      }
      return { spent: cost, completed, spiritId, player: this.state(id) };
    });
  }
  startMatch(id, spiritId, opponentId) {
    this.ready(id);
    const self = this.spirit(spiritId),
      other = this.spirit(opponentId);
    if (self.regionId === other.regionId)
      fail(400, "Choose an opponent from another culture.");
    const active = this.db
      .prepare(
        "SELECT * FROM matches WHERE player_id=? AND result IS NULL AND cancelled=0 AND started_at>? ORDER BY started_at DESC LIMIT 1",
      )
      .get(id, this.now() - 120000);
    if (active) {
      if (active.spirit_id !== spiritId || active.opponent_id !== opponentId)
        fail(409, "Finish or leave your current duel first.");
      return this.matchView(active);
    }
    const match = {
      id: randomUUID(),
      player_id: id,
      spirit_id: spiritId,
      opponent_id: opponentId,
      seed: randomBytes(4).readUInt32LE(),
      started_at: this.now(),
    };
    this.db
      .prepare(
        "INSERT INTO matches(id,player_id,spirit_id,opponent_id,seed,started_at) VALUES(?,?,?,?,?,?)",
      )
      .run(match.id, id, spiritId, opponentId, match.seed, match.started_at);
    return this.matchView(match);
  }
  matchView(m) {
    return {
      id: m.id,
      spiritId: m.spirit_id,
      opponentId: m.opponent_id,
      startedAt: m.started_at,
      elapsedMs: Math.max(0, this.now() - m.started_at),
      ...makeChallenge(m.seed),
    };
  }
  finishMatch(id, matchId, taps) {
    this.ready(id);
    return this.transaction(() => {
      const match = this.db
        .prepare("SELECT * FROM matches WHERE id=? AND player_id=?")
        .get(matchId, id);
      if (!match) fail(404, "This duel could not be found.");
      if (match.result)
        return { ...JSON.parse(match.result), player: this.state(id) };
      if (match.cancelled)
        fail(409, "This duel was left without claiming candy.");
      const elapsed = this.now() - match.started_at;
      if (elapsed < RULES.matchMs - 1000)
        fail(409, "The lantern duel is still in progress.");
      if (elapsed > 120000)
        fail(410, "This duel expired. Please start a fresh one.");
      let result;
      try {
        result = scoreMatch(taps, makeChallenge(match.seed));
      } catch {
        fail(400, "The tap timings were not valid.");
      }
      const daily = this.dailyRow(id);
      const reward =
        result.active && daily.matches < RULES.matchDaily
          ? RULES[result.outcome]
          : 0;
      if (result.active) {
        this.db
          .prepare(
            "UPDATE daily SET matches=matches+1 WHERE player_id=? AND day=?",
          )
          .run(id, this.day());
      }
      if (reward) this.award(id, `match:${match.id}`, "battle", reward);
      const output = {
        ...result,
        reward,
        matchId,
        spiritId: match.spirit_id,
        opponentId: match.opponent_id,
      };
      this.db
        .prepare("UPDATE matches SET result=? WHERE id=?")
        .run(JSON.stringify(output), matchId);
      this.event("battle_completed", result.outcome);
      return { ...output, player: this.state(id) };
    });
  }
  cancelMatch(id, matchId) {
    this.db
      .prepare(
        "UPDATE matches SET cancelled=1 WHERE id=? AND player_id=? AND result IS NULL",
      )
      .run(matchId, id);
    return { ok: true };
  }
  createInvite(id, { spiritId, channel }) {
    this.ready(id);
    this.spirit(spiritId);
    if (!CHANNELS.includes(channel))
      fail(400, "Choose a supported sharing option.");
    const token = randomBytes(16).toString("base64url");
    const eligible = channel !== "facebook" && this.inviteRewards;
    this.db
      .prepare("INSERT INTO invites VALUES(?,?,?,?,?,?)")
      .run(token, id, spiritId, channel, eligible ? 1 : 0, this.now());
    this.event("share_started", channel);
    return { id: token, eligible, spiritId, channel };
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
      eligible: !!row.eligible && this.inviteRewards,
      expired: this.now() - row.created_at > RULES.inviteLifetimeMs,
    };
  }
  reactionSummary(id) {
    const stats = this.db.prepare(`SELECT i.spirit_id AS spiritId, ROUND(AVG(r.mean_hz)) AS meanHz, COUNT(r.mean_hz) AS measured, COUNT(*) AS views FROM reactions r JOIN invites i ON i.id=r.invite_id WHERE i.sender_id=? GROUP BY i.spirit_id`).all(id);
    const recent = this.db.prepare(`SELECT r.invite_id AS inviteId,r.player_id AS receiverId,p.name,i.spirit_id AS spiritId,r.mean_hz AS meanHz,r.peak_hz AS peakHz,r.created_at AS createdAt,r.seen_at AS seenAt, EXISTS(SELECT 1 FROM reaction_audio a WHERE a.invite_id=r.invite_id AND a.player_id=r.player_id) AS hasAudio FROM reactions r JOIN invites i ON i.id=r.invite_id JOIN players p ON p.id=r.player_id WHERE i.sender_id=? ORDER BY r.created_at DESC LIMIT 30`).all(id).map(r=>({...r,level:pitchLevel(r.meanHz)}));
    return {stats,recent};
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
    if (body.durationMs !== 5000 || typeof body.audio !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.audio)) fail(400, 'Invalid recording.');
    const audio = Buffer.from(body.audio, 'base64');
    if (!audio.length || audio.length > 512000) fail(413, 'Recording too large.');
    const valid = body.mime === 'audio/webm' ? audio.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])) : body.mime === 'audio/ogg' ? audio.toString('ascii',0,4) === 'OggS' : audio.toString('ascii',4,8) === 'ftyp';
    if (!valid) fail(400, 'Invalid audio container.');
    return this.transaction(() => {
      if (this.db.prepare('SELECT 1 FROM reaction_audio WHERE invite_id=? AND player_id=?').get(token,id)) return {ok:true, alreadySent:true};
      const count = this.db.prepare('SELECT COUNT(*) AS n FROM reaction_audio WHERE player_id=? AND created_at>?').get(id,this.now()-86400000).n;
      if (count >= 20) fail(429, 'Daily recording limit reached.');
      this.db.prepare('INSERT INTO reaction_audio VALUES(?,?,?,?,?)').run(token,id,body.mime,audio,this.now());
      this.db.prepare('INSERT OR IGNORE INTO reactions(invite_id,player_id,mean_hz,peak_hz,frames,created_at) VALUES(?,?,NULL,NULL,0,?)').run(token,id,this.now());
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
      const claimed = !!this.db
        .prepare("SELECT 1 FROM first_invites WHERE player_id=?")
        .get(id);
      let receiverReward = 0,
        senderReward = 0;
      if (invite.eligible && !invite.expired && !claimed) {
        this.db.prepare("INSERT INTO first_invites VALUES(?,?)").run(id, token);
        receiverReward = RULES.invite;
        this.award(
          id,
          `invite:receiver:${id}`,
          "invite_received",
          receiverReward,
        );
        const daily = this.dailyRow(invite.senderId);
        if (daily.invites < RULES.inviteDaily) {
          senderReward = RULES.invite;
          this.award(
            invite.senderId,
            `invite:sender:${id}`,
            "invite_sent",
            senderReward,
          );
          this.db
            .prepare(
              "UPDATE daily SET invites=invites+1 WHERE player_id=? AND day=?",
            )
            .run(invite.senderId, this.day());
        }
      }
      const result = {
        receiverReward,
        senderReward,
        name: invite.name,
        eligible: invite.eligible,
        expired: invite.expired,
        alreadyClaimed: claimed,
      };
      this.db
        .prepare("INSERT INTO responses VALUES(?,?,?,?)")
        .run(token, id, JSON.stringify(result), this.now());
      this.event("invite_responded", invite.channel);
      return { ...result, player: this.state(id) };
    });
  }
  leaderboard(id, scope, metric) {
    if (
      !["players", "countries"].includes(scope) ||
      !["candies", "peace"].includes(metric)
    )
      fail(400, "Choose a valid leaderboard.");
    const p = this.rawPlayer(id),
      col = metric === "peace" ? "peace_count" : "candies";
    const base =
      scope === "players"
        ? `SELECT id,name,country,${col} AS score,1 AS participants FROM players WHERE initialized=1`
        : `SELECT country AS id,country AS name,country,SUM(${col}) AS score,COUNT(*) AS participants FROM players WHERE initialized=1 GROUP BY country`;
    const ranked = `WITH scores AS (${base}), ranked AS (SELECT *,RANK() OVER(ORDER BY score DESC) AS rank FROM scores)`;
    const rows = this.db
      .prepare(
        `${ranked} SELECT * FROM ranked ORDER BY score DESC,id LIMIT 100`,
      )
      .all();
    const self =
      this.db
        .prepare(`${ranked} SELECT * FROM ranked WHERE id=?`)
        .get(scope === "players" ? id : p.country || "") || null;
    return { scope, metric, rows, self, updatedAt: this.now() };
  }
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
