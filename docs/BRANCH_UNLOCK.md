# HelloTalk first-play redirect

The first click on a recording's Play voice button records a persistent playback grant and navigates to `https://brc.hellotalk.com/Helloween2026` with campaign tags. Returning to the recordings tab exposes the normal audio controls. Later visits do not redirect again. Viewing the list alone does not unlock playback.

This is a promotional redirect, not installation or app-open verification. No Branch webhook, webhook secret, timer, or callback is required. The retired webhook endpoint returns 410. Existing callback-issued grants remain valid.

Guest grants persist with their browser session. Signing in carries the grant to the account, including an existing account; subsequent account sessions share it. Clearing a guest's cookies starts a new guest. Recording ownership checks remain required independently of the promotional gate.

`fly.toml` and `.env.example` enable `BRANCH_UNLOCK_ENABLED=true`. Without this setting the service keeps the gate disabled; set it to `false` to bypass the promotional gate. `BRANCH_UNLOCK_LINK` optionally overrides the HTTPS link on `brc.hellotalk.com`. Invalid link configuration does not grant playback. No configuration credentials are exposed to the frontend.

GET `/api/hellotalk-unlock` reports status without changing it. POST requires an existing game session and same-origin request; the first successful request atomically persists a grant and returns the BRC URL. Subsequent requests return unlocked status without another URL. The client must follow the returned URL even though the first response is already unlocked.

Coverage includes first/repeated clicks, simultaneous clicks, guest-to-account migration, other-account isolation, persistence across restart, legacy grants, invalid links, cross-origin rejection, and browser navigation/back/reload without callbacks. Native app/store routing remains controlled by the existing BRC link and device.
