# Locale layout verification

Run `npm run build && npm run check:locales && npm run check:layout`.
The layout audit uses local Chrome through Playwright, a temporary in-memory
application, synthetic accounts and fake microphone input. It never contacts a
production app or identity provider. Chrome must be installed; set
`PLAYWRIGHT_CHROME_CHANNEL` to select another installed Chromium channel.

The default matrix covers all 15 shipped locales at widths 320, 390, 768, 1024
and 1440 pixels (heights 640, 844, 900, 900 and 900). Each combination exercises
19 rendered states: lock, language menu, consent, globe, stats, recording
controls, collection, folklore, story, ending, sharing, profile, rankings,
about, recordings, empty recordings, sign-in, invitation consent and invitation.
The audit also measures all 56 characters' names, folklore and wishes in the
mounted folklore component, their 168 story parts in the story component, and
10 recording/error states in the actual transformation layout. These repeated
content fixtures check layout; the recording browser tests check live behavior.

Checks cover horizontal page overflow, text crossing clipping ancestors or the
viewport, action labels exceeding two lines, share-preview titles exceeding four
lines, mobile navigation width, clipped recording controls and the consent
confirmation button falling below the dialog's visible area. Intentional
vertical page/dialog scrolling, ellipsized player names and single-line form
values are excluded. A source hash detects changes during the run. The report is
not a claim of native-language editorial acceptance or physical-device coverage.

Screenshots and `report.json` are saved in `artifacts/locale-layout/` by default.
Overrides:

- `LAYOUT_OUTPUT`: a separate report and screenshot directory.
- `LAYOUT_DIST`: an already-built static directory (default `dist`).
- `LAYOUT_LOCALES`: comma-separated locale codes.
- `LAYOUT_WIDTHS`: comma-separated viewport widths.
- `LAYOUT_SCREENSHOTS=0`: geometry checks without screenshot output.
- `LAYOUT_SHARING_ONLY=1`: repeat only sharing after copy-only edits.

## Copy and layout changes

Compact interface copy is saved in both `src/locales/*.json` and
`content/localization/overrides.json` so future regeneration preserves it.
The changes shorten unlock/consent actions, navigation, sharing, invitation
acceptance, account controls and recording-library copy. Platform buttons use
recognizable service names. Consent retains recording duration, local scoring,
automatic invitation upload, the inviter-only audience and cancellation.

Responsive rules preserve readable type sizes while allowing wrapping, reserve
space for the language control, constrain flex children, support RTL lists and
provide full-width space for the share card's caption. Share titles are rewritten
and given enough room to avoid broken words and excessive line counts. The
15-locale consent, sharing and recording-library contact sheets are also visually
inspected; automated geometry alone does not catch awkward phrasing or composition.

## Verified on 2026-10-29

The full five-width run passed all 75 locale/viewport combinations: 1,425
rendered screens, 16,800 character/story layout checks and 750 recording-state
checks, with zero reported layout issues or browser errors. Its source hash
remained unchanged throughout the run. The locale inventory and content budget
checks, production build, 65 unit tests and 23 focused localization/consent/audio
browser regressions passed.

The local screenshot gallery is `artifacts/locale-layout/review.html`; the final
measurements are in `artifacts/locale-layout/final/report.json`. These are local
verification results, not a deployment record.

A follow-up at 320 px preserved the equipment action icon while substituting
all character names (15 combinations, zero issues). Five locales then received
shorter share headings to remove awkward orphan words, followed by a 25-combination
recheck with zero issues. The final share caption and description were shortened
across all locales; the sharing-only report tracks that last change separately.
The gallery selects the newest screenshot for each affected screen.

The last sharing-only run passed all 75 combinations, with zero layout issues,
zero browser errors and an unchanged source hash. See
`artifacts/locale-layout/summary.json` for the recorded verification phases.
