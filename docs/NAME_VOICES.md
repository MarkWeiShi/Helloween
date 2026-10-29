# Character name voices

56 independent ElevenLabs voice designs are attached after the existing six-second transformations. Each final audio asset is 2.8 seconds; requests contain only a character name plus non-spoken performance tags. Original videos, posters, icons, descriptions and loop animations remain the visual sources. There is no name overlay, custom title font, seal or added visual animation.

- Casting and exact requests: `content/name-voices.json`.
- Saved generation provenance, file hashes and language-review status: `assets/name-voices.json`.
- Runtime publication: `content/name-reveal-pilots.json`, `public/art/transformations/manifest.json`.
- Review: `/review/jiangshi-name.html`, with all 56 choices, separate listening and full playback.
- Generate/resume: `python3 scripts/generate-name-voices.py`.
- Compose/publish locally: `node scripts/prepare-name-voices.mjs`, then `npm run build`.
- Cleanup only this batch's saved temporary voice slots: `python3 scripts/cleanup-name-voice-slots.py`.

The generator reads `ELEVENLABS_API_KEY` from the environment or the user-authorized `~/Projects/.env`. Never commit credentials. Temporary voices created by this batch are deleted only after their audio is saved; the pre-existing Jiangshi voice is retained. Voice descriptions, preview samples and original takes are kept under ignored `artifacts/name-voices-v1/` for revisions.

Eleven v3 supplies 55 voices; Eleven v4 supplies the Zulu Tokoloshe take. Ewe (Adzé), Akan/Twi (Asanbosam) and Malagasy (Kalanoro) are not officially supported by these models: their proper-name takes are pronunciation drafts, explicitly flagged in the review page. They must not be represented as verified native speech. All performances and pronunciations await human listening approval; automated duration/file/browser checks do not establish native-language or acting acceptance. Speech-to-text verification was unavailable with this key's permissions.

Non-human categories without a single established gender use original artistic casting; this is not a claim that the folklore category has a fixed sex. No deployment has been performed.
