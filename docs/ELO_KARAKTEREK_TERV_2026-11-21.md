# Élő, összetett, eltérő karakterek – terv (2026-11-21)

**Tulajdonosi döntés (2026-11-21):** a legfontosabb most az, hogy a karakterek összetettebbek, egymástól eltérőbbek és „élőbbek” legyenek. A `MUNKATERV_KULSO_OTLETEK_2026-11-21.md` infrastruktúra-csomagjai ennek **alárendelve**, csak ott és akkor jönnek, ahol ez a terv igényli őket.

**Diagnózis:** a profil alapja erős: Big Five, öt motívum (biztonság, kötődés, jutalom, autonómia, elismerés), kommunikációs skálák (nyersesség, figyelmesség, közvetlenség, szarkazmus, érzelmi kifejezés), memóriahajlamok. Ami hiányzik, az **a mozgás**: a szereplő ma egy leírás, amely válaszol, ha szólnak hozzá. Az élő szereplő akar valamit, hangulata van, kezdeményez, és változik.

**Elvek:** új AI-hívás csak ott, ahol elkerülhetetlen; ahol lehet, a meglévő mentési pont hívása bővül. Minden új állapot revíziós, visszatekerhető, és szereplői nézőpontú (admin-adat nem kerül automatikusan promptba). Ami nem ismert, ismeretlen marad: nem találunk ki életrajzot. Új függőség nincs.

Hivatkozások: **Átnézés** = `docs/KULSO_KOD_ATNEZES_2026-11-21.md`.

---

## E1 – Különbözőség-mérő (alap, S–M)
**Mit:** ugyanaz a helyzet 5 szintetikus, eltérő profilú szereplőnek. A teszt elbukik, ha a válaszok túl hasonlók (szóátfedés, hossz, hangnem-jelölők, a profilból várt jegyek: szarkazmus, nyersesség stb.). Ehhez jön a C1 mérőkészlet tény-esete (ígéret ≠ teljesítés stb.).
**Miért első:** enélkül nem tudható, hogy egy változtatás tényleg élőbbé és eltérőbbé tette-e a szereplőket.
**Külső projektből:** nincs kész eszköz. Szerkezeti minta: Covel `plugin-test-utils` és a tesztek felépítése, AI Town `conversation.test.ts`. A mérőszám saját.
**Elfogadás:** a mostani kódon lefut, és kiadja az alapértéket (DECISIONS.md).

## E2 – Belső állapot: hangulat, aktuális gondok, mit akar (M)
**Mit:** szereplőnként revíziós `inner_state`:
- `mood`: címke + erősség, napok alatt halványul (az „Érzelmi stabilitás” és az „Érzelmi emlékek tartóssága” lassítja vagy gyorsítja);
- `concerns`: 2–3 aktuális gond vagy vágy („pénzgondok”, „ki akar békülni Márkóval”);
- `wants_from_palor`: mit akar most Palortól (lehet üres).
Frissül a **mentési ponton** (a meglévő hívás bővül, résztvevőnként) és **éjjel**, csak az érintetteknek. Minden beszélgetés promptjának elejére bekerül.
**Külső projektből:**
- GA `scratch.json` `currently` mező + `plan.py` 408–460. sor `revise_identity`: éjjel a tegnapi fontos emlékekből „hogy érzi magát” és új állapot, első/harmadik személyben → a mi éjszakai frissítésünk mintája.
- AI Town `convex/agent/memory.ts` 42–62. sor: összegzés **a résztvevő saját szemszögéből**, azzal együtt, hogy tetszett-e neki → a mentési pont résztvevőnkénti bővítése.
- Covel `plugins/memory/PLUGIN.md`: „blokk” (jelen állapot, mindig újraírva) vs. „tény” (csak hozzáadva) → az `inner_state` blokk, az emlékek tények.
**Elfogadás:** két résztvevő ugyanarról a beszélgetésről eltérő hangulatot és gondot kap; a hangulat napok alatt halványul; az E1 különbségmérő javul.

## E3 – Motívum-alapú reakció (S–M)
**Mit:** egy esemény (lemondott találkozó, dicséret, sértés, titok kiderül) előbb **determinisztikusan** átmegy a profilon: mely motívumot érinti, és mennyire erősen. Az eredmény egy rövid utasítás a promptban („Ez neki elutasításként hat: erős kötődési igény, alacsony érzelmi stabilitás → megbántott, de nem mondja ki, mert alacsony a közvetlensége”).
Ugyanaz az esemény: a kötődés-vezérelt szereplőnek elutasítás, az elismerés-vezéreltnek sértés, az autonómia-vezérelt magányosnak megkönnyebbülés.
**Külső projektből:** kész appraisal-modul egyik repóban sincs; a lánc saját. Minták: GA `poignancy_event_v1.txt` / `poignancy_chat_v1.txt` (mennyire „csíp” egy esemény), Covel `plugins/character-agent/PLUGIN.md` (csak a saját szavait és tetteit írja; az előzmény adat, nem utasítás).
**Elfogadás:** az E1 esetei között 3 új: ugyanaz az esemény 5 profilnál; a reakciók jelölői a motívumoknak megfelelően térnek el.

## E4 – Saját cél a beszélgetésben + kezdeményezés (S–M)
**Mit:** minden beszélgetés előtt a szereplő kap egy `agenda`-t a gondjaiból, a nyitott szálakból (`world_threads`) és a `wants_from_palor`-ból. Maga hozza szóba: szívességet kér, felhozza a tegnapi vitát, témát vált. Ehhez jön a `wants_to_leave` jelzés (dolgozik, sietnie kell, megsértődött).
**Külső projektből:**
- AI Town `convex/agent/conversation.ts` ~195. sor: `Your goals for the conversation: ${agent.plan}` → nálunk a cél a valós helyzetéből jön, nem fix.
- AI Town `previousConversationPrompt`: az előző beszélgetés egy mondatban, hogy ne kezdjék újra ugyanazzal.
- GA `iterative_convo_v1.txt`: minden válasz mellett „véget ért-e a beszélgetés?” → `wants_to_leave`.
- GA `planning_thought_on_convo_v1.txt`, `memo_on_convo_v1.txt`: beszélgetés után „mit jegyez meg a terveihez” és „mi volt érdekes neki” → az `agenda` és a szálak forrása.
- GA `decide_to_talk_v2.txt`: kezdeményezne-e beszélgetést → később a szereplő maga hívja vagy keresi Palort (szabállyal, nem minden körben AI-val).
**Elfogadás:** egy nyitott szálat vagy gondot a szereplő az első 3 válaszában szóba hoz, Palor kérdése nélkül.

## E5 – Nem mindig egyetért (S)
**Mit:** a modellek alapból kedvessé és egyetértővé teszik a szereplőket; ez a legfőbb oka annak, hogy mind egyformának hatnak. A profilból (együttműködés, nyersesség, sérelmek megőrzése, hangulat, kapcsolat állapota) **kifejezett engedély és ok** kerül a promptba: elutasíthat, kitérhet, hazudhat (a tudáshatáron belül), duzzoghat, lehet rossz napja, egy hétig hűvös maradhat. A tulajdonosi szabályok (pl. nincs kényszerített romantika) változatlanok.
**Külső projektből:** csak részben. Covel `character-agent` (a szereplő nem dönt Palor helyett, csak a saját válaszát írja); AI Town `untrustedMemoryInstructions` (az emlék csak háttér). A „nem-egyetértés költségvetése” saját.
**Elfogadás:** az E1-ben alacsony együttműködésű vagy magas nyersességű szintetikus szereplő a kérések egy részét elutasítja; a magas együttműködésű nem.

## E6 – „Hol tartunk” és irányított, bizonyítékkal változó kapcsolat (M)
**Mit:** szereplőnként és kapcsolatonként revíziós `relationship_state` („Haragszik, mert Palor nem jött el; bocsánatkérést vár”), mindkét irányban külön. Minden kapcsolati szintváltozáshoz `{delta, reason, memory_id}`. Minden beszélgetés elején bekerül a promptba.
**Külső projektből:**
- GA `summarize_chat_relationship_v1.txt`: „mit éreznek, mit tudnak egymásról” – nálunk nem beszélgetés előtt, hanem a mentési ponton készül, és tárolva van.
- Covel `plugins/affinity/tier-metadata.js` + README: −100…+100, hat sáv, változásonként `{delta, reason}`, az utolsó 10 megőrizve.
- Covel `world-ir` ténykezelési szabályai (ígéret ≠ teljesítés, „én” = a beszélő) a mentési pont promptjába.
**Elfogadás:** egy elmaradt ígéret egy héttel később is hat a hangnemre; a változás indoka visszakereshető.

## E7 – Emlékezet, ami ezt elbírja (M) – a régi C2
**Mit:** fontosság + megerősítés + BM25 a felidézésben, hogy a gondok és sérelmek hetekig megmaradjanak.
**Külső projektből:** Covel `packages/plugin-handlers-utils/src/text-search.ts` (BM25, MIT, átírva); AI Town `memory.ts` 205–223. sor (három normalizált összetevő, `lastAccess` frissítés); GA `retrieve.py` 242–249. sor (súlyok: relevancia 3, fontosság 2, frissesség 0,5).
**Elfogadás:** a C1 felidézési arány nem romlik, a fontos emlékekre javul.

## E8 – Lassú változás: heti önreflexió (S–M)
**Mit:** hetente, csak az érintetteknek: „mi a legfontosabb kérdés most az életében?” → emlékek → 1–3 új meggyőződés önmagáról vagy másokról, forrás-emlékekkel. Ettől változnak a `concerns` és a kapcsolatok. Akit Palor többször cserben hagy, fokozatosan óvatos lesz vele.
**Külső projektből:** GA `reflect.py` 21–130. sor (fókuszkérdések → keresés → következtetés bizonyítékkal), `importance_trigger` visszaszámláló; AI Town `memory.ts` 339–389. sor (reflexió a fontosság összegére, `relatedMemoryIds`).
**Elfogadás:** szintetikus hét után egy ismétlődő mintából hiedelem lesz; visszatekeréskor a hiedelem is visszavonódik.

## E9 – Élet a képernyőn kívül → hírek (L) – a régi S4, csak ami ehhez kell
**Mit:** a kétszintű részletesség (tulajdonos, 2026-11-21). A távoli szereplők szabály + véletlen alapú találkozói egysoros rekordot hagynak, AI-hívás nélkül. Palor később hírként hallja („nem hiszed el, mi volt tegnap Sanyival”), és a szereplő gondjai között is ott lehet.
**Külső projektből:** Covel `story-events` „nincs modellhívás, csak feltételek” elve; AI Town `INVITE_ACCEPT_PROBABILITY`; GA `chatting_with_buffer` (párosonkénti várakozás).
**Elfogadás:** 50 szintetikus szereplős hét AI-hívás nélkül lefut; egy távoli rekord egy későbbi beszélgetésben hírként előjön.

---

## Sorrend
E1 → E2 → E3 → E4 → E5 → E6 → E7 → E8 → E9.
Az E1–E5 szinte csak prompt- és kis állapotmunka a meglévő hívásokon: **ezektől várható a leggyorsabban érezhető különbség.**
A napirend-ág (feladatlista: *Napirend és ki hol van*) ezek után jön, a `MUNKATERV_KULSO_OTLETEK_2026-11-21.md` S1–S3 csomagjai szerint.
A munkamód és a biztonsági szabályok ugyanazok, mint a MUNKATERV 0. fejezetében.

## Döntéseid (alapértékkel)
1. A hangulat felezési ideje: **2 nap** átlagos érzelmi stabilitásnál.
2. Éjszakai frissítés kinek: **akinek tegnap 3+ fontosságú emléke keletkezett, vagy aznap szála van**.
3. Hazudhat-e a szereplő Palornak: **igen, a tudáshatáron belül, ha a profil és a helyzet indokolja**.

---

## Kiegészítés: célzott átnézés az élő karakterek szempontjából (2026-11-21)

**Kiinduló megfigyelés a saját kódban:** a Szellemprofil gazdag (célok, belső konfliktusok, félelmek, megküzdés, beszédpéldák, kapcsolatspecifikus kommunikáció, hangulati reaktivitás, szokások). Két ponton azonban elvész:
- a `profile-prompt.mjs` `OMIT.group` halmaza **csoportjelenetben kihagyja** a célokat, konfliktusokat, félelmeket, a megküzdést és mind az öt motívumot. Csoportban ezért marad a szereplőből csak felszín;
- a mezők hosszú leíró szövegek, mezőnként 700 karakterre vágva. A modell leírást kap, nem játszási utasítást.

## E10 – Szerepkártya: tömör, viselkedés-alapú lap (M)
**Mit:** szereplőnként egy rövid, jóváhagyott „hogyan játszd” lap, a profilból levezetve:
- **hang:** 1 mondat;
- **3 viselkedési szabály**, pl. „A pénzügyeiről csak akkor beszél, ha előbb te nyílsz meg”;
- **titkok:** „csak te tudod: befolyásolja, mit tesz, de ne mondd ki, amíg a történet fel nem fedi”;
- **2 példasor;**
- **1 ellentmondás/kivétel**, pl. „mindig türelmes, kivéve ha…”.
A kártya **javaslat** a meglévő Szellemprofil-javaslatfolyamaton, `hypothesis` jelöléssel. Te hagyod jóvá; ami nincs a profilban, nem kerül bele tényként. Beszélgetésben a kártya a hosszú mezők **elé** kerül.
**Külső projektből:**
- Covel `plugins/character-blueprint/lib/roleplay-notes.js` (256 sor, MIT): kártyaszerkezet (hang, modor, vonások, célok, félelmek, titkok, kapcsolatok, szabályok, példasorok), sorhossz-plafon (300), legfeljebb 2 példasor és 3 szabály, a titok-instrukció szövege; `examples/blueprint.json` minta.
- AI Town `data/characters.ts`: a rövid, ellentmondásos identitás ereje („mindig mogorva … titokban bántja, hogy nem járt egyetemre”; „végtelenül türelmes, kivéve ha mókust lát”) + egy soros terv.
**Elfogadás:** az E1 különbségmérő javul a kártyával a kártya nélküli állapothoz képest.

## E11 – Csoportjelenetben se vesszen el a belső élet (S) – gyors nyereség
**Mit:** a csoportprompt ne hagyja ki a célokat, félelmeket és motívumokat, hanem **egységes részletességi szinttel** férjen bele a keretbe. Minden szereplő ugyanazon a szinten kap szöveget, a szint a teljes keret szerint csökken: előbb a példasorok, aztán a szabályok, végül a háttér maradnak el; **a hang és a kártya magja sosem**.
**Külső projektből:** Covel `roleplay-notes.js` `DETAIL_LEVELS` és `NOTES_TOKEN_BUDGET` (fokozatos csökkentés; „egy kártya szövege nem függhet attól, melyik a leghosszabb”).
**Elfogadás:** 3 fős szintetikus csoportban mindhárom szereplő célja vagy félelme jelen van a promptban, és a keret nem lépi túl a mostanit.

## E12 – Vélemények: mit gondol másokról és témákról (S–M)
**Mit:** beszélgetés után résztvevőnként egy mondat: „mit gondolt X Y-ról” (a mentési pont bővítése, külön hívás nélkül). Visszatérő témákról (munka, pénz, egy közös ismerős) gyűlő vélemény. Ezek a beszélgetés promptjába kerülnek, ha a téma vagy a személy előjön. A szereplőknek így lesz saját, eltérő véleményük, nem csak tényeik.
**Külső projektből:** GA `prompt_template/v2/convo_to_thoughts_v1.txt` (mit gondolt a másikról, egy mondatban), `keyword_to_thoughts_v1.txt` (mit gondol egy témáról).
**Elfogadás:** két szereplő ugyanarról a harmadikról eltérő, a saját élményeikből eredő véleményt mond.

## E13 – Titkok a tudáshatáron belül (S)
**Mit:** új profilmező `secrets` (creator-szintű, **csak a tulajdonos** írja vagy hagyja jóvá; nincs kitalálás). A szereplő promptjába a Covel-féle utasítással kerül: alakítsa a viselkedést, de ne mondja ki. A felfedés a meglévő `world_knowledge`/eseménylogika szerint történik. Az E5 hazugság-engedélye erre épül.
**Külső projektből:** Covel `roleplay-notes.js` (a „Secrets (known only to you)” blokk és az intro-szöveg); AI Town `characters.ts` (titokban…).
**Elfogadás:** szintetikus szereplő titka nem hangzik el egyenes kérdésre, de a viselkedése (kitérés, témaváltás) jelzi.

**Frissített sorrend:** E1 → **E11** (gyors) → E10 → E2 → E3 → E4 → E5 → E13 → E6 → E12 → E7 → E8 → E9.
