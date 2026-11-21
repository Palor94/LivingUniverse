# Living Universe – képességtérkép és nyílt forráskódú felderítés (2026-11-19)

Cél: célzottan találni olyan GitHub-projekteket, amelyek a **karakterinterakciókat, az emlékezetet és a beszélgetések jövőbeli következményeit** erősítik. Ez a fájl négy dolgot ad:

1. mi van már meg a kódban;
2. mi hiányzik, mindegyikhez egy célpélda;
3. kemény szűrők, amelyekkel egy repó gyorsan kizárható vagy elfogadható;
4. 15 értékelt jelölt, javasolt sorrend és Codex-indító szöveg.

**Ez nem telepítési, fizetési vagy feltöltési engedély.** Az AGENTS.md szabályai változatlanok. Új npm-csomag, helyi modell vagy fizetős futás csak a tulajdonos külön jóváhagyásával kerülhet be, a DECISIONS.md-be írt méréssel együtt.

Forrás: `PROJECT_VISION.md`, `DEVELOPMENT_PLAN.md`, `docs/NEXT_GEN_PLAN_2026-11-11.md`, `DECISIONS.md` (2026-11-15…17), a migrációk (025, 027, 028, 030, 031), valamint `world-engine.mjs`, `world-social.mjs`, `world-rewind.mjs`, `play-mode.mjs` és `world-ai.mjs`. A repók adatai a 2026-11-19-i webes keresésből valók. Ahol „(nem ellenőrzött)” áll, ott a licencet és az aktivitást a repó oldalán kell megnézni, mielőtt bármit átveszel.

---

## 1. Ami már megvan (a kódból)

| Terület | Ma | Hol |
|---|---|---|
| Emlékfelidézés | Pontozás: frissesség, a jelenlévők neve (+3), a hely (+2), közös szavak (+1, legfeljebb 3); a szavak első 5 betűje szolgál durva magyar tőként. Két profilskála is számít („Érzelmi emlékek tartóssága”, „Sérelmek megőrzése”). A 3 legfrissebb emlék mindig bekerül. AI-hívás és embedding nincs. | `world-engine.mjs` › `recallMemories()` |
| Beszélgetés-összegzés | A mentési ponton egyetlen hívás állítja elő: `shared_history`, `tags`, `importance` (1–5), `learned`, `mood`, valamint az említett emberek és helyek. | `play-mode.mjs` (~1295), `talk-history.mjs` |
| Ígéretek, tervek | `world_threads`: open → kept / dropped / lapsed. Az esedékesek bekerülnek a promptba. | 030, `openThreadsFor()` |
| Reflexió | 8 új emlék után egy hívás 3 hiedelmet készít (`world_beliefs`). A hiedelmek szubjektívek, és tévesek is lehetnek. | 031, `world-social.mjs` |
| Ki mit tud | `world_knowledge`: egy eseményt a résztvevői ismernek. Mások csak rögzített találkozón hallanak róla, körönként legfeljebb 4 történetet. A hallgató egy „X mesélte: …” emléket kap. Intim jelenet nem terjed. | 031, `world-social.mjs` |
| Visszatekerés | `rewound_at` oszlopok, kompenzáló revíziók, a világóra visszaléptetése. Semmi sem törlődik. | `world-rewind.mjs` |
| Kapcsolati szintek | `world_relationship_levels` revíziókkal; naponta legfeljebb 3 emelkedés. | 027 |
| Heti napirend | `world:schedule:<id>`, a 3.2 első lépése. | DECISIONS 2026-11-15 |
| Helyi modell | `createOllamaProvider()` a `complete()` szerződés mögött, kikapcsolva. | `world-ai.mjs` |

**Két kész, de kihasználatlan elem**, amelyek ingyen fejleszthetők:

- A beszélgetés-összegzésnek van `importance` mezője, de a `character_memories` táblában nincs ilyen oszlop, és a `recallMemories()` sem veszi figyelembe. A NEXT_GEN 2.1 terv szerint a fontosság és a „legutóbb felidézve” időpont is része lett volna a pontszámnak.
- A `character_memories.belief_accuracy` oszlop elfogadja az `unknown` és más értékeket is (az MCP-javaslatok használják). A világmotor `remember()` függvénye viszont mindig `accurate` értéket ír. A pletyka torzulásához tehát a séma már megvan.

## 2. Hiányok, célpéldával

| # | Hiány | Célpélda (elfogadási próba) | Tervbeli lépés |
|---|---|---|---|
| H1 | **Jelentés szerinti felidézés magyarul** | Palor ezt mondja: „emlékszel, amikor a kocsmában összekaptunk?”. Az emlék szövege: „Összevesztünk a sörözőben Palorral.” Ma a két mondat egyetlen 5 betűs előtagon sem fedi egymást, így az emlék kimarad. | 2.7 |
| H2 | **Fontosság és megerősítés a felidézésben** | Egy 5-ös fontosságú szakítás egy hónap múlva is előjön, egy 1-es kávézás nem. A gyakran felidézett emlék lassabban halványul. | 2.1 maradéka |
| H3 | **Pletyka torzulása és bizonyossága** – **PARKOLVA (tulajdonos, 2026-11-19):** előbb az alapokat kell kidolgozni; a meglévő, torzítás nélküli továbbadás változatlan marad. | Ádám látta, hogy Palor Sanyival vitatkozik. Bálint harmadkézből már „verekedést” hall, és ezt bizonytalannak jelölt emlékként tárolja. Ha később Ádámtól hallja a pontos változatot, a tévhite helyesbül. | 2.5 kiterjesztése, később |
| H4 | **Következmények: a kapcsolat arra reagál, amit valaki megtud** | Márkó megtudja, hogy Palor kibeszélte őt Sanyinak. A kapcsolati szint indoklással csökken („Sanyitól hallotta, hogy…”), és egy csoportban romlik Palor híre. | 3.5 |
| H5 | **Történetszálak (drámavezető)** | A „Sanyi adóssága” szál több napon át fokozatonként halad (gyanú → kiderül → konfrontáció → lezárás), és a végét Palor döntése határozza meg. | 3.4 |
| H6 | **Idővonalak** | Egy mentési pontból elágazás nyílik, és a két napló összehasonlítható. Az eredeti idővonal érintetlen marad. | 3.6 |
| H7 | **Párbeszéd-minőség regressziós tesztje** | 30 rögzített szintetikus helyzet a próbaszolgáltatón. Ellenőrzi a token-keretet, a tudáshatárt és azt, hogy nincs explicit mező intim jeleneten kívül. Ugyanez a készlet valódi szolgáltatón csak tulajdonosi jóváhagyással, költségbecsléssel fut. | 2.6 |

## 3. Kemény szűrők (bármely repóra)

Egy jelölt csak akkor kerül tovább, ha mindegyikre van válasz.

1. **Nyelv:** Node/JS, vagy olyan algoritmus, amely kb. 300 sorban átírható. A `package.json`-ban ma **nincs egyetlen függőség sem**, és a `node:sqlite` beépített. Ez érték, ezért minden új csomag külön tulajdonosi döntés.
2. **Nincs külön szerver vagy adatbázis** (Neo4j, Postgres, Convex, Python-szolgáltatás). Az élő adat a helyi SQLite-ban marad, a `dataDir`-ben, OneDrive-on kívül.
3. **Bármilyen szolgáltatóval működik:** csak a meglévő `complete()` szerződésen át (xAI/Grok, Ollama, próbaszolgáltató).
4. **Magyar szöveggel is jó:** angol tőképzés vagy kizárólag angol embedding kizáró ok.
5. **Költség:** soronként nincs új AI-hívás. Többlethívás csak a mentési ponton vagy a világkörben lehet, a meglévő napi keretben.
6. **Visszatekerhető:** minden új írást vissza kell tudni vonni `rewound_at`-tel vagy revízióval. Az olyan könyvtár, amely a saját tárolójában felülír vagy töröl, kizárt.
7. **Tudáshatár:** minden lekérdezés egy szereplő nézőpontjából történik. Az admin adatai nem kerülnek automatikusan karakterpromptba (AGENTS.md).
8. **Licenc:** MIT, Apache-2.0 vagy BSD esetén kódrészlet átvehető forrásmegjelöléssel (a fájl elején, és egy sor a DECISIONS.md-ben). GPL, AGPL vagy ismeretlen licenc esetén **csak az ötlet** vehető át, kód nem.
9. **Élő-e:** az utolsó commit 18 hónapon belüli, vagy a hozzá tartozó cikk maga az érték (ilyenkor a repó csak minta).

## 4. Értékelt jelöltek

Döntés: **Eszköz** = beépíthető vagy futtatható (tulajdonosi jóváhagyással); **Kód** = MIT/Apache kódrészlet átírható; **Minta** = csak az ötlet; **Elvetve** = könyvtárként nem.

| # | Projekt | Mit ad | Nyelv · licenc · állapot | Hiány | Döntés |
|---|---|---|---|---|---|
| 1 | **Transformers.js** + `Xenova/multilingual-e5-small` | Helyi, többnyelvű embedding Node-ban. 384 dimenziós vektor, kb. 50 MB-os ONNX modell, `query:` / `passage:` előtagokkal. | JS · Apache-2.0 (könyvtár), MIT (e5) | H1 | **Eszköz** (telepítés = döntés) |
| 2 | **Ollama embedding** (pl. `bge-m3`) a meglévő `createOllamaProvider` mellé | Ugyanaz, mint az 1., **új npm-csomag nélkül**: egy `fetch` a már meglévő helyi címre. | Ollama-telepítés kell | H1 | **Eszköz** (alternatíva az 1-re) |
| 3 | **sqlite-vec** (asg017; npm `sqlite-vec`, ≥0.1.3) | Vektorkeresés SQLite-ban. | C-bővítmény · MIT/Apache-2.0 | H1 | **Elvetve egyelőre.** Szereplőnként legfeljebb 300 emléket kell átnézni, ezt egy sima JS koszinusz-ciklus is gyorsan elvégzi BLOB-ban tárolt vektorokon. Csak akkor kell, ha a mérés lassúnak mutatja. A `node:sqlite` bővítménybetöltését külön ellenőrizni kell. A <0.1.3 verziókban ismert puffertúlcsordulás volt. |
| 4 | **Generative Agents** (Stanford, joonspk-research) | Memóriafolyam: frissesség + fontosság + relevancia; reflexió „először kérdések, aztán válaszok” sémával; napi terv. | Python · Apache-2.0 (nem ellenőrzött) | H2, a reflexió finomítása | **Minta** |
| 5 | **AI Town** (a16z-infra) | A Generative Agents TypeScriptes újraírása: emlékek fontossággal, reflexió, beszélgetés-összegzés. | TS · MIT · Convex-backend | H2 | **Kód** (csak a pontozó és a fontosságot kérő prompt; a Convex-réteg nem) |
| 6 | **OpenMemory** (CaviraOSS) | Emlékek halványulása és megerősítése felidézéskor, több „szektor”, SQLite. | TS · licenc ellenőrizendő | H2 | **Minta** (halványulás és megerősítés) |
| 7 | **Talk of the Town** (James Ryan; tükör: ShiJbey/talktown) | A tudás terjed, torzul és halványul; hazugság, félreemlékezés, bizonyosság-értékek. | Python · régi | H3 | **Minta** (a cikk az érték: „Toward Characters Who Observe, Tell, Misremember, and Lie”, AIIDE 2015) |
| 8 | **Kismet** (adamsumm/Kismet) | Pletyka a látott vagy hallott tettekről, ami befolyásolja a későbbi viselkedést. | (nem ellenőrzött) | H3, H4 | **Minta** |
| 9 | **Ensemble Engine** (ensemble-engine/ensemble) | „Társas fizika”: trigger-szabályok és szándékszabályok, a Prom Week/CiF utódja, önálló `ensemble.js`. | JS · licenc a LICENSE fájlban ellenőrizendő | H4 | **Minta** (vagy **Kód**, ha a licenc engedi) |
| 10 | **Concordia** (google-deepmind) | Játékmester-minta: a GM oldja fel a tetteket; jelenetkövető és eseményfeloldó komponensek; v2-ben mentés és visszaállítás. | Python · Apache-2.0 · ~1k csillag | H5 | **Minta** (a világmotor GM-je már ilyen; a jelenet- és szálkövetés nézhető meg) |
| 11 | **SimpleQBN** (videlais) / storyletek | Storylet = előfeltétel + hatás; „minőség” (állapot) alapján nyílik meg. | JS · MIT · npm | H5 | **Minta** (a szál fokozatai storyletként, JSON-ban; a könyvtár nem kell) |
| 12 | **Graphiti** (getzep) | Bitemporális tények: érvényességi ablak, a régi tény érvénytelenné válik, de nem törlődik; lekérdezhető, mi volt igaz egy adott időpontban. | Python · Apache-2.0 · gráf-adatbázis kell | H6, H3 | **Minta** (`valid_from` / `invalid_at` / `branch_id` a meglévő táblákra) |
| 13 | **mem0** (`mem0ai/oss`) | Mesterséges intelligencia dönti el, mi legyen az új tényből: ADD/UPDATE/DELETE/NOOP. | TS/Python · Apache-2.0 | H2, H3 | **Elvetve** könyvtárként: minden hozzáadás egy AI-hívás, saját vektortár, és felülír (6. szűrő). Az egyeztető prompt ötlete használható. |
| 14 | **Letta** (MemGPT) | Mag- és archív memóriablokkok, „alvásidős” háttér-reflexió. | Python-szerver | – | **Elvetve** (2. szűrő); az alvásidős reflexió nálad már világkör |
| 15 | **promptfoo** | YAML-tesztesetek promptokra, `llm-rubric` és szabályalapú ellenőrzések, helyben fut. 2026 márciusa óta az OpenAI-é, de MIT maradt. | Node/TS · MIT · aktív | H7 | **Eszköz**, csak fejlesztéshez (`npx`, futásidejű függőség nélkül). Alternatíva: ugyanez `node:test`-ben, csomag nélkül. |

## 5. Javasolt sorrend

Minden csomag a szokásos módon indul: kódellenőrzőpont (`node ops/code-checkpoint.mjs create --label …`), adatbázis-mentés, visszafordítható migráció, tesztek szintetikus adatokon a próbaszolgáltatóval, végül DECISIONS-bejegyzés.

| # | Csomag | Mit vesz át | Új függőség | Méret |
|---|---|---|---|---|
| 1 | **H7 mérőkészlet**: 30 szintetikus helyzet + elvárások a próbaszolgáltatón (`tests/dialogue-quality.test.mjs`). Felidézési pontosság: 200 szintetikus emlékből a „helyes 3” bekerül-e. | promptfoo-szerű felépítés, `node:test`-ben | nincs | M |
| 2 | **H2 fontosság és megerősítés**: új oszlopok a `character_memories`-ban (`importance`, `last_recalled_at`, `recall_count`); a mentési pont `importance` értéke átkerül a beszélgetésből lett emlékekre; pontszám = jelenlegi + fontosság + megerősítés. Az 1. készlettel mérve. | 4, 5, 6 | nincs | M |
| 3 | **H4 következményszabályok**: `app/play/consequence-rules.json` (eseménytípus × viszony → szintváltozás + indoklás), Ensemble-stílusban. A 3 emelkedés/nap korlát marad; a csökkenés korlátja **tulajdonosi döntés**. | 9 | nincs | M |
| 4 | **H1 jelentés szerinti felidézés (2.7)**: egyszeri benchmark az 1. készleten: mostani pontozás vs. hibrid (mostani + koszinusz). Vektor BLOB-ban, keresés JS-ben. Csak akkor kapcsol be, ha mérhetően jobb. | 1 vagy 2 | **igen – tulajdonosi döntés** | L |
| 5 | **H5 történetszálak (3.4)**: `world_story_threads` (név, fokozat, résztvevők, mi viszi tovább); a fokozatok storyletként, a GM a szálakat lépteti. | 10, 11 | nincs | L |
| 6 | **H6 idővonalak (3.6)**: `branch_id` + érvényességi ablak a meglévő `rewound_at` logikára építve. | 12 | nincs | L |

Indok: előbb mérni kell (1), utána az ingyenes, kis kockázatú fontosság-javítás jön (2), majd a következmények (3). Az egyetlen telepítést igénylő lépés (4) addigra mérhetővé válik. A pletyka torzulása (H3) a tulajdonos döntése szerint parkolva; a 7–8. jelölt addig csak háttéranyag.

## 6. Hogyan keress még (GitHub-keresés)

Használd a minősítőket: `language:`, `license:`, `pushed:>2025-06-01`, `stars:>30`. Példák:

- H1: `multilingual embedding transformers.js language:TypeScript pushed:>2025-06-01`
- H2: `"memory stream" reflection importance agent stars:>50`, `"memory decay" reinforcement llm agent`
- H3: `gossip npc knowledge propagation`, `"belief" "misremember" npc`, `topic:social-simulation`
- H4: `"social physics" game`, `relationship simulation npc rules language:JavaScript`
- H5: `storylet language:JavaScript`, `"drama manager" llm`, `"game master" llm narrative pushed:>2025-01-01`
- H6: `bitemporal sqlite`, `"event sourcing" branch timeline game`
- H7: `llm eval dialogue character consistency`, `roleplay benchmark character llm`

Minden új jelöltet a 3. fejezet 9 szűrőjén kell átvinni, és a 4. fejezet táblázatába egy sorral felvenni.

## 7. Codex-indító szöveg (1. csomag)

> Olvasd el: `AGENTS.md`, `docs/NEXT_GEN_PLAN_2026-11-11.md` (2. fázis), `docs/OSS_FELDERITES_2026-11-19.md`. A `DECISIONS.md`-ben keress rá a `recall`, `world_threads`, `world_knowledge`, `belief` szavakra. Feladat: az 5. fejezet 1. csomagja. Készíts `tests/dialogue-quality.test.mjs`-t a próbaszolgáltatóval: 30 szintetikus helyzet (1:1, csoport, telefon, intim/nem intim, admin-adat a profilban), elvárások: token-keret, nincs Palor-privát jegyzet, nincs creator-érték más szereplő promptjában, nincs explicit mező intim jeleneten kívül. Külön teszt: 200 szintetikus emlékből a `recallMemories()` visszaadja-e a jelenlévő személyhez és helyhez tartozó 3 emléket, és mennyi a találati arány (ezt a számot írd a DECISIONS-be alapértékként). Ne telepíts semmit, ne hívj valódi szolgáltatót, ne nyúlj az élő adatbázishoz.

## 8. Tulajdonosi döntések

1. **H1 telepítés:** Transformers.js (npm, kb. 50 MB-os modell) vagy Ollama, vagy egyik sem? Csak az 1. csomag mérése után érdemes eldönteni.
2. **Csökkenés korlátja:** a 3 emelkedés/nap mellett legyen-e napi korlát a kapcsolati szint csökkenésére (H4)?
3. **promptfoo** mint fejlesztői eszköz (`npx`, a projektbe nem kerül be): igen vagy nem? Nélküle a `node:test` is elég.
