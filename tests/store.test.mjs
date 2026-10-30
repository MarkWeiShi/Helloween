import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { BooStore } from "../server/store.mjs";
import { makeChallenge, RULES, scoreMatch } from "../shared/rules.mjs";
const catalog = JSON.parse(
  readFileSync(new URL("../content/catalog.json", import.meta.url), "utf8"),
);
function setup(options = {}) {
  let now = Date.UTC(2026, 9, 28, 12);
  const store = new BooStore(":memory:", catalog, {
    now: () => now,
    ...options,
  });
  const player = (country = "JP") => {
    const guest = store.createGuest();
    store.onboard(guest.player.id, {
      name: "Kind ghost",
      country,
      spiritId: "kappa",
    });
    return guest;
  };
  return { store, player, tick: (ms) => (now += ms) };
}
const readyMatch = (ctx, id, taps = "perfect") => {
  const m = ctx.store.startMatch(id, "kappa", "jiangshi");
  ctx.tick(15000);
  return ctx.store.finishMatch(id, m.id, taps === "perfect" ? m.targets : taps);
};

test("welcome is exactly once and affiliation locks with the award", () => {
  const { store, player } = setup();
  const p = player();
  assert.equal(store.state(p.player.id).wallet, 30);
  store.onboard(p.player.id, {
    name: "Again",
    country: "JP",
    spiritId: "kappa",
  });
  assert.equal(store.state(p.player.id).candies, 30);
  assert.throws(
    () =>
      store.onboard(p.player.id, {
        name: "Again",
        country: "CN",
        spiritId: "kappa",
      }),
    /country is fixed/,
  );
  store.close();
});
test("guest tokens are opaque, authenticated by hash and never exposed in player state", () => {
  const { store } = setup();
  const p = store.createGuest();
  assert.equal(store.authenticate(p.token), p.player.id);
  assert.equal(store.authenticate("invalid"), null);
  assert.equal(store.authenticate(null), null);
  assert.ok(!JSON.stringify(p.player).includes(p.token));
  assert.notEqual(
    store.db.prepare("SELECT hash FROM sessions").get().hash,
    p.token,
  );
  store.close();
});
test("validation prevents invalid onboarding from issuing any candy", () => {
  const { store } = setup();
  const id = store.createGuest().player.id;
  for (const data of [
    { name: "a", country: "ZZ", spiritId: "kappa" },
    { name: "", country: "JP", spiritId: "kappa" },
    { name: "a".repeat(25), country: "JP", spiritId: "kappa" },
    { name: "a", country: "JP", spiritId: "unknown" },
  ])
    assert.throws(() => store.onboard(id, data));
  assert.equal(store.state(id).wallet, 0);
  store.close();
});
test("any ISO country can join regardless of the cultural discovery regions", () => {
  const { store, player } = setup();
  const p = player("NZ");
  assert.equal(store.state(p.player.id).country, "NZ");
  assert.equal(store.state(p.player.id).selected, "kappa");
  store.close();
});
test("gifts are atomic and do not reduce lifetime earned candy", () => {
  const { store, player } = setup();
  const id = player().player.id;
  const r = store.gift(id, "kappa", 10, "gift-test-1");
  assert.equal(r.spent, 10);
  assert.equal(r.player.wallet, 20);
  assert.equal(r.player.candies, 30);
  assert.equal(r.player.progress[0].donated, 10);
  store.close();
});
test("gift retry has one debit; reusing a key for another gift is rejected", () => {
  const { store, player } = setup();
  const id = player().player.id;
  store.gift(id, "kappa", 10, "same-operation");
  store.gift(id, "kappa", 10, "same-operation");
  assert.equal(store.state(id).wallet, 20);
  assert.throws(
    () => store.gift(id, "jiangshi", 10, "same-operation"),
    /different action/,
  );
  store.close();
});
test("insufficient funds roll back progress creation and cannot produce negative balances", () => {
  const { store, player } = setup();
  const id = player().player.id;
  assert.throws(
    () => store.gift(id, "kappa", "complete", "too-expensive"),
    /more candies/,
  );
  assert.equal(store.state(id).wallet, 30);
  assert.equal(store.state(id).progress.length, 0);
  store.close();
});
test("independent gifts cannot spend the same last candies twice", () => {
  const { store, player } = setup();
  const id = player().player.id;
  for (let i = 0; i < 3; i++) store.gift(id, "kappa", 10, `operation-${i}`);
  assert.throws(
    () => store.gift(id, "jiangshi", 10, "operation-four"),
    /more candies/,
  );
  assert.equal(store.state(id).wallet, 0);
  assert.equal(store.state(id).candies, 30);
  store.close();
});
test("completion is one unique spirit, switching preserves progress, replay cannot award twice", () => {
  const ctx = setup();
  const id = ctx.player().player.id;
  for (let i = 0; i < 4; i++) readyMatch(ctx, id);
  ctx.store.gift(id, "kappa", "complete", "complete-first");
  assert.equal(ctx.store.state(id).peaceCount, 1);
  assert.equal(ctx.store.state(id).wallet, 10);
  assert.throws(
    () => ctx.store.gift(id, "kappa", 10, "already-done"),
    /already complete/,
  );
  ctx.store.select(id, "jiangshi");
  assert.equal(ctx.store.state(id).progress[0].donated, 100);
  assert.equal(ctx.store.state(id).peaceCount, 1);
  ctx.store.close();
});
test("invalid amounts and arbitrary characters cannot affect the wallet", () => {
  const { store, player } = setup();
  const id = player().player.id;
  for (const amount of [-10, 0, 100, 1.5, "-10"])
    assert.throws(() => store.gift(id, "kappa", amount, "invalid-gift"));
  assert.throws(() => store.gift(id, "missing", 10, "invalid-gift"));
  assert.equal(store.state(id).wallet, 30);
  store.close();
});
test("duel challenges and computer scores are stable before completion", () => {
  const { store, player } = setup();
  const id = player().player.id;
  const a = store.startMatch(id, "kappa", "jiangshi"),
    b = store.startMatch(id, "kappa", "jiangshi");
  assert.equal(a.id, b.id);
  assert.deepEqual(a.opponentScores, b.opponentScores);
  assert.throws(
    () => store.startMatch(id, "kappa", "nie-xiaoqian"),
    /current duel/,
  );
  assert.throws(
    () => store.startMatch(id, "kappa", "bake-danuki"),
    /another culture/,
  );
  store.close();
});
test("duels cannot be finished instantly or submitted for another player", () => {
  const ctx = setup();
  const id = ctx.player().player.id,
    id2 = ctx.player().player.id;
  const m = ctx.store.startMatch(id, "kappa", "jiangshi");
  assert.throws(
    () => ctx.store.finishMatch(id, m.id, m.targets),
    /still in progress/,
  );
  ctx.tick(15000);
  assert.throws(
    () => ctx.store.finishMatch(id2, m.id, m.targets),
    /not be found/,
  );
  ctx.store.close();
});
test("perfect score wins and duplicate result submission is exactly once", () => {
  const ctx = setup();
  const id = ctx.player().player.id;
  const m = ctx.store.startMatch(id, "kappa", "jiangshi");
  ctx.tick(15000);
  const a = ctx.store.finishMatch(id, m.id, m.targets),
    b = ctx.store.finishMatch(id, m.id, [0, 0, 0]);
  assert.equal(a.score, 300);
  assert.equal(a.reward, 20);
  assert.equal(b.score, a.score);
  assert.equal(ctx.store.state(id).wallet, 50);
  ctx.store.close();
});
test("abandoned, expired and malformed duels never award candy", () => {
  const ctx = setup();
  const id = ctx.player().player.id;
  let m = ctx.store.startMatch(id, "kappa", "jiangshi");
  ctx.store.cancelMatch(id, m.id);
  ctx.tick(15000);
  assert.throws(
    () => ctx.store.finishMatch(id, m.id, m.targets),
    /left without/,
  );
  m = ctx.store.startMatch(id, "kappa", "jiangshi");
  ctx.tick(15000);
  assert.throws(
    () => ctx.store.finishMatch(id, m.id, [NaN, Infinity, -1]),
    /not valid/,
  );
  ctx.tick(120001);
  assert.throws(() => ctx.store.finishMatch(id, m.id, m.targets), /expired/);
  assert.equal(ctx.store.state(id).wallet, 30);
  ctx.store.close();
});
test("non-interaction earns nothing; a completed losing duel earns ten", () => {
  const ctx = setup();
  const id = ctx.player().player.id;
  assert.equal(readyMatch(ctx, id, [null, null, null]).reward, 0);
  assert.equal(ctx.store.state(id).remainingMatches, 20);
  assert.equal(readyMatch(ctx, id, [0, 0, 0]).reward, 10);
  assert.equal(ctx.store.state(id).remainingMatches, 19);
  ctx.store.close();
});
test("battle daily cap permits play without rewards and resets at UTC midnight", () => {
  const ctx = setup();
  const id = ctx.player().player.id;
  for (let i = 0; i < 21; i++) {
    const r = readyMatch(ctx, id);
    assert.equal(r.reward, i < 20 ? 20 : 0);
  }
  assert.equal(ctx.store.state(id).wallet, 430);
  ctx.tick(86400000);
  assert.equal(readyMatch(ctx, id).reward, 20);
  ctx.store.close();
});
test("score calculation treats all cultures identically and accepts exact ties", () => {
  const c = { targets: [3000, 3000, 3000], opponentScores: [100, 100, 100] };
  assert.equal(scoreMatch([3000, 3000, 3000], c).outcome, "draw");
  assert.deepEqual(makeChallenge(42), makeChallenge(42));
  assert.throws(() => scoreMatch([1, 2], c));
});
test("opening an invitation is read-only; a response awards both participants once", () => {
  const { store, player } = setup();
  const a = player(),
    b = player("CN");
  const inv = store.createInvite(a.player.id, {
    spiritId: "kappa",
    channel: "line",
  });
  for (let i = 0; i < 3; i++) store.invite(inv.id);
  assert.equal(store.state(a.player.id).wallet, 30);
  const r = store.respond(b.player.id, inv.id);
  assert.equal(r.senderReward, 20);
  assert.equal(r.receiverReward, 20);
  store.respond(b.player.id, inv.id);
  assert.equal(store.state(a.player.id).wallet, 50);
  assert.equal(store.state(b.player.id).wallet, 50);
  store.close();
});
test("self-invites are rejected and one recipient cannot claim different senders", () => {
  const { store, player } = setup();
  const a = player(),
    b = player(),
    c = player();
  const inv = store.createInvite(a.player.id, {
    spiritId: "kappa",
    channel: "x",
  });
  assert.throws(() => store.respond(a.player.id, inv.id), /own surprise/);
  store.respond(b.player.id, inv.id);
  const inv2 = store.createInvite(c.player.id, {
    spiritId: "jiangshi",
    channel: "copy",
  });
  assert.equal(store.respond(b.player.id, inv2.id).receiverReward, 0);
  assert.equal(store.state(c.player.id).wallet, 30);
  store.close();
});
test("Facebook invitation never awards, and never consumes an eligible first invitation", () => {
  const { store, player } = setup();
  const a = player(),
    b = player();
  const inv = store.createInvite(a.player.id, {
    spiritId: "kappa",
    channel: "facebook",
  });
  assert.equal(inv.eligible, false);
  assert.equal(store.respond(b.player.id, inv.id).receiverReward, 0);
  assert.equal(store.state(b.player.id).hasClaimedInvite, false);
  const eligible = store.createInvite(a.player.id, {
    spiritId: "kappa",
    channel: "line",
  });
  assert.equal(store.respond(b.player.id, eligible.id).receiverReward, 20);
  store.close();
});
test("reward kill switch applies to previously issued invites", () => {
  const { store, player } = setup();
  const a = player(),
    b = player();
  const inv = store.createInvite(a.player.id, {
    spiritId: "kappa",
    channel: "x",
  });
  store.inviteRewards = false;
  assert.equal(store.invite(inv.id).eligible, false);
  assert.equal(store.respond(b.player.id, inv.id).receiverReward, 0);
  store.close();
});
test("inviter cap does not prevent a new receiver from receiving their welcome response", () => {
  const { store, player } = setup();
  const a = player();
  const inv = store.createInvite(a.player.id, {
    spiritId: "kappa",
    channel: "line",
  });
  for (let i = 0; i < 11; i++) {
    const b = player();
    const r = store.respond(b.player.id, inv.id);
    assert.equal(r.receiverReward, 20);
    assert.equal(r.senderReward, i < 10 ? 20 : 0);
  }
  assert.equal(store.state(a.player.id).wallet, 230);
  store.close();
});
test("expired invitation still resolves its character but issues no rewards", () => {
  const ctx = setup();
  const a = ctx.player(),
    b = ctx.player();
  const inv = ctx.store.createInvite(a.player.id, {
    spiritId: "kappa",
    channel: "line",
  });
  ctx.tick(RULES.inviteLifetimeMs + 1);
  assert.equal(ctx.store.invite(inv.id).spiritId, "kappa");
  assert.equal(ctx.store.respond(b.player.id, inv.id).receiverReward, 0);
  ctx.store.close();
});
test("invite freezes character even when sender changes costume", () => {
  const { store, player } = setup();
  const a = player();
  const inv = store.createInvite(a.player.id, {
    spiritId: "kappa",
    channel: "line",
  });
  store.select(a.player.id, "jiangshi");
  assert.equal(store.invite(inv.id).spiritId, "kappa");
  store.close();
});
test("leaderboards use total earned, ties, participant totals, and out-of-catalog countries", () => {
  const { store, player } = setup();
  const a = player("NZ"),
    b = player("NZ"),
    c = player("JP");
  store.gift(a.player.id, "kappa", 10, "rank-gift-one");
  let board = store.leaderboard(a.player.id, "players", "candies");
  assert.equal(board.rows.length, 3);
  assert.ok(board.rows.every((x) => x.rank === 1 && x.score === 30));
  board = store.leaderboard(a.player.id, "countries", "candies");
  assert.equal(board.self.country, "NZ");
  assert.equal(board.self.score, 60);
  assert.equal(board.self.participants, 2);
  assert.equal(board.self.rank, 1);
  assert.equal(
    store.leaderboard(c.player.id, "countries", "candies").self.rank,
    2,
  );
  assert.throws(() => store.leaderboard(a.player.id, "injection", "candies"));
  store.close();
});
test("persistent restart and SQLite backup restore preserve wallet, ledger and identity", async () => {
  const dir = mkdtempSync(join(tmpdir(), "boo-backup-"));
  const path = join(dir, "game.sqlite"),
    copy = join(dir, "restore.sqlite");
  try {
    let store = new BooStore(path, catalog);
    const guest = store.createGuest();
    store.onboard(guest.player.id, {
      name: "Persistent",
      country: "BR",
      spiritId: "saci",
    });
    store.gift(guest.player.id, "saci", 10, "persistent-gift");
    await backup(store.db, copy);
    store.close();
    store = new BooStore(path, catalog);
    assert.equal(store.authenticate(guest.token), guest.player.id);
    assert.equal(store.state(guest.player.id).wallet, 20);
    store.close();
    store = new BooStore(copy, catalog);
    assert.equal(store.state(guest.player.id).wallet, 20);
    assert.equal(store.state(guest.player.id).candies, 30);
    assert.equal(store.state(guest.player.id).progress[0].donated, 10);
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("only unlocked endings are readable and completed reads count once per player and character", () => {
  const ctx = setup();
  const id = ctx.player().player.id;
  assert.throws(() => ctx.store.story(id, "kappa"), /Complete this wish/);
  assert.throws(() => ctx.store.readStory(id, "kappa"), /Complete this wish/);
  for (let i = 0; i < 4; i++) readyMatch(ctx, id);
  ctx.store.gift(id, "kappa", "complete", "story-unlock-once");
  assert.equal(ctx.store.story(id, "kappa").story.length, 3);
  assert.equal(ctx.store.readStory(id, "kappa"), true);
  assert.equal(ctx.store.readStory(id, "kappa"), false);
  assert.equal(
    ctx.store.db
      .prepare(
        "SELECT SUM(count) count FROM analytics WHERE event='story_read'",
      )
      .get().count,
    1,
  );
  assert.equal(ctx.store.state(id).peaceCount, 1);
  ctx.store.close();
});

test('consented reaction reports are private, idempotent, and never award candy', () => {
 const {store,player,tick}=setup();
 const sender=player(), receiver=player(), other=player();
 const invitation=store.createInvite(sender.player.id,{spiritId:'kappa',channel:'copy'});
 const body={consent:true,meanHz:440,peakHz:780,frames:40};
 assert.throws(()=>store.recordReaction(receiver.player.id,invitation.id,{...body,consent:false}));
 assert.throws(()=>store.recordReaction(sender.player.id,invitation.id,body));
 assert.throws(()=>store.recordReaction(receiver.player.id,invitation.id,{...body,meanHz:1300}));
 store.recordReaction(receiver.player.id,invitation.id,body);
 store.recordReaction(receiver.player.id,invitation.id,{...body,meanHz:600});
 let state=store.state(sender.player.id);
 assert.equal(state.wallet,30);
 assert.equal(state.reactions.stats[0].meanHz,440);
 assert.equal(state.reactions.stats[0].measured,1);
 assert.equal(state.reactions.recent[0].peakHz,780);
 assert.equal(state.reactions.recent[0].level,'Big Boo');
 assert.equal(store.state(other.player.id).reactions.recent.length,0);
 store.recordReaction(other.player.id,invitation.id,{consent:true,meanHz:null,peakHz:null,frames:0});
 state=store.state(sender.player.id);
 assert.equal(state.reactions.stats[0].views,2);
 assert.equal(state.reactions.stats[0].meanHz,440);
 assert.ok(store.readReactions(sender.player.id).player.reactions.recent.every(r=>r.seenAt));
 tick(RULES.inviteLifetimeMs+1);
 assert.throws(()=>store.recordReaction(other.player.id,invitation.id,body));
 store.close();
});

test('social links preserve their channel without awarding on creation',()=>{
 const {store,player}=setup(); const sender=player();
 for(const channel of ['kakao','wechat','instagram','tiktok']) {
  const link=store.createInvite(sender.player.id,{spiritId:'kappa',channel});
  assert.equal(store.invite(link.id).channel,channel);
  assert.equal(store.invite(link.id).spiritId,'kappa');
 }
 assert.equal(store.state(sender.player.id).wallet,30);
 store.close();
});

test('share visits count distinct friend/link pairs without awarding sweets', () => {
  const {store,player,tick}=setup();
  const sender=player().player.id,friend=player().player.id;
  const invite=store.createInvite(sender,{spiritId:'kappa',channel:'x'});
  const before=store.state(sender).candies;
  store.invite(invite.id); // Preview/read requests do not count.
  assert.equal(store.state(sender).shareVisits,0);
  assert.equal(store.recordInviteVisit(sender,invite.id).counted,false);
  assert.equal(store.recordInviteVisit(friend,invite.id).counted,true);
  assert.equal(store.recordInviteVisit(friend,invite.id).counted,false);
  assert.equal(store.state(sender).shareVisits,1);
  assert.equal(store.state(sender).candies,before);
  tick(RULES.inviteLifetimeMs+1);
  assert.equal(store.recordInviteVisit(player().player.id,invite.id).counted,false);
});
