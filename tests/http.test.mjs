import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/index.mjs";
test("HTTP session, CSRF, visitor privacy and retired gift endpoints", async () => {
  const app = createApp({ databasePath: ":memory:", rateLimits: false });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const send = (path, body, cookie = "", headers = {}) =>
    fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        Cookie: cookie,
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  try {
    const res = await send("/api/session", {});
    let cookie = res.headers.get("set-cookie").split(";")[0];
    assert.match(res.headers.get("set-cookie"), /HttpOnly/);
    const session = await res.json();
    assert.equal(session.player.wallet, undefined);
    cookie = `boo_session=${app.store.accountLogin(session.player.id,"http-test").token}`;
    assert.equal((await send("/api/me")).status, 401);
    assert.equal(
      (
        await send(
          "/api/onboard",
          { name: "<img onerror=evil>", country: "JP", spiritId: "kappa" },
          cookie,
          { Origin: "https://evil.test" },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await send(
          "/api/onboard",
          { name: "Kind visitor", country: "JP", spiritId: "kappa" },
          cookie,
        )
      ).status,
      200,
    );
    const requests = Array.from({ length: 6 }, () =>
      send(
        "/api/spirits/kappa/gifts",
        { amount: 10, requestId: "http-repeat-gift" },
        cookie,
      ),
    );
    const results = await Promise.all(requests);
    assert.ok(results.every((r) => r.status === 410));
    const me=await (await send('/api/me',undefined,cookie)).json();
    assert.equal(me.player.wallet,undefined);assert.equal(me.player.candies,undefined);
    assert.equal(
      (await send("/api/spirits/kappa/story", undefined, cookie)).status,
      403,
    );
    assert.equal(
      (
        await send(
          "/api/events",
          { event: "story_read", detail: "kappa" },
          cookie,
        )
      ).status,
      403,
    );
    const catalog = await (await send("/api/catalog")).json();
    assert.equal(catalog.spirits.length, 56);
    assert.equal(catalog.countries.length, 249);
    assert.equal(catalog.spirits[0].story, undefined, "endings load on demand");
    assert.equal(catalog.spirits[0].reviewNotes, undefined);
    const invite = await (
      await send(
        "/api/invites",
        { spiritId: "kappa", channel: "facebook" },
        cookie,
      )
    ).json();
    assert.equal(invite.eligible, undefined);
    const publicInvite = await (await send(`/api/invites/${invite.id}`)).json();
    assert.equal(publicInvite.senderId, undefined);
    assert.equal(
      (await send("/api/events", { event: "invented" }, cookie)).status,
      400,
    );
    assert.equal(
      (
        await send(
          "/api/events",
          { event: "hellotalk_clicked", detail: "map" },
          cookie,
        )
      ).status,
      200,
    );
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
    app.close();
  }
});
