# Public media CDN rollout (2026-10-31)

Production media origin: https://assets.helloween.dev. R2 bucket `helloween-public-assets` (APAC). Uploaded release: `21e0f86429f2cfe9808d`. Game/API remain on Fly; no private recordings, credentials or account responses belong in the public bucket.

Build with `PUBLIC_ORIGIN=https://helloween.fly.dev PUBLIC_ASSET_ORIGIN=https://assets.helloween.dev npm run build:all`. The optional build variable defaults to same-origin. Only the approved CDN hostname is accepted. JSON snapshots remain byte-identical; clients map public media fields to the CDN after validating transformation manifests. New builds must upload and verify their whole immutable release BEFORE activation. Never overwrite a released URL or purge old versions merely to publish a new build.

## Cloudflare configuration

- Custom domain `assets.helloween.dev` connected to R2; development r2.dev endpoint disabled.
- Cache rule `Helloween immutable public assets`: URI Full wildcard `https://assets.helloween.dev/releases/*`, Eligible for cache, respect origin Cache-Control.
- Immutable objects: `Cache-Control: public,max-age=31536000,immutable`. This is a freshness lifetime, not a guarantee that edge objects remain resident for a year.
- Smart Tiered Cache enabled. Edge misses check an upper tier before R2; R2 is the media origin, never Fly.
- CORS: only `https://helloween.fly.dev`, `https://helloween.dev`, `https://www.helloween.dev`; GET/HEAD; Range request header; expose ETag, Content-Length, Content-Range, Accept-Ranges. No credentials.
- CSP: allow the CDN in img-src, media-src, connect-src only. Keep executable code and APIs on the game origin.
- Keep version/hash in path. Do not append random cache-busting parameters during normal use. Preserve default query and Origin cache handling; probe-only query keys intentionally create cold entries.
- After each release, warm actual (no-query) catalog, motions, map/terrain, character thumbnails and a small set of entrance videos from SIN/FRA/IAD. Verify status, CF-Ray, CF-Cache-Status and Age. Do not scan all 2.5 GiB periodically.
- No API/account/recording caching. Cache rule matches only the public asset hostname and release prefix.
- No paid add-ons enabled. Regional Tiered Cache/custom topology require Enterprise; Free supports Smart Tiered Cache. Do not upgrade to Pro expecting pinned per-region storage.

Cloudflare supports multi-region edge caching but not guaranteed pre-pushed permanent copies in every location. Regional warmup reaches the PoPs selected for those probes, not all PoPs or all ISPs. A route change can produce another MISS. Retain Fly media copies as rollback capability; there is no automatic silent cross-origin fallback.

## Measurement

`scripts/cdn-regional-probe.cjs` runs on an existing Fly machine. It fetches the first 64 KiB of a video three times using one unique query key per host/run/region, records cache status, actual PoP, TTFB, full body duration and CORS. No user data is used. These are datacenter probes, not mobile or residential measurements; later calls may reuse connections.

Observed cold → warm TTFB: SIN 1814 → 60/29 ms; FRA 953 → 79/52 ms; IAD reached ATL 1169 ms MISS, EWR 430 ms MISS, ATL 41 ms HIT. All responses 206, 65536 bytes. The probe's existing same-region Fly baseline was faster (4–96 ms), so these measurements do not support claiming CDN is universally faster than the existing Fly regional fleet. They do demonstrate multi-region caching and cold-cache overhead. Re-measure real-user p50/p95 after rollout before claiming global improvements.

Sources: https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/ and https://developers.cloudflare.com/cache/how-to/tiered-cache/.
