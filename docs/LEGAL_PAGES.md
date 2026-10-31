# Privacy and data deletion pages

The public pages are `/privacy.html` and `/data-deletion.html`, with the confirmed support address `support@hellotalk.com`. Both contain Chinese and English text and load without authentication. Deletion requests use the support mailbox; this change does not introduce a self-service account erasure endpoint. The support team must verify requests and handle associated game, identity-service and backup records. Deleting a voice in the game does not erase all interaction records.

`src/main.ts` places two optional links at the end of the first unlock notice. No extra consent checkbox or click requirement was added. `public/legal-policy.css` styles the standalone pages.

## Scoped production publication, 2026-10-31

The existing production bundle is retained. The deployed index adds `/legal-entry.js`, a compatibility script that inserts the same links into the existing unlock dialog and does nothing if the links are already rendered by newer source. It does not change microphone permissions or send data.

Tokyo receives the five static files in its persistent `/data/web/current` release directory. Existing static edge Machines receive persistent file overrides under `/opt/ghost-web`, preserving their image, startup configuration and Nginx overrides. Release scripts, the original index and pre-change edge configurations are stored locally under `artifacts/legal-pages/release/`.

On a later complete image release, include the public legal files and `src/main.ts` change, and remove the five legal-release file overrides from each edge after verifying the new image contains these files. In particular, do not retain the old index override, which would mask the new application's entry point. The compatibility script can be retired once every served index uses a bundle rendering the links directly.

Meta settings use Privacy Policy URL `https://helloween.fly.dev/privacy.html` and Data deletion instructions URL `https://helloween.fly.dev/data-deletion.html`. These settings are separate from Meta app publication and review approval.

## CDNSolution integration

WhatsApp and Messenger use separate `whatsapp` and `messenger` invitation channels; the existing `facebook` feed-sharing channel is preserved. Both new controls appear beside the character greeting and in the share chooser. Messenger uses the configured public App ID on desktop and native sharing where available, with copy fallback. Invitations remain associated with the current game session. This branch records six seconds, so the privacy policy reflects that duration; the earlier scoped production page was based on the five-second implementation. Building this branch includes all legal pages at stable root URLs.
