import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/index.mjs";
test("HTTP session, CSRF, visitor privacy and atomic gift retries", async () => {
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
    assert.equal(session.player.wallet, 0);
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
    assert.ok(results.every((r) => r.status === 200));
    const me = await (await send("/api/me", undefined, cookie)).json();
    assert.equal(me.player.wallet, 20);
    assert.equal(me.player.candies, 30);
    assert.equal(me.player.progress[0].donated, 10);
    await send(
      "/api/spirits/kappa/gifts",
      { amount: 10, requestId: "http-second-gift" },
      cookie,
    );
    const retry = await (
      await send(
        "/api/spirits/kappa/gifts",
        { amount: 10, requestId: "http-repeat-gift" },
        cookie,
      )
    ).json();
    assert.equal(
      retry.player.wallet,
      10,
      "a retry returns current state, not an older wallet",
    );
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
    assert.equal(invite.eligible, false);
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

test('video HTTP supports MIME, seeking, suffix ranges, HEAD and unsatisfiable ranges', async () => {
  const {mkdtemp,writeFile,rm} = await import('node:fs/promises');
  const {tmpdir} = await import('node:os');
  const {join} = await import('node:path');
  const {pathToFileURL} = await import('node:url');
  const root = pathToFileURL((await mkdtemp(join(tmpdir(),'boo-static-')))+ '/');
  await writeFile(new URL('index.html',root),'<main>isolated static root</main>');
  await writeFile(new URL('test.mp4',root),Buffer.from('0123456789'));
  await writeFile(new URL('test.webm',root),Buffer.from('0123456789'));
  const app = createApp({databasePath:':memory:',rateLimits:false,staticRoot:root.pathname});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.server.address().port}/`;
  try {
    assert.match(await (await fetch(base)).text(),/isolated static root/);
    assert.match(await (await fetch(base+'a-client-route')).text(),/isolated static root/);
    assert.equal((await fetch(base+'missing.mp4')).status,404);
    for (const [extension,mime] of [['mp4','video/mp4'],['webm','video/webm']]) {
      const whole=await fetch(`${base}test.${extension}`); assert.equal(whole.headers.get('content-type'),mime); assert.equal(await whole.text(),'0123456789');
      const head=await fetch(`${base}test.${extension}`,{method:'HEAD'}); assert.equal(head.headers.get('content-length'),'10'); assert.equal(await head.text(),'');
      for (const [range,body,contentRange] of [['bytes=2-5','2345','bytes 2-5/10'],['bytes=-3','789','bytes 7-9/10'],['bytes=8-','89','bytes 8-9/10']]) {
        const part=await fetch(`${base}test.${extension}`,{headers:{Range:range}}); assert.equal(part.status,206); assert.equal(part.headers.get('content-range'),contentRange); assert.equal(await part.text(),body);
      }
      const invalid=await fetch(`${base}test.${extension}`,{headers:{Range:'bytes=99-100'}}); assert.equal(invalid.status,416); assert.equal(invalid.headers.get('content-range'),'bytes */10');
    }
  } finally { await new Promise(resolve=>app.server.close(resolve)); app.close(); await rm(root,{recursive:true,force:true}); }
});
