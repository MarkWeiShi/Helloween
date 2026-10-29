# Globe transformation audit — 2026-10-29

Local preview: http://127.0.0.1:18879

- 56 playable characters; all have entrance, loop and poster resources (168 HTTP checks passed).
- Automated Chrome check dispatches each actual globe pin click handler (including rear-hemisphere pins), verifies advancing intro video, differing rendered canvas frames, then loop playback. Intro completion was accelerated after the frame checks.
- First pass: 55 passed, Zheztyrnak timed out once. Separate retry passed; three subsequent normal-speed entrance-to-loop runs also passed. Cause of the first timeout was not established.
- Removed seven static-only preview pins from the globe: Vetala, Domovoi, Lutin, Kobold, Duppy, El Tunche, Bunyip. Artwork remains available in the project.
- Fresh page verified: 56 playable pins, zero static-preview pins.
- Build and 15-language completeness checks passed. This is local Chrome evidence; no physical-device or production verification.

| Character | Playback result |
| --- | --- |
| jiangshi | Passed |
| nie-xiaoqian | Passed |
| yingning | Passed |
| painted-skin-ghost | Passed |
| bake-danuki | Passed |
| kappa | Passed |
| chochin-obake | Passed |
| kasa-obake | Passed |
| dokkaebi | Passed |
| gumiho | Passed |
| bulgasari | Passed |
| gaekgwi | Passed |
| krahang | Passed |
| phi-kong-koi | Passed |
| nang-tani | Passed |
| krasue | Passed |
| tikbalang | Passed |
| kapre | Passed |
| duwende | Passed |
| santelmo | Passed |
| puca | Passed |
| banshee | Passed |
| dullahan | Passed |
| merrow | Passed |
| brownie | Passed |
| kelpie | Passed |
| selkie | Passed |
| boggart | Passed |
| headless-horseman | Passed |
| jersey-devil | Passed |
| jackalope | Passed |
| hidebehind | Passed |
| la-planchada | Passed |
| la-pascualita | Passed |
| la-mulata-de-cordoba | Passed |
| el-charro-negro | Passed |
| saci | Passed |
| curupira | Passed |
| boitata | Passed |
| cuca | Passed |
| adze | Passed |
| asanbosam | Passed |
| tokoloshe | Passed |
| kalanoro | Passed |
| ghul | Passed |
| ifrit | Passed |
| marid | Passed |
| nasnas | Passed |
| div | Passed |
| pari | Passed |
| shahmaran | Passed |
| karakoncolos | Passed |
| albasty | Passed |
| zhalmauyz-kempir | Passed |
| zhalgyz-koz | Passed |
| zheztyrnak | Passed isolated retry and 3 normal-speed repeats; first pass timed out |

## Follow-up: generate and restore the seven preview characters

The user chose immediate video generation instead of hiding the previews. All seven now have Seedance entrances and independent animated loops, published in the transformation manifest (63 entries total). Their globe pins are restored. They remain visual regional characters, without new collection awards or invitation records.

Production: `artifacts/ghost-horror-preview-v1/`; technical and visual evidence: `delivery-audit.json`. Every entrance is 6 seconds; every looping segment is 48 frames / 2 seconds at 24 fps. MP4 playback, VP9 alpha, posters and cute globe sprite packs were published. All seven passed media frame-count, audio and alpha/motion checks. Human aesthetic and listening approval remains pending. Duppy reaching hands and El Tunche branch tips extend beyond the generated source frame during the close approach; this framing is recorded in visual-review notes.

Browser regression coverage: `tests/browser/preview-transformations.spec.ts` exercises each globe pin, checks advancing video and differing rendered frames, checks three normal-speed loop boundaries, replays and closes. Independent static build served at port 18882 prevents concurrent builds from invalidating the test page.

Final validation: all 7 new browser cases passed, including three full normal-speed loop boundaries, replay and close (1.4 minutes). Nine motion/player unit tests, the production build and all 15 locale checks passed. The current port-18879 home page reports 63 globe pins. No production deployment or commit was performed for this follow-up.
