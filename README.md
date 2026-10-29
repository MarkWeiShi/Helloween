# Boo Around the World

A mobile Halloween folklore game with globe exploration, local microphone scoring, private invitation recordings, accounts and rankings.

## CDNSolution architecture

This branch separates the static frontend, browser SDK and Node.js API. The frontend is served by NGINX/CDN; same-origin `/api/*` routes reach an independent Node service. SQLite remains the single-writer data store. Invitations use a generic static social preview.

Read [the deployment, SDK, test and rollback runbook](docs/CDN_SOLUTION.md) before deploying. `Dockerfile` is now **API only**; `Dockerfile.web` builds the static site. Do not replace a combined production website with the API image before routing and static hosting are ready.

## Development

Node 24+:

```sh
npm ci
npm run dev
# Second terminal:
npm run dev:client
```

Open `http://localhost:5173`. The API listens on port 8787. The default database is `.data/boo.sqlite`; do not commit databases, cookies or credentials. Environment setup is documented in `.env.example`; export variables or use your process manager's environment loader.

```sh
PUBLIC_ORIGIN=https://game.example.com npm run build:all
npm run check:content
npm run check:locales
NGINX_BIN=/absolute/path/to/nginx npm test
```

Build outputs are `dist/` (web), `dist-api/` (backend), and `dist-sdk/` (SDK). Production builds require the public website origin for absolute social-preview images. Browser and NGINX integration tests are described in the runbook.

## Gameplay and content

The first country/character selection awards welcome candy. Invitation responses, gifts and story unlocking remain backend-authorized with transactional ledgers and idempotency. Ordinary character scoring uses local microphone analysis and localStorage; it does not upload raw audio. Invitation recordings require the existing consent flow and are playable only by their owner. Each invitation stores at most five successful participant recordings. Legacy duels are retired.

See [accounts](docs/ACCOUNT_SETUP.md), [sharing](docs/SNS_SHARING_SETUP.md), [cultural sources](docs/cultural-sources.md), and [content packs](content/packs/README.md). Content generation, cultural review, physical devices and native social-app acceptance are separate from software test results.
