# CDNSolution local validation — 2026-10-29

Implemented on branch `CDNSolution`, based on `9cd1e53480753a86c7c7523794d8ad874a267328`, in an isolated managed worktree. No edits were applied to the primary checkout and its in-progress changes were not imported.

## Passed

- TypeScript SDK build, Vite static build, and independent Node package build.
- 79 Node tests, including real NGINX routing, cookie separation, private-audio ownership, story permissions, immutable content, legacy manifest compatibility, SDK retry behavior and atomic static release/rollback.
- 28 Chromium/WebKit mobile browser executions for static startup and language preference/fallback behavior.
- 10 final Chromium mobile browser executions for CDN startup, account/library behavior, rankings, invitation capacity, local scare scoring, private recording upload, cancellation and retry. CDN startup overlaps the preceding batch; these are execution counts, not 38 unique scenarios.
- Content and all 15 locale checks; Git whitespace check.
- Production-only dependency installation in the generated API package; the only top-level runtime package is the S3 SDK. A separate process also booted a copied API package from a temporary directory without repository/frontend files.
- Full static publication dry-run: 2,106 paths, including compatibility aliases. No bucket operations occurred.
- Mixed local load smoke: five synthetic actors, about three seconds, 60 requests, zero failed/limited requests and zero ledger mismatches. Backend ran separately from the load generator. This was not a sustained capacity test.

Real NGINX integration used a locally compiled NGINX 1.30.6 binary under ignored `artifacts/tools/`; no system NGINX configuration was changed. Tests ran with Node 24.17.0. Browser tests used installed Chrome and Playwright WebKit, not physical phones.

## Evidence and boundaries

Ignored local artifacts include `unit-final.log`, `browser-final.log`, `browser-game-final.log`, `build-final.log`, `content-final.json`, `locales-final.json`, `publish-dry-run.log` and `loadtest-split.json`. Test auth providers were simulated. A prior browser batch contained three expectations for server-localized HTML; those were replaced with the accepted static-client behavior and passed in the 28-execution rerun.

Docker was unavailable on this host, so Docker images and Compose startup were not executed. Their runtime components were exercised directly through the built API package and the same NGINX config files. No production deployment, DNS/CDN routing change, database migration, object-store upload, real OAuth/email/social-provider acceptance, or 100,000-user capacity validation was performed.

Use [the deployment runbook](CDN_SOLUTION.md) for production configuration, release ordering and subsequent capacity measurements.
