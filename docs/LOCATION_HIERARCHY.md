# Hierarchikus helyszínek — működés és visszaállítás

Fejlesztési változat, 2026-10-30. A fejlesztés külön Git-ágon, kizárólag ideiglenes
adatbázisokkal és mesterséges médiafájlokkal történt. Éles adatbázist nem nyitottunk
meg és nem migráltunk; eredeti médiát nem módosítottunk. A változat nincs élesítve.

## Felület

A **Locations / Helyszínek** menüpont most a katalógus tényleges helyszínfáját
mutatja. A nyilakkal kinyithatók és bezárhatók az ágak; van teljes ágnyitás,
bezárás és magyar/angol keresés. A keresés a találat szülőit is megmutatja.
Billentyűzettel a fel/le nyíl a látható helyek között lép, a jobbra/balra nyíl
megnyitja vagy bezárja az ágat, illetve a szülőre lép.

A **Helyszín hozzáadása** név és szülő alapján hoz létre új UUID-t. Például két
külön hely lehet **Fenyves / Strand** és **Kőváros / Strand**. Ugyanazon szülő
alatt azonos normalizált név nem hozható létre; a gyökérszint is külön névtér.
A magyar ékezetek számítanak, az NFC és a magyar kis-/nagybetűzés egységesített.
Az angol megfelelő opcionális; ismeretlen értéket nem találunk ki.

Egy kiválasztott helyen az **Új gyermekhelyszín** előre kiválasztja a szülőt.
Áthelyezéshez módosítsd a **Szülőhelyszín** mezőt, majd a Mentés után ellenőrizd
az előnézetet. Az **Áthelyezés és mentés** az egész ágat ugyanazokkal az
azonosítókkal helyezi át. Saját maga/leszármazottja alá helyezés, kör, hiányzó
szülő, 128 szintnél mélyebb fa és testvérnév-ütközés nem menthető el.

Az átnevezések és áthelyezések visszavonhatók közvetlenül mentés után, valamint
a **Legutóbbi helyszínmódosítások** listájából. A visszavonás új naplóbejegyzés;
nem ír felül későbbi változást, és nem töröl létrehozott helyszínt. A lista az
utolsó 100 műveletet mutatja; a teljes előzmény az adatbázisban és exportban marad.

A **Külön tervvászon** továbbra is önálló tervezési felület. A régi vászonterv,
jóváhagyott tervverzió, típus vagy gyűjtemény nem kerül automatikusan a tényleges
katalógusba. Megnyitása nem migráció vagy kánonjóváhagyás.

## Háttérhelyszín és képrendezés

A pontos háttérhelyszín (`media_locations`, `media_location_links`) külön adat a
kép helyszínreferencia-besorolásától (`media_roles`). Háttérhelyszín hozzárendelése:

- nem állítja át a képet helyszínreferenciává;
- nem veszi ki a karakterképet a rendezendő képek közül;
- nem módosítja a rendezés kész/nem kész állapotát;
- nem változtat karakterhozzárendelést, profilt, kánont, jegyzetet vagy értékelést;
- nem hoz létre mappát és nem mozgat eredeti fájlt.

A helyszínreferencia-gyűjteményhez tartozást külön jelölőnégyzet szabályozza.
Kikapcsolása megőrzi a háttérhelyszíneket. A háttérhelyszín eltávolítása külön,
üres helyszínválasztással történik. A **Finish sorting** és **Save for later**
továbbra is explicit képrendezési műveletek; önálló szándékot jelentenek.

A már meglévő helyszínreferencia-besorolásokat a migráció nem értelmezi át.
Megmaradnak az elsődleges és további média-hozzárendelések. Régi, egy helyet
szerkesztő mobilkliens az elsődleges hely megtartásakor megőrzi a másodlagosakat.

Új faelemekhez nem szükséges strukturált címkét létrehozni. A régi hely/címke
kapcsolatok megmaradnak. Egy régi címke csak akkor követi az átnevezést, ha ez
egyértelmű és nem okoz címkeütközést; egyébként változatlan marad. A jegyzetek
hashtagjei továbbra sem rendelnek pontos világhelyszínt egy képhez.

## Adatmodell és API

A **022-location-hierarchy** migráció megtartja a `locations` táblát és minden
régi UUID-jét, hozzáadja a `parent_id` mezőt, és a globális névegyediséget két
részleges indexre cseréli: gyökérnév és `(parent_id, name_key)` testvérnév.
Az indexek a null szülőt is helyesen kezelik.

A korábbi tervhez képest a már létező `location_profiles` táblában maradnak az
angol nevek, típusok és leírások. Nem szükséges ezeket újabb mezőkbe másolni.
A szülőkapcsolat forrása a `locations.parent_id`; a régi profil-szülőmezőt
triggerek tartják összhangban a kompatibilis olvasáshoz/restore-hoz. Az új és régi
értékek eltérését a restore és az integritásellenőrzés elutasítja.

Új táblák: `location_schema` (helyszínséma 2), `location_changes` (előzmények,
ismétlésvédelmi kulcsok, előtte/utána állapotok, visszavonási kapcsolatok).
A globális SQLite `user_version` helyett önálló verziójelző biztosítja, hogy a
migráció csak egyszer fusson le. A szerkezeti váltás táblarebuild, nem kizárólag
hozzáadó migráció; meglévő adatot nem nevez át, nem egyesít és nem töröl.

| API | Jelentés |
| --- | --- |
| `GET /api/location-tree` | Tényleges helyek, UUID-k, szülők, angol nevek, útvonalak, faverzió, utolsó 100 naplóbejegyzés. Asztali végpont. |
| `GET /api/location-editor` | Szerkesztési lista, faverzió, előzmények; a még nem helyszínként kezelt régi környezeti címkék külön jelöltek. |
| `PUT /api/location-editor` | Új hely: `name`, explicit `parent_id` (vagy null), opcionális `english_name`, `category`, `description`, `request_key`, `expected_tree_version`. |
| `GET/PUT /api/location-editor/:id` | Részletes adat és verzióellenőrzött mezőmentés; szülőváltással ágáthelyezés. |
| `PUT /api/location-editor/undo` | `change_id`, `expected_tree_version`; ütközésvédett visszavonás asztalon és hitelesített mobilon. |
| `POST /api/location-tree/undo` | Az asztali visszavonás megfelelője. |
| `POST /api/locations/assign` | Meglévő médiák háttérhelyszíne; besorolást csak explicit `location_reference` változtat. |

Az útvonal megjelenítési adat, nem azonosító. Egy hely átnevezése/áthelyezése után
a képek és események ugyanarra az UUID-re mutatnak. Az új létrehozási kérések
azonos `request_key` + változatlan tartalom mellett ugyanazt a helyet adják vissza.
Azonos kulcs eltérő tartalommal ütközés. A régi, csak nevet küldő kliensek
gyökérszintű kompatibilitási útja megmarad; az új fa mindig explicit szülőt küld.

MCP médiametaadatokban a háttérhelyszínek UUID-je, magyar neve, angol megfelelője,
szülője és teljes útvonala is megjelenik. Nincs új AI-hívás, képfeltöltés vagy
automatikus helyszínfelismerés. Adminisztrátori jegyzetet nem adunk át.

## Mentés, migráció és visszaállíthatóság

Meglévő helyszínadatbázis első frissítése előtt a migráció online SQLite-mentést
készít a konfigurált, OneDrive-on kívüli adatmappa `backups` könyvtárába:
`before-location-hierarchy-<uuid>.sqlite`. Az `integrity_check` és
`foreign_key_check` eredményét is ellenőrzi. Vadonatúj, üres katalógus nem kap
felesleges migráció előtti mentést.

A rebuild egy kizáró tranzakcióban történik. Az idegen kulcsok kezelése a
tranzakción kívül vált át, és hiba esetén is visszakapcsol. Az új tábla felépítése
után a régi oszlopokat/rekordokat és a meglévő profilokat bájtpontos JSON-sorrendben
összehasonlítja, majd fa-, idegenkulcs- és SQLite-integritásellenőrzést végez.
Hiba esetén az egész rebuild visszagördül. Éles frissítés előtt minden írót le
kell állítani; a mostani fejlesztés nem hajtott végre ilyen éles frissítést.

A logikai export továbbra is `schema_version:1`, kiegészítve
`location_schema_version:2` mezővel, szülőazonosítókkal és a teljes műveleti
naplóval. Új exportból a helyszínrész nem hiányozhat. A régi export szülőit a
meglévő profiladatokból állítja vissza. A szülő/gyermek sorok eltérő sorrendje
támogatott. A restore üres katalógust igényel, és akkor is elutasítja a felülírást,
ha még csak helyszínek vannak benne. Sérült, körkörös vagy ellentmondó helyszínadat
esetén a teljes restore tranzakció visszagördül.

Séma-visszalépést csak a `rollbackLocationHierarchy(db, dataDir)` segéddel,
leállított alkalmazás és előzetes export mellett szabad végezni. Ez is ellenőrzött
mentést készít (`before-location-hierarchy-rollback-<uuid>.sqlite`). Megőrzi a régi
UUID-ket, média- és eseménykapcsolatokat, valamint a profilokban a szülőket.
Az up/down SQL-fájlokat ne futtasd közvetlenül a segéd előellenőrzése nélkül.

Azonos nevű helyek különböző szülők alatt nem férnek bele a régi globálisan egyedi
sémába. Megőrzendő műveleti előzményeket sem törlünk a visszalépés kedvéért.
Ilyenkor a segéd biztonságosan megtagadja a downgrade-et. Használj kompatibilis
kódot és műveletenkénti visszavonást; régi teljes mentés visszatöltése csak akkor
megfelelő, ha az újabb adatok nem vesznének el. Sem automatikus átnevezés, sem
helyszínegyesítés vagy adateldobás nem történik.

## Ellenőrzések és korlátok

Az előző fázis 161 tesztje a munka kezdetén sikeres volt. Az új regressziós
tesztek lefedik a névtereket, stabil UUID-ket, kör-/mélységvédelmet, áthelyezést,
visszavonást, mobilhitelesítést, karakterképek besorolásának megőrzését,
elsődleges/másodlagos médiakapcsolatokat, régi/új exportot, hibás migráció
visszagördítését, mentéseket, eseményhivatkozásokat és AI-kompatibilis olvasást.
A végső teljes futás: **174 sikeres teszt, 0 hiba**, ebből 13 új hierarchiateszt.

A böngészős ellenőrzés mesterséges adatokkal igazolta az ágnyitást, a két
különböző Strandot, az áthelyezés előnézetét/mentését/visszavonását és új gyermek
létrehozását. Natív iOS/Safari és nagyméretű, valós katalógus teljesítménye nem
volt tesztelve. A fa jelenlegi szerkesztési határa 5000 konkrét hely és 128 szint;
csonkolt fát nem engedünk szerkeszteni. Törlés, utazási gráf és a tervvászon
jóváhagyott elemeinek katalógusba emelése külön jövőbeli funkció.

Következő fázis: [AI-képelemzés, helyszínjelöltek és címkejavaslatok](AI_MEDIA_ANALYSIS_PLAN.md).
