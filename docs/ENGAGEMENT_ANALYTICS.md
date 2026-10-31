# Page duration and character card analytics

The local dashboard runs with `node scripts/analytics-dashboard.mjs` on `127.0.0.1:8790`, reading aggregate data from the Tokyo primary through the operator's existing Fly CLI authentication. Dates use Beijing time. This is a local management UI, not a public admin endpoint.

Page duration is cumulative visible time per page load, sampled with a monotonic clock. A heartbeat sends cumulative counters every 15 seconds; visibility changes and pagehide flush the latest counters. Hidden time is excluded. A delayed tick contributes at most 30 seconds, limiting overcounts after suspension. It measures visibility, not proof of active interaction. Abrupt termination, failed requests or offline exits can lose the last unsent segment. No page URLs, raw audio or additional device fingerprints are collected.

Client counters split at UTC hour boundaries (equivalently whole Beijing hours). The server validates shapes and reasonable ranges, then merges each visit/hour using MAX, so retrying a packet or receiving older packets cannot increase duration. A random per-load visit ID keeps one sample across same-page account transitions. The database stores existing player identity for attribution; it is never returned by the local report.

The overall mean and median use each page load's total visible duration. Hourly values use that page load's fragment in the selected hour. Zero-duration registrations and visits still in progress are included in sample counts; means are not limited to completed visits. No samples produces a missing mean/median. Hourly averages and medians must not be summed.

A card view is recorded after the character detail dialog mounts, for catalog characters and regional preview characters. Reopening the dialog, changing to another card, or returning from a share flow to a reopened card creates another view. It does not imply transformation playback or completion. Each event has a random idempotency ID. Distinct visitors deduplicate the existing browser/player identity per hour and role. The overview deduplicates across roles; the all-time total deduplicates across hours. Do not sum hourly/per-role UV to infer all-time unique humans.

The additive SQLite tables are `page_dwell`, `card_views`, and `engagement_metadata`. The metadata timestamp is the coverage boundary. Earlier hours show missing values; the first hour is marked partial. Existing daily/hourly counters and recordings remain unchanged. The separate upload count reports currently retained successful audio uploads by creation time, not local microphone use, recording starts or failures.

Only Fly code/static assets need updating. Public media and content release URLs remain unchanged. Back up SQLite before promotion; retain the previous Fly image/config and static deployment ID for rollback. A code rollback may leave the additive analytics tables in place safely.

## Sharing and recording steps

`funnel_events` stores whitelisted, idempotent client step reports, grouped by hour and channel in the dashboard. UI-ready and platform-handoff events do not prove a native app opened or a recipient received a message. Only the LINE SDK success callback reports `share_send_confirmed`; cancellation and errors are separate. Native app login still belongs to each provider.

Recording, microphone and upload-attempt reports diagnose the visitor flow. `mic_requested` counts audio-stream requests, including reacquisition with an existing grant; it does not count native permission dialogs or unique users. The one-step homepage unlock requests permission; transformations subsequently reacquire permitted audio streams automatically. Refusal keeps the homepage locked and a manual retry requests another stream. The server records `recording_uploaded` inside the first successful audio insertion transaction. Duplicate retries do not add another success; deleting audio does not erase this cumulative counter. The existing retained-recording column remains a count of rows still stored. All client analytics are best-effort, not verified attribution or unique-human counts.

These source changes include the previously prepared dwell/card instrumentation. No deployment, CDN upload, cache purge or real SNS message is authorized by committing or pushing them.
