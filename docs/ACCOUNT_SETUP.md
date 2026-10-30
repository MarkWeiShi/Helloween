# Accounts and My ghost links

Implemented locally; production identity-provider configuration and real SNS acceptance are still required. The existing Node/SQLite app remains the owner of links and recordings. The CDNSolution deployment serves the static frontend through NGINX/CDN and routes `/api/*` to the independent Node service; keep the external origin and callback path unchanged.

## Configure authentication

1. Create/select the intended Supabase project. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` on the application server. Use a publishable key or legacy anon key, never a service-role key. No Supabase token is exposed to the browser or stored in the game database.
2. Enable Google in Supabase Auth and configure its Google OAuth client. Register the Supabase callback shown by its dashboard in Google. `AUTH_PROVIDERS=google` controls the visible login choices; only enable providers actually configured in Supabase. Supported choices are Google, Apple, Facebook, Kakao and X. For X use `AUTH_PROVIDERS=x` and Supabase's X / Twitter (OAuth 2.0) provider. LINE sharing uses the separate LIFF flow below; it does not provide game-account login.
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


## LINE ghost-card sharing (LIFF)

Set the public `LINE_LIFF_ID` on the game server. Production channel 2012290872
uses LIFF ID `2012290872-RIK5yg1d`, Endpoint URL `https://helloween.fly.dev/line-share.html`,
Full size, `openid`, Add friend Off, and shareTargetPicker enabled.
No Channel secret or `chat_message.write` is needed for this flow.

The game creates its usual account-owned invitation, then opens
`/line-share.html?invite=<token>`. This page initializes LIFF, loads the existing
invitation and character artwork, and shows editable text. LINE login returns to
that same invitation. Sending requires a separate user click and confirmation
inside the friend picker; cancellation is not reported as success. The Flex
card image and button both open the original `/i/<token>` receiver flow.
LINE identity is used only for sharing; it does not replace the game's Supabase
account or transfer ownership of invitations/recordings.

Channel Developing status restricts testing to permitted developers/testers.
Publish the channel for general availability after a real-device check. Test
login, cancellation, sending to a consenting test recipient, and receiver video
playback. SDK mocks do not establish real LINE acceptance.


## X OAuth deployment parity

`server/auth.mjs` includes X OAuth 2.0 (`x`) in the opt-in provider list and
requests `tweet.write` alongside Supabase's baseline scopes. The session-bound,
single-use PKCE callback remains unchanged. This scope does not implement API
posting: provider tokens are discarded and users still confirm in the X composer.

For the existing Fly app preserve its Supabase URL, publishable key and
`AUTH_PROVIDERS=x` runtime settings. No client secret belongs in the repository.
The running `e40972e-line-liff-v3-20261030` image was built from CDNSolution plus
these LINE changes; X was supplied through a persistent `/app/server/auth.mjs`
machine file override. This source now includes the same X patch. On the next
image deployment, reconcile/remove that override so it cannot mask future auth
changes. Committing this source does not itself change the running machine.

## KakaoTalk ghost-card sharing

The game uses Kakao JavaScript SDK 2.8.4 with `KAKAO_JAVASCRIPT_KEY` supplied by
`/api/social/config`. Use the JavaScript platform key, not a REST or Admin key.
Application 1629099 (Scary Halloween by HelloTalk) registers
`https://helloween.fly.dev` in both JavaScript SDK domains and Product Link web
domains. This share flow does not require Kakao Login.

The share panel prepares a public 1024×538 JPEG from `/line-cards/<spirit>.jpg`
using `Kakao.Share.scrapImage`, then opens `sendDefault` synchronously from a
player click. The feed card includes editable text and retains the exact invite
URL in both its image/content link and button. Preparation failures retain the
copyable invitation. Opening the picker never counts as confirmed delivery.

Kakao first scrapes the approved character GIF (up to 5 MB), falling back to
the static JPEG if that request fails. A successful scrape does not establish
animation playback in the recipient chat; the UI explicitly states that Kakao
may show a still cover. The original GIF can also be downloaded.
Reference: https://developers.kakao.com/docs/en/kakaotalk-share/js-link

For local SDK-mocked validation, run Vite on port 5174 and then:
`PLAYWRIGHT_CHROME_CHANNEL=chrome npx playwright test tests/browser/kakao-share.spec.ts --project=chromium-desktop --project=chromium-mobile --workers=1`.
Real KakaoTalk receipt and card-click behavior still require a device test.

## Animated sharing artwork

Run `python3 scripts/prepare-share-apng.py` (Pillow required) after updating the
approved GIF manifest. It validates source hashes and generates 56 APNGs under
`public/art/share-animations`, with one shared palette per animation, 16 frames,
retained source duration, and file sizes below 300 KB. The manifest records
source/output hashes and dimensions. Preview-only GIFs are excluded.

LINE automatically includes the APNG as the Flex hero with `animated: true`,
keeping the exact invitation URI on the image and button. Missing or invalid
APNGs fall back to the JPEG. Recipient autoplay settings can suppress animation.
X continues to offer the original GIF download and prefilled invitation text;
its Web Intent does not attach the media automatically.

`/review/social-share.html?invite=<existing-token>` previews X and Kakao using
the same handoff component as the game, and links to the LINE page. It does not
create invitations or send messages automatically. Only existing, unexpired
invites are accepted. Real recipient rendering must be checked on the platforms.

Validation on 2026-10-30: 56 deployed APNG files matched their hashes and size
limits; browser screenshots confirmed LINE preview animation. X accepted the
Jiangshi GIF in the compose window (not posted). Kakao's real SDK accepted the
GIF and returned a 320×320 image/gif retaining all 36 frames. Kakao returned an
HTTP CDN URL, so approved Kakao/Daum CDN URLs are upgraded to HTTPS; image CSP
permits only these CDN hosts. Chat-recipient rendering remains a user phone test.

### X landscape animated cards

Run `node scripts/prepare-x-cards.mjs` to build 56 landscape GIF attachments from the existing cute-only sprite sheets. These have fixed `Halloween Tricks by HelloTalk` branding, the catalog's native name and English display name, and motion only in the left portrait. English names use existing catalog names (including transliterations), not newly invented translations. Assets and their checksums live in `public/art/x-cards/manifest.json`; X handoff uses this manifest while LINE and Kakao retain their existing assets. The GIF is an X media attachment: users open the invitation from the post's text link, not by tapping the GIF. This change does not publish posts or make native URL preview cards animate.

### Localized cultural context on X cards

After the base generator, run `node scripts/localize-x-cards.mjs`. Each of the 56 cards has variants for the game's 15 locales. The native and English display names remain fixed; the cultural note uses the first sentence of the existing translated folklore. If that sentence cannot fit in two lines, use the existing shorter cultural-origin description instead. Text is measured with the renderer and never silently clipped. Arabic notes are right-aligned. The X handoff selects the sender's current game locale, with English fallback; text baked into a GIF cannot switch to the recipient's language after sending.

LINE can reproduce the composition using Flex layout, APNG portrait and native text. This is preferable to shrinking the complete card into an APNG under 300 KB: text stays legible and can be localized at composition time. A URI action can open the invitation from the card. Kakao feed can use the landscape image and invitation URI; however, preserving GIF bytes on Kakao's image host is not proof that the receiving chat animates its feed image. Receiver-side animation remains unverified. This update changes X assets only; it does not replace LINE or Kakao payloads.

LINE now composes a horizontal Flex body: APNG portrait on the left, native name, English name and localized culture on the right, plus the invitation button. The static fallback is a portrait PNG, not a duplicate landscape card. The preview uses the same two-column layout. The original language parameter survives LINE login redirects.

Kakao now selects the localized landscape GIF from the X-card manifest and falls back to its matching JPEG if GIF scraping is rejected. The JPEG contains the same names and cultural note. The old two-line friendship slogan is removed from all new localized GIFs and JPEGs. Both LINE and Kakao still require recipient selection and confirmation; no test message is sent by this change.

## Facebook sharing without game login

The Facebook button opens the public Facebook share window (`sharer/sharer.php`). It does not require `FACEBOOK_APP_ID`, an app secret, Facebook Login, or a business portfolio. The player writes their own message and confirms on Facebook; opening the window is not proof of posting or delivery. Keep Facebook out of the enabled game auth providers until production login requirements are completed; existing X login is unchanged.

The shared URL is `/api/share/facebook/:invite?lang=:locale`. Its server-rendered Open Graph metadata selects the matching localized static ghost card. Browsers immediately continue to the original `/i/:invite` consent flow. Crawler requests do not create sessions, visits, rewards, or recordings, and metadata excludes sender/recipient details. The API origin must use the game's `PUBLIC_ORIGIN`; the matching `/art/x-cards/*.jpg` assets must be published on the static origin. Facebook may cache previews; real composer/recipient rendering still needs manual verification. This path does not promise animated GIF previews.

## Compact platform sharing (supersedes the manual X flow above)

Ordinary LINE, Facebook, Kakao, WeChat and copy-link sharing remain available to guests. Website account sign-in is optional for cross-device management; X direct publishing requires X authorization. The selected character and channel survive OAuth in session storage. X opens its existing Supabase login directly when publishing authorization is missing, then returns to one confirmation sheet with name/country (only for new profiles), animated card, editable post and one publish button. Other channels go directly to their selected destination without forcing website X login. LINE goes directly to its LIFF screen and automatically requests LINE login before showing its compact card confirmation. Provider-controlled login/recipient dialogs can still add screens, particularly when LINE opens a separate browser session; no provider confirmation is bypassed.

X requests `tweet.read users.read tweet.write media.write`. The provider token is retained only in server memory for at most one hour, never returned to the browser or written to the database; a restart or expired authorization requires sign-in again. The server uploads the approved character GIF with X v2 media upload, waits for processing, then publishes the reviewed text with that media ID. X API access and available credits must permit these operations. Tests simulate X; no real post is sent by the test suite.

A durable per-invitation publication record prevents double submission. An uncertain response after the post request is not retried automatically: check the X profile first. `/api/share/card/:invite` and old `/i/:invite` URLs serve localized static Open Graph cards; browsers continue to `/?invite=:invite&lang=:locale`. Route `/i/*` to the API in any external CDN, just as the included gateway now does. X link previews remain static; the uploaded GIF is the animated attachment.

Database schema version 2 removes the retired economy: wallet/candies/donated/eligibility columns and reward/duel/ledger tables. Existing accounts, sessions, invitations, visit attribution, recordings and unlocked story state remain. Back up the database before deployment. The old server cannot run against the migrated schema; rollback requires restoring a matching backup. Gift and old leaderboard endpoints return 410. Publishing this code is separate from verifying a real X post and actual LINE/Kakao recipient display.

LINE, Facebook and Kakao use the same compact confirmation layout: the chosen destination is retained; new-profile fields stay on the confirmation screen. Facebook keeps caption editing in its native share window. LINE/Kakao show one caption field and one recipient-picker action. Link/fallback actions are collapsed under “Link and other options”; LINE expands them when its picker is unavailable. Provider-native consent and recipient selection are still required. Browser tests mock the provider SDKs and do not establish real delivery.

### App-first LINE and one publish confirmation for X

LINE sharing now opens `https://liff.line.me/{liffId}?invite=...&lang=...` directly, before rendering a temporary game share modal. LIFF initialization completes before reading the redirected language/invitation parameters. The operating system may still keep LIFF in a browser; first-time LINE consent is platform-controlled.

X no longer redirects to OAuth on channel selection. The game first displays the exact GIF/text preview. Without a current posting token, its explicit action is “Authorize X and publish”: it opens an authorization window in the click gesture, saves the reviewed text in the initiating page, and publishes only after the same-origin callback from that exact window and a fresh server token check. Cancelled/failed/closed authorization never publishes. Existing authorization goes straight to the normal publish action. The OAuth return window closes itself; no second platform selection or publish confirmation is required. Popup blocking and provider opener isolation may prevent this path on some mobile browsers; those environments need real-device validation. There is no automatic posting on a normal login callback.

Token lifetime/storage is unchanged: expired tokens or server restarts can still require authorization again. This change merges the interaction around required authorization; it does not claim to remove provider consent or implement persistent refresh tokens. Browser tests simulate the provider callback and verify success/failure, unchanged draft text, and no publishing before the explicit action.
