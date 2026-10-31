# Karakterenkénti referenciakivágás

1. Rendeld a közös JPEG/PNG képet minden rajta szereplő karakterhez, és mentsd a hozzárendelést.
2. A kép nézetében válaszd a **Karakter referenciakivágása…** gombot.
3. Válassz karaktert és szerepet: arc, test, jellegzetes részlet vagy általános megjelenés. Húzd a kijelölés széleit/sarkait, vagy rajzolj új téglalapot a kijelölésen kívülről. A nyílbillentyűk finoman, Shift mellett nagyobb lépéssel állítanak.
4. Kattints a **Kijelölés mentése** gombra, mielőtt karaktert/szerepet váltasz. Minden hozzárendelt karakterhez és szerephez külön kijelölés tartozik.
5. Referenciává emeléshez menj vissza a képhez: **Approve as reference… → karakter és szerep → Ehhez a karakterhez és szerephez mentett kivágás**. Ellenőrizd az előnézetet, majd válaszd a **Megjelenített referencia jóváhagyása** gombot.

A kijelölés mentése önmagában nem jóváhagyás. A korábbi teljes képes referenciák teljes képesek maradnak, amíg kifejezetten másik részletet nem hagysz jóvá. Egy elfogadott kivágás későbbi szerkesztése is csak munkapéldányt módosít. Az alapértelmezett jóváhagyási választás megtartja a már elfogadott részletet; a **Teljes eredeti kép** kifejezetten visszaállítja a teljes képes referenciát.

A **Kivágás mellőzése** csak a kiválasztott szerep munkapéldányát nullázza. A teljes kép kijelölése és mentése a teljes képre mutató koordinátákat menti. A borítókép kijelölése és a régebbi **Crop picture…** fájlszerkesztő külön funkciók; az utóbbi lecseréli a fájlt, és jóváhagyott referenciákon továbbra is tiltott.

## Adatok és jóváhagyások

- `character_reference_crops`: összetett kulcs `media_id + character_id + role`, normalizált, EXIF szerint tájolt `x/y/w/h` koordináták, eredeti SHA-256, verzió és időpont. Nem jön létre új médiarekord vagy kivágott fájl. A JPEG származék igény szerint, memóriában készül.
- A kijelölés módosítása a forrás fingerprintjét és a munkapéldány verzióját ellenőrzi. Megváltozott forráshoz a régi kijelölés nem lesz automatikusan alkalmazva.
- A canon referenciabejegyzés opcionális `crop` mezője a kifejezetten jóváhagyott koordináták önálló másolata. A `sha256` továbbra is az eredeti fájl hash-e. A migráció nem írja át a meglévő canon bejegyzéseket, és meglévő katalógusnál ellenőrzött SQLite-mentés előzi meg.
- A projekt meglévő megtartási szabálya szerint a puszta referenciacsere nem hoz létre megjelenésleírás-revíziót. Ezért az összehasonlítás és a generálási validálás az azonosító mellett a teljes referenciakészletet, benne a kivágást is ellenőrzi. Régi vagy párhuzamos jóváhagyás nem írhat felül újabb kijelölést.
- A profil referencialistája, összehasonlító nézete, Sogni-választója és a plugin a jóváhagyott kivágást mutatja. Kivágás hiányában a korábbi teljes képes működés marad. Fingerprint-hibánál hiba jelenik meg; nincs csendes váltás más tartalomra.
- A generálási manifest karakterenként külön rögzíti az eredeti azonosítót/hash-t, szerepet és kivágást. A szolgáltató ezekből a jóváhagyott képrészletekből kap bemenetet. Két karakter ugyanazon eredeti képből eltérő bemenetet kaphat. A később átírt munkapéldány nem hat a tervre; megváltozott jóváhagyás érvényteleníti a még indítandó tervet.
- A kész generálások manifestjei változatlanok maradnak. A kivágások nem garantálják a szolgáltató karakterhűségét.

## API és plugin

- Asztali GET/POST: `/api/media/{media_id}/character-crops/{character_id}/{role}`. Mentés: `{crop: {x,y,w,h} | null, source_sha256, expected_version}`. Ez kizárólag munkapéldányt ment; nincs távoli crop-írási vagy automatikus canon-jóváhagyási végpont.
- Jóváhagyott asztali előnézet: `/api/characters/{character_id}/references/{media_id}/image?revision_id=...`. Csak a karakterhez tartozó, fingerprint-ellenőrzött canon bejegyzést adja.
- A plugin `get_media` metaadataiban a `character_crops` külön jelzi a munkapéldányokat. A `get_approved_references` kizárólag a canonba mentett kivágást használja; `image_quality: original` továbbra is a teljes eredeti bájtjait adja. Az `image_info` elkülöníti a forrás és a kézbesített JPEG hash-ét, méretét és transzformációját.
- A `propose_reference_update.references[]` opcionális `crop` mezője konkrét koordinátákat kér jóváhagyásra; kihagyása megőrzi a meglévő elfogadott részletet, `null` teljes eredetit kér. A privát jóváhagyólap külön jeleníti meg az előző és a javasolt részletet, és a javaslat hash-e a kivágást is védi. Trusted módban is emberi jóváhagyás szükséges.
- A meglévő referenciakészlet egy eredeti képhez karakterenként egy aktuális referenciaszerepet választ. A munkapéldányok ettől függetlenül minden szerephez külön megőrizhetők és később kiválaszthatók.

## Ellenőrzés és korlátok

`node --test tests/character-reference-crops.test.mjs` ellenőrzi a többkarakteres képet, szerepek elkülönítését, koordinátahatárokat, párhuzamos mentést, restartot, export/importot, migrációs mentést, canon-megőrzést, tényleges JPEG-kivágást, eredeti bájtok kézbesítését, privát jóváhagyást és a generálási bemenetet. Külső képgenerálás helyett helyi próbaszolgáltatót használ.

Az interaktív kivágó álló JPEG/PNG képeket támogat, legfeljebb 20 MiB / 32 megapixel méretben. A referenciaváltozat legfeljebb 2048 képpont / 3 MiB JPEG, tájolásnormalizálással és fehér átlátszósági háttérrel. Az eredeti fájl, felbontása és metaadatai megmaradnak. A kivágást a meglévő Windows-képdekóder készíti; más rendszeren nincs csendes helyettesítés.

Az export a munkapéldányokat és a jóváhagyott koordinátákat is tartalmazza; régebbi exportok az új tábla nélkül is visszaállíthatók. Visszaállításkor a koordináták validálódnak. Kód-visszaállítás előtt készíts mentést: a `021-character-reference-crops.down.sql` csak a munkapéldány-táblát törli, a canon és a generálási manifest kivágásait nem. Régi kód nem értelmezi ezeket; ezért jóváhagyott kivágások után a régi kódra visszaállás nem átlátszó művelet.
