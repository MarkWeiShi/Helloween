# Product localization

The product supports English (`en`), Simplified Chinese (`zh`), Spanish (`es`), Portuguese (`pt`), French (`fr`), German (`de`), Italian (`it`), Russian (`ru`), Arabic (`ar`), Hindi (`hi`), Japanese (`ja`), Korean (`ko`), Indonesian (`id`), Thai (`th`) and Vietnamese (`vi`).

## Language selection

A manual language choice takes priority. It is saved under `boo:language` in browser local storage; the current URL also keeps `lang` so selection works when storage is blocked and preserves invitation paths. “Device language” follows the first supported entry in `navigator.languages`, including regional variants such as `pt-BR` and `zh-CN`. Unsupported preferences fall back to English. Chinese variants currently use the Simplified Chinese bundle. Language menus are available before microphone permission, on the globe, and in the ordinary header.

Browsers expose their preferred languages, not the currently selected software keyboard/input language. The language list can reflect browser or operating-system settings; it is not inferred from a player's country or IP. See [Navigator.languages](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/languages).

Switching language reloads the current route, ending active audio capture and keeping the existing guest cookie and server progress. Automatic mode reacts to `languagechange`; a manual choice does not. Initial HTML and invitation previews use a validated `lang` parameter or quality-ordered `Accept-Language`. Locale bundles load on demand. A missing client bundle falls back to English.

## Content and safety

`src/locales/*.json` contains the shipped strings. `content/localization/source.json` records the inventory and `overrides.json` holds editorial translations. `shared/i18n.mjs` localizes authored template text before interpolating values. It never translates rendered DOM nodes, user names, friend labels, URLs, stable IDs or native-name fields. HTML text and accessibility attributes are localized and escaped; dynamic values retain their existing escaping. Country names come from `Intl.DisplayNames`, and dates use the selected locale. Arabic sets `dir="rtl"`; the globe and its physical direction controls remain left-to-right.

Coverage includes navigation, forms, microphone disclosures, recording states, sharing instructions, errors, character descriptions, wishes, endings, region labels, image descriptions and social previews. Character names and actual source-publication titles may intentionally retain their originals. Character-name audio and artwork remain original media. The internal voice-review tool is outside the public product localization scope.

## Translation status

This is a localization implementation with translation drafts, not native-language or cultural acceptance. English normalizes the previously mixed Chinese/English interface. Common controls and microphone disclosures have authored translations in all 15 languages. All 56 Chinese character summaries have been rewritten, and selected terminology and passages corrected. Other long-form content is an offline machine-translation draft and requires native editorial review, especially folklore terminology and story nuance. Automated structural coverage does not establish semantic accuracy.

Draft generation uses the MIT-licensed [M2M100 model](https://huggingface.co/facebook/m2m100_418M), via the CTranslate2 INT8 conversion `jncraton/m2m100_418M-ct2-int8` at revision `7c1b2620a4e58dacecbd8bf89cfd6da7eb9eb7b0`. The product never calls a translation service. Model downloads and Python dependencies are generation-only and are not deployed.

## Maintenance and verification

Add authored copy with `t`, `msg` or the `html` tag; include its exact trimmed source key in `content/localization/source.json` and a translation in every bundle. Preserve the complete multiset of `{{number}}` placeholders. Do not put HTML into translated values. Use `overrides.json` for corrected or approved translations so regeneration retains them.

The inventory checker parses authored TypeScript templates and server errors using the pinned Rolldown parser, and checks catalog fields too. `node scripts/collect-locales.mjs` prints the current inventory (`--write` updates the manifest).

Run `npm run check:locales`, `npm test`, and `npm run build`. `tests/browser/localization.spec.ts` covers all 15 mobile locales, direction, consent, manual persistence, blocked storage, fallback, user-text isolation and translated folklore. Set `LOCALIZATION_BASE_URL` to an isolated test server; otherwise it uses the standard local development URL. Existing browser regression tests use `WD_ACCEPTANCE_ORIGIN`.

For offline draft regeneration, install `ctranslate2` and `sentencepiece` in a separate Python environment, download the pinned model outside the repository, and run `python scripts/translate-locales.py /path/to/model locale...`. `--repair` retries malformed model outputs. Keep generation outputs under editorial review before release.

## Verification snapshot — 2026-10-29

Each of the 15 bundles contains 1,238 registered messages, with zero missing keys, placeholder mismatches or invalid model markers. The build, content budget check, 62 unit tests and 20 mobile localization browser tests passed. A refined automatic `languagechange` test also passed. Chinese, Spanish and Arabic mobile screenshots were inspected.

Eight existing invitation/recording/sharing regression tests passed. One existing lock test still fails because it expects the globe to rotate under the play lock; the pre-existing globe implementation explicitly pauses rotation while `.play-lock` is present. That animation behavior was not changed by localization.

See `localization-verification.json` for the scoped results. This is local automated evidence, not physical-device, native-language, cultural or deployment acceptance.
