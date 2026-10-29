# Accounts and My ghost links

Implemented locally; production identity-provider configuration and real SNS acceptance are still required. The existing Node/SQLite app remains the owner of links and recordings. The CDNSolution deployment serves the static frontend through NGINX/CDN and routes `/api/*` to the independent Node service; keep the external origin and callback path unchanged.

## Configure authentication

1. Create/select the intended Supabase project. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` on the application server. Use a publishable key or legacy anon key, never a service-role key. No Supabase token is exposed to the browser or stored in the game database.
2. Enable Google in Supabase Auth and configure its Google OAuth client. Register the Supabase callback shown by its dashboard in Google. `AUTH_PROVIDERS=google` controls the visible login choices; only enable providers actually configured in Supabase. Supported initial choices are Google, Apple, Facebook and Kakao. LINE is not implemented in this first release.
3. Set `PUBLIC_ORIGIN` to the exact HTTPS deployment origin. In Supabase Auth URL configuration allow `https://YOUR_HOST/api/auth/callback` with its `state` query (use an appropriate wildcard for query parameters) and set the site URL. Configure an additional local callback for development. Test success, rejection, and returning from the actual SNS in-app browser.
4. Enable email OTP, configure a production SMTP sender, and change the Magic Link email template to show `{{ .Token }}`. The app accepts a 6–8 digit code rather than an emailed callback link. Configure provider abuse controls. Local application endpoints also rate-limit requests.
5. Open `/my-links`, sign in, share, then sign in from a second browser and verify the same links and private playback. Verify logout revokes the current cookie.

OAuth uses a server-side, session-bound, single-use PKCE verifier with a ten-minute lifetime. Pending flows are held in memory: a server restart requires starting login again. HttpOnly, SameSite=Lax cookies are rotated on login and expire after 30 days server-side. Production cookies are Secure. Authentication failures do not grant an account. Missing provider configuration displays an unavailable state and blocks new shares; existing guest-owned links remain accessible from their existing browser session.

## Ownership and migration

The verified Supabase user ID maps to the existing product player ID; no ownership decision uses a nickname, client-supplied player ID or email address. The first login upgrades the current guest. A returning account adopts that browser guest's links. Progress takes the highest per-character donation and preserves completed stories. Balances use the higher value, not addition, to avoid stacking welcome rewards; the adjustment has a ledger entry. The existing account's initialized profile takes precedence. Historical guest rows remain for audit. Guest sessions are invalidated on adoption. Different existing accounts cannot be merged through this flow.

Supabase can associate its verified identities with one Supabase user. Explicit UI for adding a second provider to an existing account is not implemented; do not merge accounts based on matching display names.

## Recording and library behavior

`/my-links` opens without microphone permission. It lists 20 invitation links per page, with a filter across all links, refresh and load-more controls. Each link shows five slots in successful upload order. Old 3/5-second audio stays playable with its actual stored duration. New invitation recordings and ordinary local scoring both use a five-second window beginning 0.3 seconds before the configured scare (currently video time 2.0–7.0 seconds). New five-second recordings retain local scores and pitch measurements; legacy recordings remain readable.

The single entry confirmation explains microphone use and private upload before the invitation experience opens. No second recording consent dialog appears. A full link shows an entry notice and remains playable without audio upload. Concurrent submissions are capped transactionally; a sixth submission is discarded with a full result. Duplicate submissions return the original success, including after filling the fifth slot. Server playback verifies the link owner. Guests are deduplicated by browser identity, accounts by recorded account membership; neither guarantees unique humans.

The server accepts legacy 3/5-second payloads for existing clients. Duration metadata is not media transcoding/validation. Only the current recorder guarantees the two-second capture window; hostile uploaded containers are size/header checked, not independently decoded. New Chinese/English UI copy is authored; new strings in other locales currently use English fallback and need translation review.

## Verification

`npm test`, `npm run build`, `npm run check:locales` and focused Playwright tests cover the local implementation. Provider responses in account tests are simulated; passing these tests does not prove real Google/Supabase credentials, email delivery, native SNS-browser behavior, or deployment readiness.

## Scream rankings

`/rankings` replaces the product's candy/country leaderboard UI. The legacy leaderboard API remains for compatibility. `/api/scream-rankings?scope=trick` counts successfully saved invitation recordings by sender, excluding self-recordings; link opens alone do not count. Retries and rejected sixth submissions cannot add rows. Rankings include stored historical audio.

`scope=intensity` uses the resolved interface language captured with each new recording, not a country or a later language choice. The browser samples RMS amplitude across all analyser frames (including unpitched sound/silence), separately from pitch/game scoring. Index = mean RMS × 100. First average per participant per language, then average these participant means so frequent contributors do not dominate. Account membership identifies linked participants; unlinked guests remain browser identities. The server validates language and finite 0–1 amplitude and stores the metadata atomically with the recording. Missing historical measurements are excluded, genuine zero measurements are included. Scores rounded to two decimals share competition ranks on ties. Only aggregate language results are returned.

This is relative microphone volume, not calibrated sound pressure or fear. Device gain, distance, audio processing and client-reported measurements affect comparisons; it is a casual game ranking, not a tamper-proof competition. No historical intensity or language is fabricated.
