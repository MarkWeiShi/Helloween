# CDNSolution: static web + independent API

The website uses one public HTTPS origin. A CDN routes `/api/*` (including the authentication callback and private audio) to Node without caching; other requests go to the static NGINX origin. `Dockerfile.web` and `Dockerfile` are independent deployment artifacts. No cloud resources or production data are changed by building them.

## Build and local development

Use Node 24 and `npm ci`. Build from the same source/content checkout:

```sh
PUBLIC_ORIGIN=https://game.example.com npm run build:all
npm run check:content
npm run check:locales
```

Outputs:

- `dist/`: complete static site, hashed JS/CSS/fonts and immutable public assets under `releases/<content-hash>/`. Includes movies, posters, sprites, terrain, audio, dictionaries and public JSON. Original art source files are excluded. The root compatibility tree preserves original JSON URLs for older players and uses media symlinks into the snapshot; preserve symlinks when copying to NGINX.
- `dist-api/`: server, authoritative content, rules, compatibility metadata, runtime dependency manifest and backup utilities. Contains no frontend build or public media. Run `npm ci --omit=dev` inside this directory, then `npm start`; mount persistent storage and configure `DATABASE_PATH`.
- `dist-sdk/`: browser ESM and declarations for `@wd-ghost/sdk`. It has no DOM, UI translation, server dependencies, or deployment capabilities. It is private and not published to npm.

`PUBLIC_ORIGIN` is required for a release build because social crawlers need an absolute image URL. Never put secrets in frontend build variables. It must also be set on the API to the externally visible HTTPS website origin; API origin hostnames are not used in invitations or OAuth callbacks. Supabase and social provider secrets stay in the API environment.

For hot reload run `npm run dev` (API port 8787) and `npm run dev:client` (Vite port 5173), then open `http://localhost:5173`. Vite proxies only `/api`. `predev` prepares API compatibility data; the Vite plugin serves development public JSON. Content or media changes require restarting Vite; production content changes require a new build. The API no longer renders pages.

## SDK and content boundary

`createGhostClient({baseUrl:'/api'})` exposes session, account, player, invitation, recording, story, gift, ranking, event and social methods, plus a low-level typed `request` compatibility method. `src/api.ts` is the translated UI adapter; only the SDK performs business fetches. Private audio URLs come from `client.audio.url(...)` and remain authenticated same-origin requests.

Credentials remain HttpOnly, SameSite=Lax, Secure in production. GET transport failures retry once; HTTP failures, including 429, do not. Writes do not automatically retry. `GhostApiError` carries status and Retry-After delay; UI polling backs off, adds jitter, pauses in hidden pages and prevents overlapping poll requests.

Public catalog export uses an allowlist and excludes story bodies, editorial review notes and unknown fields. Runtime `/api/config` provides invitation reward status and content version. Stories remain permission-checked API responses. Existing localized browser dictionaries are preserved; this change is not DRM for story text. `/api/catalog` and `/api/motions` remain compatibility adapters backed by the packaged snapshot. New clients load immutable public JSON and do not poll `/api/motions`.

The static entrypoint has the same generic social preview for every invitation. A loaded invitation still shows its actual sender and character. Locale resolution now runs in the browser; there is no server `Content-Language` or `Vary: Accept-Language`. If both browser language APIs are absent, automatic mode falls back to English; URL/manual language still works.

## NGINX / CDN setup

Use `deploy/nginx/static.conf`, `cache.conf` and `security.conf` (included by `Dockerfile.web`). Configure two CDN origins:

| Match | Origin | Policy |
| --- | --- | --- |
| `/api` and `/api/*` | API ingress | Bypass cache unconditionally for all methods/statuses; forward query, cookies, Origin, Content-Type and Set-Cookie. Never retry writes. |
| `/assets/*`, `/releases/*` | Static NGINX | Cache successful immutable files for one year. Preserve Range and correct MIME. Do not negatively cache errors. |
| HTML, aliases, `release.json` | Static NGINX | Respect `no-cache` and revalidate. Do not create a Cookie-dependent cache key. Strip cookies before static origin. |

`/`, `/i/:id`, `/my-links` and `/rankings` return the static entrypoint. Missing assets and unknown routes return 404, not HTML. Compression and video HEAD/Range are handled by NGINX. API responses, including 502/503 at the edge, must carry `no-store`. Unsatisfiable static video ranges carry `no-store`, which overrides any header added before NGINX's range filter changed the response status.

The API only trusts `X-Real-IP` when `TRUST_PROXY=true`. Enable this only when direct API access is blocked and the ingress overwrites the header from a verified client address. If the optional gateway sits behind a CDN, configure NGINX real_ip with that provider's exact trusted proxy ranges first; otherwise `$remote_addr` is a CDN address. Do not trust arbitrary X-Forwarded-For or Fly headers. Preserve Host including a non-default port (`$http_host`). Use fixed `PUBLIC_ORIGIN` in production. Preserve the default 700000-byte request limit for legacy base64 recordings.

TLS terminates at the CDN or gateway; the plain HTTP compose listener is not a production public endpoint. Microphone permissions and Secure cookies require HTTPS, except local browser development. `/healthz` is an API-origin health check, not a cached frontend route.

`deploy/compose.yaml` demonstrates three independent services. Its optional gateway provides the same-origin routing for environments without CDN origin rules:

```sh
PUBLIC_ORIGIN=https://game.example.com docker compose -f deploy/compose.yaml build
PUBLIC_ORIGIN=https://game.example.com docker compose -f deploy/compose.yaml up -d
```

The gateway listens on host port 8080 behind your HTTPS edge. API and static origins are not host-published. Existing database/backup credentials must be supplied explicitly; the named volume is initially empty. Point it at the intended restored database before cutover. Put API secrets and feature flags in the optional root `.env`; shell variables configure compose substitutions such as PUBLIC_ORIGIN. Keep exactly one API writer.

## Release, data and rollback

1. Back up and verify the current SQLite database with existing backup tools. Keep the public domain, cookie name and cookie path unchanged so sessions and localStorage survive.
2. Build static and API artifacts from the same checkout. Compare `dist/release.json` with `dist-api/runtime/public-content.json`. For additions, publish the compatible API content/rules before activating the new frontend. Do not remove existing character IDs or earned progress.
3. Publish all immutable resources before switching HTML. Keep previous `/assets` and `/releases` directories on the NGINX volume or object store. Do not use a syncing command that deletes old releases. For NGINX, use `node scripts/install-web.mjs dist /srv/ghost` and set the NGINX root to `/srv/ghost/current`. The installer verifies immutable path collisions, preserves previous assets/releases, stages the HTML and compatibility tree, and atomically switches a symlink. Use the emitted deployment ID as the third argument to roll back, for example `node scripts/install-web.mjs dist /srv/ghost PREVIOUS_ID`. It does not contact or restart the API. For a rolling web-container rollout, mount the retained `/srv/ghost` parent volume and point NGINX root at its `current` child; do not bind-mount only the resolved child. Replacing a standalone web image alone does not retain previous releases. The compose file is a topology demonstration; use this retained-volume release path for production updates.
4. Configure CDN rules and test uncached API responses before moving traffic. Invalidate old cached HTML and any previously cached API paths. Verify multiple users, OAuth callback, audio ownership, and video seeking.
5. Switch HTML entrypoints last. Releasing the web does not restart API; releasing API does not rebuild web. Roll back frontend by restoring its HTML and alias set while retaining its immutable files. API rollback must still understand content used by active clients; do not roll back new character support while those clients are active.

No database schema migration is introduced. Recording BLOBs remain private in SQLite. OAuth pending state and rate limits remain in process memory; restart interrupts pending logins and temporarily resets rate-limit windows. This is a single-process deployment, not a multi-writer/HA design. Existing backups, Supabase authentication, social signatures and account ownership rules remain authoritative.

`npm run publish:assets` now publishes the complete `dist` tree to the configured static bucket, with correct MIME/cache headers and HTML last; it never deletes old versions or modifies bucket CORS. `PUBLISH_DRY_RUN=true npm run publish:assets` inventories without uploading. The primary NGINX deployment can instead copy the same static artifact; object storage publication is optional. The old ASSET_ORIGIN partial-image switch is no longer used.

## Verification and later capacity measurement

Build both artifacts before tests. Install NGINX locally or set `NGINX_BIN` to a test binary; no system configuration is modified by the integration harness.

```sh
PUBLIC_ORIGIN=http://127.0.0.1:8787 npm run build:all
NGINX_BIN=/absolute/path/to/nginx npm test
NGINX_BIN=/absolute/path/to/nginx npm run test:split
NGINX_BIN=/absolute/path/to/nginx PLAYWRIGHT_CHROME_CHANNEL=chrome npm run test:browser -- tests/browser/cdn.spec.ts tests/browser/ghost-links.spec.ts tests/browser/language-fallback.spec.ts tests/browser/recording.spec.ts tests/browser/personal-scare.spec.ts --project=chromium-mobile
LOAD_USERS=5 LOAD_DURATION_MS=3000 LOAD_THINK_MS=1500 npm run loadtest
```

Without `NGINX_BIN`, ordinary unit tests explicitly skip integration; `test:split` requires NGINX and fails if unavailable. Browser runner launches isolated API and real NGINX servers automatically. Auth fixtures simulate identity responses, not real provider acceptance.

The load generator now exercises sessions, state, selection, invitations, visits/responses, recording upload/private playback, link lists and rankings; it no longer calls retired duels. Its local API runs in a separate process with a temporary SQLite database, seeded test accounts and rate limits enabled. Audio payloads are synthetic 40 KB containers, not playable or representative of real encoding. Output includes RPS, latency, per-route failures, 429s, process CPU/RSS/event-loop delay and ledger reconciliation. A short local run is only a smoke test.

For a later external test, set `LOAD_TARGET` and `LOAD_SESSIONS_FILE`. The private JSON file contains dedicated `{owner, receiver, receiverId}` sessions; never commit or log these credentials. The tool writes invitations and audio: use an isolated test deployment. Observe the target's metrics independently (`METRICS_INTERVAL_MS=60000`) and storage I/O/SQLite contention; external runs do not inspect its database. Increase load in steps and record the highest stable mixed workload plus safety headroom. This implementation does not establish a user-capacity number or migrate storage based on guessed load.

Validate CDN bandwidth, cache hit ratio, cold-start origin traffic and video Range separately. At 100,000 visible initialized users, the retained 15-second state polling alone is approximately 6,667 RPS before jitter; static delivery does not eliminate that backend demand. No ten-thousand/100,000 concurrent-user guarantee follows from these local tests.

## Fly adapter for helloween.fly.dev

`fly.toml` selects `Dockerfile.fly`. This adapter keeps the split static/API code on the existing single Fly Machine: NGINX listens on 8080 and serves `/data/web/current`; Node listens only on 127.0.0.1:8787. `/api/*` and `/healthz` are proxied with `no-store`. This is a Fly-hosted static origin, not an external CDN cache deployment.

The startup script installs the built web release atomically on the existing data volume and retains older immutable resources. Provision enough volume space for the database and multiple static releases (the current static release is about 1.5 GB; a 5 GB volume supports initial rollout and a subsequent release). Never delete old releases during rollout. Keep one API writer. Preserve the existing auth file override and secrets when updating the Machine; its X support is currently outside this branch. Before rollout, take and verify a SQLite backup and record the current Machine image/config. Roll back by restoring that image/config; preserve the data volume.

Build with `fly deploy --build-only --push --remote-only --dockerfile Dockerfile.fly --build-arg BUILD_ID=<revision>`. Update the existing Machine only after a successful build and validation. The generic API-only Dockerfile remains available for separately hosted API deployments.
