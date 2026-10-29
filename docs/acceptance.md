# Release acceptance

The complete 40-character game is running as an acceptance candidate at https://boo-around-the-world.fly.dev/. It is not marked ready for formal promotion because human, cultural and native-device checks remain open, and Fly organization quota blocked the final patch update and image rollback drill.

## Implemented and deployed

- Friendly optional entry scare, a miniature world map with ten culture regions, forty playable character entries and free costume changes.
- Server-backed anonymous progress, fixed country affiliation and welcome candy.
- Fifteen-second, three-tap duels against a seeded computer, server scoring, UTC reward caps and idempotent settlement.
- X/LINE sharing paths, Facebook sharing without incentives, recipient response, social metadata and transactional invitation rewards.
- Atomic candy gifts, forty unique warm three-frame endings, on-demand ending text and image loading, replay without duplicate completion.
- Four cumulative leaderboards, HelloTalk outbound links, aggregate funnel metrics and unique final-story-frame tracking.
- Forty original art sets: 120 transparent poses, 40 thumbnails and 40 share cards. Saci, La Mulata de Córdoba and El Charro Negro use the user's approved story-object avatars; their lore panels explicitly identify that visual adaptation.
- Additive versioned content packs, stable IDs and retained player progress.
- A single Fly Tokyo write instance, encrypted persistent volume, public Tigris media and a separate private backup bucket.

## Automated evidence

| Evidence | Result and scope |
|---|---|
| `npm test` | 29 domain, HTTP, persistence and content-pack tests passed. Covers duplicate invitations, previews, cancellation, self-invites, gift races, negative-balance protection, country lock, UTC caps and deduplicated wish/story completion. |
| `artifacts/browser-results.json` | 15 tests passed across desktop Chrome, mobile Chrome and mobile WebKit. Each project visits all 40 character images, completes four real-time duels and an ending, checks persistence and boards, and tests invitation/clipboard/share-cancellation behavior. These are browser emulations, not physical-device acceptance. |
| `artifacts/content-validation.json` | 40 characters, 10 regions, 120 story frames and poses, 40 share cards; main-script gzip about 15 KB. No missing art. |
| `artifacts/lighthouse-mobile.json` | Local first-entry sample: performance 91, accessibility 100, best practices 100; total transfer 413,632 bytes. These scores cover that sampled entry screen, not every view or international network. |
| `artifacts/loadtest.json` | Local 500-player, 900-second test: 43,966 requests, zero errors and ledger mismatches; P95 about 2.4 ms. |
| `artifacts/fly-loadtest.json` | 500 simulated players for 900 seconds on the deployed shared 2 CPU / 1 GB nrt machine, using an isolated temporary database and loopback HTTP server: 43,966 requests, 14,733 duels, exactly 10,000 rewarded duels, zero errors/ledger mismatches, reward caps correct, P95 3.21 ms. The load client ran on the same machine; public leaderboard data was not seeded. |
| `artifacts/public-smoke.json` | Deployed health/catalog and all 201 public media resources passed. |
| `artifacts/regional-network.json` | 60 normal guest-session requests from Fly nrt through public HTTPS to the catalog API; zero errors, P95 about 11 ms. This is a separate network probe, not the mixed settlement load test. |
| `artifacts/remote-backup-restore.json` | Development snapshot containing test progress uploaded to the private bucket and restored byte-for-byte; SQLite integrity and ledger reconciliation passed; anonymous access returned 403. |
| `artifacts/fly-backup-restore.json` | The deployed database passed the same remote restore and privacy check before promotion. |
| `artifacts/restart-verification.json` | SIGTERM stop/start preserved a separate probe database on the live volume: wallet 20, lifetime candy 30, donated 10. Public leaderboard data was not seeded by the probe. |

The first unauthenticated 60-requests/minute network probe intentionally encountered the configured 40/minute anonymous limit; its report is retained in `artifacts/regional-network-unauthenticated.json`. The successful probe uses a normal browser-equivalent guest session. Limits were not weakened to obtain a passing result.

## Deployment version boundary

`artifacts/deployment.json` identifies the running image/build `20261028.1` and the built but unpublished `20261028.2`. The latter adds the mobile profile button's accessible name and makes shutdown await an in-flight backup. Fly rejected both regular deployment and stopped-machine update with its organization machine-limit error. The running first image was restored and its volume checked. No other application's machines were removed.

The image rollback drill is still pending provider capacity. A restart check does not substitute for rolling back an image.

## Required before formal promotion

- Human cultural/editorial review of all forty backgrounds, visual adaptations and original endings.
- Ten first-time human testers: at least eight independently reach the first ending within five minutes.
- Physical iOS Safari and Android Chrome, plus X/Facebook/LINE in-app browser checks for entry, sharing, return, audio control and HelloTalk/store navigation.
- Native sharing and recipient delivery tests with consenting participants. No messages or posts have been automatically sent.
- Resolve Fly quota, publish the final patch and perform the recorded-image rollback drill.

Use `docs/human-acceptance.md` to record actual human/device results, and `docs/operations.md` for maintenance. No human sign-off is implied by generated art, cited sources, browser emulation or simulated players.
