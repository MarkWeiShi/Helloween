# Pumpkin reaction feedback

Local implementation, 2026-10-28. No deployment performed.

## Experience

Character dialog: centered enlarged portrait; large borderless paging arrows. Pumpkin Scare Friend and candy Give Sweet sit side by side. The pumpkin meter shows this sender's per-character average of measured recipient pitches in Hz, number of measurements, and a game-only level. The candy meter shows donated / 100. Existing preview characters share the layout but remain explicitly disabled until their content is published.

Lantern Duel frontend and API are retired (HTTP 410). Historical database records and reward ledgers remain intact. Invitation responses and welcome awards are now the remaining earning paths; the former solo-duel path no longer exists.

Every page entry offers explicit microphone consent before the surprise. Users can decline or continue without it. The invitation disclosure explains sharing with its sender. Capture lasts 3.5 seconds, pauses/ends on hidden pages, and stops tracks at completion or cancellation. No game-generated sound plays while measuring. No MediaRecorder or audio upload is used. Existing scare poses are used; this change does not create new horror illustrations.

## Measurement and notifications

Normalized autocorrelation estimates 70–1200 Hz on voiced frames (RMS >= .015, correlation > .8, at least five valid frames). Mean and peak Hz, frame count and consent are sent; raw waveforms never leave the browser. Silence or inadequate samples produce null, not zero fear. Average character pitch averages each recipient's measured mean, excluding null values. Bar fill is mean Hz / 1200; thresholds 220, 400, 700 Hz produce Little / Big / Mega Boo (below 220: Low Boo). These are playful sound categories, not inference of psychological fear. Client readings are untrusted and confer no reward/ranking advantage.

SQLite reactions are unique per invitation and recipient. Self-invites, expired invites, invalid inputs and missing consent are rejected. Retries cannot change or duplicate a saved reaction. Only the sender sees their reports through authenticated player state. Inbox includes recipient nickname, character, average/peak pitch, game label and time. Read status is persisted. While the app is visible, a 15-second poll refreshes the unread badge, dialog meter and toast. Offline reports remain available at next visit; there is no social-platform or OS push notification.

## Validation

32 Node tests passed, including sine-wave estimator, silence, bounds, consent, deduplication, privacy, expiry, no extra candy, and read status. Desktop browser checks pass for all 20 dialogs, paging, invitations, sharing cancellation, a synthetic microphone through two browser sessions to the sender's inbox, retired duel API and permission refusal. Synthetic audio verifies software flow, not actual acoustic accuracy or real-device permissions. Real Safari / social in-app browsers and physical microphones still require acceptance.

Screenshot: artifacts/pumpkin-reaction-actions.png.
