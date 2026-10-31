# One-step homepage unlock

Current source changes are not deployed. The homepage shows one rounded button containing Agree and unlock plus concise microphone, numeric-score and private invitation-audio terms. Public privacy/deletion links are adjacent. One application click confirms the notice and requests native microphone permission directly; there is no second application confirmation page. Browser-owned permission UI remains necessary when the browser has not granted access.

The gate stays locked on refusal, unavailable audio or a 15-second timeout and offers retry in place. A successful permission probe stops immediately without recording or upload. The persisted v2 unlock marks this combined consent flow; the earlier v1 exploration-only choice does not bypass it. Later transformations acquire a fresh stream automatically with the browser's existing permission. Known-full invitation storage skips recording without blocking an already-unlocked visit.


Capture starts at video second 3 and lasts six seconds. A countdown and progress bar show capture, followed by an indeterminate upload indicator. Cancellation, page hiding or closing discards unfinished capture and releases the microphone. Failed uploads retain the same recording for retry; completed uploads do not repeat on ordinary replay. Ordinary measurement uploads numbers only. The private audio playback ownership checks are unchanged.

Browser tests use synthetic microphones and provider stubs. They validate consent timing, guest sharing, cancellation, retry, numeric-only measurements and private upload access, but do not establish delivery in native SNS apps or acceptance on physical phones.

## Historical deployment records

The following entries describe older behavior and releases, not authorization to deploy these changes.

2026-10-29: deployed the direct invitation transition to `helloween` as `9cd1e53-invite-direct-20261029`. Six Chrome browser cases passed against an isolated release built from `9cd1e53` plus this fix and the previously deployed X auth change. Live health and frontend asset SHA-256 match the tested build; X login remains enabled. Local unrelated UI/BGM changes were excluded. Release evidence: `artifacts/private/invite-direct-image/verification.json`.

2026-10-29 follow-up: valid invitation links now open the existing consent dialog immediately on arrival. Published to `helloween` as `9cd1e53-invite-confirm-20261029` after seven Chrome browser cases passed. No microphone request occurs before confirmation; dismiss/denial, expired links and recording protections remain covered. Evidence: `artifacts/private/invite-confirm-image/verification.json`.
