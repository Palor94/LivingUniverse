# Karakterenkénti referenciakivágás · egykattintásos jóváhagyás

## Használat

1. Nyisd meg a közös képet, majd kattints a **Karakter referenciakivágása…** gombra.
2. Válassz karaktert és szerepet: face, body, detail vagy general. A kiválasztott karakter még hozzárendelés nélkül is megadható.
3. Jelöld ki a részletet. A szélek/sarkok húzhatók; a nyilak finoman, Shift mellett nagyobb lépéssel állítanak.
4. Kattints a **Kijelölés mentése** gombra. Ez a kattintás egyúttal az új referencia kifejezett adminisztrátori jóváhagyása. Nincs további jóváhagyási ablak.

A mentés automatikusan hozzáadja a kép–karakter kapcsolatot, ha az még hiányzott, és új, approved státuszú referenciát készít a kiválasztott szereppel. Azonnal megjelenik a kivágó alatti **A karakter jóváhagyott referenciái** listában, a karakter Approved identity lapján és a generálási választóban. A korábbi teljes képes referencia, ugyanazon kép korábbi kivágásai és a többi karakter referenciái is megmaradnak.

Az eredeti képfájl nem változik és nem keletkezik új médiafájl. A kivágott JPEG igény szerint, memóriában készül az eredetiből. Meglévő munkapéldányok vagy referenciák telepítéskor nem válnak automatikusan újonnan jóváhagyott kivágássá.

## Visszavonás és verziótörténet

A kiválasztott karakter/szerep **Kivágások verziótörténete** részében a **Jóváhagyás visszavonása** gomb az adott mentéssel hozzáadott referenciát veszi ki az aktuális készletből. Más, akár később hozzáadott referencia megmarad. A visszavonás új canon-revíziót és külön, dátummal és adminisztrátorral azonosított történeti bejegyzést készít; nem írja át az eredeti jóváhagyási bejegyzést.

Ha a kijelölés munkapéldánya azóta nem változott, az is visszaáll a mentés előtti állapotra, új munkapéldány-verzióval. Újabb szerkesztést a visszavonás nem ír felül. A média eredetije és galériabeli karakterkapcsolata megmarad. Korábban végrehajtott generálások manifestje nem változik.

## Jogosultság

Az egykattintásos út kizárólag a meglévő Tailscale Serve privát HTTPS kapcsolaton működik. A szerver ellenőrzi a konfigurált adminisztrátor Tailscale-azonosságát, az engedélyezett származást és a munkamenet CSRF-tokenjét. Az asztali felület megnyitáskor automatikusan ellenőrzi ezt a munkamenetet. Tailscale vagy jogosult adminisztrátori munkamenet nélkül a mentés letiltva marad; nincs hitelesítés nélküli tartalék jóváhagyás.

A szűk CORS-kivétel kizárólag az aktuális helyi asztali alkalmazás pontos eredetére és az adminisztrátori crop-végpontokra vonatkozik. Nem változtatja meg a többi mobil/MCP művelet jogosultságát. A ChatGPT/Grok propose_reference_update út továbbra is külön emberi jóváhagyást igényel, trusted módban is.

## Backend és adatok

- A character_reference_crops tábla továbbra is media_id + character_id + role alapján tárolja az utoljára szerkesztett koordinátákat, a forrás SHA-256-át és a munkapéldány verzióját.
- Minden hozzáadott jóváhagyás saját reference_id azonosítót kap. Ez lehetővé teszi több, azonos eredetiből származó, akár azonos szerepű kivágás egyidejű megőrzését. A canon bejegyzés pontos koordinátamásolatot, eredeti fingerprintet, approved státuszt, jóváhagyási időpontot/adminisztrátort és approval_id hivatkozást tárol.
- A character_crop_approvals tábla őrzi a kérésazonosítót és hash-t, a képrészletet, az előző munkapéldányt, a canon-revíziót, az adminisztrátort, valamint a jóváhagyás/visszavonás kapcsolatát.
- A társítás, munkapéldány, canon-revízió és jóváhagyási napló **egy SQLite-tranzakcióban** mentődik. Hiba esetén mind visszagördül. A munkapéldány- és canon-verzió ellenőrzése megakadályozza a párhuzamos módosítás felülírását. A request_id azonos tartalmú ismétlése ugyanazt az eredményt adja, új referencia nélkül.
- A 023-as migráció előtt a meglévő katalógusról ellenőrzött online mentés készül. A telepítés nem módosít meglévő jóváhagyást. A mentések az új naplót és az összes reference_id hivatkozást is tartalmazzák; visszaállításkor ezek validálódnak.

Az adminisztrátori API a privát listeneren: GET /api/admin/reference-crops/session; GET /api/admin/reference-crops/{media_id}/{character_id}/{role}; PUT ugyanott /approve vagy /undo. A mentési kérés request_id, crop, source_sha256, expected_version és expected_canon_version mezőket tartalmaz. A visszavonás request_id, approval_id és expected_canon_version mezőket kér. A jogosultságot és a jóváhagyó nevét a szerver állapítja meg, nem a kérés.

A régi asztali character-crops POST csak munkapéldányt menthet; nem ad approved státuszt. A Kijelölés mentése gomb az új hitelesített API-t használja. A borítókép-kivágás és a fájlt lecserélő régi Crop picture… eszköz külön funkció marad.

## Plugin és képgenerálás

A get_approved_references a canonból olvassa a referenciákat. Ha egy eredetihez több jóváhagyott képrészlet tartozik, a reference_id választja ki a pontosat; egyértelmű role-szűrés is használható. Több találat esetén nincs önkényes kiválasztás. image_quality:original továbbra is a teljes eredeti bájtjait adja, ugyanazzal a fingerprint-ellenőrzéssel.

A generálás reference_ids mezőjében a reference_id szerepel, ha van; régi referenciánál a media_id marad használható. A manifest minden bemenethez rögzíti a referencia- és médiaazonosítót, a jóváhagyott koordinátákat és az eredeti fingerprintet. A szolgáltató a kiválasztott jóváhagyott képrészletet kapja. Arc és test ugyanabból az eredetiből is külön választható. A visszavonás vagy canon-változás érvényteleníti a még indítandó régi tervet; a kész manifest megmarad. A kivágás nem garantálja egy generátor karakterhűségét.

## Korlátok és ellenőrzés

Álló JPEG/PNG források, legfeljebb 20 MiB / 32 megapixel; EXIF szerint tájolt, normalizált x/y/w/h koordináták. A referenciaváltozat legfeljebb 2048 képpont / 3 MiB JPEG. A régi más formátumú teljes képes referenciák továbbra is olvashatók.

Teszt: node --test tests/crop-oneclick-approval.test.mjs. Ez ellenőrzi a jogosultságokat, pontos CORS/CSRF-szabályokat, automatikus társítást, hozzáadást ugyanahhoz a képhez, valódi approved állapotot, hibánál teljes rollbacket, párhuzamos/idempotens mentést, visszavonást, export/restore-t és a ténylegesen továbbított kivágásokat helyi próbaszolgáltatóval. A böngészős teszt külön mesterséges katalógust és kifejezetten tesztcélú azonosítási proxyt használ. Nincs fizetős generálás.

Az új jóváhagyási naplót régi kódra váltáskor nem szabad önmagában törölni. Teljes, kompatibilis mentésből kell helyreállítani a canon- és történeti adatokat együtt.
