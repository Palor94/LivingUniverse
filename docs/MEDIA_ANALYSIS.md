# Képelemzés: működő mock infrastruktúra

2026-10-30. Fejlesztési ág: `codex/media-analysis-review`. A tényleges
képfelismerés nincs bekötve; a mock rögzített, egyértelműen megjelölt válaszokat
ad. Nem futott fizetős kérés, modelltelepítés vagy privát feltöltés. A fejlesztés
és minden migrációs próba eldobható adatbázisokon történt, éles indítás nélkül.

## Használat

1. A desktop médiatár aktuális oldalán jelölj ki 1–100 képet, majd válaszd a
   **Mock képelemzés…** gombot. Egy mentett kép adatlapjáról is indítható.
   Előbb mentsd az adatlap változtatásait. Videó nem támogatott.
2. Jelöld ki a célokat: kameraállás, kivágás, arckifejezés, testhelyzet, öltözet,
   megvilágítás, háttér. A száraz előnézet rögzíti a pontos médiaazonosítókat,
   forrásállapotot, célokat és provider-verziót. Indítás külön gombbal történik.
3. A **Képelemzés · mock** oldalsó gombbal bármikor megnyitható az előzmény.
   Futó köteg szüneteltethető, folytatható vagy megszakítható. Bezárás/újraindítás
   és mentés-visszatöltés után a befejezetlen köteg szünetel; nincs automatikus
   újraindítás. A megszakítás után az elkészült eredmények megmaradnak.
4. Az eredeti kép előnézete, a külön tárolt mintaleírás, kétnyelvű megfigyelések,
   bizonytalanság és indoklás megtekinthető. A leíró címke és a pontos helyszín
   külön javaslat. A semleges háttérből nem lesz környezeti jelenetcímke.
5. Jelölj ki egy vagy több javaslatot (maximum 200, csak az aktuális oldalon).
   A magyar/angol név és alias a meglévő szótárhoz illeszkedik, stabil ID alapján.
   Pontos helyet teljes útvonallal kell kiválasztani. Két különböző szülő alatti
   **Strand** nem vonható össze. Bizonytalan elfogadáshoz külön jelölés kell.
6. Az ismeretlen címke/hely csak javaslat marad. Meglévő elemhez kézzel
   megfeleltethető; új elem a meglévő szótár-/helyszínszerkesztőben hozható
   létre, majd **Újraillesztés** kérhető. A modell nem hozhat létre elemet.
7. Elfogadás és elvetés előtt pontos változáslista jelenik meg. Elfogadás csak
   hozzáad; meglévő címkét/helyet nem cserél le. A döntés az előzményekben
   visszavonható. Később kézzel átvett vagy módosított kapcsolat megmarad.

A rendezési státusz, karakterkapcsolatok, eredeti Media Notes, kánon és
referenciajóváhagyás változatlan. A háttérhely nem alakít karakterképet
helyszínreferenciává. A javaslat elfogadása után a többi eredmény konzervatívan
elavulttá válhat; újraillesztés kell, új modellhívás nélkül. Szerkesztés közben
a felület automatikus frissítése szünetel; a kézi Frissítés törli a helyi kijelölést.

## Modulok és szerződések

| Fájl | Feladat |
| --- | --- |
| `app/analysis-model.mjs` | Szigorú kimeneti séma, kategóriák, determinisztikus HU/EN/alias-illesztés, mock provider. |
| `app/analysis-source.mjs` | Határon belüli, helyben elérhető eredeti ellenőrzött olvasása és korlátozott JPEG-származék. |
| `app/media-analysis.mjs` | Előnézet, tartós sor, revízióval védett megszakítás, verziózott cache, újraillesztés, mentés/migráció. |
| `app/analysis-review.mjs` | Szelektív előnézet/elfogadás/elvetés, idempotens nyugta, tulajdonjoghoz kötött visszavonás. |
| `app/analysis-restore.mjs` | Exportált eredmények és visszavonási kapcsolatok konzisztenciája, biztonságos visszatöltés. |
| `app/analysis-routes.mjs` | Desktop API; Origin + folyamatonkénti CSRF-védelem minden írásnál. |
| `app/public/media-analysis.js` | Köteg- és javaslatellenőrző felület, oldalra korlátozott kijelölés. |

Provider-szerződés: `analyzeImage({image, source_sha256, goals, signal})`.
Az `image` ellenőrzött származékot, MIME-t, dimenziókat és hash-t tartalmaz.
Eredeti jegyzet, karakterdosszié, admin-adat és fájlrendszerútvonal nincs a
provider-bemenetben. Az adapter nem kap adatbázist, fájlkezelőt vagy eszközhívást.
Ebben a kiadásban kizárólag `mock`, `local:true`, `mock:true` használható;
az API nem kapcsolhat be valódi/külső providert. A tesztinjektálás szerveroldali
fixture-lehetőség, nem HTTP-konfiguráció. Nincs új MCP vagy mobil írási jogosultság.

A séma legfeljebb 64 KiB eredményt, 30 megfigyelést, 60 címkét és 20 helyjavaslatot
enged; a megfigyelés/javaslat magyar és angol mezője kötelező. A bizonytalanság
explicit jelző; nincs kitalált pontosság vagy kalibrálatlan százalék. A szöveg
adat, nem futtatható utasítás. Az eredményből csak a kiválasztott célkategóriák
adhatnak javaslatot, akkor is, ha a provider többet válaszol.

Forráskorlát: 20 MiB, 40 MP, támogatott JPEG/PNG/GIF/BMP tartalom. A tényleges
dekódolást a meglévő képszármazék-készítő végzi (Windows), legfeljebb 2048 px
élű és 3 MiB JPEG-re. Nincs automatikus OneDrive-fájlbehívás; nem helyi kép hibát
ad. GIF első képkockájának származéka nem videóelemzés. Az eredetibe nem írunk.

Egy worker, elemenként 30 s időkeret; a későn visszatérő provider eredménye
megszakítás után nem commitolható. Egyedi elemhiba nem állítja le a többi képet.
A „Befejezve” a feldolgozás végét jelenti, a hibaszámot külön mutatjuk. Hibás
vagy megszakított elemekre új kijelölt köteg indítható. Felső korlát: 1000 köteg,
10000 tétel és 5000 cache-bejegyzés; nincs automatikus előzménytörlés. A cache
telítődésekor a feldolgozás folytatódik új cache-bejegyzés nélkül.

Cache-kulcs: eredeti + származék SHA-256, provider/model/prompt/preprocess/séma
verzió és célok. A szótár/helyszínfa nincs a provider-bemenetben; a nyers eredmény
újrailleszthető a jelenlegi katalógushoz. A forrás, jegyzet, hozzárendelés,
szótár vagy helyszínfa változása érvényteleníti a releváns előnézetet. A forrás
hash-e elfogadás és újraillesztés előtt is ellenőrződik. A cache privát, exportban
szereplő szöveges adat; képbájtokat nem tárol.

## Migráció, mentés és visszaállítás

`023-media-analysis.up.sql` additív: csak saját táblákat, indexeket és
hozzárendelési tulajdonjogot tisztító triggereket hoz létre. Nem írja át a régi
táblák tartalmát. Meglévő, feltöltött adatbázisnál az első 023 telepítés előtt
SQLite online backup készül a kiválasztott `dataDir/backups` könyvtárba,
`before-media-analysis-<UUID>.sqlite` néven; integritás/FK-ellenőrzés hibája
megállítja az indítást. Üres új tesztadatbázisnál nincs szükség előzetes másolatra.

Az export `analysis_schema_version:1` mellett mind a hét elemzési adattáblát
tartalmazza. Hiányos elemzési export atomikusan elutasítandó; régebbi, elemzés
előtti export támogatott. Eredmények és döntések megmaradnak, függő munka
szünetel. A visszatöltés üres célkatalógust igényel.
A visszavonási tulajdonjog csak az adott döntésben ténylegesen szereplő
médiához és célazonosítóhoz tartozhat. Aktív worker/előnézet mellett a restore tiltott.

Visszalépés tesztpéldányon:

1. Állítsd le az alkalmazást, mentsd a teljes aktuális adatbázist és exportot.
2. Ha a jóváhagyások hatását is vissza akarod vonni, előbb a felületen használd
   a döntésenkénti visszavonást. Ez az eredetileg is meglévő vagy később kézzel
   átvett kapcsolatokat megőrzi; további helykapcsolatok miatt megőrzött elsődleges
   helyet konfliktusként jelent.
3. A `023-media-analysis.down.sql` tranzakcióban kizárólag az elemzési sémát
   távolítja el. Az elfogadott címke-/helykapcsolatokat szándékosan megtartja.
   A down tehát nem helyettesíti a döntések visszavonását.
4. Használd az előző binárist/commitot. Az új kód indítása újra telepítené a 023-at.
   Teljes, migráció előtti visszaállításhoz az ellenőrzött SQLite-backupból
   külön, leállított tesztpéldányt állíts helyre; ez az azóta keletkezett változásokat
   is visszalépteti. Az eredeti médiafájlok egyik műveletben sem érintettek.

## Ellenőrzés és következő lépés

A `tests/media-analysis.test.mjs` fedi a változatlanságot, kiválasztott célokat,
kétnyelvű sémát, duplikációt, bizonytalanságot, névazonos helyeket, előnézetet,
cache-t, részleges hibát, időtúllépést, késői választ, szünet/folytatás/megszakítást,
újraindítást, export/restore-t, kézi átvételt, stale védelmet, hozzáférést és
a migráció up/down körét. A szintetikus böngészős próbához:
`node tests/mobile-preview.mjs --desktop --hierarchy` (eldobható adatbázis).

Valódi vizuális pontosság, natív mobilos kezelőfelület, automatikus új
szótár-/helylétrehozás és tényleges modelladapter nincs ebben a kiadásban.
A következő fázis szolgáltató- és benchmarkválasztása előtt olvasd el a
[szolgáltatói összehasonlítást](AI_PROVIDER_COMPARISON.md). Külön jóváhagyás kell
a privát média külső továbbításához és fizetős kérésekhez; ezekre nincs automatikus
átmenet a mock tesztből.

Ellenőrzési eredmény (2026-10-30): előzetes baseline 174/174; végső teljes
regresszió 190/190 sikeres. Ebből 16 új képelemzési teszt. A véglegesített,
üres céladatbázist használó tulajdonjogi restore-próba és backup részhalmaz
18/18 sikeres. Böngészőben három szintetikus BMP valódi származékkészítése,
mock köteg, cache-találatok, két címke ellenőrzött elfogadása és visszavonása,
valamint egy képadatlapból történő előkészítés is kipróbálva. Nem történt
vizuális felismerési benchmark, natív iOS-teszt vagy éles migráció.
