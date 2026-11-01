# Mentett képelemzések ellenőrzése

A médiatár **AI-javaslatok** gombja az importált megfigyelések ellenőrzési sorát
nyitja meg. A **Próbaválogatás** szűrő az előkészített legfeljebb húsz képet mutatja.
A képadatlap fejlécének **AI-ellenőrzés** gombja ugyanazt a szerkesztőt nyitja meg.
Az alkalmazás `#ai-review` és `#ai-review-trial` hash-hivatkozása is használható.

## Szereplők jelölése

A P1/P2-összefoglaló külön rövid fizikai leírást is mutat. Meglévő, az adott
alakhoz rendelt szöveges ismertetőjegyből dolgozik; hiányzó jellemzőt nem talál ki.
A kijelölt alak **Rövid fizikai leírás** mezője kézzel kitölthető és javítható.
Ez a képhez és alakazonosítóhoz mentett megjegyzés, nem karakterprofil vagy kánon.
A mentés, visszavonás és katalógusexport ezt is megőrzi. Az eredeti elemzési kör
nem gyűjtött rendszeresen fizikai jellemzőket; a hiányok automatikus kitöltése
külön képelemzési feladat lenne.

A képen vagy a jobb oldali alaklistában válassz p1/p2 jelölést, majd válaszd ki
a meglévő karaktert. Az ismeretlen és a nem karakterként kezelt alak külön állapot.
A névkereső szűkíti a karakterválasztót. A már létező képszintű kapcsolatok csak
jelöltek: nem automatikus arcfelismerés eredményei.

A korábbi képszintű kapcsolatok a névválasztó első javaslatcsoportjába kerülnek.
Egyetlen látható alak és egyetlen korábbi kapcsolat esetén a név alapból kitöltött,
ellenőrizetlen javaslat. Több alakhoz nem osztunk ki neveket pusztán sorrendből.
Két alak és két korábbi név esetén az egyik név kézi kiválasztása automatikusan
a másik nevet adja a másik alakhoz. Ez P1-ről és P2-ről indulva is működik;
a választás javításakor a párja követi, így nem marad két azonos korábbi név.
Korábbi listán kívüli, külön kézzel választott karaktert és explicit ismeretlen
jelölést nem cserél le. Mentésig ez szerkesztési javaslat marad.
Az **Új karakter…** a meglévő karakterlétrehozó ablakot nyitja meg, annak
házirendjével és mezőivel. Mentés után az új karakter az aktuális alaknál lesz
kiválasztva; visszalépéskor a jelölő addigi munkája megmarad.

A régió húzható, sarka átméretezhető, számszerűen is javítható. A **Kijelölt alak
régiójának rajzolása** újrarajzolja ugyanannak az alaknak a téglalapját. Az **Új
alak kijelölése** külön, stabil u-azonosítót ad a kézzel felvett figurának. Téves
gépi észlelést kihagyottnak lehet jelölni; ettől az eredeti gépi szerep nem kerül
automatikusan egy másik emberhez.

A **Jelölések mentése** a névválasztást piszkozatként is megőrzi. Név szerinti
tevékenységszerep-kereséshez jelöld be az **A karakter-hozzárendeléseket
ellenőriztem** négyzetet, és mentsd el. A szerep és a hozzá tartozó tevékenység
címkéje külön elfogadást igényel. A régió módosítása új ellenőrzést igényel.

## Címkék ellenőrzése

A **Címkék ellenőrzése** fül csoportonként mutatja a környezetet, kompatibilis
helyszínlehetőségeket, tevékenységet, pozíciót és szerepeket, kamerát,
referenciafedezetet, képi kötöttségeket és szimulációs felhasználást.

Az egyes állítások külön elfogadhatók, javíthatók, elvethetők vagy piszkozatban
hagyhatók. Bizonytalan állítás elfogadását külön ellenőrzőnégyzet igazolja.
A gépi eredeti érték és az indoklás visszanézhető. Javításkor a magyar és angol
megnevezést is ellenőrizd. Saját további környezetet a **Helyszínlehetőség
hozzáadása** gombbal lehet felvenni, mindkét nyelvi mező kitöltésével.

Több helyszínlehetőség egyszerre megtartható. Ezek elfogadása a kép lehetséges
felhasználásának ellenőrzése, nem pontos világhely hozzárendelése. Nem jön létre
automatikusan szótári elem, rendezési döntés, karakterreferencia vagy kánonrevízió.
A semleges referenciák narrációs korlátozása és a generálási tervek planning_only
célja továbbra is érvényes.

## Mentés és folytatás

A két fül külön menthető. A felhasználó külön kérésére a **Mentés és következő**
az aktuális kép összes függő címkejavaslatát, a bizonytalanokat is beleértve,
elfogadja, valamint a kiválasztott karakter-hozzárendeléseket ellenőrzöttnek
jelöli. A kézi javításokat és a korábban elvetett címkéket megőrzi; hiányzó nevet
nem talál ki. Ezután az aktuális találati oldal következő képére lép. A **Kihagyás**
nem fogadja el a megfigyeléseket. Nem mentett módosítás elhagyásakor figyelmeztetés
jelenik meg. A legutóbbi mentés visszavonható; a visszavonás új dokumentumverzió.

A forrás SHA-256 ellenőrzése megnyitáskor és mentéskor történik. Megváltozott vagy
nem elérhető fájl korábbi elemzése megtekinthető, de nem alkalmazható automatikusan
az új képre. A megnyitás nem minősül elfogadásnak. Egy másik ablakban közben
megváltozott dokumentumot az elvárt verzió ellenőrzése védi a felülírástól.

## Tárolás, export és törlés

A 024-es, önálló sémabővítés `world_review_*` táblái az alkalmazás saját
adatbázisában tárolják az importált nyers eredményt, a deduplikált futásleírást,
az aktuális kézi dokumentumot, a minimális visszavonási adatokat és a válogatást.
Az eredeti gépi eredmény változatlan. A keresési vetület újraépíthető.

A normál katalógusexport `world_review_schema_version:1` jelöléssel ezeket is
menti. Üres katalógusba történő visszaállításuk validált, tranzakciós művelet.
A média továbbra is a meglévő médiamentés része; nincs szükség az összes
elemzési munkamásolat újabb megkettőzésére vagy modellhívásra.

A médiatárból eltávolítás adatbázistriggerrel törli az adott kép megfigyeléseit,
döntéseit és próbaválogatásbeli helyét. A tombstone megakadályozza a korábbi
elemzések véletlen újraimportálását. A külön régi elemzési munkamappa törléskövető
folyamata a saját másolatait továbbra is külön kezeli. Régebbi offline mentések
önálló pillanatfelvételek.

## Import és fejlesztői ellenőrzés

Az `app/import-world-review.mjs` helyi operátori eszköz. `--preview` módban
a tulajdonos adatbázisát csak olvassa, és külön SQLite-másolaton készít előnézetet.
`--apply` pontos tervhashhez, céladatbázishoz és előnézethashhez kötött átvétel;
előtte ellenőrzött mentés készül. A `--trial` legfeljebb húsz képet választ
meglévő katalóguskapcsolatokból, személyfelismerés nélkül. A riport és a forrás
futási mappa a szinkronizált projektfán kívül maradjon.

A `/api/world-review` végpontok az alkalmazás meglévő loopback/origin védelmén
belül működnek; mentéshez külön, futásonként cserélődő CSRF-token kell.
Nincs HTTP-importvégpont vagy modellhívás. A `/search` ellenőrzött személy–alak
kapcsolatot, elfogadott tevékenységet és elfogadott szerepet követel név szerinti
szerepkereséshez; a találatok képforrását is ellenőrzi. Ez a helyi szolgáltatás
alapja, nem automatikusan új MCP-eszköz vagy teljes világszimuláció.

A `tests/private-world-review-ui.mjs` külön szintetikus felületet indít;
`tests/world-review-browser-check.mjs` csak ilyen, ellenőrzött tesztadatokra
enged kattintásos mentést. A teszt ellenőrzi a tényleges CSP melletti rajzolást,
mozgatást, saját helyszínlehetőséget és a mobilnézetet. Privát képek nem kerülnek
tesztkimenetbe vagy képernyőképbe.
