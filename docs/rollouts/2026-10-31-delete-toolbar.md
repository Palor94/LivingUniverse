# Éles telepítés: Media Library Törlés gomb

2026-10-31. A felhasználó külön engedélyezte az éles kódfrissítést és újraindítást.

A tényleges szolgáltatás a médiagyökér `00_SYSTEM/project` kódját indítja az
`app/start-existing.mjs` belépőponttal. Nem a külön fejlesztési checkoutot használja.
Az éles forrás alapja `9c1afcd` volt, további helyi, még nem commitolt karakter- és
kánonvédelmi változtatásokkal. Ezeket megőriztük; teljes ág-/könyvtárcsere és
mainbe merge nem történt.

Külön tesztmásolatban, az aktuális éles forrás fölött készült a célzott integráció.
Hat meglévő kódfájlt módosít: server, client, sorting, style, media-imports és
media-uploads; két új modul a backend és frontend `permanent-media-delete`.
Az éles példányon nem lett bekapcsolva a külön 021–023-as fejlesztési fázis.
A törlőmodul ezért a még nem létező opcionális hashtag-/képelemzési táblák nélkül
is működik; az idegenkulcsok előzetes ellenőrzése változatlanul kötelező.

Ellenőrzések:

- Éles alaphoz illesztett teljes tesztkör: 171 sikeres, 0 hibás; 1 teszt kimaradt,
  mert a külön opcionális képelemzés nincs ebben az éles változatban.
- Frissebb fejlesztési sémán: mind a 12 végleges-törlési teszt sikeres.
- Mentés az újraindítás előtt és közvetlenül a leállított állapotban is; a
  mentett SQLite-on integrity_check és foreign_key_check sikeres.
- Mind a 17 ellenőrzött fő adattábla sorainak SHA-256 lenyomata azonos maradt.
  Összesen 67 karakterrekord és 2570 médiarekord maradt meg. A felület az aktív
  rekordok részhalmazát mutathatja; ez nem adatvesztés.
- Az éles szerver már az új kliens-, eszköztár- és törlési modult szolgálja ki.
  Egy meglévő kanonikus referencia csak olvasott védettségi lekérdezése sikeres.
- Böngészőben a Media Library saját felső eszköztárában látható a Törlés gomb;
  kijelölés nélkül letiltott. Éles törlési POST nem történt.

Az indítás a meglévő `Living Universe catalogue runtime` ütemezett feladattal
történt; annak beállításait, a konfigurációkat és a titkokat nem változtattuk.
SQL-migráció nem kellett. Az eredeti médiafájlokhoz nem nyúltunk.

A privát mentési csomag a desktop-katalógus `backups` könyvtárában,
`before-delete-button-2026-10-31T06-15-25-320Z-7fa72bfd` néven található.
Tartalmazza a régi kódot, a pontos telepített kódot, az adatbázis-pillanatképeket,
a hash-manifesztet és a sikeres éles ellenőrzés eredményét. Ezek nincsenek Gitben.
Kódvisszalépéskor a meglévő szolgáltatást le kell állítani és csak a manifesztben
felsorolt fájlokat visszaállítani. Adatbázis-visszaállítást nem végzünk automatikusan,
mert az azóta történt felhasználói változtatásokat is visszaléptetné.

## Többes kijelölés bővítése

A felhasználó utólag több kijelölt kép egykattintásos törlését kérte,
kifejezetten tesztfuttatás nélkül. A felület a kattintáskori kijelölt képeken
halad végig sorban, a meglévő egyképes backendművelettel. A kanonikus referenciák
kimaradnak; külön számlálót kap a siker, a védett kihagyás és a hiba. A videókra
nem terjed ki. Egy sikertelen kép nem állítja le a többi kijelölt kép feldolgozását.

A futó példányon csak három frontendfájl frissült: `permanent-media-delete.js`,
a `client.js` modulimportja és az `index.html` klienslinkje. A két link új verziót
kapott a böngésző régi modulcache-ének elkerülésére. A backend, az adatbázis és
a médiafájlok nem módosultak; nem kellett szolgáltatást újraindítani.

Mentés: `before-bulk-delete-2026-10-31T06-29-24-836Z` a desktop-katalógus helyi
`backups` könyvtárában. Tartalma a három korábbi forrásfájl és a régi/telepített
hash-manifeszt. A telepítés előtti forrásváltozás-védelem megmaradt; ez nem
funkcionális teszt vagy próbatörlés. A felhasználó kérésére ehhez a bővítéshez
nem futott automatizált vagy böngészős teszt, illetve éles törlés sem történt.
A fenti korábbi teszteredmények az egyképes előzményre vonatkoznak.

Visszaállítás: kizárólag a mentett három frontendfájlt kell visszamásolni, majd
a böngészőt teljesen frissíteni; ehhez adatbázis-visszaállítás nem szükséges.
