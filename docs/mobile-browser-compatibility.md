# Mobile browser compatibility

This change is based on production source commit `6c8538e`. It is prepared on
`codex/mobile-browser-compat`; production deployment and physical-device acceptance
are separate steps.

## Target and limits

The build targets Safari/iOS 14.5 and Chrome/Android WebView 88 syntax and newer.
These are engineering targets, not a claim that every device/embedded browser has
been tested. Android OS versions do not identify the WebView engine version.
iOS 16.3.1 is the reported failing device and remains a required physical-device
acceptance check in Safari and HelloTalk. Versions below the targets are not promised.

## Capability handling

- Request cancellation: use native `AbortSignal.any/timeout` when both exist;
  otherwise compose an AbortController, owned timer and external abort listener.
  Dispose fallback resources after JSON decoding, including failures/cancellation.
  API requests, immutable catalog/motions and transformation manifests use this path.
  Existing credentials, GET-only transport retry, no automatic write retry, HTTP
  errors and Retry-After behavior are retained.
- Translation: use native Object.hasOwn or hasOwnProperty.call; retain authored
  country labels when Intl.DisplayNames is absent, and authored short descriptions
  when Intl.Segmenter is absent. No translation service or locale download is added.
- Menus: keep native popovers on supporting engines. Otherwise use a hidden menu
  with click, Escape, outside click, focus dismissal and ARIA-expanded state.
- Dialogs: keep native showModal/close. Fallback provides a fixed backdrop, modal
  ARIA, focus containment, Tab wrapping, Escape, backdrop dismissal and focus restore.
- Interaction locks: native inert where supported; otherwise remove descendants
  from tab order, block pointer/keyboard interaction and restore attributes on unlock.
  This also applies while an invitation transformation is playing.
- Event listeners: keep native signal-bound cleanup where supported; otherwise
  explicitly remove scoped listeners on abort. Unsupported focus-visible selectors
  use :focus without throwing in the animation loop.
- Audio: native AudioContext or prefixed constructor. Recording capability is
  checked before constructing MediaRecorder. Existing codec selection, video
  Canvas/WebGL fallback, autoplay/user-gesture and microphone-consent rules remain.
  Missing microphone/recording capabilities are not faked or bypassed.
- Layout: vh declarations precede dvh declarations. Modern browsers keep dvh;
  older ones get usable viewport sizing, with a square globe aspect-ratio fallback.

No browser prototype is patched. No new dependency, API endpoint, periodic task,
tracking or external resource is added. The static release content hash remains
unchanged; this is a client/SDK change, not a data or server migration.

## Verification

`tests/sdk.test.mjs` covers the native and fallback branches, actual session
startup without static AbortSignal helpers, cancellation, timeout, body decoding,
resource cleanup, retry policy and HTTP error handling. Before the fix the legacy
session test fails with `Network request failed` before fetch is invoked.

`tests/browser/browser-compat.spec.ts` runs native and missing-capability scenarios
in desktop Chromium, mobile Chromium and mobile WebKit. It disables signal helpers,
Object.hasOwn, Intl.DisplayNames/Segmenter, popover, dialog, inert, listener-signal
support and focus-visible support. It checks startup, language changes, characters,
modal focus/dismissal, microphone consent and restoration of locked controls.
This emulates missing capabilities in modern engines; it is not an old OS emulator.

Validation commands:

```sh
PUBLIC_ORIGIN=https://helloween.fly.dev npm run build:all
REQUIRE_NGINX=1 npm test
PLAYWRIGHT_CHROME_CHANNEL=chrome npm run test:browser -- tests/browser/browser-compat.spec.ts tests/browser/lock.spec.ts tests/browser/share-challenges.spec.ts tests/browser/language-fallback.spec.ts --grep-invert "blocked storage keeps"
PLAYWRIGHT_CHROME_CHANNEL=chrome npm run test:browser -- tests/browser/recording.spec.ts tests/browser/personal-scare.spec.ts tests/browser/immersive.spec.ts --project=chromium-desktop
```

Run browser commands sequentially because their default trace/report directories
are shared. Machine-readable final results and the equal-gzip bootstrap size
comparison are saved locally in `artifacts/compatibility/`. Size measurements cover
HTML-referenced JS/CSS, excluding locale chunks, fonts and media. They do not prove
identical CPU time, memory, FPS, or real-device latency.

Two pre-existing browser-test assumptions were reproduced on the unchanged baseline:
a nonexistent invitation returns a server 404 rather than a client page, and the
production globe pauses automatic rotation while locked. The lock expectation and
its microphone mock were corrected. The unrelated nonexistent-invitation language
test remains unchanged and is excluded from the focused run (one test per browser).
It cannot validate client storage behavior because it never reaches the client.

Before release, test iOS 16.3.1 Safari/HelloTalk and representative older Android
WebViews for microphone permission, recording/playback, cancel/background cleanup,
language switching and sharing. Regional static edges must ship the same client
build as the primary to avoid retaining the broken SDK on some routes.

## Build-size measurement

The final initial JS/CSS set is 74,509 gzip bytes versus production's 71,803:
+2,706 bytes (about 2.64 KiB, 3.77% of that set). Both HTML documents reference
seven initial JS/CSS files. Locale files and the media release are unchanged.
This includes lowering the syntax target, not only runtime fallbacks.

The old lock test also referenced a removed rotate button and an obsolete
`data-globe-spirit` attribute. It now uses the existing keyboard rotation and
`data-spirit` selector. These are fixture corrections, not changes to gameplay.

## Final automated evidence (2026-10-31)

- Production build, standalone SDK and packaged API build: passed.
- Node and real NGINX integration suite: 90 passed, no skips.
- Compatibility scenarios: 12 passed across Chromium desktop/mobile and WebKit
  mobile (native and missing-capability paths, consent dismissal/unlock).
- Media/scoring/recording regression suite: 7 passed, including failed/full upload
  retry, no duplicate upload, cancellation and pagehide microphone cleanup.
- Broader browser run: 53 passed; three old lock-selector failures are superseded
  by the corrected-lock rerun: 3/3 passed. One WebKit focus-restoration
  assertion also fails on unchanged production source and remains open.
- The nonexistent-invitation language test is a known baseline failure and was
  excluded from the focused run; this is not a blanket full-suite pass.

No old iOS/Android physical device, HelloTalk native app, real social-provider
sending, CPU/FPS benchmark or production deployment was performed. There is no
observed regression in the passing coverage, but this does not prove zero risk.
