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

test("profile initialization is idempotent without a balance", () => {
  const { store, player } = setup();
  const p = player();
  assert.equal(store.state(p.player.id).wallet, undefined);
  store.onboard(p.player.id, {
    name: "Again",
    country: "JP",
    spiritId: "kappa",
  });
  assert.equal(store.state(p.player.id).candies, undefined);
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
test("invalid onboarding does not initialize a player", () => {
  const { store } = setup();
  const id = store.createGuest().player.id;
  for (const data of [
    { name: "a", country: "ZZ", spiritId: "kappa" },
    { name: "", country: "JP", spiritId: "kappa" },
    { name: "a".repeat(25), country: "JP", spiritId: "kappa" },
    { name: "a", country: "JP", spiritId: "unknown" },
  ])
    assert.throws(() => store.onboard(id, data));
  assert.equal(store.state(id).wallet, undefined);
  store.close();
});
test("any ISO country can join regardless of the cultural discovery regions", () => {
  const { store, player } = setup();
  const p = player("NZ");
  assert.equal(store.state(p.player.id).country, "NZ");
  assert.equal(store.state(p.player.id).selected, "kappa");
  store.close();
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
 assert.equal(state.wallet, undefined);
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

test('Kakao and WeChat links preserve their channel without awarding on creation',()=>{
 const {store,player}=setup(); const sender=player();
 for(const channel of ['kakao','wechat']) {
  const link=store.createInvite(sender.player.id,{spiritId:'kappa',channel});
  assert.equal(store.invite(link.id).channel,channel);
  assert.equal(store.invite(link.id).spiritId,'kappa');
 }
 assert.equal(store.state(sender.player.id).wallet, undefined);
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
