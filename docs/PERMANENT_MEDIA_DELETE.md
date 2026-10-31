# Egykattintásos végleges médiatörlés

2026-10-31. Fejlesztési ág: `codex/permanent-media-delete`. A funkció
frontend- és backendváltoztatás; nem MCP-/ChatGPT-plugin-törlési művelet.
Az eredeti egyképes funkció tesztjei és böngészős próbája csak eldobható
tesztadatokon futottak. A többes kijelölés későbbi módosításához a felhasználó
kérésére nem futtattunk teszteket.

## Kezelés

A **Törlés** gomb mindig látható a desktop alkalmazás felső sávjában, görgetés
közben is. A Media Library saját felső kijelölési eszköztárában, a Clear selection
mellett is van Törlés gomb. A médiatárban egy vagy több kijelölt képre működik. A megnyitott kép
felső, görgetéskor is elérhető eszköztárán külön Törlés gomb jelenik meg.
Videókra nem működik. A jóváhagyott referenciák többes kijelölésnél kimaradnak;
ha csak ilyen képek vannak kijelölve, a gomb letiltott.

Több kép esetén a kattintáskori kijelölt képek rögzített listáján haladunk végig,
egyesével a meglévő védett szerveroldali művelettel. Csak az aktuális oldalon
kijelölt képek tartoznak bele; közben újonnan kijelölt kép nem kerül a sorba.
A gomb mutatja az előrehaladást, és futás közben nem indítható újra.
A végén külön számláló jelzi a teljesen törölt, védettként kihagyott és sikertelen
képeket. A hibák nem állítják le a további kijelölt képek feldolgozását.
A sikertelen tételeket nem tekintjük töröltnek; a szerver teljes nyugtája szükséges
minden egyes képhez. Az aktuális felület betöltését verziózott modullink biztosítja.

Egy kattintás azonnal indítja a végleges törlést, további megerősítő ablak nélkül.
A gomb súgója jelzi, hogy eredeti fájlt, előnézeteket és minden hozzárendelést
töröl. Ez nem az eddigi **Remove…** művelet: az továbbra is a külön, visszaállítható
eltávolítási folyamat. A végleges törlésnek nincs alkalmazáson belüli Undo vagy
Removed items / Restore lehetősége.

## Törlési hatókör és védelem

- Eltűnik maga a médiarekord, minden karakter-hozzárendelés, médiához tartozó
  jegyzet, review, címkekapcsolat, helyszínkapcsolat és rendezési állapot.
- A közös címkeszótár, helyszínfa, karakterek és más képek megmaradnak.
- Tisztulnak a borító- és képkocka-előnézetek, vágási kapcsolatok, ujjlenyomatok,
  rendezési javaslatok és a kiválasztott kép elemzési eredményei. Más képekkel
  közös elemzési döntésekből csak az adott kép műveletei kerülnek ki; a többiek
  visszavonása és export/visszatöltése működőképes marad.
- Törlődnek az eredeti útvonalán levő képfájl és az alkalmazás által azonosítható
  privát másolatok: importált JPEG-előnézet, vágás előtti eredeti, képszerkesztési
  maradványok, generált kimenet helyi helyreállítási fájlja és feltöltési részletek.
  Más médiához tartozó közös előnézetet/cache-t nem törlünk.
- A korábbi import-/feltöltési nyugták `erased` állapotba kerülnek, média-ID nélkül;
  ugyanannak a feltöltésnek a megismétlése nem állíthatja vissza a törölt képet.
  Egy későbbi, kifejezetten új import külön művelet marad.
- Generálási kimenetnél megszűnik az aktív kimeneti kapcsolat; a run `withdrawn`
  lesz. A végrehajtott generálás történeti manifestje és szöveges eredetadata nem
  íródik át új történetté, de a helyi képbájtokat tartalmazó recovery-fájl törlődik.
- Ha a kép bármely jóváhagyott kanonikus revízió referencialistájában szerepel,
  a backend a fájlművelet előtt elutasítja a törlést. Referenciát előbb külön,
  a meglévő jóváhagyási folyamatban kell eltávolítani. A végleges törlés nem ír
  át kanonikus revíziót. Érintett függő referenciajavaslat érvénytelenedik.

OneDrive alatt ugyanazt az eredeti, helyi szinkronizált fájlt töröljük, nem csak
a katalógusbejegyzést. A helyi fájl hiányát ellenőrizzük. A OneDrive távoli
szinkronizálási állapotához nincs új API-integráció: a válasz mindig
`cloud_sync_verified:false`, OneDrive-útvonalnál a sikerüzenet is megkülönbözteti
a helyi törlést a később futó felhős szinkrontól. A szolgáltató lomtárát/verzióit,
korábbi külön mentéseket és alkalmazáson kívüli másolatokat nem ürítjük.

## Backend és hibakezelés

`app/permanent-media-delete.mjs` szolgálja ki a kizárólag desktop oldali
`GET/POST /api/media/<UUID>/permanent-delete` végpontot. A GET csak a kiválasztott
rekord verzióját, védelmét és folyamatonkénti CSRF-adatot adja. A POST az aktuális
rekordverzióhoz, saját Originhez és `X-LU-Delete-CSRF` fejléchez kötött. Nincs
mobil vagy MCP végleges törlési jogosultság.

A fájlútvonalakat szerveroldali rekordokból állítjuk össze, nem a kliens küldi
őket. Tiltott az útvonalkilépés, szimbolikus link/junction, alkalmazáskönyvtár,
közösen hivatkozott fájlútvonal és befejezetlen fájlmozgatás. Csak egyenként
ellenőrzött szabályos fájlt törlünk; nincs rekurzív könyvtártörlés.

Minden ismert fájl és adatbázis-kapcsolat ellenőrzése megelőzi az első unlinket.
Az SQL-takarítást előbb visszagörgetett savepointban próbáljuk ki; egy új,
ismeretlen idegenkulcs-kapcsolat így még fájltörlés előtt megállítja a műveletet.
Futó import, elemzés, generálás, scan vagy mozgatás mellett nem indul törlés.
Törlés közben az új módosító kérések blokkoltak, így új referenciajóváhagyás
sem kerülhet a kanonikus védelem ellenőrzése és a fájltörlés közé.
A már korábban elkezdett, még hash-t számoló referencia-jóváhagyás közvetlenül
az SQL-commit előtt újra ellenőrzi a fájlműveleti zárat és az aktív kép/karakter
hozzárendelését; törölt képet késői jóváhagyás sem tehet kanonikussá.

A fájlrendszer és SQLite nem egy közös tranzakció. Emiatt tartós törlési napló
készül az `application_settings` táblában, `permanent-delete:<media_id>` kulccsal.
Előbb a származékok, végül az eredeti törlődik. Az egyes fájlok azonosságát
és törlés utáni hiányát is ellenőrizzük. Újra létrejött vagy megváltozott fájlt
nem törlünk a régi kérés alapján.

Az adatbázisrekord és kapcsolatai csak az összes fájllépés után, egy SQL-
tranzakcióban törlődnek. Fájlhiba vagy későbbi adatbázishiba esetén
`ok:false, complete:false` válasz és hibaüzenet érkezik; nincs sikeres teljes
törlés jelzés. A médiarekord megmarad, a napló rögzíti az előrehaladást. Lehet,
hogy néhány fájl már hiányzik: ezt a `partial` jelzi. Újraindításkor semmi nem
törlődik automatikusan; a felhasználó külön új kattintással próbálhatja újra.
Megváltozott rekord/fájl esetén előbb kézi rendezés szükséges.

Siker után csak minimális, képbájt és fájlútvonal nélküli nyugta marad a
megismételt kérés biztonságos felismerésére. Nem marad rejtett médiarekord.

## Migráció, mentés, tesztek

Új SQL-migráció nem szükséges: az állapot a már exportált/visszatölthető
`application_settings` táblába kerül. Telepítés vagy indulás nem indít törlést.
Kódvisszalépéssel a gomb és az endpoint eltávolítható, a már végleg törölt
eredeti fájl ettől nem áll vissza. Régi külön mentés visszaállítása csak tudatos
helyreállítási műveletként lehetséges; a törlés nem készít új, elrejtett fájlmentést.

Az automatizált tesztek helye: `tests/permanent-media-delete.test.mjs`.
Fedi a többkarakteres takarítást, kanonikus védelmet, jogosultságot, verziót,
fájlrendszerhibát, adatbázishibát, explicit újrapróbálást, újraindítást,
útvonal-/junction-védelmet, félidőben lecserélt fájlt, párhuzamos kéréseket,
származékokat, import-visszahozás tiltását, más képek elemzési döntéseit és
az export/restore konzisztenciáját. A UI-segéd tesztje ellenőrzi az egyetlen
kijelölt ID-t és a teljes, megfelelő szervernyugta megkövetelését.

Böngészős fixture: `node tests/mobile-preview.mjs --desktop --hierarchy --delete`.
Három eldobható szintetikus BMP-t hoz létre; a harmadik kanonikus védelem alatt
áll. Az első kép egykattintásos törlését és a megmaradt referencia védelmét
ezen a példányon ellenőriztük, éles adatok nélkül.

Az eredeti egyképes változat ellenőrzése: a teljes regressziós futás 202/202 sikeres tesztet tartalmazott,
köztük 12 új végleges-törlési tesztet. A böngészős próba igazolta az egyetlen
kattintást, a megerősítő ablak hiányát, az eltűnő tesztképet, a megmaradó
referencia védelmét és a felső gomb elérhetőségét a galériában/képnézetben.

A 2026-10-31-i többes kijelölési bővítésre ezek a korábbi eredmények nem
vonatkoznak: a felhasználó kifejezett kérésére nem futott új automatizált vagy
böngészős teszt, és éles médiát sem töröltünk fejlesztési ellenőrzésként.
