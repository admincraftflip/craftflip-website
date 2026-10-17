# Reader background presets: sources and licences

Temporary placeholders for product development, not the final curated collection (see PROJECT.md,
"Product Decisions for the Future UI/UX Pass"). Replace them during the visual-design phase.

All four are from Wikimedia Commons under CC0 1.0 (Creative Commons Zero, public domain
dedication). Attribution is not required; it is recorded here for traceability. Licence checked on
each file page and through the Commons API (LicenseShortName CC0, AttributionRequired false) in
October 2026. Re-encoded as WebP (at most 1600px, plus a 240x160 thumbnail) with sharp.

| Preset id | Commons file | Author | Licence |
| --- | --- | --- | --- |
| ivory-marble | https://commons.wikimedia.org/wiki/File:Marble_Top.jpg | Ambadyanands | CC0 |
| pale-stone | https://commons.wikimedia.org/wiki/File:Light_grey_painted_bumpy_moderately_discolored_grubby_grungy_seamless_concrete_texture.jpg | Sisters.seamless | CC0 |
| warm-wood | https://commons.wikimedia.org/wiki/File:Wood_Texture_Background.jpg | Bango Textures | CC0 |
| misty-forest | https://commons.wikimedia.org/wiki/File:Fog_in_forest_at_Kent,_Washington_-_1.jpg | Roc0ast3r | CC0 |

The preset ids are an allowlist in backend/utils/readerSettings.js and
frontend/src/utils/readerSettings.js; adding or renaming a file here needs both.
