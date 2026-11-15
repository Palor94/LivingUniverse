# Living Universe – fejlesztési terv (2026-11-11)

**Kinek szól:** Claude Code (délutáni munkamenet) és Tibor (tulajdonos).
**Mit fed le:** négy témát: (A) optimalizálás, (B) avatarok ChatGPT-vel, (C) letisztultabb felület,
(D) helyzetkép-generálás beszélgetés közben.
**Hogyan készült:** a kód és a dokumentáció átnézésével, 2026-11-11 délelőtt. A számok és
fájlnevek ebből az állapotból származnak. Ha valami azóta változott, a kód az irányadó, nem ez a fájl.

---

## 0. Claude Code: így használd ezt a tervet

1. Először olvasd el: `AGENTS.md`, `PROJECT_VISION.md`, `DECISIONS.md` (legalább a 2026-11-09 utáni
   részt), `docs/IMAGE_PROTOCOL.md`, `docs/IMAGE_GENERATION.md`, `docs/PLAY_MODE.md`. Az ottani szabályok
   felülírják ezt a tervet, ha ütköznek.
2. Minden lépés előtt készíts kódmentést (nincs Git):
   `node ops/code-checkpoint.mjs create --label "<lépés azonosító>"`.
3. Minden lépés kicsi, önállóan működő növekmény legyen. Utána:
   futtasd a teszteket (`npm test`), pótold az új teszteket, és írj rövid bejegyzést a `DECISIONS.md`-be.
4. Adatbázis-módosítás csak új, visszafordítható migrációval (`app/migrations/0NN-*.up.sql` és `.down.sql`),
   előtte ellenőrzött mentéssel, a meglévő minta szerint (`backup` + `integrity_check`).
5. Fizetős hívás, modelltelepítés, privát kép feltöltése új szolgáltatóhoz: **csak a tulajdonos kifejezett
   jóváhagyásával**. A tesztek szintetikus adatokkal és mock szolgáltatóval fussanak.
6. A **8. fejezetben** felsorolt nyitott kérdéseket a megfelelő lépés előtt kérdezd meg Tibortól, ne találgass.
7. Javasolt sorrend: **9. fejezet** (ütemterv). Ha kevés az idő, az 1. sprint önmagában is értékes.

---

## 1. Kiinduló állapot (2026-11-11 délelőtt)

- Node 24 + `node:sqlite` (WAL), egyetlen szerver: `app/server.mjs` (553 sor), a játékmód
  `app/play-mode.mjs` (744 sor). Az `app/` és `mcp/` összesen kb. 10 600 sor.
- Frontend: natív ES modulok, `app/public/client.js` tölti be (24 import). Méretek:
  `i18n.js` **181 KB**, `style.css` **83 KB**, `play.js` **70 KB**. A verziózás kézi
  (`client.js?v=hu-20261108-1`).
- CSS: kevés design token (`--bg`, `--panel`, `--line`, `--muted`, `--text`, `--accent`, `--soft`, `--danger`),
  ugyanakkor **158 különböző beégetett hex szín**, 24 `!important`, 27 `@media` blokk, 3 külön CSS fájl az index
  oldalon.
- Navigáció: **10 menüpont** a bal sávban (Kezdőlap, Játék, Élő világ, Szereplők, Helyszínek, Könyvtár,
  Rendezésre vár, Gyors címkézés, Médiaáttekintés, Képműhely), plusz mentés/visszaállítás.
- Beszélgetés (VN) alsó gombsora: akár **12 gomb** egyszerre (közelebb, közös fotók, fotó mód, ◀ ☀ 🔥 🔞 ▶,
  pillanat, jelenet-prompt, kép hozzáadása, előzmények, befejezés, távozás).
- Képkiszolgálás: a médiaútvonal ETag-et ad, de `Cache-Control: private, no-cache`, tehát minden kép
  minden megjelenítéskor újraellenőrzést kér. A rácsok az eredeti (akár több MB-os, OneDrive-on lévő)
  fájlokat kapják; asztali bélyegkép-gyorsítótár nincs (a mobil oldalon van `thumbnail.ps1`).
- Adatbázis: a migrációkban csak **14 `CREATE INDEX`**. Sok `play_*` tábla nem migrációban, hanem a modulokban
  jön létre (`CREATE TABLE IF NOT EXISTS` a `play-mode.mjs`, `scene-images.mjs`, `media-director.mjs`,
  `play-assets.mjs`, `media-review.mjs` fájlokban), így ezek indexei nincsenek egy helyen áttekintve.
  A `prepare()` utasítás-gyorsítótár már megvan (`server.mjs` 108. sor).
- Háttérfeladatok: figurák és helyszínhátterek mappafigyelője 5 percenként végigszkenneli a OneDrive-
  mappákat; a világmotor 30 percenként fut; automatikus mentés óránként.
- Grok beszélgetés: `grok-4-1-fast-non-reasoning`, JSON válasz, 60 s időkorlát, nincs streamelés.
  A mai élő teszten a válaszidő 2–38 s volt, egy hívás túllépte a 60 s-ot.
- Képgenerálás: van védett, jóváhagyásos folyamat (`app/image-generation.mjs`, `app/image-providers.mjs`:
  OpenAI `gpt-image-2.5-*`, xAI `grok-imagine-image-2.0`, Sogni). Van ingyenes MCP-s munkafolyamat Grokhoz és
  ChatGPT-hez (`play-assets.mjs`: `list_generation_needs` → `start_generation_job` → `finish_generation_job`,
  a célok jelenleg `figure`, `background`, `scene`).
- Képtartalom-kapu: `app/character-origin.mjs` és az intimitási protokoll (`docs/IMAGE_PROTOCOL.md` 4. pont).
  **Ez marad a tartalmi szabályok egyetlen forrása**, minden új képfunkció ezt hívja.

---

## 2. Közös alapelvek minden új funkcióhoz

- **Kánon érinthetetlen.** Avatar, helyzetkép, figura: megjelenítési eszköz, soha nem kanonikus referencia.
  Nem írnak a kánonba, nem hagynak jóvá semmit automatikusan.
- **Tartalmi kapu a szerveren.** A kliens csak kér, a szerver dönti el a megengedett tartalmi szintet a
  meglévő `characterOrigin` (`mayUseReferences`, `mayUseEverydayReferences`, `intimateAllowed`) és az
  intimitási szint (`intimacyStage`) alapján. Új kód nem implementál saját, párhuzamos szabályt.
- **Valós fotó nem kerül intim generált kép arcába.** A meglévő szabály változatlan (DECISIONS 2026-11-10):
  hétköznapi képhez minden jóváhagyott referencia mehet, meztelen vagy szexuális képhez csak szövegből
  bizonyítottan generált referencia (C2PA), vagy szöveg, ha a szereplő rekordja szerint kitalált.
- **Mindenki felnőtt férfi**, nem jön létre új szereplő, nem találunk ki kinézetet vagy életrajzot.
- **Elutasítás:** rögzítjük (`refused` + ok), nem fogalmazzuk át a promptot, hogy átmenjen.
- **Pénz:** minden fizetős hívás előtt látható becslés, kifejezett feltöltési/költség-jóváhagyás, napi plafon,
  bizonytalan (esetleg már kiszámlázott) hívás nem ismétlődik automatikusan.
- **Kulcsok** csak a meglévő védett helyen (`xai-key.ps1`, `sogni-key.ps1`, az app-folyamat környezete), soha nem
  a forrásban, OneDrive-on vagy böngészőben.
- **Élő adatbázis, gyorsítótár, bélyegképek: OneDrive-on kívül**, a helyi adatmappában (`dataDir`).

---

## A. Optimalizálás

Cél: a felület érezhetően gyorsabb legyen (rácsok, játékjelenetek, első betöltés), a beszélgetés ne
„fagyjon” a Grok-válasz alatt, és a háttérfeladatok ne terheljék feleslegesen a gépet és a OneDrive-ot.

### A0. Mérési alap (kötelező első lépés)

- Új szkript: `ops/perf-baseline.mjs`. Az élő adatbázis **másolatán** fut (a Cycle 10 mintájára), és kiírja:
  - a 15–20 legfontosabb végpont meleg és hideg válaszidejét (medián és p95 10 futásból):
    `/api/play`, `/api/play/talk` (mock providerrel), `/api/play/media/pick`, `/api/play/journal`,
    `/api/play/relationships`, `/api/locations`, `/api/duplicates/groups`, `/api/world-review`,
    a szereplőlista, a könyvtár első oldala, a Rendezésre vár lista;
  - az első betöltés letöltött bájtjait képernyőnként (index, Játék, Szereplő adatlap) a statikus
    fájlok mérete alapján;
  - a háttérfigyelők egy körének idejét és az érintett fájlok számát.
- Kimenet: `docs/PERF_BASELINE.md` (dátummal). Minden további A-lépés után újramérés, és a különbség
  bekerül a `DECISIONS.md` bejegyzésbe (ahogy a Cycle 10-nél: „351→143 ms”).

### A1. Bélyegkép-gyorsítótár és képkiszolgálás

**Probléma:** a rácsok és kártyák teljes méretű eredetiket töltenek le, és mindegyik újraellenőrzést kér.

**Megoldás:**
1. Új modul: `app/thumbnails.mjs`.
   - Kulcs: a fájl SHA-256-ja, vagy ha még nincs, `size+mtimeMs+relative_path` hash, és a szélesség.
   - Szélességek: 160, 320, 640, 1280 (a kért méret a legközelebbi nagyobbra kerekedik).
   - Tárolás: `<dataDir>/thumbs/<kulcs első 2 karaktere>/<kulcs>-<w>.jpg` (WebP, ha a választott könyvtár tudja).
   - Előállítás: a meglévő `mcp/thumbnail.ps1` (Windows, System.Drawing) újrahasznosítása, ugyanazzal a
     biztonságos útvonalellenőrzéssel. Egyszerre legfeljebb 2 előállítás fusson (szemafor), a többi sorba áll.
     Ha később kell gyorsabb megoldás, a `sharp` telepítése külön tulajdonosi jóváhagyás (8. fejezet).
   - Méretkorlát: a gyorsítótár legfeljebb N GB legyen (alapérték 2 GB), a legrégebben használt fájlok törlődnek.
     Ez a saját gyorsítótár fájljait érinti, médiát soha.
2. Új végpont: `GET /media/<id>/thumb?w=320&v=<verzió>`.
   - `Cache-Control: private, max-age=31536000, immutable`, mert a `v` (sha vagy mtime) változik, ha a kép változik.
   - Videónál a meglévő borítókép (`video-covers.mjs`) bélyegképe.
   - Hiányzó vagy felhőben lévő fájl: a meglévő „cloud recall” szabály érvényes, magától nem tölt le.
3. Kliens: minden rácsban, kártyán, telefon-kontaktlistán és naplóképen `thumb` URL, `loading="lazy"`,
   `decoding="async"`, `srcset` 320/640 szélességgel. Teljes méret csak a nézegetőben és a játékjelenet
   háttérképénél (ott 1280, eredeti csak nagyításkor).
4. Előmelegítés: a játékjelenet következő 2–3 valószínű képét (`media-director` sorrend) a kliens előre
   letölti (`<link rel="preload">` vagy `new Image()`), alacsony prioritással.

**Elfogadás:** a könyvtár első oldalának letöltött képbájtja legalább 80%-kal kisebb; második megnyitáskor
0 képkérés megy ki (gyorsítótárból jön); a tesztek zöldek. Új tesztek: `tests/thumbnails.test.mjs`
(kulcsképzés, útvonal-kiszökés elutasítása, méretkorlát, immutable fejléc, hiányzó fájl).

### A2. Frontend: kevesebb és okosabb letöltés

1. **Statikus tömörítés:** gzip és brotli a `node:zlib`-bel, első kéréskor előállítva és a `dataDir/static-cache`-be
   mentve (forrásfájl mtime szerint érvénytelenítve). `Accept-Encoding` alapján szolgál ki.
2. **Automatikus verziózás:** a kézi `?v=hu-20261108-1` helyett induláskor tartalom-hash minden statikus
   fájlhoz; az `index.html` a hash-elt URL-eket kapja; `Cache-Control: immutable`. Ez megszünteti a
   „frissítettem, de a régi JS fut” hibákat is.
3. **i18n szétbontása:** az `i18n.js` (181 KB) képernyőnként külön fájlokba (`i18n/core.js`, `i18n/play.js`,
   `i18n/library.js` stb.), dinamikus `import()`-tal az adott nézet megnyitásakor. Ugyanaz a `t()` API marad.
   Teszt: minden kulcs pontosan egy fájlban van, és nincs hiányzó kulcs (a `client-lint.test.mjs` bővítése).
4. **Nézetek lusta betöltése:** a `client.js` csak a vázat és a Kezdőlapot töltse be; a Játék (`play.js`,
   `play-map.js`), a helyszínvászon, a képműhely, a duplikátumok stb. dinamikus `import()`-tal jöjjenek.
5. **CSS:** a C-szakasz tokenjei után a nézet-specifikus CSS a nézettel együtt töltődik
   (`location-canvas.css` és `world-review.css` ne az index oldalon legyen).

**Elfogadás:** az első betöltés átvitt mérete (tömörítve) legalább 60%-kal kisebb; a Játék megnyitása
melegen 300 ms alatt interaktív (mérés: `performance.mark` a kliensben, eredmény a konzolba).

### A3. Adatbázis

1. **Index-audit:** a `ops/perf-baseline.mjs` kapjon `--explain` kapcsolót, ami a 20 leglassabb lekérdezésre
   `EXPLAIN QUERY PLAN`-t futtat, és kiemeli a `SCAN TABLE` sorokat.
2. **Új migráció** `029-performance-indexes` (up és down), csak az audit által igazolt indexekkel. Valószínű
   jelöltek (ellenőrizni kell, mielőtt bekerülnek). **Már létezik, ne duplikáld:** `media_tags_by_tag`
   (`media_tags(tag_id, media_id)`), `play_lines_conversation`, `play_conversations_character`, `world_messages_from`.
   - `media_tags(media_id)` (fordított irány, ha az audit igazolja);
   - `media_roles(role, media_id)`, ha a 007-es migráció még nem fedi le;
   - a játéktáblák szereplő és idő szerint: `play_seen(character_id, media_id)`,
     `play_inserts(kind, character_id, created_at)`, `play_appointments(character_id, ...)`,
     `play_line_media(media_id)`, `play_media_shown(panel, cast_key)`.
3. **Szétszórt sémák rendezése:** a modulokban létrehozott `play_*` táblák `CREATE TABLE IF NOT EXISTS`
   sorai maradjanak (visszafelé kompatibilitás), de kerüljenek egy összesítő migrációba is
   (`030-play-schema-consolidation`), hogy a séma egy helyen dokumentált legyen. **Adatot nem mozgat.**
4. **PRAGMA-hangolás** a megnyitáskor (`server.mjs` 86. sor körül), méréssel igazolva:
   `synchronous=NORMAL` (WAL mellett biztonságos), `temp_store=MEMORY`, `cache_size=-65536` (64 MB),
   `mmap_size=268435456`; óránként és leálláskor `PRAGMA optimize`.
5. A `media-director` és a `journal` ismétlődő lekérdezéseinél rövid (pl. 30 s) memóriás gyorsítótár,
   írásnál érvénytelenítve (a `director.clearCache()` mintájára).

**Elfogadás:** a `/api/play/media/pick` és a `/api/play/journal` p95 legalább 40%-kal gyorsabb a másolaton;
`PRAGMA integrity_check` és `foreign_key_check` rendben; a down-migráció tesztelve.

### A4. Háttérfeladatok

1. A figurák és hátterek 5 perces teljes szkennelése helyett `fs.watch` (rekurzív, Windows-on működik)
   2 s-os összevonással, és tartalékként 30 perces teljes szkennelés (OneDrive néha nem jelez).
2. Mappánként a legutóbbi `mtime` és fájlszám tárolása: ha nem változott, a mappa kimarad.
3. Az időzítők legyenek elcsúsztatva (ne induljon együtt a mentés, a világmotor és a szkennelés), és
   **játék közben** (aktív beszélgetés alatt) a nehéz feladatok várjanak, amíg a beszélgetés véget ér vagy
   5 percig nincs aktivitás.
4. A `character-origin` C2PA-ellenőrzése (2026-11-10-én már aszinkron lett) kapjon tartós gyorsítótárat
   `sha256` szerint, hogy újraindításkor ne olvasson újra több száz fájlt.

### A5. Beszélgetés: gyorsabb érzet és kevesebb token

1. **Streamelés:** az xAI chat-hívás `stream: true`-val, a szerver SSE-n (`text/event-stream`) továbbítja a
   szöveget a kliensnek, így a válasz első szavai 1–2 s alatt megjelennek. A JSON-mezők (beat, javaslatok, spark)
   a végén jönnek. Ha a JSON nem érvényes, a meglévő hibakezelés fut (504/502 érthető üzenettel).
2. **Prompt-sorrend gyorsítótárazáshoz:** a rendszerprompt és a szereplőprofil (ritkán változik) álljon elöl,
   a dinamikus rész (utolsó sorok, pillanatnyi helyzet) a végén, hogy a szolgáltatói prompt-cache találjon.
   A `usage.cached` értéket naplózni kell, és a költségkijelzés vegye figyelembe.
3. **Tokenkeret:** a `scenePack` kapjon kemény keretet (pl. 3 000 token), prioritás szerint vágva:
   profil-mag → kapcsolat → releváns emlékek (legutóbbi és helyhez kötött) → régi beszélgetés-összefoglalók.
   Teszt: a keret soha nem lép túl, és a legfontosabb mezők mindig benne maradnak.
4. **Időkorlát:** az első bájtig 20 s, összesen 60 s. Időtúllépésnél a kliens „Újrapróbálás” gombot mutat,
   **automatikus újrahívás nincs** (költség).
5. A javasolt válaszok és a beat ugyanabban a hívásban jöjjenek, ahogy most. Külön hívást ne vezessünk be.

**Elfogadás:** az első szöveg megjelenéséig eltelt idő mediánja 3 s alatt van élő Grokkal (ezt a tulajdonos
méri, mert fizetős); mockkal a streamelési út tesztelve (`tests/play-stream.test.mjs`).

### A6. Kód karbantarthatósága (csak ha marad idő, a tesztek védelmében)

- `play-mode.mjs` (744 sor) szétbontása: `play-talk.mjs`, `play-travel.mjs`, `play-phone.mjs`, `play-intimacy.mjs`;
  a nyilvános `installPlayMode` API változatlan.
- `play.js` (70 KB, nagy sablon-stringek) szétbontása komponensekre: `play/vn.js`, `play/phone.js`,
  `play/journal.js`, `play/map.js`.
- Nincs viselkedésváltozás: a meglévő `play-*.test.mjs` tesztek változtatás nélkül zöldek.

---

## B. Avatarok ChatGPT-vel

### B0. Mi az „avatar” ebben a programban

- Egy **négyzetes portré** (fej és váll, semleges háttér), ami mindenhol a szereplő arca lesz a felületen:
  szereplőkártya, telefon-kontaktlista és üzenetek, a beszélgetés beszélő-portréja, napló, kapcsolatok,
  helyszín jelenlévői.
- Nem kánon, nem referencia, nem figura (a figurák az egész alakos `Szereplő-alakok` képek maradnak).
- **Tartalék-sorrend** megjelenítéskor: aktív avatar → jóváhagyott arc-kivágás (crop) → borítókép (cover) → monogram.
  Így semmi sem törik el, ha egy szereplőnek még nincs avatarja.

### B1. Adatmodell (migráció `031-character-avatars`)

```sql
CREATE TABLE character_avatars(
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id),
  media_id TEXT NOT NULL,            -- a katalógusba importált kép
  sha256 TEXT NOT NULL,
  style TEXT NOT NULL,               -- 'photo' | 'painted' | 'illustrated' (tulajdonos választja, 8. fejezet)
  source TEXT NOT NULL,              -- 'chatgpt-mcp' | 'openai-api' | 'grok-mcp' | 'upload'
  model TEXT, prompt TEXT,
  reference_ids_json TEXT NOT NULL DEFAULT '[]',
  crop_json TEXT,                    -- négyzetes kivágás a forrásképből (presentation only)
  status TEXT NOT NULL CHECK(status IN ('candidate','active','rejected')),
  created_at TEXT NOT NULL, decided_at TEXT, note TEXT
);
CREATE UNIQUE INDEX one_active_avatar ON character_avatars(character_id) WHERE status='active';
CREATE INDEX avatars_by_character ON character_avatars(character_id, status);
```

- Fájlok: `20_SHARED_MEDIA/Avatarok/<szereplő neve>/<stílus> - <n>.png`. Nem ír felül semmit. Az átnevezés ezt a mappát is vigye:
  az `app/rename-play-extras.mjs` 71. sorában a `SPRITE_FOLDER` és `SCENE_FOLDER` mellé kerüljön az `AVATAR_FOLDER`,
  teszttel (`character-rename-game.test.mjs` bővítése).
- Az exportba és visszaállításba bekerül; a végleges törlés (`permanent-media-delete`) kezeli.
- Az átnevezett vagy törölt szereplő avatarja a meglévő átnevezési és törlési szabályokat követi.

### B2. Első út: ChatGPT az MCP-alagúton keresztül (ingyenes, előfizetésből)

Ez illeszkedik a meglévő Grok/ChatGPT képgyártási folyamatba, ezért ez legyen az első.

1. `play-assets.mjs`: a `TARGETS` kapjon új célt: `'avatar'`.
   - `list_generation_needs`: avatar-igény minden játékban szereplő (és opcionálisan minden) szereplőre, akinek
     nincs aktív avatarja. Prioritás: Palor és a világmotor szereplői előre.
   - A brief: négyzetes 1024×1024, fej és váll, enyhén felülről, semleges, a felület színeihez illő háttér
     (a C1 tokenjei közül: sötét, meleg tónus), természetes arckifejezés, felirat és vízjel nélkül, felnőtt férfi,
     **csak a jóváhagyott kinézet és a jóváhagyott referenciák** (`character-origin.everydayReferences`, ez
     hétköznapi kép). A stílus a tulajdonos választása szerint.
   - `content_expected: "non_intimate"`, mindig.
   - `finish_generation_job` célja `avatar` esetén: kép importálása a katalógusba, másolás az `Avatarok` mappába,
     `character_avatars` sor `candidate` státusszal. **Nem válik automatikusan aktívvá**, kivéve, ha a
     szereplőnek még semmilyen avatarja nincs **és** a tulajdonos ezt beállításban engedélyezte (8. fejezet).
   - A forráskép a `play_asset_sources` mintájára ne jelenjen meg a Rendezésre vár listában.
2. `app/generation-playbook.mjs` és `docs/CHATGPT_PROMPT.md`: új szakasz az avatarokról (verziószám emelése,
   pl. 2026-11-11.1). A ChatGPT csak `avatar`, `figure`, `background` és `non_intimate` `scene` munkát vállal.
3. Az MCP szerver `instructions` szövege (mcp/server.mjs 58. sor) egy ponton elavult: azt írja, hogy referenciafotó
   csak szövegből generált referencia lehet. Ezt igazítsd a 2026-11-10-i tulajdonosi döntéshez: hétköznapi képhez
   (avatar, figura, hétköznapi jelenet) a brief által felsorolt minden jóváhagyott referencia használható, intim
   képhez továbbra is csak a bizonyítottan generált.

### B3. Második út: egy gombnyomás az appban (OpenAI API, fizetős)

1. Szereplő adatlap → új fül vagy blokk: **„Avatar”**.
   - Rács: aktív avatar kiemelve, jelöltek, elutasítottak (összecsukva).
   - Gombok: **„Legyen ez az avatar”**, „Elutasítom”, „Kivágás igazítása” (a meglévő `picture-crop.js`, négyzetes
     arányra kötve), **„Új avatar ChatGPT-vel (ingyenes, MCP)”** (munkát nyit a B2 szerint), és
     **„Új avatar OpenAI API-val”** (fizetős).
2. A fizetős út a **meglévő** `image-generation.mjs` folyamatot használja (prepare → approve → execute), új
   „avatar” előbeállítással: provider `openai`, modell a `image-generation.json` szerint
   (pl. `gpt-image-2.5-sunburst`), méret 1024×1024, referenciák az `everydayReferences` közül (legfeljebb 4,
   arc-kivágások előnyben), prompt a B2 briefjéből.
   - A jóváhagyó lap mutatja a becsült költséget és a feltöltendő referenciákat; a feltöltési és költség-
     jóváhagyás kötelező (AGENTS.md).
   - Kötegelt mód: „Hiányzó avatarok elkészítése (N db)”: egy összesített terv tételesen felsorolva (szereplő,
     referenciák, darabár, összesen), **egyetlen kifejezett jóváhagyással**, napi plafonnal. Ehhez a tulajdonos
     előzetes döntése kell (8. fejezet), addig csak egyesével.
   - Eredmény: `character_avatars` sor `candidate` státusszal, `source='openai-api'`, teljes provenance-szel.
3. Elutasításnál (`refused`) rögzítés és továbblépés. Átfogalmazás nincs.

### B4. Megjelenítés

- Új kliens-segéd: `avatarUrl(character, size)`, ami a tartalék-sorrendet alkalmazza, és a bélyegkép-végpontot
  (A1) használja 64/128/256 px-re.
- Minden helyen erre cserélni, ahol most borító, kivágás vagy monogram jelenik meg (kártyák, telefon, VN
  beszélő-portré, napló, kapcsolatok, helyszín). Kereséshez: `portrait`, `avatar`, `monogram`, `cover` a `public/`
  alatt.

### B5. Tesztek

- `tests/character-avatars.test.mjs`: egy aktív avatar szereplőnként (az index kikényszeríti); jelöltből aktív, majd
  vissza; elutasított nem jelenik meg; átnevezés viszi a mappát; export és visszaállítás; tartalék-sorrend;
  kánon és referenciák változatlanok maradnak.
- `tests/play-assets.test.mjs` (vagy új fájl): az `avatar` cél igény, brief (non_intimate, referencia-szabály) és
  befejezés; a ChatGPT `cancelled` útja intim briefnél nem érinti az avatart.

---

## C. Letisztultabb felület

Cél: kevesebb zaj, egyértelmű elsődleges művelet minden képernyőn, egységes megjelenés. A sötét, meleg
(arany kiemelésű) jelleg marad, a meglévő funkciók nem tűnnek el, csak rendezettebbek lesznek.

### C1. Design tokenek

`app/public/tokens.css` (az index oldalon első CSS-ként):

- **Színek:** `--bg`, `--surface-1`, `--surface-2`, `--surface-3`, `--line`, `--line-strong`, `--text`,
  `--text-muted`, `--text-faint`, `--accent`, `--accent-strong`, `--accent-contrast`, `--success`, `--warning`,
  `--danger`, `--info`, és a tartalmi szintek (`--level-everyday`, `--level-nudity`, `--level-sexual`).
- **Térköz:** `--space-1 … --space-8` (4, 8, 12, 16, 24, 32, 48, 64 px).
- **Lekerekítés:** `--radius-sm` 6, `--radius-md` 10, `--radius-lg` 16, `--radius-pill` 999.
- **Tipográfia:** `--font-ui` (Segoe UI), `--font-display` (Georgia), méretskála `--fs-xs … --fs-2xl`.
- **Árnyék és réteg:** `--shadow-1`, `--shadow-2`, `--z-dialog`, `--z-toast`.
- **Mozgás:** `--ease`, `--dur-fast` 120 ms, `--dur` 200 ms; `prefers-reduced-motion` alatt 0.

Egy segédszkript (`ops/css-token-report.mjs`) listázza a beégetett hex színeket fájlonként és a legközelebbi
tokent. A cserét **fájlonként, átnézve** kell elvégezni, nem vakon. Cél: 158 → 20 alatti egyedi hex, 24 → 5 alatti
`!important`.

### C2. Navigáció

10 menüpont helyett 5 csoport (ikon + felirat, a csoporton belül fülek):

| Új menüpont | Tartalma (fülek) |
|---|---|
| **Kezdőlap** | csak teendők és figyelmeztetések (rendszerállapot, hiányzó figurák/avatarok, rendezendő képek száma) |
| **Játék** | Játék, Élő világ (világmotor, futásnapló, képgyártás) |
| **Szereplők** | Szereplők, Kapcsolatok, Csoportok |
| **Helyszínek** | Helyszínlista, Térkép/vászon, Hátterek |
| **Gyűjtemény** | Könyvtár, Rendezésre vár, Gyors címkézés, Médiaáttekintés, Duplikátumok |
| **Műhely** | Képműhely, Avatarok, Generálási előzmények és költség |

- A mentés, visszaállítás és a beállítások egy **⚙ Beállítások** oldalra kerülnek (felnőtt kapcsoló, napi
  költségplafonok, szolgáltatók állapota, avatar-stílus, gyorsítótár mérete).
- A számlálók (Rendezésre vár, Gyors címkézés) a csoport ikonján összesítve, a fülön részletezve.
- A régi `data-view` azonosítók maradjanak meg aliasként, hogy a meglévő linkek és tesztek működjenek.

### C3. Komponensek

`app/public/ui/` alatt kis, függőség nélküli segédek (sablon-függvények, ahogy most is):

- `button(variant: primary|secondary|ghost|danger, size)`, `iconButton`, `chip`, `card`, `toolbar`,
  `emptyState`, `dialog` (fejléc + törzs + lábléc), `toast`, `tabs`, `menu` (legördülő „⋯ Több”),
  `segmented` (szegmentált kapcsoló).
- **Egy ikonkészlet:** inline SVG sprite (`ui/icons.svg`, saját rajzolású vagy szabad licencű, pl. Lucide MIT,
  ennek telepítése vagy bemásolása tulajdonosi jóváhagyás). Az emoji és Unicode-ikonok helyett. Az emoji
  csak a tartalomban marad (pl. beat-jelzés), ha a tulajdonos így kéri (8. fejezet).
- Egységes állapotok: hover, focus-visible (látható fókuszkeret), disabled, loading (gombon pörgő jel).

### C4. Beszélgetés (VN) képernyő

A legzsúfoltabb rész. Új elrendezés:

- **Alul középen**: beviteli mező + **Küldés** (elsődleges).
- Mellette két ikon: **📸 Pillanatkép** (D-szakasz) és **⋯ Több** (menü).
- A **⋯ Több** menüben: Előzmények, Közös fotók, Fotó mód, Jelenet-prompt másolása, Kép hozzáadása a jelenethez,
  Beszélgetés befejezése, Távozás.
- **Fotó módban** külön, vékony sáv jelenik meg a kép alatt: ◀ ▶ lapozás, darabszám, és a ☀ 🔥 🔞 jelölés
  szegmentált kapcsolóként.
- **Tempó** (Lassabban / Folytassuk / Álljunk meg) csak intim jelenetben, szegmentált kapcsolóként a beviteli mező
  felett. A „💋 Közelebb” és a „✨ Pillanat” gomb csak akkor látszik, amikor ténylegesen használható (ahogy most is),
  de chipként, nem teljes gombként.
- A beat-jelzés (♥ 💋 👕 🔥 ☁) a név mellett chip marad.
- A javasolt válaszok chipek a beviteli mező felett; koppintásra a mezőbe kerülnek, nem küldődnek el azonnal.
- Billentyűk asztalon: Enter = küldés, Shift+Enter = új sor, Esc = menü bezárása, ←/→ = fotó lapozás fotó módban.

### C5. Kezdőlap

- Csak akcióképes kártyák: „3 rendezendő kép”, „2 szereplőnek nincs figurája”, „5 avatar hiányzik”,
  „A Grok-kapcsolat kulcsa lejárt (mit kell tenni)”. A rendszerállapot (`app/system-status.mjs`) figyelmeztetései
  ide kerülnek.
- Egy „Folytatás” kártya: az utolsó játékbeli hely és beszélgetés, egy kattintással.

### C6. Mobil

- 650 px alatt alsó fülsáv (5 csoport), a felső sáv eltűnik; a VN képernyőn a beviteli mező a billentyűzet fölé
  rögzül (`visualViewport`), a „⋯ Több” alulról felcsúszó lap.
- A mobil külön felület (`mobile.html`) a tokeneket és az ikonkészletet használja.

### C7. Akadálymentesség és ellenőrzés

- Kontraszt: szöveg legalább 4.5:1 a felületen (a `--text-muted` jelenlegi értékét ellenőrizni).
- Minden ikongomb kap `aria-label`-t (i18n kulccsal), a dialógusok fókuszt fognak és Esc-re zárnak.
- Vizuális ellenőrzés: a meglévő `*-preview.mjs` szkriptek mintájára `tests/ui-preview.mjs`, ami képernyőnként
  szintetikus adatokkal elindítja a felületet; a tulajdonos ránéz. Automatikus pixel-összehasonlítás nem kell.

**Elfogadás (C egészére):** minden meglévő funkció elérhető legfeljebb két kattintással; a VN alsó sávjában
alapállapotban legfeljebb 4 vezérlő látszik; a `client-lint` és a UI-tesztek zöldek; a tulajdonos jóváhagyja a
képernyőképeket.

---

## D. Helyzetkép beszélgetés közben

### D0. Ami már megvan, és amire építünk

- A jelenet saját fotót választ címkék alapján (`media-director`, `play_line_scene`, `play_line_media`).
- „📋 Jelenet-prompt”: másolható prompt (`scene-images.mjs` `prompts()`), a megfelelő referencia-szabállyal.
- „➕ Kép a jelenethez”: kézi feltöltés.
- Grok/ChatGPT MCP munkák `scene` céllal, aszinkron.
- Tartalmi kapu: `intimacyStage` + `characterOrigin` + `play_content` szintek.

**Új:** a **📸 Pillanatkép** gomb a beszélgetésben, ami az *aktuális pillanatról* képet kér, és ha elkészül,
megjeleníti a jelenetben, a beszélgetés adott sorához kötve.

### D1. A pillanat leírása

- A Grok-válasz JSON-ja kapjon egy új, opcionális mezőt: `visual_moment`. Ez 1–2 mondat a látható helyzetről:
  ki hol van, testtartás, ruházat állapota, tevékenység, hangulat, fény. **Nem kerül bele** név, valós helyszín
  azonosító, felirat. Így nincs külön chat-hívás (A5).
- Ha a mező hiányzik vagy üres, a szerver sablonból állítja össze: hely (`location tree` útvonal), napszak
  (`nappal/este/ejjel`), jelenlévők, a szereplő aktuális tevékenysége (`activityOf`), beat.
- A szerver a `visual_moment` szöveget **szűri** a kapu szerint (D2): ha a megengedett szint
  `non_intimate`, a leírás ruházat- és testrész-részletei semlegesítődnek, és a prompt kifejezetten hétköznapi,
  felöltözött kompozíciót kér.

### D2. Tartalmi kapu (szerver, kötelező)

```
megengedett_szint(szereplő, beszélgetés) =
  ha felnőtt kapcsoló ki            → non_intimate
  ha nem characterOrigin.intimateAllowed(szereplő) → non_intimate
  különben az intimacyStage szerinti szint: none→non_intimate, flirt→nudity, intimate→sexual_activity
kért_szint = a beat és a visual_moment alapján becsült szint
végső_szint = min(kért_szint, megengedett_szint)
referenciák:
  végső_szint == non_intimate → everydayReferences (fotók is)
  különben → csak bizonyítottan generált referencia (C2PA), vagy szöveg, ha a rekord „kitalált”
szolgáltató:
  OpenAI/ChatGPT → csak non_intimate (az ő szabályuk); magasabb szintnél a gomb a Grok utat ajánlja
```

- Csoportos jelenetben a megengedett szint a **legszigorúbb** jelenlévőé. Palorra ugyanez vonatkozik a saját
  rekordja alapján (a `palor_reference_policy` már létezik).
- A végső szint és az indoklás a provenance-be kerül (`play_moment_images.level`, `.reason`).
- Teszt: a kapu táblázatos tesztje minden kombinációra (`tests/play-moment-gate.test.mjs`), külön esettel arra,
  hogy valós fotó referencia soha nem kerül `nudity`/`sexual_activity` szintű kérésbe.

### D3. Két út a generáláshoz

**a) Ingyenes, aszinkron (alapértelmezett):** a gomb egy `scene` munkát nyit (`play_generation_jobs`) a
pillanat-briefjével: `source='moment'`, `conversation_id`, `line_id`, a D2 szerinti szint és referenciák. A Grok
vagy a ChatGPT (non_intimate esetén) a meglévő MCP-folyamattal elkészíti. Amikor megérkezik:
- a kép a `Közös jelenetek/<szereplő>/<hely> - pillanat - <n>.png` helyre kerül (nem ír felül);
- a `play_moment_images` sor `ready` lesz, és a beszélgetés előzményében a sorhoz kötve jelenik meg;
- ha a beszélgetés még tart, a jelenet háttérképe áttűnéssel lecserélődik; ha már véget ért, a naplóban és a
  „Közös fotók” között látszik, és egy kis értesítés jelzi.

**b) Azonnali, fizetős (opcionális, tulajdonosi bekapcsolás után):** az appból közvetlenül hív képgeneráló API-t.
- Szolgáltató: `non_intimate` szinten OpenAI vagy xAI; magasabb szinten csak az xAI (ha a tulajdonos engedi;
  8. fejezet). A meglévő `image-providers.mjs` adapterei; ha referencia nélkül kell (szövegből), az adapter kapjon
  `images/generations` ágat a mostani `images/edits` mellé.
- **Költség:** a gombon látszik a becsült ár (pl. „📸 ~0,07 $”). Az első használatkor egy egyszeri jóváhagyó lap:
  melyik szolgáltató, mely referenciák mehetnek fel szereplőnként, darabár, napi plafon. Utána minden
  gombnyomás egy kifejezett, árral jelölt művelet. **Ez a működés tulajdonosi döntés, és a DECISIONS.md-ben rögzíteni
  kell, mielőtt elkészül** (az AGENTS.md futásonkénti jóváhagyást ír elő; ez annak egy formája).
- Napi plafon (`image_daily_cap_usd` a játékbeállításokban: `application_settings`, kulcs `play:settings`,
  a `savePlaySettings` validálásával), beszélgetésenként legfeljebb 1 folyamatban lévő kép, 30 s
  lehűlés két kérés között.
- Hívás közben a jelenetben finom „kép készül…” jelzés; a beszélgetés közben folytatható.
- `uncertain` állapotnál (lehet, hogy kiszámlázták) nincs automatikus ismétlés; a tulajdonos dönt.

### D4. Következetesség

- Referenciák szereplőnként a D2 szerint, arc-kivágások előnyben (a meglévő crop-ok).
- A helyszín hangulatához: a hely háttérképe (emberek nélküli helyszínfotó vagy generált háttér) mehet
  **stílus-referenciaként**, ha a szolgáltató több referenciát fogad. Emberes fotó nem.
- Fix formátum a VN-hez: 1536×1024 fekvő (OpenAI) vagy a megfelelő arány (xAI).
- Egységes stílus-előbeállítás a tulajdonos választása szerint (ugyanaz, mint az avatarnál, vagy külön).
- Minden kép provenance-e: szolgáltató, modell, verzió, prompt, referencia-azonosítók és hash-ek, végső szint,
  `conversation_id`, `line_id`, költség (becsült és tényleges).

### D5. Adatmodell (migráció `032-play-moment-images`)

```sql
CREATE TABLE play_moment_images(
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  line_id TEXT,                      -- melyik sorhoz tartozik
  character_ids_json TEXT NOT NULL,
  location_id TEXT,
  level TEXT NOT NULL CHECK(level IN ('non_intimate','nudity','sexual_activity')),
  reason TEXT NOT NULL,              -- a kapu indoklása
  route TEXT NOT NULL CHECK(route IN ('mcp-job','api')),
  job_id TEXT, run_id TEXT,          -- play_generation_jobs / image generation run
  media_id TEXT,                     -- ha elkészült
  status TEXT NOT NULL CHECK(status IN ('pending','ready','refused','failed','uncertain','cancelled')),
  estimated_cost_usd REAL, actual_cost_usd REAL,
  created_at TEXT NOT NULL, finished_at TEXT, note TEXT
);
CREATE INDEX moment_by_conversation ON play_moment_images(conversation_id, created_at);
CREATE INDEX moment_by_status ON play_moment_images(status);
```

- Elkészült képnél `play_content` szint = a végső szint (később a world-review elemzés felülírhatja, ha szigorúbb).
- `play_inserts` sor `kind='scene'`, `source='moment'`.
- Visszatekerés (`world-rewind`): a pillanatkép **megmarad** a médiában (média nem törlődik), de a visszatekert
  beszélgetéshez kötés kompenzáló bejegyzéssel lekerül. Ezt teszteld.
- Export, visszaállítás és végleges törlés kezeli.

### D6. Végpontok

- `POST /api/play/moment` `{conversation_id, line_id?, route:'mcp-job'|'api'}` → `{id, status, level, estimated_cost_usd}`
- `GET /api/play/moment/:id` → állapot és kép (thumb URL), csak saját beszélgetéshez.
- `POST /api/play/moment/:id/cancel`
- MCP: a meglévő `start_generation_job` a `moment` forrású munkákat is visszaadja; új olvasó eszköz nem kell.
  A playbook kap egy „pillanatképek” bekezdést (elsőbbség a nyitott pillanatképeknek, mert a játékos vár rájuk).

### D7. Tesztek

- Kapu (D2) táblázatos teszt, csoportos legszigorúbb szabály, Palor-szabály.
- Aszinkron út: munka nyitása, briefben a helyes szint és referencia, befejezés után a kép a sorhoz kötődik.
- Fizetős út mock szolgáltatóval: becslés, plafon túllépése elutasít, `uncertain` nem ismétel, lehűlés.
- Elutasítás: `refused` rögzítve, a felület csendben jelzi, nincs átfogalmazás.
- Visszatekerés és export.

---

## 8. Nyitott kérdések Tibornak (a megfelelő lépés előtt)

1. **Avatar-stílus:** fotórealisztikus, festett vagy illusztrált? Egy közös stílus mindenkinek, vagy szereplőnként?
2. **Automatikus első avatar:** ha egy szereplőnek még nincs avatarja, az első elkészült jelölt automatikusan
   aktív legyen, vagy mindig te választasz?
3. **Kötegelt fizetős avatar:** engedélyezed-e az egy jóváhagyással, tételes listával induló kötegelt OpenAI-
   generálást? Mekkora napi plafonnal?
4. **Fizetős pillanatkép:** kell-e egyáltalán az azonnali, fizetős út, vagy elég az ingyenes MCP-s? Ha kell:
   melyik szolgáltató, mekkora napi plafon, és elfogadod-e az „egyszeri bekapcsolás + gombnyomásonként látható
   ár” jóváhagyási formát?
5. **Ikonok:** maradjanak az emoji-k a játékban (♥ 💋 ☀ 🔥 🔞), vagy egységes vonalas ikonok mindenhol?
   Engedélyezed-e egy szabad licencű ikonkészlet (pl. Lucide, MIT) bemásolását?
6. **Bélyegképek:** elég a meglévő PowerShell-alapú bélyegkép-készítés, vagy telepíthető a `sharp` csomag
   (gyorsabb, WebP-t is tud)?
7. **Navigáció:** jó-e az 5 csoportos felosztás (C2), vagy valamit máshova tennél?

---

## 9. Ütemterv

**1. sprint – ma délután (kb. 3–4 óra):**
1. A0 mérési alap → `docs/PERF_BASELINE.md`
2. A3 index-audit + `029-performance-indexes` + PRAGMA-hangolás → újramérés
3. A1 bélyegkép-gyorsítótár és immutable képkiszolgálás → újramérés
4. B1 + B2: avatar-tábla és `avatar` cél az MCP-folyamatban (ChatGPT-vel azonnal használható)
5. B4: `avatarUrl` tartalék-sorrenddel a kártyákon és a VN-portrén
6. Kódmentés, tesztek, DECISIONS-bejegyzés

**2. sprint:**
7. A2 tömörítés, automatikus verziózás, i18n- és nézetbontás
8. C1 tokenek + C3 komponensek
9. C4 VN-képernyő új elrendezése
10. C2 navigáció + Beállítások oldal, C5 kezdőlap

**3. sprint:**
11. D1–D2 (`visual_moment` + kapu, tesztekkel először)
12. D3a ingyenes pillanatkép MCP-n keresztül, D5–D6
13. A5 streamelés (a beszélgetés érzetét ez javítja leginkább)
14. B3 fizetős avatar az appban, D3b fizetős pillanatkép (csak a 8. fejezet döntései után)

**Később:** A4 háttérfeladatok, A6 szétbontás, C6 mobil, C7 akadálymentesség.

---

## 10. Indító üzenet Claude Code-nak (bemásolható)

```text
Olvasd el a docs/FEJLESZTESI_TERV_2026-11-11.md fájlt, és előtte az AGENTS.md-ben felsorolt dokumentumokat.
Az 1. sprinttel kezdj (9. fejezet), lépésenként: kódmentés (ops/code-checkpoint.mjs), megvalósítás, tesztek,
újramérés, DECISIONS.md bejegyzés. Ha egy lépéshez a 8. fejezet valamelyik kérdése kell, előbb kérdezz meg.
Fizetős hívást, telepítést vagy új szolgáltatóhoz való feltöltést ne indíts a jóváhagyásom nélkül.
Minden lépés után röviden, magyarul írd le, mi változott és mit mértél.
```
