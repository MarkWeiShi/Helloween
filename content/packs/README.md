# Additive content packs

The launch catalog is version 1. To publish new characters, add a JSON file here with an increasing integer `version`, optional new `regions`, and a `spirits` array using the same complete fields as `../catalog.json`. Every new character needs a new stable ID, culture and source links, three original story frames, a motion template (`float`, `hop`, `sway`) and art provenance.

Use `public/art/source/<stable-id>-strip.png` for a new character's three transparent poses. Run `npm run assets`, build, and `npm run check:content`; publish the generated hashed assets before deploying the pack. Existing region IDs are referenced rather than redefined. The loader refuses duplicate character IDs and non-increasing versions. Existing player progress stays in SQLite under the unchanged launch IDs.

A new region needs name, subtitle and map hotspot coordinates. Do not reuse a country label as proof of exclusive cultural ownership. Human review of the sources, imagery, labels and new original ending remains required before promotion.

Packs are deployed with application files. They do not execute scripts and are not accepted from browser uploads. To correct an existing character's wording, edit its owning catalog/pack in place without changing that character's ID or meaning, then increment the catalog sequence appropriately. Do not remove a published character to hide an earned wish.
