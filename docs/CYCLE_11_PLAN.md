# Cycle 11 – terv (2026-11-11)

## Kell-e overhaul?

Teljes újraírás nem kell: a 243 teszt zöld, a modulok határai többnyire jók.
Két helyen viszont célzott átépítés indokolt, mert ezek akadályozzák a további fejlesztést:

1. **`play-mode.mjs` szétszedése** (81 KB, 737 nagyon sűrű sor). Ebben van egyszerre a
   beszélgetés, a beat/szikra, a jelenetkép, a tempó, a randik, a napi limit, az album és az
   összegzés. Minden új játékfunkció ide kerül, ezért itt keletkezik a legtöbb hiba.
   Cél: `play/conversation`, `play/scenes`, `play/relationship`, `play/dates`, `play/album`
   modulok, változatlan API-val és tesztekkel.
2. **Üzemeltetés: egyetlen igazságforrás a helyekhez.** A Grok-leállás oka az volt, hogy az
   ütemezett feladatok a régi `Kríziskezelő Központ\…\00_SYSTEM\project` útvonalra mutatnak.
   Ugyanez a régi út van a `00_SYSTEM\config\runtime-locations.json`-ban, és ott van a régi
   kódmásolat is (`00_SYSTEM\project`). A program ezeket nem használja, de félrevezetnek.

## Nagy tételek (hatás szerint)

1. **Grok válasz élőben (streaming)** – a mért válaszidő 2–38 s, egyszer 60 s timeout.
   A szöveg folyamatosan jelenjen meg („gépel…” helyett), a beat/szikra/választások a végén.
   Egy randiszimulátorban ez a legérezhetőbb különbség.
2. **`play-mode.mjs` szétszedése** (lásd fent).
3. **Új képek automatikus helye** – a mai rendrakás után új import/címkézés esetén a program
   javasolja a helyet ugyanazzal a szabállyal (1 szereplő → `10_CHARACTERS\<név>`,
   2+ → `Scenes\<A + B>`), egy kattintásos „Áthelyezés” gombbal. Különben a mappa újra szétesik.
4. **Útvonal-függetlenség** – az indító `.cmd` fájlok a saját helyükből számolják a projektet;
   a rendszerállapot-panel jelezze, ha egy ütemezett feladat nem létező mappára mutat
   (ez most csak „nem fut”-ként látszik). A régi kódmásolatot archiválni (`99_ARCHIVE`),
   a `runtime-locations.json`-t frissíteni.
5. **Hiányzó fordítások ellenőrzése** – teszt, ami minden szerveroldali `fail('…')` üzenetre
   megköveteli a magyar fordítást; most egy kimaradt kulcs angol hibát mutat a játékosnak.

## Kisebb tételek

- Karakter átnevezésekor a `Scenes\<A + B>` mappanevek is frissüljenek.
- A `world_review_sources.source_path` régi utakat mutat: a felületen mindig az aktuális utat
  mutassuk (a történeti mezőt hagyjuk).
- `i18n.js` (177 KB) képernyőnként töltődjön, ne mindig egyben.
- Album: szűrés szereplő/szint szerint, nagyítás billentyűkkel.
- Időtúllépés után „Újrapróbálás” gomb ugyanarra a sorra (nem automatikus, nem fizetős).

## Sorrend

1 (streaming) → 2 (szétszedés, tesztekkel) → 3 (képek helye) → 4–5 → kisebbek.
Fizetős hívás, modelltelepítés vagy feltöltés ebben a ciklusban nincs.
