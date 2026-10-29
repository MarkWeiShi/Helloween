# Boo Around the World

An English-first, mobile Halloween game: explore ten cultures, meet forty folklore characters, send a friendly surprise, play a fifteen-second lantern duel, and give candies to fulfil a character's wish.

Live acceptance build: [boo-around-the-world.fly.dev](https://boo-around-the-world.fly.dev/). Operational status and remaining promotion gates are recorded in `docs/acceptance.md`.

## Run locally

Requires Node.js 24 or newer.

```sh
npm ci
npm run build
npm start
```

Open http://127.0.0.1:8787. Do not open the source `index.html` through `file://`: its TypeScript entry and game APIs require the running HTTP service. For frontend hot reload, run `npm run dev:client` in a second terminal. The default database is `.data/boo.sqlite`; do not commit it or cookies.

## Rules and persistence

- The first country and character selection awards 30 candies. Country affiliation then stays fixed; costumes can change freely.
- Valid duels award 20 / 15 / 10 candies for a win / tie / loss. Only the first twenty active duels each UTC day award candy. A duel with no input awards nothing.
- A recipient's first eligible invitation response awards 20 candies. The inviter can receive ten such bonuses each UTC day. Self-invites, retries and social preview requests do not award anything.
- Facebook invitations have no reward eligibility. `INVITE_REWARDS_ENABLED=false` disables all invitation rewards, including previously issued links.
- Giving 100 candies to a character unlocks that character's original three-frame ending. Wallet spending never lowers lifetime earned candy. A character's wish only contributes once.
- SQLite WAL, transactions, unique ledger IDs and operation keys protect balances and first completions. Guest credentials are random, HttpOnly cookies; only hashes are stored. Guest play does not provide robust unique-human verification or cross-device recovery.

Accounts and invitation reactions: first-time sharers sign in through configured Supabase Auth (Google or email OTP) before creating a link. `/my-links` is a private, microphone-free library grouped by invitation, with five recording slots per link, filtering, refresh and pagination. Guests can accept invitations without signing in. The single entry unlock notice explains recording and private upload before the invitation opens; recording adds no second consent dialog. New invitation recordings last two seconds and the first five successful distinct participants fill the slots transactionally. Full links remain playable without uploads. Ordinary exploration uses three-second local scoring only. Old three/five-second recordings remain playable. Cancellation, hiding or closing discards unfinished recordings; retries do not duplicate slots. Guest participation is not unique-human verification. See [account configuration and acceptance limits](docs/ACCOUNT_SETUP.md).

The four all-time leaderboards cover personal/country candy and personal/country unique wish completions. Rankings use competition ranking, so equal totals share a rank.

## Content and art

`content/catalog.json` contains all forty complete English entries and 120 original story frames. Traditional background and game-created stories are separate. Source links and adaptation boundaries are documented in `docs/cultural-sources.md`.

Generated original art and prompts are retained in `public/art/source/` and `assets/`. `npm run assets` extracts alpha-bounded poses, places them on a common canvas, generates optimized WebP images, thumbnails and share cards, and writes `public/art/manifest.json`. It also creates a contact sheet in `artifacts/`.

The production content check requires all forty characters to have three poses, thumbnails and share cards. Pending generation or human cultural review is not treated as complete. Add future characters with additive JSON packs under `content/packs/`; the loader rejects reused IDs and non-increasing versions. See `content/packs/README.md`. Never reuse an ID for a different character or delete earned progress.

## Verification

```sh
npm test
npm run build
npm run check:content
npx playwright install chromium webkit
npm run test:browser
npm run loadtest
```

On a Mac with an installed Chrome, `PLAYWRIGHT_CHROME_CHANNEL=chrome npm run test:browser` uses it for Chromium projects. Browser tests need the local server running. They cover desktop/mobile Chromium and an emulated iPhone viewport in WebKit, including actual fifteen-second duels. This is not physical-device or native SNS-app acceptance.

The load test creates an isolated temporary database and server, simulates 500 players for fifteen minutes, retries settlements, checks UTC reward caps and reconciles every wallet with its ledger. `LOAD_USERS` and `LOAD_DURATION_MS` permit shorter diagnostic runs. Its report labels the execution environment; a local result is not a global-network or Fly capacity result.

## Fly.io deployment

The selected app is `boo-around-the-world` in Tokyo (`nrt`). Use exactly one write instance with the independent `boo_data` volume. Start at shared 2 CPU / 1 GB RAM. Do not clone independent SQLite volumes as a scale-out strategy.

```sh
fly deploy --ha=false --strategy immediate
fly checks list
```

`scripts/provision-storage.mjs` is a one-time provisioning helper for the selected new app. It creates a public art bucket and a separate private backup bucket; returned credentials remain in memory and the Fly app secret store. Inspect existing buckets before retrying a partially completed provisioning operation. For later media publishing, use `npm run publish:assets` with the media bucket credentials supplied through the environment, not committed files.

Private hourly backups use `BACKUP_BUCKET` and its dedicated `BACKUP_ACCESS_KEY_ID`, `BACKUP_SECRET_ACCESS_KEY` and `BACKUP_ENDPOINT` settings. Before a release, execute `node scripts/backup.mjs` inside the deployed app. Restore into a fresh database or volume, verify SQLite integrity and wallet/ledger reconciliation, and only then point the app at it. Never overwrite a live database while the process is running. Roll back code with `fly releases` and a previously verified image; the current schema is additive.

`node scripts/metrics.mjs` prints aggregate activity and ledger consistency without guest secrets. Runtime logs expose backup completion/failure and request errors. HelloTalk analytics record outbound clicks only, not installs or registrations.

See `docs/operations.md` for deployment, restoration, metrics and single-instance maintenance commands.

## Release acceptance

See `docs/acceptance.md` for automated evidence and the outstanding human/native-platform gates. The implementation is an acceptance candidate until all release gates are satisfied. Do not infer cultural or human approval from source existence, generated art or automated tests.

## Languages

The public product supports 15 languages with automatic browser-language matching, a remembered manual choice, and Arabic RTL layout. See [localization coverage, draft status and maintenance](docs/LOCALIZATION.md). Run `npm run check:locales` to check bundle and placeholder completeness; long-form machine translations still require native review.
