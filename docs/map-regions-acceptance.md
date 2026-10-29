# Twenty-region map revision · 2026-10-28

Local implementation at http://127.0.0.1:8787/; this revision has not been deployed to Fly.

- Catalog v2: 20 discovery regions, six continental entry points; Russia is reachable through Asia and Europe, Arab World through Asia and Africa.
- Existing 40 stable character IDs, their stories and player progress remain intact. Thailand and Philippines share Southeast Asia; Ireland moves to Other Europe; US characters move to United States & Canada.
- Original country attribution and source atlas IDs are independent of navigation IDs. Existing 120 poses, 40 thumbnails and 40 share cards regenerate successfully.
- Eleven regions currently have no playable characters. Their explicit empty state preserves the current costume and wallet, with a return-to-character action.
- New map artwork generated with built-in image_gen. Original source retained as world-map-v1.png. Provenance and prompt in assets/world-art.json.
- 46 editorial candidates listed separately in docs/region-roster-review.md and .json, with a read-only HTML review in artifacts/region-roster-review.html. Candidates are not loaded by the catalog or exposed as playable characters.

Verification: build and content validation passed. 30 Node tests passed. Targeted map/navigation tests passed on desktop Chrome, mobile Chrome, and iPhone-sized WebKit, traversing all 20 regions and 40 character images, checking empty states, original costume return, wallet preservation, collection count, reload and layout overflow. This does not replace real-device or cultural review.

Derived map: 214,160 bytes. Main script gzip: 15,645 bytes. These are individual asset budgets, not a new whole-page network or load-test result.

Screenshots: artifacts/chromium-desktop-map.png, artifacts/chromium-mobile-map.png, artifacts/webkit-mobile-map.png.

Deployment remains separate: earlier Fly organization machine quota blocked updates; no machine from another project was changed or removed. Public release remains the prior version.
