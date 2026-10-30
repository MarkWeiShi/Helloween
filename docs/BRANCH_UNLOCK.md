# HelloTalk open → game unlock

Implemented locally; not deployed or connected to live Branch webhooks. No new HelloTalk server endpoint is required. HelloTalk's existing native Branch SDK must report attributed mobile install/reinstall/open events with the link data intact. Verify that behavior on physical iOS/Android devices before enabling the gate.

## Game API

- `GET /api/hellotalk-unlock`: session required; returns `enabled`, `available`, `signedIn`, `unlocked`, `pending`, `expiresAt`. Never accepts another player ID.
- `POST /api/hellotalk-unlock` with `{}`: signed-in game account required. Builds a per-account URL from `https://brc.hellotalk.com/Helloween2026` with encoded attribution tags and `unlock_id`; returns `url` and status. Reuses a pending link for 24 hours. On failure returns 502; missing configuration returns 503. Six attempts per minute per player plus existing general rate limits.
- `POST /api/branch/webhook`: server-to-server, no game cookie required. Requires a dedicated `BRANCH_WEBHOOK_SECRET` credential using `Authorization: Bearer …`, or a `token` query parameter for dashboards supporting only URL configuration. This is our shared-secret authentication, NOT an assumed Branch signature protocol. Credential validation uses constant-time digest comparison. HTTPS is mandatory in production; redact query strings at any proxy/access logger. Never put this credential in frontend code, a public Branch link, or a screenshot.
- The recordings lists (`/api/friend-voices` and `/api/my-links`) remains available to its owner. While enabled, only recording playback GET endpoints require a persisted unlock grant. Original recording-owner authorization still applies after unlocking.

The UI shows the list immediately. Locked recordings show a Play voice button; clicking it generates the account-specific Branch link and navigates to HelloTalk/store. The return history entry points to /my-links. No unlock link is issued merely by viewing the tab. The UI checks every five seconds while visible, also checking on focus/return. After verification, native audio controls appear; the user taps play (no forced autoplay). It does not navigate into the app's webview. A game login is required to keep the grant across browsers and sessions. Chinese UI is provided for zh, English fallback for other locales.

## Deployment configuration

Set on the GAME server, not in VITE variables:

```
BRANCH_UNLOCK_ENABLED=false
BRANCH_UNLOCK_LINK=https://brc.hellotalk.com/Helloween2026
BRANCH_WEBHOOK_SECRET=<independently generated random secret of at least 32 characters>
```

The feature defaults off to preserve existing behavior until the external integration is ready. When explicitly enabled with missing credentials it fails closed: recordings stay locked, and the UI reports verification unavailable. Keep disabled until callbacks and real-device acceptance are ready, then enable deliberately. No secrets have been generated or installed by this change.

The configured link must be HTTPS on `brc.hellotalk.com`. This uses the existing short link, so the game no longer needs a Branch API key or a short-link creation API call. Generated links carry campaign `halloween_2026`, feature `friends_screams`, channel `game_tab2`, and random custom data `unlock_id`. Routing inherits the supplied Helloween2026 link configuration in Branch; this change does not alter that dashboard configuration. The UI appends a per-request unlock_id and campaign tags; using the bare link does not unlock a particular account. Validate on physical devices that appended unlock_id and tags are preserved in last_attributed_touch_data.

## Branch webhook setup (administrator required)

Create POST webhooks for `install`, `reinstall`, and `open`. Limit each to:

- `last_attributed_touch_data.~campaign` equals `halloween_2026`
- `last_attributed_touch_data.~feature` equals `friends_screams`
- `last_attributed_touch_data.~channel` equals `game_tab2`

After deployment, the endpoint is `https://helloween.fly.dev/api/branch/webhook`. Configure its independent credential as above. Do not enable callbacks against an undeployed endpoint. If configuring a minimal payload, preserve these fields:

```json
{
  "id": "unique-branch-event-id",
  "name": "open",
  "timestamp": 1800000000000,
  "user_data": {"os": "Android"},
  "last_attributed_touch_data": {
    "~campaign": "halloween_2026",
    "~feature": "friends_screams",
    "~channel": "game_tab2",
    "unlock_id": "the-value-from-this-clicks-link-data"
  }
}
```

Timestamp is the event time in epoch milliseconds. Only mobile iOS/Android install/reinstall/open events qualify. Clicks, web sessions, wrong campaigns, unknown/expired tokens and events outside the request's time window do not unlock. Valid delivery returns 200, including ignored and duplicate events, to avoid pointless retries. Malformed qualifying events return 400; bad credentials 401; payloads over 64 KiB 413. Grant creation, consumption of the request and event deduplication are transactional in SQLite and survive restart. Persisted data does not include the full webhook payload, device identifiers or IPs.

This is an attribution-based promotional gate, not cryptographic proof that the same person/device installed the app. A forwarded per-user link can attribute an open back to that request. Attribution may be delayed or absent; never substitute a timer/click for a successful callback. Do not use this grant to bypass recording ownership, and do not promise immediate or guaranteed verification.

## Acceptance before rollout

1. Confirm Webhooks access with a Branch admin (current UI account lacked the required export access and Webhooks did not open).
2. Deploy the game endpoint with credentials; configure only these campaign callbacks.
3. Existing-install iOS/Android: generate a link from a signed-in game session, open HelloTalk, return to the original browser, verify callback attribution and automatic unlock.
4. Fresh-install iOS/Android: repeat through the store and FIRST APP LAUNCH. Download completion alone emits no qualifying install event.
5. Verify no-click, unrelated campaign, expired link, wrong account, private browser and delayed callback cases. Verify direct audio requests remain forbidden before unlock and for non-owners after unlock.
6. Turn on the gate only after these checks; verify login in another browser retains the account grant.

Local validation: `node --test tests/branch-unlock.test.mjs`; `npm test`; `npm run build`; `PLAYWRIGHT_CHROME_CHANNEL=chrome npx playwright test tests/browser/branch-unlock.spec.ts --project=chromium-desktop --project=chromium-mobile --reporter=list`.

References: [Branch webhook events and filters](https://help.branch.io/marketer-hub/webhooks), [Branch webhook payload](https://help.branch.io/developer-hub/data-integration-webhooks-for-developers).

## CDNSolution integration

The timeline uses `/api/friend-voices`; audio URLs use the shared SDK and NGINX
forwards both playback and unlock API calls to Node. The gate remains disabled
by default. This commit does not configure Branch or deploy the application.

Recordings retain the CDN branch's six-second capture starting at video second
three. New composite ranking metadata is stored separately in
`reaction_scores_v2`; old recordings still count toward Trick totals. Deleting a
recording removes its ranking metadata in the same transaction. Personal and
country Scream rankings average each friend's scores before averaging friends;
country attribution comes from the sharer. Historical recordings without the
new echo-cancellation metadata remain excluded from Scream rankings.
