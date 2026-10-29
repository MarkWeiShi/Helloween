# Globe cute motion delivery

All 40 existing catalog characters have local cute motion packs as of 2026-10-29. Existing static figures, stories, selection and invitations remain unchanged.

The 40-character batch is recorded in `artifacts/ghost-horror-40-v1/delivery.json` and `audit.json`. Each new character uses an inspected 0–1.2 second cute-only range from its corrected entrance clip; Banshee uses 0–1.5 seconds and the original Jiangshi pack uses 0–1.6 seconds. All packs are silent. La Llorona is a separate review concept, outside the 40 catalog IDs, and has no globe pack. These are local assets; online deployment has not been performed.

## Original Jiangshi clip

Source: artifacts/jiangshi-horror-review-v1/seedance-original.mp4. Use only 0–1.6 seconds (the transformation starts around 2 seconds). Green-screen key/despill, constant union crop and 160 px transparent cells retain actual character motion. Nineteen frames at 12 fps are mirrored without duplicate endpoints into a 36-frame / 3-second silent loop. The 195,210-byte hashed WebP sprite is served from public/art/motions. No horror frames or soundtrack enter the globe.

## Production handoff for future characters

After making a character video, explicitly inspect and choose its cute-only time range, then publish with:

```sh
node scripts/prepare-cute-motion.mjs CHARACTER_ID PATH_TO_GREEN_SCREEN_VIDEO CUTE_START_SECONDS CUTE_END_SECONDS
```

The command accepts an existing stable playable character ID, a maximum 3-second range, and the same green-screen source convention as Jiangshi. It writes a hashed sheet first and atomically publishes `public/art/motions/CHARACTER_ID.json` last. Do this as the final step of video production; merely saving a raw video does not mark its content safe for the globe. Preview-only characters need stable catalog IDs before release. Inspect source frames to exclude transformation/horror content before publishing.

`GET /api/motions` discovers ready cute packs on each request, ignores incomplete/invalid/horror packs, and exposes only public render metadata. Open globe screens check every 30 seconds and on returning to the foreground. Newly published packs attach automatically without frontend edits or server restart. Publishing to production still requires shipping both the manifest and hashed sheet to the app's public directory.

Sprite frame animation retains the existing icon dimensions, orange color treatment and hover enlargement. It pauses when hidden behind the globe, behind a modal, or in a background tab. Reduced motion restores the original static thumbnail. Failed downloads preserve the static image; teardown cancels animation/polling. The runtime was introduced with Jiangshi; the 40-character batch adds packs through that existing flow.

Original Jiangshi runtime validation: production build, 34 Node tests and Chrome desktop/mobile plus mobile WebKit loop/pause/reduced-motion checks passed. Contact sheet: artifacts/jiangshi-cute-loop-contact.png. Browser screenshot: artifacts/chromium-mobile-cute-globe.png. The later 40-character batch is validated separately in `artifacts/ghost-horror-40-v1/audit.json`. Physical-device acceptance and online deployment not performed.
