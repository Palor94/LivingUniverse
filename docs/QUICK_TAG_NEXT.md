# Gyors címkézés — "Egyéb" tab improvements (agreed and built 2026-11-08)

Owner chose all three. Files: `app/public/quick-tag.js`, `app/quick-tag.mjs`, texts in
`app/public/i18n.js`, test in `tests/quick-tag.test.mjs`.

1. **Character chips** — under each person, one-click buttons for the picture's
   linked characters plus **Palor** (always), and "Más…" opening the full list.
   Selected chip = that person's choice. Unpicked people still become
   "Nem karakter (háttérszereplő)" on confirm.
2. **Brush mode** — a page-level character picker ("ecset"); while active,
   clicking a person row on any card assigns that character. Esc or clicking the
   brush again turns it off. Egyéb is ordered by file path, so a character's
   folder comes in a run.
3. **Filters inside Egyéb** — by linked character / folder, by number of people
   (3, 4, 5+), and "no linked character" (crowd pictures) so a page can be
   confirmed as all-background quickly. Server: extend `queue()` with
   `character_id`, `people`, `unlinked` parameters.

Keep: collage checkbox, groups (may repeat), repeats allowed, additive links only.
