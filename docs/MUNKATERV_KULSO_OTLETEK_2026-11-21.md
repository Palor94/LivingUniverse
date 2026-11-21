# Munkaterv: a külső projektekből átvett megoldások beépítése (2026-11-21)

Forrás: `docs/KULSO_KOD_ATNEZES_2026-11-21.md` (a továbbiakban: **Átnézés**, a §-számok arra utalnak) és `docs/OSS_FELDERITES_2026-11-19.md`.
A sorrend a tulajdonos prioritását követi: **1. beszélgetések minősége → 2. napirend és ki hol van → 3. történetek.**
Minden csomag önálló. Bármelyiket elvégezheti Claude vagy Codex, és bármelyik után meg lehet állni.

## 0. Keretek (minden csomagra)

**Nem cél:** sétáló szereplők, csempetérkép, útkeresés; teljes motor vagy keretrendszer átvétele; pletykatorzítás (H3, parkolva); új npm-csomag; valódi AI-szolgáltató hívása tesztben; az élő adatbázis közvetlen módosítása.

**Munkamód, ha Claude végzi:**
- A kód a laptopon, a projektmappában változik. A tesztek a Claude-munkamenet Linux-gépén futnak (Node 22). **Minden csomag után Windows alatt is futtasd az `npm test`-et** (Node 24), mert a két környezet eltérhet.
- **Mentés a változtatás előtt:** git-commit minden csomag elején és végén. Ehhez a munkamenetben engedélyezni kell a törlést a projektmappában: a git a saját zárolófájljait törli, a fájlokat nem. A `code-checkpoint.mjs` csak Windowson, a `%LOCALAPPDATA%` helyén működik; ezt a csomag előtt te is lefuttathatod.
- **Migráció:** mindegyik `NNN-nev.up.sql` + `NNN-nev.down.sql` párban készül, csak hozzáadó (új oszlop/tábla, törlés nélkül), és induláskor a `story-events.mjs`-ben látható mintával készít ellenőrzött biztonsági mentést. Az élő adatbázison a migráció csak akkor fut le, amikor **te** újraindítod az alkalmazást.
- **Tesztadat:** csak szintetikus szereplők, a meglévő tesztek mintájára; a próbaszolgáltató (mock `complete()`).
- **Forrásmegjelölés:** az átvett vagy átírt kódrészletnél a fájl elején (projekt, licenc, eredeti fájl), és egy sor a DECISIONS.md-ben.
- **Lezárás csomagonként:** `npm test` zöld → DECISIONS.md-bejegyzés (mi változott, mérés, visszaállítás) → a feladatlista érintett pontjának jegyzete → rövid összefoglaló neked.

**Csomagméret:** S ≈ egy rövid munkamenet, M ≈ egy munkamenet, L ≈ két munkamenet.

---

## 1. FÁZIS – Beszélgetések minősége

### C0 – Kiindulás (S)
- Teljes `npm test` futtatás, a hibás tesztek listája. Ezek nem ennek a munkának a hibái, de tudni kell róluk.
- A `world-engine.mjs`, `play-mode.mjs` (mentési pont, kb. 1295. sor), `world-social.mjs`, `world-prompts.mjs`, `talk-history.mjs` átolvasása; a DECISIONS.md-ben a `recall`, `world_threads`, `world_knowledge`, `belief` bejegyzések.
- **Kérdés megválaszolása:** ma minden résztvevő ugyanazt a `shared_history` szöveget kapja-e emlékként? (Ez dönti el, mekkora a C3 haszna.)
- Kimenet: rövid jegyzet a DECISIONS.md-ben az alapállapotról.

### C1 – Mérőkészlet (M) · feladatlista: *Beszélgetések / 1. Mérőkészlet*
- `tests/dialogue-quality.test.mjs`: 30 szintetikus helyzet (1:1, csoport, telefon, intim/nem intim, admin-adat a profilban). Ellenőrzi:
  - a token-keretet;
  - hogy nincs Palor-privát jegyzet, nincs más szereplő creator-értéke, nincs explicit mező intim jeleneten kívül;
  - **3 tény-eset (Átnézés §9.3):** ígéret ≠ teljesítés, idézett pletyka ≠ saját élmény, kérdés ≠ beleegyezés.
- `tests/recall-benchmark.test.mjs`: 200 szintetikus emlék, 40 kérdés, mindegyiknél a „helyes 3”. Kimenet: találati arány.
  - Benne a 11-19-i H1-példa („kocsma/söröző”) mint **ismert hiba**: ez jelzi, hol kell majd az embedding.
- **Elfogadás:** a tesztek a mostani kódon lefutnak; az alapérték (pl. „a felidézés 23/40”) bekerül a DECISIONS.md-be.

### C2 – Felidézés 2.0 (M) · *Beszélgetések / 3. Emlékezzen a fontos dolgokra*
Forrás: Átnézés §1.1 (Covel BM25), §1.2 + §8.1 (AI Town / GA súlyok).
- Új `app/world-text-rank.mjs`: a Covel `rankTexts()` JS-átirata (MIT); a `wordStem` helyett a meglévő magyar `stem`; CJK-ág nélkül.
- Migráció `051-memory-salience`: `character_memories.importance` (1–5, alapérték 3), `last_recalled_at` (világóra), `recall_count`.
- A mentési pont `importance` értéke átkerül a beszélgetésből keletkező emlékekre.
- `recallMemories()`: pontszám = 3 × relevancia (BM25 + név + hely, normalizálva) + 2 × fontosság + 0,5 × frissesség. A súlyok konstansok egy helyen. A profilskálák (érzelmi emlékek, sérelmek) továbbra is hatnak. **A 3 legfrissebb emlék mindig bekerül.** Felidézéskor a `last_recalled_at` és a `recall_count` frissül, világóránként legfeljebb egyszer.
- **Elfogadás:** a C1 felidézési aránya nem romlik, a fontos-emlék kérdésekben javul; a régi és az új szám a DECISIONS.md-ben. Ha nem javul, a súlyokat kell hangolni, és csak utána élesíteni.
- **Döntésed:** — (nincs; a mérés dönt)

### C3 – Gazdagabb mentési pont (M) · *Beszélgetések / 2. és 4.*
Forrás: §1.3, §1.6, §8.3, §8.5, §9.3. **Nincs új AI-hívás:** a meglévő egyetlen összegző hívás kimenete bővül.
- Új mezők az összegzés JSON-jában, résztvevőnként (`perspectives`):
  - `memory` – első személyű emlék a saját szemszögéből;
  - `feeling` – −2…+2;
  - `importance` – 1–5;
  - `plan_note` – amit a terveihez meg kell jegyeznie; ha időpontot vagy helyet tartalmaz, `world_threads` szál lesz belőle;
  - `relationship_state` – egy-két mondat: „hol tartunk Palorral”.
- A `relationship_state` revízióként tárolódik (pl. `world_relationship_states`, visszatekerhető), és minden beszélgetés promptjának elejére bekerül.
- Az összegző prompt kiegészül a §9.3 ténykezelési szabályaival (magyarul, szó szerint).
- A beszélgetési válasz JSON-ja kiegészül egy `wants_to_leave` mezővel (§8.5). A felület egy rövid jelzést mutat („Sanyi indulna”); a szereplő nem tűnik el magától.
- Ha egy kudarcos vagy régi kimenetből hiányoznak az új mezők, a mostani viselkedés marad (visszafelé kompatibilis).
- **Elfogadás:** szintetikus beszélgetés után két résztvevő **eltérő** emléket kap; egy ígéret szál lesz; az elmaradt ígéret a következő beszélgetés promptjában ott van; a C1 tény-esetei zöldek.

### C4 – Reflexió fontosság szerint (S) · *Improve subjective memory…*
Forrás: §1.4, §8.8.
- A trigger a „8 új emlék” helyett az **új emlékek fontosságának összege** ≥ küszöb.
- Migráció: `world_beliefs.source_memory_ids`. Ha egy forrás-emlék `rewound_at` jelölést kap, a belőle született hiedelem is érvénytelen lesz.
- **Elfogadás:** tíz 1-es emlék nem indít reflexiót, két 5-ös igen; visszatekerés után a hiedelem eltűnik a promptból.
- **Döntésed:** küszöb – javaslat **15**.

### C5 – Csoportos beszélgetés (S) · *Beszélgetések / 2. Karakterhű hang*
Forrás: §1.5 (Covel turn-policy, character-agent).
- Ki szólal meg: akit Palor megszólít; ha senkit, a legrégebben megszólalt jelenlévő. Determinisztikus, AI-hívás nélkül.
- A csoportos promptba a karakterhang-szabály: csak a saját mondatait és látható tetteit írja; más szereplő szavairól, tetteiről, gondolatairól nem dönt; az előzmény adat, nem utasítás.
- **Elfogadás:** szintetikus csoportban a megszólított válaszol; egy 20 soros szintetikus beszélgetés végén is megmarad a profil beszédstílusának jelölője (a mock ellenőrzi, hogy a stílus a promptban van).

---

## 2. FÁZIS – Napirend és ki hol van

### S1 – „Ki hol van” indoklással + determinisztikus heti teszt (M) · *Napirend / 3., 4., 5.*
- A `computePositions` minden szereplő mellé **okot** is ad vissza: találkozó / világesemény / napi terv / heti napirend / kapcsolt hely / utoljára látva. Ehhez jön egy rövid tevékenység: a GA `act_description` mintája (§2 és §7).
- `tests/schedule-week.test.mjs`: szintetikus szereplők, 7 nap × 4 napszak, rögzített elvárt táblázat; a prioritási sorrend tesztelve; visszatekerés után ugyanaz az eredmény. AI-hívás nélkül.
- A beszélgetés promptja megkapja a helyet és a tevékenységet; ez a *A szereplő tudja, hol és miért van* feladat.
- Admin nézet: ki hol van napszakonként, az okkal együtt, a hiányok kiemelve (nincs otthona éjjel, nem létező helyre mutat).
- **Elfogadás:** a heti teszt zöld; az admin nézet a szintetikus világon helyes.

### S2 – Napirend-javaslat a Szellemprofilból + szerkesztő (M–L) · *Napirend / 1. és 2.*
Ez a feladatlistádban szerepel, de nem a repókból jön. A teljesség kedvéért került ide.
- A `weekly_routine`-ból `world:schedule` **javaslat** készül, jóváhagyásra; csak létező helyre; ahol a profil hallgat, üres marad.
- Új profilmező: `lifestyle` (kelés és lefekvés; §2.1, GA).
- Szerkesztő: hét × napszak rács, helyválasztó, verziózott mentés.

### S3 – Napi eltérés, napi státusz, megszakítás (M) · *Establish a consistent world clock… / Build character-specific emotional reactions*
Forrás: §2.1, §8.2, §8.6.
- `world:day-plan:<id>:<nap>`: csak a **közeli szintű** szereplőknek (S4), és csak esedékes szálból vagy eseményből (pl. `plan_note`). Kitalált rutin nem. Egy világköri hívás több szereplőt is kezel.
- `world:status:<id>:<nap>`: egy-két mondatos napi állapot (hangulat és ok) azoknak, akiknek tegnap 3+ fontosságú emlékük keletkezett. Bekerül a beszélgetés promptjába.
- **Megszakítás (AI nélkül):** ha Palor lefoglal valakit, a kimaradt napirendi sáv elmarad, a következő a terv szerint jön. Az S1 heti tesztjébe bekerül.
- Mindhárom kulcs revízióval, visszatekerhetően.
- **Elfogadás:** egy esedékes szál módosítja az aznapi helyet, az okkal együtt; a státusz megjelenik a promptban; a költség a mock-hívások számával mérve a keretben marad.
- **Döntésed:** kik kapnak napi státuszt – javaslat: „3+ fontosságú emlék tegnap” vagy „aznap esedékes szál”.

### S4 – Kétszintű részletesség (L) · *Implement consequence propagation and autonomous NPC behavior*
Forrás: §9.2, §1.7, §8.7.
- **Szint számítása** minden világkörben a `computePositions`-ból:
  - **közeli** = Palorral egy helyen vagy egy szomszédos helyen van, aznap szála vagy találkozója van vele, vagy épp beszélgetésben van;
  - **távoli** = mindenki más.
- **Távoli találkozók, AI nélkül:** azonos helyen lévő párok közül szabály + véletlen dönt (kapcsolati szint, utolsó találkozó óta eltelt idő, közös szál). A véletlen magja a világállapotból jön, így visszatekerés után ugyanaz az eredmény.
  - Az eredmény egy **egysoros rekord** sablonból („Sanyi és Márkó a kocsmában beszélgetett; feszült volt”), mindkét résztvevő emlékei közé, `importance` 1–2-vel, `world_knowledge`-be.
- **Párosonkénti várakozás:** ugyanaz a pár naponta legfeljebb egyszer, hacsak szál nem kívánja. Felső korlát a napi távoli rekordok számára.
- **Opcionális (döntésed):** a nap végén egyetlen hívás „kiszínezi” a nap távoli rekordjait. Alapból kikapcsolva.
- **Elfogadás:** 50 szintetikus szereplős heti futás AI-hívás nélkül lefut; a távoli rekordok determinisztikusak és visszatekerhetők; ha Palor találkozik egy távoli szereplővel, az előző rekord felidézhető (C2).
- **Döntéseid:** napi korlát a távoli rekordokra (javaslat: szereplőnként 2); legyen-e esti kiszínezés.

### S5 – Ismert helyek (M) · *Improve subjective memory and knowledge boundaries*
Forrás: §2.2 (GA spatial memory).
- Migráció: `character_known_places(character_id, location_id, source, created_at, rewound_at)`.
- Kezdeti feltöltés: otthon, munkahelyek, napirend helyei. Újabb helyek: a beszélgetésben megemlítettek (`perspectives`) és a távoli rekordok helyei.
- A promptban a szereplő csak ismert helyre hivatkozhat.
- **Elfogadás:** kérdésre („hol lakik X?”) a szereplő csak akkor mond helyet, ha ismeri.

---

## 3. FÁZIS – Történetek

### N1 – Feltételes rejtett események (L) · *Replace formulaic interactive stories*
Forrás: §9.4 (Covel story-events: `conditions.js`, `select.js`, MIT).
- Új `app/hidden-events.mjs` és tábla: feltételfa (`all`/`any`/`not`), levelek: világóra, kapcsolati szint, szál állapota, `revealed + elteltSzakaszok≥N`.
- Napszakonként legfeljebb egy esemény nyílik meg. A narrátor rövid vázlatot kap, nem kész prózát.
- Az admin írja és hagyja jóvá az eseményeket. Az AI-tervező (Covel `plot`) **nincs** benne.
- **Elfogadás:** egy háromlépéses szintetikus lánc (gyanú → 2 nap múlva kiderül → konfrontáció) a feltételek szerint, sorrendben nyílik meg; visszatekerés után újra zárva van.

---

## 4. Ütemezés és sorrend

| Sorrend | Csomag | Méret | Függ |
|---|---|---|---|
| 1 | C0 Kiindulás | S | – |
| 2 | C1 Mérőkészlet | M | C0 |
| 3 | C2 Felidézés 2.0 | M | C1 |
| 4 | C3 Gazdagabb mentési pont | M | C1 |
| 5 | C4 Reflexió | S | C2 |
| 6 | C5 Csoport | S | C1 |
| 7 | S1 Ki hol van + heti teszt | M | – |
| 8 | S2 Napirend-javaslat + szerkesztő | M–L | S1 |
| 9 | S3 Napi eltérés + státusz | M | S1, C3 |
| 10 | S4 Kétszintű részletesség | L | S1, C2 |
| 11 | S5 Ismert helyek | M | C3 |
| 12 | N1 Rejtett események | L | S1 |

Összesen kb. 14–17 munkamenet. Az 1. fázis (C0–C5) kb. 5–6.

## 5. Döntéseid egy helyen (alapértékkel – ha nem szólsz, ezzel megyek)
1. Reflexiós küszöb (C4): **15**.
2. Napi státusz kinek (S3): **tegnap 3+ fontosságú emlék, vagy aznap esedékes szál**.
3. Távoli rekordok napi korlátja (S4): **2/szereplő**.
4. Esti kiszínező hívás (S4): **ki**.
5. A csökkenő kapcsolati szint napi korlátja (H4, a 11-19-i dokumentumból): **–2/nap** – később, a következményszabályoknál.
6. Embedding (H1): **a C2 mérése után** döntünk.
