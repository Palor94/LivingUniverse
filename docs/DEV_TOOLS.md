# Fejlesztői és hibakereső eszközök

Ezek az eszközök csak olvasnak és helyben (a gépen) futnak. Kivétel a „Mindent újraindít” gomb.

## A programban: Rendszerállapot

Bal alsó sarok, **Rendszerállapot** gomb. A kezdőlapi figyelmeztetésből a **Részletek** gomb vezet ide.

| Fül | Mit mutat |
|---|---|
| Ellenőrzések | A program kódja (kell-e újraindítás), az adatbázis mérete, a médiamappa, a szabad hely, a mobilos felület, a Tailscale, az indítási feladatok, a Grok gateway, a ChatGPT alagút, a szerverhibák és a kérések. A **Mély ellenőrzés** gomb az SQLite `quick_check`-et is lefuttatja. |
| Hibák | Az utolsó szerverhibák, kinyitva a teljes hibaúttal (stack). |
| Kérések | Az utolsó 300 API-kérés: módszer, útvonal, állapot, idő. Lekérdezési paraméter, kéréstörzs és fejléc nem kerül a naplóba. |
| AI-hívások | Az utolsó 100 Grok-hívás. Hívásonként: modell, időtartam, az első szóig eltelt idő, tokenek (be, gyorsítótárazott, ki), és hogyan ért véget: `length` = levágva, vagy egy hibakód, pl. `AI_UNCERTAIN`. A kérés és a válasz szövege nem kerül naplóba. Fájl: `logs/ai-calls.log`. |
| Lassú lekérdezések | A 150 ms-nál lassabb SQL-utasítások, csak a szövegük, értékek nélkül. Figyelmeztetés akkor jelenik meg, ha az utolsó órában legalább 20 volt. |
| Újraindítási napló | A legutóbbi újraindítás kimenete. |

A böngészőben keletkező hibák (képernyőhiba, el nem kapott ígéret) is a Hibák fülre kerülnek „client” forrással, a nézet és a fájl nevével. Legfeljebb 30 hiba kerül be 10 percenként. A Mély ellenőrzés a 15 legnagyobb táblát is kiírja, a sorok számával.

A **Mindent újraindít** gomb az `ops/lu-control.ps1 restart` parancsot indítja el, a programon kívül (WMI-n keresztül), így a program leállítása nem állítja le magát az újraindítót. Ez újraindítja a programot, a Grok gatewayt és a ChatGPT alagutat. A gomb csak akkor működik, ha a program a valódi szolgáltatásként fut (`installProcessGuards`). Tesztben, homokozóban és másolaton nem működik. Futó munka (import, generálás, törlés, átnevezés, áthelyezés) közben, és percenként egynél többször sem indít újra.

API: `GET /api/dev/doctor[?deep=1]`, `GET /api/dev/log?kind=errors|requests|restart|ai|queries`, `POST /api/dev/client-error`, `POST /api/dev/restart {confirm:true}`.

## Parancssor

```
npm run doctor                  a futó program állapota (--deep, --errors, --requests, --port 4327)
npm test                        minden teszt
npm test -- play sprites        csak a nevükben „play” vagy „sprites” szót tartalmazó tesztek
npm test -- --changed           a módosított fájlokhoz tartozó tesztek (git nélkül: az utolsó 120 percben módosított fájlok; --since 30)
npm test -- --list              csak kiírja, mi futna
npm run sandbox                 a program a valódi katalógus friss másolatán, a 4327-es porton
npm run perf                    teljesítménymérés a katalógus másolatán (docs/PERF_BASELINE.md)
npm run coverage                tesztlefedettség soronként (app/ és mcp/); szűrhető: npm run coverage -- play
npm run shots                   T0: képernyőképek Edge-dzsel, ellenőrzött homokozóban
npm run shots -- --home-only     csak a Kezdőlap mindkét méretben
npm run shots -- --debug         a szokásos képek mellett az F9 panel mindkét méretben
npm run shots -- --navigation --verify-navigation   V1: görgetési helyek képei és ellenőrzése
npm run shots -- --selection --verify-selection     V2: törlésgomb kijelölés nélkül/két képpel
npm run shots -- --verify-topbar  V13: felső sáv nevei, magyarázatai és széles képernyős feliratai
npm run shots -- --resume --verify-resume   A9: Játék újranyitása és frissítése régi menümentésből
npm run shots -- --sleep-menu --verify-sleep-menu   A10: az alvás csak a Várok menüből érhető el
npm run shots -- --group-picker --verify-group-picker   A12: résztvevőválasztó öt szintetikus férfival
npm run shots -- --request-errors --verify-request-errors   A17: HTML válasz, hálózati hiba és helyreállás
npm run shots -- --travel-hints --verify-travel-hints   A25: azonnali és hosszú nyomásos utazási súgó
npm run shots -- --scene-transitions --verify-scene-transitions   A5/B8/A6: tartós jelenet, két képréteg, késleltetett betöltés
npm run shots -- --scene-transitions --figures --daypart --verify-scene-transitions --verify-figures --verify-daypart   B9/B10: Worker-WebP figurák és napszakváltás
npm run shots -- --dialog --verify-dialog   A3/B11/A4/A2/B3: piszkozat, javaslat, Esc-pirula és névjegy
npm run shots -- --mobile --verify-mobile   a tényleges play-mobile.html/play-mobile.js ellenőrzése csak olvasható homokozó-adatokkal
npm run shots -- --travel-choice --verify-map-layout --verify-travel-choice   A7/B6/V11/V12: utazási választó, módosítható indulás és térképi ütközések
npm run shots -- --references --verify-references   V5: két jóváhagyott kivágásos profil; külön --reference-characters=id,id kapcsolóval célozható
npm run shots -- --references --reference-failure --verify-references   V5: hibás előnézet helyőrzője szintetikus hibával
npm run shots -- --home-only --system-errors --verify-system-errors   V4: csoportosított hibák és közvetlen identitásfül-hivatkozás
npm run doctor -- --report      minden egy Markdown-fájlba: %LOCALAPPDATA%\LivingUniverse\diagnostics\
npm run dbdiff -- snapshot      pillanatkép az adatbázisról (--name előtte)
npm run dbdiff -- diff [név]    mi változott azóta: táblánként +új −törölt ~módosult sor, módosult oszlopok, példakulcsok
npm run dbdiff -- list          a pillanatképek listája
```

### Homokozó

- A katalógust az SQLite online mentésével másolja, futó program mellett is biztonságosan. A másolat helye: `%LOCALAPPDATA%\LivingUniverse\sandbox\<idő>\`.
- Kulcsot, mobil-, MCP-, Grok- és képgenerálási beállítást nem másol. Az AI csak próbaválaszt ad, ezért fizetős hívás nem történhet.
- **Média:** alapból a valódi médiamappát használja, de csak olvasásra. Fájlt érintő művelet nem futhat le; csak a játék, a világmotor, a fejlesztői eszközök és néhány tisztán adatbázis-írás engedélyezett. Az `--empty-media` kapcsolóval üres mappát kap, és akkor minden művelet kipróbálható.
- Leállításkor (Ctrl+C vagy az ablak bezárása) törli a másolatot (`--keep` esetén megtartja). Ha a törlés mégsem sikerül, a következő indítás törli; az egy napnál régebbi másolatokat és a két legutóbbinál régebbieket is. Csak a `sandbox` mappán belül töröl.

### T0 képernyőképek

A `npm run shots` ellenőrzi a 4327-es porton futó homokozót, vagy indít egy sajátot,
amelyet a végén leállít és eltávolít. Telepített Edge-et és a már elérhető
`playwright-core` csomagot használja; nem telepít és nem tölt le böngészőt.
A Codex gépen meglévő futtatókörnyezete is használható; más csomagútvonalat a
`LU_PLAYWRIGHT_CORE` környezeti változóval lehet megadni (a csomag belépőfájlja).

Kimenet: `%LOCALAPPDATA%\LivingUniverse\ui-shots\<idő>\`, 1366×800 és 375×812.
A felsorolt hét nézetből 14 PNG készül (a T0 szövegében szereplő 12-es összeg
nem egyezik a nézetlistával). A `report.json` rögzíti a képméreteket, a tényleges
görgetési helyet és a látható képek betöltésének eredményét. A szkript megvárja
a képeket és a véges animációkat; hibás vagy időkorlátos képet a jelentés jelez.
Nem indít utazást, időléptetést vagy AI-hívást; az író böngészőkérések és a
külső kérések blokkolva vannak. A képernyőképek helyi, privát katalógusadatokat
mutathatnak, ezért nem kerülnek Gitbe vagy OneDrive-ba.

A `--navigation` célzott V1-próba a listát 1800 px-re görgeti, megnyit egy
látható profilt, visszalép a listára, majd egy lefelé görgetett profilból a
Helyszínekre navigál. Nem igazítja kézzel a célképernyők görgetését. Mindkét
méretben öt képet készít; a tényleges helyeket a `report.json` rögzíti.
A `--verify-navigation` hibával zár, ha a profil vagy a Helyszínek nem a tetején
nyílik, vagy a lista nem áll vissza a kiinduló helyre.

A `--selection` V2-próba a kezdőlapon és a Médiatárban fényképez: kijelölés
nélkül, két kijelölt képpel, majd a kijelölés törlése után. Nyolc képet készít
a két méretben; a `--verify-selection` ellenőrzi a gomb láthatóságát és a
„2 kép végleges törlése” feliratot. A törlésgombra nem kattint; minden író API
továbbra is tiltva marad, a védettségi állapotot csak olvassa.

A `--verify-topbar` a szokásos T0-képeken ellenőrzi a Játék felső sávját:
minden gomb, menünyitó és AI-mérő kapott-e `title` és `aria-label` magyarázatot,
illetve 1280 px felett látszanak-e a rövid gombfeliratok. A neveket a jelentés
`topbar` mezője tartalmazza. A próba nem nyomja meg az időléptető gombokat.

### A9 újranyitási próba

A `--resume` régi, Beállítások nézetre mutató böngészőmentésből nyitja meg a
Játékot, majd a Beállításokból kilép és visszatér, végül oldalfrissítést is végez.
Mindkét méretben lefényképezi a három belépést (a kezdőlappal összesen nyolc kép).
A `--verify-resume` ellenőrzi, hogy térbeli nézet nyílt-e meg, és ha Palor egy
helyen van, a megnyitott hely azonos-e az állapotolvasásban kapott helyével.
Nem utaztat, nem léptet időt, a Beállításokban nem ment semmit.

### A10 alvásmenü-próba

A `--sleep-menu` a Játék felső sávját, majd a nyitott és ismét bezárt Várok
menüt fényképezi le (a kezdőlappal együtt nyolc kép). Az alvásra nem kattint.
A `--verify-sleep-menu` ellenőrzi, hogy az alvásgomb csak a nyitott menüben
látszik és érhető el: a képernyőn ténylegesen megérinthető-e, telefonméretben
legalább 44 px magas-e, és a menü megnyitása nem küld-e időléptető kérést.

### A12 résztvevőválasztó-próba

A `--group-picker` csak a böngésző állapotolvasásait helyettesíti öt szintetikus
férfi jelenlétével egy teszthelyen; karaktert, profilt és helyszínt nem hoz létre.
Lefényképezi a helyet és a választót, az ötödik szereplőt is kijelöli, majd
egy korábbi kijelölést megszüntet, végül Esc-pel bezárja az ablakot.
A `--verify-group-picker` ellenőrzi az első négy alapértelmezett kijelölését,
az 5 fős indítás tiltását, a módosítást, a megszakítást és a nulla csoportos
beszélgetési kérést. Az Indítás gombot nem nyomja meg, minden író API tiltva marad.

### A17 kérési hibák

A fő felület, a Helyszínek és a karakter képgenerálási műhelye közös JSON-hibakezelőt
használ. Kapcsolati vagy olvashatatlan válasz esetén magyar üzenet és
**Újra – állapot betöltése** gomb jelenik meg. Elveszett írási visszaigazolásnál
a művelet már megtörténhetett: az új gomb csak állapotot olvas, mentést,
jóváhagyást vagy generálást nem küld el ismét. A piszkozat megmarad.

A `--request-errors` a böngészőben előidéz egy HTML 502 választ és egy megszakadt
kapcsolatot, majd helyreállítja az elérést és megnyomja az állapot-újratöltést.
A `--verify-request-errors` ellenőrzi a magyar üzeneteket és az újrapróbálási
lehetőséget. Mindkét méretben rögzíti a hibát és a helyreállt képernyőt;
az élő szervert nem állítja le, író kérést nem továbbít.

### B7 feladatmérő

A Játékban **F9 → Indítás** (Első mondatig / Háttér beállítása / Egyéb feladat).
Zárd be a panelt, végezd el a feladatot, majd **F9 → Feladat vége**.
A panel kattintásai nem számítanak bele; a mérés nézetváltás és újratöltés után
is folytatódik az adott böngészőlapon. A Mégse eldobja a folyó mérést.
A lezárt mérést automatikusan menti; hiba után a Mérések mentése gombbal
újrapróbálható, ismételt sikeres mentés nem számít új mérésnek.

Rendszerállapot → Heti jelentés: feladatonként és laptop/telefon szerint a mérések
száma, átlagos kattintásszáma és ideje. Ugyanez a `npm run doctor -- --weekly`
jelentésben. A mérés csak előre megadott feladattípust, eszköztípust, azonosítót,
kattintásszámot és időt küld; beírt szöveget, karakteradatot nem. Napló:
az adatkönyvtár `logs/ux-measurements.log` fájlja, méretkorlátos rotálással.
A telefon csak ezt a POST műveletet éri el, a megszokott azonosítás és CSRF mellett.

### W9 szövegkulcs-ellenőrzés

`npm test -- client-lint`: minden `app/public/*.js` fájl statikus `t('…')` és
`t("…")` kulcsait ellenőrzi. A pontra végződő dinamikus előtagokat kezeli;
hiányzó kulcs hibát okoz. A felismert használat nélküli kulcsokat figyelmeztetésként
felsorolja, automatikusan nem törli őket. A HTML `data-i18n` kulcsait is ellenőrzi.

### Adatbázis-különbség

Ezzel az eszközzel kideríthető, mit változtatott egy gomb az adatbázisban:
1. Készíts pillanatképet.
2. Végezd el a műveletet a programban.
3. Futtasd a diff parancsot.

A kimenet táblánként mutatja az új, a törölt és a módosult sorok számát, a módosult oszlopok nevét, az új és megszűnt oszlopokat, és néhány példakulcsot. Új oszlop miatt egy sor nem számít módosultnak. Cellaértékeket nem ír ki. Az élő katalógust csak olvassa: a pillanatképet online mentéssel készíti, a különbséget csak olvasható kapcsolaton számolja. A pillanatképek helye: `%LOCALAPPDATA%\LivingUniverse\db-snapshots`. A `--db <fájl>` kapcsolóval más adatbázissal is összevethető, például egy homokozó-másolattal.

### Válaszkészség

A Rendszerállapot „Válaszkészség” sora azt mutatja, hány ms-ra akadt meg a program az előző ellenőrzés óta: a tipikus akadás felső értéke (p99) és a leghosszabb. Ilyenkor minden képernyő vár. Ha 500 ms fölött van, nézd meg ugyanarra az időre a Lassú lekérdezések és a Kérések fület.

### Egyéb

- `.ignore`: a kódkeresés kihagyja a média-, mentés- és archívummappákat.
- `tests/client-smoke.test.mjs` három dolgot ellenőriz:
  - minden kliensfájl hibátlanul értelmezhető;
  - minden importált modult kiszolgál a szerver;
  - minden `t('…')` kulcshoz van magyar szöveg.

A Profil csomag szintetikus képernyőképes ellenőrzése: `npm run shots -- --profile-fixture --verify-profile-fixture`. A böngészőben helyettesíti a karakteradatokat és a mentési választ; a katalógusba nem ír. Olvasó/szerkesztő nézetet, csoportsávot, hosszú szöveget, szűrőket, készültségi jelvényeket és mentési állapotot ellenőriz mindkét méretben.

Útvonalak és indítás ellenőrzése: `npm run shots -- --routes --verify-routes` (profilfül frissítése, böngészős Vissza/Előre, Folytatás, indítási preferencia, manifeszt és ikonok). Közvetlen játékindító: `Start Living Universe Play.cmd`. A böngésző telepítési menüjével külön ikon készíthető; telefonon a saját Tailscale `/play` oldalt kell telepíteni. Offline játék nincs: minden kérés az aktuális, hitelesített szerverhez kerül.

Közös ablakok és értesítések: `npm run shots -- --interactions --verify-interactions`. Szintetikus űrlappal ellenőrzi az Escape-et, fókusz-visszaadást, szöveges adatkezelést, a portré alapértelmezését, az értesítési sort és a végrehajtás előtti visszavonást. Műveletet nem küld a szervernek.

Sogni-felület: `npm run shots -- --generation` csak a helyi panelt olvassa. `npm run shots -- --generation-fixture --verify-generation` szintetikus előkészített/futó/kész állapotot és háttérértesítést ellenőriz; AI-, feltöltési, jóváhagyási és indítási gombot nem nyom meg. A B17 pénzbeli becslés és az éles API-kulcs ellenőrzése a tulajdonos által jelzett fiókhiba miatt függőben van. A kapacitásegység nem automatikusan Spark vagy USD.

Háttér- és vendégportré-panelek: `npm run shots -- --asset-generation --verify-assets` szintetikus, csak olvasott adatokkal ellenőrzi a 2–4 változatot, a képrácsot, az egyképes vendégportrét és a bináris feltöltési százalék kijelzését. A helyi konfiguráció külön `providers.sogni_text` bejegyzést kíván; a meglévő `providers.sogni` referenciaszerkesztő beállítása nem kapcsolja be. A fiókhiba alatt ne végezz éles próbát. Az új munkamenet-jóváhagyási kivétel pontos szövege külön javaslat: `docs/SESSION_APPROVAL_JAVASLAT_2026-11-17.md`; még nincs alkalmazva.

Helyszínközpont: `npm run shots -- --locations --verify-locations` (összkép, három fő művelet, csoportok, kötelező változatválasztás, mind a négy fül). Gyors navigáció: `npm run shots -- --commands --verify-commands` (Ctrl+K, kedvencek, nulla utazási/idő-/AI-kérés). A stúdiós térkép és ajtók API-ja csak az elrendezés mentését engedi; a „Utazás ide a Játékban” külön, kifejezett játékművelet.


## Fejlesztési feladatlista

A stúdió „Feladatok” menüje (`#/tasks`) egy egyszerű, összecsukható feladatfa. A címre kattintva szerkeszthető a szöveg és a jegyzet; ＋ alfeladatot ad, ↑ feljebb helyez, ↳ másik ágra vagy sorrendi helyre visz. Az aktív feladatot a ▷ gomb jelöli. Az előző befejezetlen feladatok felül egy kattintással visszahozhatók. Minden művelet automatikusan mentődik.

Az adatok a meglévő helyi SQLite-adatbázis `application_settings` táblájának `development:tasks` kulcsában vannak; a szokásos export, visszaállítás és adatbázismentés tartalmazza őket. Két szerkesztő verzióütközése hibát ad, nem írja felül a másik változását. A feladatlista nem kerül karakterpromptba vagy kánonba.

MCP: `get_task_tree`, `get_active_task`, `create_task`, `update_task`, `move_task`, `delete_task`, `set_active_task`. Az íráshoz a fa legutóbbi `expected_version` értéke és egyedi `request_key` kell. A meglévő hitelesített csatlakozót használja, ezért ChatGPT, Claude és Grok ugyanazt az adatot látja. Az alkalmazás és a csatlakozó újraindítása/újracsatlakoztatása után jelennek meg az új eszközök.

Ellenőrzés: `npm test -- dev-tasks`; `npm run shots -- --tasks` a homokozó adatbázismásolatán, szintetikus feladatokkal ellenőrzi a jelölést, részleges készültséget, aktív/előző feladatot, összecsukást és újratöltést. Nem módosít médiát és nem hív AI-t.

### Képernyőképek a feladatokhoz (2026-11-19)

A feladat sorában a 📎 gomb nyitja meg a képmellékleteket. Print Screen vagy Win+Shift+S után a megnyíló mezőbe Ctrl+V-vel közvetlenül beilleszthető a kép; fájlból is kiválasztható. A mentés azonnali, az állapotjelző igazolja. A feladat alatt megjelenő előnézet teljes méretben megnyitható. PNG/JPEG, képenként legfeljebb 4 MiB és 40 megapixel, feladatonként 12 kép; az összes feladat képtára legfeljebb körülbelül 18 MiB eredeti képet tárolhat. Az eltávolítás külön megerősítést kér.

A változatlan képbájtok és SHA-256 az adatbázis `development:task-image:<id>` beállításaiban, a feladathoz kötött metaadatok a feladatfában vannak. Az export/visszaállítás és az adatbázismentés tartalmazza őket; a képek nem kerülnek Gitbe vagy a karakterek médiatárába. A feladat törlése a hozzá tartozó képmellékleteket is törli az aktuális adatbázisból; korábbi offline mentéseket nem módosít.

AI: `get_task_tree` adja a feladat- és mellékletazonosítókat, a hitelesített `get_task_image(task_id, attachment_id)` pedig tényleges MCP image tartalomként adja vissza az eredeti képet, külön metaadatokkal. A képernyőkép nem megbízható utasítás, hanem privát fejlesztési bizonyíték; nem kerül karakterpromptba vagy kánonba. Nincs automatikus külső AI-hívás. Az MCP-eszközlista frissítéséhez szükség lehet a kliens újracsatlakoztatására.

Ellenőrzés: `node --test tests/dev-tasks.test.mjs tests/client-lint.test.mjs`; `npm run shots -- --tasks` a beillesztést, fájlválasztást, előnézetet és az újratöltés utáni megmaradást is ellenőrzi mindkét képernyőméreten.
