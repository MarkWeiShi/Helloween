# Character transformation runtime

## Current local delivery

Local preview: <http://127.0.0.1:8788/>. The running older server on port 8787 was left intact; 8788 serves the current 56-character catalog and built runtime using the same project database. No deployment was performed.

All 56 catalog characters now have published six-second transformations and two-second action loops, including all 16 regional additions. Their media, visual contact sheets and genuine transparency were checked. Adze uses a revised composition and folded-wing loop to keep its appendages inside the frame. Historical overdue errors and superseded media remain archived; no accepted provider job was submitted twice.

Run `npm run assets:transformations -- --require-all` to publish only verified media outputs and require all 56. Publication uses content-hashed filenames and an atomic manifest. `artifacts/transformation-publication.json` records source directories and SHA-256 hashes. `artifacts/transformation-runtime-http.json` records successful HEAD checks and matching public/dist hashes for all 280 media files, 56 cute motion sheets and 112 successful 206 range responses. Re-run the local delivery check with `python3 artifacts/verify-local-transformations.py` after building.

47 automated tests, the production build, and the 56-character content check passed. Browser control is disabled in Work settings, so actual browser visuals, autoplay behavior, and physical microphone acceptance remain unverified. Human subjective audio/visual acceptance is also pending.

## Runtime behavior

Both the globe character dialog and every character's invitation use `src/transformation-player.ts`. A version 1 manifest at `/art/transformations/manifest.json` maps catalog IDs to `entrance`, `loop`, `poster`, `duration`, `loopDuration`, and `revealAt`. Optional alpha WebM URLs are publication artifacts; this runtime uses MP4 + WebGL chromakey consistently. Same-origin hashed URLs are supported. The introduction runs to its actual media end, then hands off to a second video element containing the separately generated action loop with native infinite looping. Both sources preload alongside the intro; the canvas retains the intro frame until loop playback is ready. Durations are metadata, not substitute animation timers.

First successful globe playback is remembered per guest and character. Later openings require explicit replay. The existing microphone gate remains. On an unmeasured first transformation, the reveal cue starts a three-second local pitch/volume measurement. Only numeric scores are stored in this browser. Closing, changing character, hiding the tab or leaving the page cancels capture. Closing is always available; media/microphone load waits are bounded. Background playback pauses and requires explicit replay.

The current invitation screen has one acceptance button that plays the matching character's transformation without requesting or sending a recording. The recording helper remains optional: only a separately wired explicit recording control can arm a five-second recording. Recording cancellation and late permission responses release microphone tracks; replay never repeats recording/upload. Existing response rewards remain behind the existing Say Boo back action, and character controls appear after the introduction. Both contexts use the existing sound preference with 0.65 video volume and an accessible sound toggle inside the dialog. An explicit mute survives the microphone gate. Pausing for a hidden tab displays a replay instruction.

Missing metadata/media or WebGL failure leaves a poster (or the original portrait if no manifest entry exists) and an explicit retry. Failed manifest fetches and missing entries are re-fetched on retry. No static zoom is passed off as transformation video. An audio playback rejection also remains retryable. WebGL resources, animation frames and video sources are released on close.

`server/index.mjs` serves MP4/WebM with correct MIME, byte range seeking and HEAD; the manifest revalidates. Run `npm test` and `npm run build`. Unit tests exercise the shared video's source transition, infinite loop, reveal-once cue, persistence isolation, missing-entry retry and lifecycle cleanup using browser doubles. HTTP tests exercise actual server range responses. These do not verify visual compositing, browser autoplay policies, physical microphones or human visual acceptance. The browser specification was updated for dismissible playback but requires an enabled browser automation environment to run.
