# Operating the acceptance candidate

App: `boo-around-the-world`, region `nrt`, one shared 2 CPU / 1 GB machine and one encrypted 1 GB `boo_data` volume. Do not add independent write replicas. Public art is in `boo-world-art-20261028`; database snapshots are in the separate private `boo-world-backups-20261028` bucket.

## Release

1. Run `npm test`, `npm run build`, `npm run check:content` and the relevant browser checks. Review `docs/acceptance.md` before promotion.
2. Back up the existing database: `fly ssh console -a boo-around-the-world -C 'node scripts/backup.mjs'`.
3. Record the current image with `fly releases -a boo-around-the-world --image`.
4. Deploy one write machine: `fly deploy --ha=false --strategy immediate --build-arg BUILD_ID=<new-build-id>`.
5. Publish any new hashed assets: `fly ssh console -a boo-around-the-world -C 'node scripts/publish-assets.mjs'`. Existing hashed resources are retained for previous releases. For a busy public launch, pre-publish through the media credentials before deploying the referencing catalog.
6. Check HTTPS `/healthz`, all new asset URLs and `fly checks list -a boo-around-the-world`.

The health response includes a build ID. The three authorized object avatars are explained in their lore panels. A successful deployment does not replace the native-device, human or cultural review gates.

## Backups and restoration

The process writes a SQLite online snapshot every hour and on graceful SIGTERM, then uploads it with dedicated private-bucket credentials. Concurrent shutdown waits for an in-flight backup. Watch for `backup_completed` and investigate `backup_failed`.

`fly ssh console -a boo-around-the-world -C 'node scripts/verify-backup.mjs'` makes a fresh snapshot, uploads and downloads it, compares bytes, opens it in a separate temporary SQLite file, checks integrity and reconciles balances. It also requires anonymous access to return 401/403. It never overwrites the live database.

For recovery, stop writes and restore a chosen private snapshot into a **new** database/volume. Verify it first, preserve the old volume, and change `DATABASE_PATH` only after verification. Never copy over a live SQLite database or only copy the main file while ignoring its WAL.

## Restart and rollback

`node scripts/volume-probe.mjs` creates/checks a separate probe database under the same mounted data directory. It does not add test players to the public leaderboard. Run it before and after a graceful machine restart.

Roll back to a recorded image with `fly deploy --app boo-around-the-world --image <verified-image-reference> --ha=false --strategy immediate`. Check the build ID, health, persistent probe and asset availability, then restore the intended image. This first release uses an additive schema; any later schema migration needs its own backward-compatibility review.

## Metrics and rewards

`fly ssh console -a boo-around-the-world -C 'node scripts/metrics.mjs'` returns aggregate funnel counts and ledger reconciliation without guest credentials. It distinguishes guest identities from verified people, reaching the final story frame from reading comprehension, and download-link clicks from installs.

`fly secrets set -a boo-around-the-world INVITE_REWARDS_ENABLED=false` disables invitation rewards, including existing invitations. Other gameplay remains available. Facebook invitations are independently always ineligible in the domain rules.

## Storage provisioning notes

The one-time provisioning script is already complete. Do not run it again on existing buckets. It creates the private bucket outside the app directory because Fly auto-detects app context; its dedicated keys are then imported as `BACKUP_ACCESS_KEY_ID` / `BACKUP_SECRET_ACCESS_KEY` / `BACKUP_ENDPOINT`. Public-media credentials remain in the ordinary AWS settings. No credentials are written to the repository. This follows the [Fly/Tigris app-context and access-key behavior](https://flyio-landing.fly.dev/docs/tigris/).
