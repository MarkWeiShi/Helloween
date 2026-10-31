# First-card microphone permission

Current source changes are not deployed. The initial Start exploring button opens the live world without requesting microphone access. A valid invitation uses Watch transformation and opens its character directly. Existing saved exploration choices still skip this entry screen; they never imply recording consent.

The first transformation card requests native microphone permission. After permission is granted, later card visits and replays acquire a fresh stream and capture automatically without an extra recording action; the browser controls whether its permission persists. Denial or timeout is remembered to avoid repeated requests, while watching and sharing remain available. A per-card retry action is shown only after an unavailable/denied microphone. Entry-page permission is never requested. Known-full invitation storage skips recording without blocking viewing. The adjacent notice explains automatic capture and private invitation upload, with a privacy link.

Capture starts at video second 3 and lasts six seconds. A countdown and progress bar show capture, followed by an indeterminate upload indicator. Cancellation, page hiding or closing discards unfinished capture and releases the microphone. Failed uploads retain the same recording for retry; completed uploads do not repeat on ordinary replay. Ordinary measurement uploads numbers only. The private audio playback ownership checks are unchanged.

Browser tests use synthetic microphones and provider stubs. They validate consent timing, guest sharing, cancellation, retry, numeric-only measurements and private upload access, but do not establish delivery in native SNS apps or acceptance on physical phones.

## Historical deployment records

The following entries describe older behavior and releases, not authorization to deploy these changes.

2026-10-29: deployed the direct invitation transition to `helloween` as `9cd1e53-invite-direct-20261029`. Six Chrome browser cases passed against an isolated release built from `9cd1e53` plus this fix and the previously deployed X auth change. Live health and frontend asset SHA-256 match the tested build; X login remains enabled. Local unrelated UI/BGM changes were excluded. Release evidence: `artifacts/private/invite-direct-image/verification.json`.

2026-10-29 follow-up: valid invitation links now open the existing consent dialog immediately on arrival. Published to `helloween` as `9cd1e53-invite-confirm-20261029` after seven Chrome browser cases passed. No microphone request occurs before confirmation; dismiss/denial, expired links and recording protections remain covered. Evidence: `artifacts/private/invite-confirm-image/verification.json`.
