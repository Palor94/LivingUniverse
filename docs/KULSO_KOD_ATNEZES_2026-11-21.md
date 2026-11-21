# Külső projektek kódjának átnézése – mi használható (2026-11-21)

Ez a `docs/OSS_FELDERITES_2026-11-19.md` folytatása. Akkor webes leírások alapján készült a lista, most a letöltött kódot néztem meg itt:
`External_projects/ai-town-main`, `External_projects/covel-main` és `External_projects/generative_agents-main`.

A sorrend a tulajdonos jelenlegi prioritását követi: **először a beszélgetések minősége, utána a napirendek és az, hogy ki hol van a világban.** A pletyka torzulása továbbra is parkolva van (H3).

**Ez nem telepítési engedély.** Az AGENTS.md szabályai és a 11-19-i dokumentum 3. fejezetében leírt 9 szűrő változatlanul érvényes. Egyik javaslat sem igényel új npm-csomagot.

## 0. Amit tudni kell előre

- **A generative_agents-main mappa hiányos.** 16 fájl van benne: egy minta-visszajátszás, két JSON és a Django-felület. Hiányzik maga az ügynök-kód (`reverie/backend_server/persona/...`), vagyis a tervezés, a felidézés, a reflexió és a promptsablonok. Ha kellenek, a teljes repót újra le kell tölteni (`joonspk-research/generative_agents`). Az alábbi pontok a meglévő `scratch.json` és `spatial_memory.json` adatszerkezetére épülnek.
- **Licencek:** AI Town = MIT (a16z-infra), Covel = MIT (Covel Contributors), Generative Agents = Apache-2.0. Kódrészlet mindháromból átvehető, forrásmegjelöléssel a fájl elején, és egy sorral a DECISIONS.md-ben.
- **Ami NEM kell:** az AI Town Convex-motorja, csempe-alapú mozgása és útkeresése; a Generative Agents csempetérképe és folyamatos szimulációja; a Covel plugin-kernele és monorepója (Node 26, pnpm, turbo). Mindegyik ütközik a 2. szűrővel (nincs külön szerver) vagy a PROJECT_VISION-nel (nincs drága folyamatos szimuláció).
- **A fejlesztési feladatlista** (`development:tasks`) az élő adatbázisban van (`AppData\Local\LivingUniverse`), ehhez nem volt hozzáférés. A legutóbbi mentés (11-11) régebbi a feladatlistánál. A csomagokat ezért a tervekhez és a 11-19-i H-számokhoz kötöttem; a feladatlistába kézzel kell felvenni őket.

## 1. Beszélgetések minősége

### 1.1 BM25-pontozás a felidézésben (Covel) → H1 egy része, embedding nélkül
**Hol:** `covel-main/packages/plugin-handlers-utils/src/text-search.ts` (178 sor, függőség nélkül, `rankTexts()`).
**Mit ad:** Okapi BM25 IDF-súlyozással. A ritka szó (név, „kocsma”, „adósság”) sokat ér, a gyakori („volt”, „mert”) keveset. Ma a `recallMemories()` minden közös szóért +1 pontot ad, legfeljebb 3-at, súlyozás nélkül.
**Átvétel:** a `rankTexts` logikáját JS-ben át kell írni `app/world-text-rank.mjs` néven. A `wordStem()` helyére a mostani magyar 5 betűs előtag kerül, a CJK-ágak kimaradhatnak. A `recallMemories()`-ben a „közös szavak” tag helyére a normalizált BM25-pontszám jön.
**Korlát:** a „sörözőben” és a „kocsmában” így sem talál egymásra. Ezt csak a H1 embedding oldja meg. A BM25 viszont ingyenes, és a mérőkészlettel összehasonlítható.

### 1.2 Fontosság és megerősítés a pontszámban (AI Town) → H2
**Hol:** `ai-town-main/convex/agent/memory.ts`, 205–223. sor.
**Mit ad:** három összetevő, mindegyik 0–1 közé normalizálva a jelöltek körében, majd összeadva:
- relevancia (náluk vektor, nálunk az 1.1-es BM25 + név + hely);
- fontosság (1–10, a mentési pont már ad 1–5-öt);
- frissesség = `0.99 ^ (órák az utolsó felidézés óta)`. A Generative Agents `scratch.json` szerint `recency_decay: 0.995`.
Felidézéskor a `lastAccess` frissül, de legfeljebb ritkán (`MEMORY_ACCESS_THROTTLE`). Ettől a gyakran előjövő emlék tovább él.
**Átvétel:** a 11-19-i 2. csomag pontosan ez. Új oszlopok: `importance`, `last_recalled_at`, `recall_count`. A frissesség a **világórához** igazodik, nem a valós időhöz. A profilskálák („Érzelmi emlékek tartóssága”, „Sérelmek megőrzése”) a bomlási rátát és a súlyokat módosítják, ahogy most is.

### 1.3 Résztvevőnkénti nézőpont a beszélgetés-összegzésben (AI Town) → minőség, H4 előkészítése
**Hol:** `ai-town-main/convex/agent/memory.ts`, 42–62. sor.
**Mit ad:** a beszélgetés végén **mindegyik résztvevő a saját szemszögéből** kap emléket, első személyben, és azzal együtt, hogy tetszett-e neki a beszélgetés. Ugyanaz a vita Márkónak sértés lehet, Palornak tréfa.
**Átvétel, többlethívás nélkül:** a mentési pont meglévő egyetlen hívása (`play-mode.mjs` kb. 1295. sor) bővüljön egy `perspectives` mezővel: `{ "<név>": { memory, feeling: -2..+2, importance: 1–5 } }`. Minden résztvevő a saját sorát kapja `character_memories`-ként. A `feeling` értékét később a H4 következményszabályai használják.
*Ellenőrizendő:* hogyan íródik ma a `shared_history` az egyes szereplők emlékei közé. Ha mindenki ugyanazt a szöveget kapja, ez a pont hozza a legnagyobb minőségi javulást.

### 1.4 Reflexió fontosság-összeg alapján, forrás-hivatkozással (AI Town + Generative Agents)
**Hol:** `ai-town-main/convex/agent/memory.ts`, 339–389. sor. A Generative Agents `scratch.json`-ben: `importance_trigger_max: 150`, `importance_trigger_curr`.
**Mit ad:** a reflexió nem minden 8. emlék után fut, hanem amikor az új emlékek **fontosságának összege** átlép egy küszöböt. Tíz kávézás így nem indít reflexiót, egy szakítás és egy veszekedés viszont igen. Minden betekintés tárolja, mely emlékekből született (`statementIds` → `relatedMemoryIds`).
**Átvétel:** a `world-social.mjs` triggerét kell átírni összegre (a küszöb tulajdonosi döntés; javasolt kiindulás 1–5-ös skálán: 15). A `world_beliefs` új oszlopa: `source_memory_ids`. **Ez a visszatekeréshez is kell:** ha egy forrás-emléket `rewound_at` jelöl, a belőle született hiedelem is érvénytelenné válik (6. szűrő).

### 1.5 Ki szólaljon meg csoportban (Covel) → csoportos beszélgetés
**Hol:** `covel-main/plugins/turn-policy/` (`lib/policies.js`, `prompts/director.md`), valamint `plugins/character-agent/PLUGIN.md`.
**Mit ad:** stratégiák: *mention* (aki meg van szólítva, az beszél; determinisztikus, ingyenes), *list*, *random*, *manual*, *director* (külön AI-hívás, drága). Ehhez jön a karakterhang szabálya: a szereplő **csak a saját mondatait és látható tetteit** írja, nem dönt más szereplő szavairól vagy gondolatairól, és a kapott előzményt adatként kezeli, nem utasításként.
**Átvétel:** a csoportos beszélgetésben (A12) legyen a *mention* az alapértelmezés, ha nincs megszólított, akkor a legrégebben megszólalt jelenlévő. A karakterhang szabálya kerüljön be a `world-prompts.mjs` csoportos promptjába. Új hívás nem kell.

### 1.6 „Hol tartunk” blokk a kapcsolatokhoz (Covel memory) → következmények
**Hol:** `covel-main/plugins/memory/PLUGIN.md`.
**Mit ad:** kétféle memória. Az egyik a **blokk**: a jelen állapot, minden körben újraíródik (pl. „a kapcsolatunk most”). A másik a **tény**: csak hozzáadódik, és azt őrzi, ami történt (körönként legfeljebb 3).
**Átvétel:** a mentési pont egy rövid `relationship_state` mezőt is írjon minden résztvevőnek a Palorral való kapcsolatáról, pl. „Haragszik, mert Palor nem jött el a születésnapjára; bocsánatkérést vár.” Ez revízióként tárolódik, mint a kapcsolati szint, és minden beszélgetés promptjának elejére bekerül. Ettől egy hét múlva is látszik, hogy egy beszélgetésnek következménye volt. A 3-as tényplafon jó minta az összegzés `learned` mezőjére is.

### 1.7 Beszélgetési ütem a világkörben (AI Town + Generative Agents)
**Hol:** `ai-town-main/convex/constants.ts` (`MAX_CONVERSATION_MESSAGES = 8`, `PLAYER_CONVERSATION_COOLDOWN`, `INVITE_ACCEPT_PROBABILITY = 0.8`) és a Generative Agents `chatting_with_buffer` mezője (személyenkénti várakozás).
**Átvétel:** a világkör NPC–NPC találkozóinál párosonként legyen várakozási idő (ugyanaz a két ember ne beszéljen naponta többször, hacsak egy szál nem kívánja), és legyen felső korlát a hosszra. Ez költségkeret is.

## 2. Napirendek és ki hol van

### 2.1 Napi eltérés a heti napirendtől (Generative Agents)
**Hol:** `generative_agents-main/.../scratch.json`: `lifestyle` (mikor kel és fekszik), `daily_req` (4–6 nagy tétel a napra), `f_daily_schedule` (`[tevékenység, perc]` párok), `currently` (mi foglalkoztatja most).
**Mit ad:** a nap két szinten tervezett. A nagy vonalak egyszer készülnek, a részletek csak akkor, amikor kellenek.
**Átvétel (olcsón):** a meglévő `world:schedule:<id>` heti napirend marad az alap, ingyen. Új: `world:day-plan:<id>:<nap>`, **csak** azoknak a szereplőknek, akiknek aznap esedékes szálat (`world_threads`) vagy eseményt tartanak nyilván. Egy világköri hívás több szereplőt is kezel, és csak a napirend eltérő sávjait írja felül, pl. „du.: kórház, mert meglátogatja az anyját”. A `play-mode.mjs` `scheduled()` függvénye előbb a napi tervet nézi, aztán a heti napirendet. Visszatekerhető: kulcsonként revízió.
Új profilmező a Generative Agents mintájára: `lifestyle` (kelés és lefekvés). Ebből derül ki, hogy éjjel 2-kor ki van még ébren.

### 2.2 Ki milyen helyeket ismer (Generative Agents)
**Hol:** `spatial_memory.json`: `világ → épület → helyiség → tárgyak`, **szereplőnként**. Mindenki csak azt ismeri, ahol már járt, vagy amiről hallott.
**Átvétel:** illeszkedik a tudáshatár elvéhez. Új tábla `character_known_places (character_id, location_id, source, rewound_at)`. Kezdetben az otthonból, a munkahelyekből és a napirend helyeiből töltődik. Egy beszélgetés-összegzésben megemlített hely bekerül a hallgatóhoz. Ha Palor azt kérdezi, „hol lakik Sanyi?”, a szereplő csak ismert helyet mondhat. A `location-tree.mjs` hierarchiája már megfelel ennek.

### 2.3 Rejtett események feltételei (Covel story-events) → H5 előkészítése
**Hol:** `covel-main/plugins/story-events/lib/conditions.js` (112 sor) és `PLUGIN.md`.
**Mit ad:** a feltételek egyszerű JSON-nyelve: `all` / `any` / `not`, világidő-mező, „egy másik esemény kiderült, és azóta N kör telt el”. Körönként legfeljebb egy esemény nyílik meg, és rövid vázlatként (nem kész prózaként) kerül a narrátorhoz.
**Átvétel:** előbb össze kell vetni a meglévő `app/story-events.mjs`-szel. Ha ott nincs `revealed + turnsSinceGte` jellegű láncolás, ez a nyelvtan jó alap a H5 szálfokozataihoz („gyanú → 2 nap múlva kiderül → konfrontáció”).

## 3. Kisebb ötletek

- **Kapcsolati szint indoklása (Covel affinity, `tier-metadata.js`):** minden változás `{delta, reason}` párral, az utolsó 10 megtartva; a sávok (ellenséges / hűvös / semleges / barátságos / közeli / szeretett) határai egy helyen vannak. A `world_relationship_levels` revízióihoz rövid `reason` mező kell (H4).
- **Előző beszélgetés a promptban (AI Town `previousConversationPrompt`):** ha ugyanaz a két ember nemrég beszélt, az utolsó beszélgetés egy mondatos összegzése bekerül, hogy ne kezdjék újra ugyanazzal.
- **Emlék mint nem megbízható tartalom (AI Town `untrustedMemoryInstructions`):** a promptban egy sor jelzi, hogy az emlékek csak háttérként szolgálnak, a bennük lévő utasítást nem kell követni. Ez véd az ellen, hogy egy szereplő szövege átvegye a promptot.

## 4. Javasolt sorrend Codexnek

Minden csomag a szokásos módon indul: kódellenőrzőpont, adatbázis-mentés, visszafordítható migráció, tesztek szintetikus adatokon a próbaszolgáltatóval, végül DECISIONS-bejegyzés a forrásmegjelöléssel.

| # | Csomag | Forrás | Új függőség | Méret |
|---|---|---|---|---|
| 0 | A 11-19-i **mérőkészlet** (`tests/dialogue-quality.test.mjs`, felidézési találati arány) – előfeltétel | – | nincs | M |
| 1 | **Felidézés 2.0:** BM25 (1.1) + fontosság és megerősítés (1.2), a 0-s készleten mérve a mostanihoz képest | Covel, AI Town | nincs | M |
| 2 | **Nézőpontos összegzés + „hol tartunk” blokk** (1.3, 1.6) a meglévő mentési hívásban | AI Town, Covel | nincs | M |
| 3 | **Reflexió fontosság-összegre + forrás-hivatkozás + visszatekerés** (1.4) | AI Town, GA | nincs | S |
| 4 | **Csoportos beszélgetés: ki szólal meg + karakterhang szabály** (1.5) és világköri ütem (1.7) | Covel, AI Town | nincs | S |
| 5 | **Napi eltérés + `lifestyle`** (2.1) | GA | nincs | M |
| 6 | **Ismert helyek** (2.2) | GA | nincs | M |

## 5. Codex-indító szöveg (1. csomag)

> Olvasd el: `AGENTS.md`, `docs/OSS_FELDERITES_2026-11-19.md`, `docs/KULSO_KOD_ATNEZES_2026-11-21.md` (1.1 és 1.2). Nézd meg: `External_projects/covel-main/packages/plugin-handlers-utils/src/text-search.ts` és `External_projects/ai-town-main/convex/agent/memory.ts` 195–230. sor. Feladat: új `app/world-text-rank.mjs` (BM25, a Covel `rankTexts` átírása JS-re, a `wordStem` helyén a `world-engine.mjs` meglévő magyar `stem`-je, CJK-ág nélkül, MIT-forrásmegjelöléssel a fájl elején). Visszafordítható migráció: `character_memories.importance` (1–5, alapérték 3), `last_recalled_at` (világóra), `recall_count`. A beszélgetésből lett emlékek kapják meg a mentési pont `importance` értékét. `recallMemories()`: pontszám = normalizált (BM25 + név + hely) + normalizált fontosság + normalizált frissesség (`0.995^órák` a világórán, a `last_recalled_at`-től); a profilskálák a bomlást és a sérelem-súlyt módosítják, mint eddig; a 3 legfrissebb emlék továbbra is mindig bekerül; felidézéskor a `last_recalled_at` és a `recall_count` frissül, legfeljebb világóránként egyszer. Mérd le a mérőkészleten a régi és az új találati arányt, és írd be a DECISIONS-be. Ne telepíts semmit, ne hívj valódi szolgáltatót, ne nyúlj az élő adatbázishoz.

## 6. Tulajdonosi döntések

1. Reflexiós küszöb (1.4): induljon 15-tel (1–5-ös fontosság mellett), vagy maradjon a „8 emlék”?
2. Napi eltérés (2.1): kik kapják? Javaslat: csak akiknek aznap szál vagy esemény esedékes.
3. Generative Agents: letöltöd-e újra a teljes repót, hogy a tervezési és reflexiós promptokat is meg lehessen nézni?

## 7. Megfeleltetés a fejlesztési feladatlistával (élő adatbázis, 72. verzió, 2026-11-21)

A feladatlistát nem módosítottam (élő adatbázis). Az alábbi pontokat kézzel vagy egy MCP-hívással lehet a feladatok jegyzetébe írni.

**Beszélgetések minősége (1:1 Palorral)**
| Feladat | Ebből a dokumentumból |
|---|---|
| 1. Mérőkészlet | 4. fejezet, 0. csomag (változatlan, előfeltétel) |
| 2. Karakterhű hang a beszélgetés végéig | 1.5 karakterhang-szabály; 1.6 „hol tartunk” blokk. Ha futó összegzés van: a Covel `plugins/history-compaction/prompts/server/compactor.md` szabálya – nevek, számok és ok-okozati láncok megtartása, magyarázat nélkül – plusz a beszédstílus kifejezett megtartása |
| 3. Emlékezzen a fontos dolgokra | 1.1 BM25, 1.2 fontosság és megerősítés, 1.4 reflexió-trigger (1. és 3. csomag) |
| 4. Ígéretek és elmaradt találkozók | 1.6 „hol tartunk” blokk (pl. „bocsánatkérést vár”); 3. fejezet: előző beszélgetés egy mondatban |

**Napirend és ki hol van a világban**
| Feladat | Ebből a dokumentumból |
|---|---|
| 1. Napirend minden aktív szereplőnek | 2.1 `lifestyle` mező (kelés/lefekvés) a Szellemprofil `weekly_routine` mellé. A napi eltérés **csak** esedékes szálból vagy eseményből jöhet, kitalált rutin nem (a feladat szabálya) |
| 2. Napirend-szerkesztő | Egyik repóban sincs átvehető minta |
| 3. „Ki hol van most” indoklással | A Generative Agents `act_description` + `currently` mintájára a pozíció mellé rövid ok és tevékenység tárolódik; a 2.1 napi eltérés saját indoklással („napi terv: anyját látogatja”) |
| 4. Determinisztikus heti teszt | Nincs közvetlen átvétel; a 2.1 napi tervet a teszt rögzített bemenetként kapja, AI-hívás nélkül |
| 5. A szereplő tudja, hol és miért van | 2.2 ismert helyek + a 3. feladat indoklása a promptban |

**A régebbi, angol nyelvű feladatok**
- *Build character-specific emotional reactions:* 1.3 `feeling` mező résztvevőnként (az appraisal első lépése, többlethívás nélkül).
- *Make relationships dynamic and directional:* 1.3 + 3. fejezet `{delta, reason}` a kapcsolati szint revízióihoz.
- *Improve subjective memory and knowledge boundaries:* 1.2, 1.4 (forrás-hivatkozás), 2.2.
- *Consequence propagation and autonomous NPC behavior:* 1.6, 1.7.
- *Richer narrative system / Separate world simulation from narrative direction:* 2.3 (Covel story-events feltételnyelv).
- *Evaluate GitHub projects selectively:* ez a dokumentum. Megjegyzés: a Covel 0.0.54 early-access, ezért csak mintát és kis, átírt kódrészletet érdemes átvenni, függőséget nem.

**Generative Agents letöltés (2026-11-21):** a laptop hálózati engedélylistája nem enged GitHub-letöltést, így a teljes repó nem tölthető le innen. A hiányos mappa valószínű oka a Windows hosszú elérési útjai a ZIP kibontásakor. Megoldás: böngészőből újra letölteni („Code → Download ZIP”), és rövid útvonalra kibontani (pl. `C:\ga`), majd átmásolni a `reverie` mappát az `External_projects\generative_agents-main` alá.

## 8. Generative Agents – a teljes kód átnézése (2026-11-21, kiegészítés)

A `reverie` mappa a `Downloads\generative_agents-main.zip`-ből bekerült ide: `External_projects\generative_agents-main\reverie` (131 fájl). A korábbi kibontás azért maradt hiányos, mert a ZIP 210 000 fájlt tartalmaz, főleg térképanyagot és visszajátszásokat. Fő fájlok: `persona/cognitive_modules/` (plan 1053 sor, retrieve, reflect, converse, perceive) és `persona/prompt_template/v3_ChatGPT/*.txt`. Python, Apache-2.0: a promptok szerkezete és a logika átírható, forrásmegjelöléssel.

### 8.1 Felidézési súlyok – helyesbítés az 1.2-höz
`retrieve.py` 242–249. sor: a tényleges súlyok `gw = [0.5, 3, 2]`, vagyis frissesség 0,5, relevancia 3, fontosság 2, mindhárom normalizálva. A frissesség itt **sorrend szerinti** (`0.995^i`, az i-edik legutóbbi emlék), nem idő szerinti. **Következtetés az 1. csomaghoz:** a relevancia és a fontosság számítson többet, mint a frissesség. A mostani „a 3 legfrissebb mindig bekerül” szabály ettől még maradhat. A súlyok legyenek konstansok, és a mérőkészlet döntsön róluk.

### 8.2 Éjszakai „állapot” frissítés → érzelmi reakciók, napirend
`plan.py` 408–460. sor (`revise_identity`): minden új nap elején, szereplőnként:
1. a tegnapi fontos emlékekből: „mit kell észben tartania a mai tervezéshez” (időpont, hely, ha van);
2. „hogy érzi magát az elmúlt napok után” (első személyben);
3. ebből egy új `currently` státusz, harmadik személyben;
4. ebből a mai nap 4–6 tételes vázlata.
**Átvétel:** a 2.1 napi eltérés mellé egy `world:status:<id>:<nap>` rövid státusz („Fáradt és ingerült, mert tegnap összeveszett Sanyival; ma este a születésnapra készül”). Ez bekerül a beszélgetés promptjába, ettől lesznek a reakciók szereplőhöz és naphoz kötöttek (*Build character-specific emotional reactions*). Költség miatt **csak** azok kapják, akiknek az elmúlt napban 3+ fontosságú emlékük keletkezett, vagy aznap szál/esemény esedékes; egy világköri hívás több szereplőt is kezel.

### 8.3 Beszélgetés után: „mit jegyez meg a tervezéshez”
`reflect.py` 190–230. sor és `planning_thought_on_convo_v1.txt`: minden beszélgetés végén a szereplő saját szemszögéből egy mondat: „mire kell emlékeznie a tervezéséhez”. Lejárata 30 nap, és a beszélgetésre hivatkozik bizonyítékként. A `memo_on_convo_v1.txt` párja: „mi volt érdekes neki”.
**Átvétel:** nálunk ez a `world_threads` (ígéret, terv). Az 1.3 `perspectives` mezőbe kerüljön `plan_note` is; ha időpontot vagy helyet tartalmaz, szál lesz belőle. Kapcsolódik: *Ígéretek és elmaradt találkozók*, és a 2.1 napi eltérés forrása.

### 8.4 Beszélgetés előtt: „mit tudnak egymásról”
`converse.py` + `summarize_chat_relationship_v1.txt`: a beszélgetés előtt a szereplő a másikról szóló emlékeiből egy rövid összegzést kap: mit érez, mit tud a másikról. Ez kerül a promptba, nem a nyers emléklista.
**Átvétel:** ez az 1.6 „hol tartunk” blokk forrása. Nálunk nem a beszélgetés előtt készül (az többlethívás lenne), hanem a mentési pontnál frissül, és tárolva van.

### 8.5 Minden válasznál: „véget ért-e a beszélgetés?”
`iterative_convo_v1.txt`: a szereplő válasza mellett egy logikai mező jelzi, hogy ő lezárta-e a beszélgetést.
**Átvétel:** a beszélgetési válasz JSON-jába `wants_to_leave` (pl. dolgozik, sietnie kell, megsértődött). A felület ezt jelezheti, és a világóra szerint a szereplő tovább is indulhat. Kapcsolódik: *A szereplő tudja, hol és miért van* („épp dolgozom, siess”).

### 8.6 Megszakított napirend újratervezése
`new_decomp_schedule_v1.txt`: ha valaki váratlanul X percig mással foglalkozott, a nap hátralévő részét úgy kell újratervezni, hogy a meglévő vége-időponthoz igazodjon.
**Átvétel:** ha Palor 2 órán át lefoglal valakit, a szereplő aznapi napirendje determinisztikusan tolódik (AI-hívás nélkül): a kihagyott sáv kimarad, a következő a terv szerint folytatódik. A *Determinisztikus heti teszt* része legyen.

### 8.7 Kezdeményezzen-e beszélgetést (NPC–NPC)
`decide_to_talk_v2.txt`: bemenet: mikor és miről beszéltek utoljára, és hogyan állnak egymással; kérdés: „X kezdeményezne-e beszélgetést Y-nal?”. Az AI Town a döntést egy egyszerű valószínűséggel helyettesíti (0,8).
**Átvétel:** a világkör találkozóinál determinisztikus szabály + véletlen, AI-hívás nélkül: a kapcsolati szint, az utolsó beszélgetés óta eltelt idő (1.7 várakozás) és a nyitott közös szál alapján. A GA-féle hívás csak akkor kell, ha a szabály bizonytalan, és ez tulajdonosi döntés.

### 8.8 Reflexió fókuszpontokkal
`reflect.py` 21–130. sor: a reflexió előbb 3 kérdést tesz fel („mi a legfontosabb kérdés X életében most?”), azokra keres emlékeket, és csak utána von le következtetést, forrás-emlékekkel. A trigger az `importance_trigger_curr` visszaszámláló, ami az 1.4 javaslatát erősíti meg.

### Frissített sorrend
Az 1–4. csomag változatlan. Az 5. csomag (napi eltérés) bővül a 8.2 státusszal és a 8.6 determinisztikus újratervezéssel. A 2. csomag bővül a 8.3 `plan_note`-tal és a 8.5 `wants_to_leave`-vel. Egyik sem igényel új függőséget.

## 9. Tulajdonosi irány (2026-11-21) és további átvehető elemek

### 9.1 Döntések
- **Nincs sétáló szereplő, nincs csempetérkép és útkeresés.** Az AI Town `movement.ts`/útkeresése és a GA csempetérképe végleg kimarad.
- **Kétszintű részletesség (elfogadva):** a Palor közelében lévők teljes kezelést kapnak, a többiek olcsó szabályokat.
- **Átvételi elv:** ötletet, módszert és kódrészletet veszünk át, amely illik a mostani irányhoz vagy hiányt pótol. Teljes motort vagy keretrendszert nem.

### 9.2 Kétszintű részletesség – javasolt felépítés
| | **Közeli szint** | **Távoli szint** |
|---|---|---|
| Ki | Palorral egy helyen vagy egy szomszédos helyen lévők; akivel Palornak aznap szála vagy találkozója van; a mostani beszélgetés résztvevői | mindenki más |
| Napirend | heti napirend + 2.1 napi eltérés + 8.2 napi státusz | csak a heti napirend; a 8.6 determinisztikus tolás |
| Találkozók egymással | a meglévő világkör, valódi szöveges összegzéssel | **szabály + véletlen** (8.7, 1.7): kapcsolati szint, utolsó találkozó óta eltelt idő, közös hely; az eredmény egy **egysoros rekord** („Sanyi és Márkó a kocsmában összevitatkozott a pénzen”), AI-hívás nélkül, sablonból vagy a nap végén csoportosan egyetlen hívással |
| Emlék | teljes nézőpontos emlék (1.3), fontosság (1.2) | az egysoros rekord mindkét résztvevőnél `importance` 1–2-vel; ha Palor később találkozik velük, ez előjöhet |
| Váltás | ha Palor odaér, a távoli rekordok már ott vannak; nem kell semmit utólag szimulálni | |

A szintet a meglévő `computePositions` (play-mode.mjs) eredményéből lehet számolni minden világkörben. A költség így a Palor körüli eseményekkel arányos, nem a szereplők számával. A távoli rekordok ugyanúgy `rewound_at`-tel visszavonhatók.
Előzmény a repókban: a Covel `story-events` „nincs modellhívás, csak feltételek” elve; az AI Town véletlen-alapú meghívás-elfogadása (`INVITE_ACCEPT_PROBABILITY`); a GA `chatting_with_buffer`.

### 9.3 Kivonatolási szabályok a mentési ponthoz (Covel world-ir) → *Separate world simulation from narrative direction*
**Hol:** `covel-main/plugins/world-ir/PLUGIN.md`.
**Mit ad:** szigorú szabályok arra, hogy a beszélgetésből mi számít ténynek:
- kérés, próbálkozás, feltételezés vagy idézett beszámoló **nem** megtörtént esemény („Palor megígérte, hogy visszaadja” ≠ „visszaadta”);
- minden szegmens a saját beszélőjéhez tartozik; az „én” a beszélőé, nem automatikusan Palora;
- nem szabad kitalálni a játékos döntéseit, érzéseit vagy beleegyezését.
**Átvétel:** ezek a mondatok kerüljenek be szó szerint (magyarul) a mentési pont összegző promptjába. Ingyenes, és egyenesen a *Separate world simulation…* feladat „a narráció javasolhat, de nem írhat felül kánont” céljához tartozik. A *Mérőkészlet* kapjon erre 3 esetet: ígéret ≠ teljesítés, idézett pletyka ≠ saját élmény, kérdés ≠ beleegyezés.

### 9.4 Feltételhez kötött rejtett események → *Replace formulaic interactive stories*
**Hol:** `covel-main/plugins/story-events/lib/conditions.js` (112 sor) és `select.js` (42 sor), MIT.
**Mi van nálunk:** az `app/story-events.mjs` kánoni eseménytár (admin által írt, jóváhagyott események). Rejtett, feltételre megnyíló esemény nincs.
**Átvétel:** az `all`/`any`/`not` feltételfa, a `revealed + turnsSinceGte` láncolás és a „körönként legfeljebb egy” szabály kb. 150 sorban átírható. Nálunk a „kör” a világóra napszaka. A feltételek levelei: világóra, kapcsolati szint, egy szál állapota, egy másik esemény megnyílása. A narrátor rövid vázlatot kap, nem kész prózát. Ez adja a 76 fix választásos történet helyett a „később visszaüt” következményeket.

### 9.5 Amit átnéztem, és nem kell
- **Covel branch-reply (alternatív válaszok):** nálunk már megvan (`play-turn-revisions.mjs`, `can_regenerate`).
- **Covel char-creator, dm-console, scene-stage, soundtrack, dice-check, inventory, core-quest:** RPG-játékmechanika vagy saját felület; nem pótol hiányt.
- **Covel world-time:** a mi `game-clock.mjs`-ünk ugyanezt fedi.
- **AI Town embedding-gyorsítótár, Convex-ütemező:** a Convexhez kötött.
