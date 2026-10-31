# Teljes karakterátnevezés · MCP v2

A névváltoztatás egy művelet: elsődleges karakter-név, magyar névalakokat
tartalmazó egyértelmű munkaszövegek, korábbi név aliasként, valamint az ID-hoz
rendelt OneDrive-karaktermappa és katalógusbeli fájlútvonalai együtt változnak.
A karakter-, média-, kapcsolat- és kánon-ID-k megmaradnak.

## Használat

Kifejezett felhasználói átnevezési kérésre a meglévő trusted módban:

```json
{"request_key":"egyedi-keres-azonosito","character_id":"a-meglevo-karakter-UUID-ja","new_name":"Ábel"}
```

Ezt a `rename_character` fogadja. Az alapértelmezett `preview_only:false` elvégzi
az egész műveletet. Nincs külön névmező- vagy mappaeszköz kérése, és nincs második
kötelező jóváhagyási oldal trusted módban. `preview_only:true`, illetve review
mód esetén előnézet készül. Kétes vagy másik személyre utaló írható találatnál
semmilyen név/mappa/szöveg részmentés nem történik: a pontos kijelölést kell
ellenőrizni. A `get_character_rename` lapozva olvassa a tervet; a teljes magyarázó
szöveg/adminjegyzet a privát oldalon látszik. A trusted
`apply_approved_character_rename` az exact plan_hash és opcionális selected_ids /
confirmed_ids alapján ment, review módban a privát oldalon kell dönteni.

Az `undo_character_rename` ugyanígy egyben fordítja vissza a név-, szöveg- és
mappamódosítást. `preview_only:true` visszavonási előnézetet kér. Az érintett
rekord későbbi szerkesztését nem írja felül. Ha az átnevezéskor még nem létezett
karaktermappa, az undo megőrzi a létrejött gyűjteménymappát és a régi névre nevezi
vissza; nem töröl benne időközben keletkezett fájlokat.

Ha nincs külön karaktermappa, létrejön az új névvel és a meglévő karakter-ID
tulajdonosi kapcsolatával. A közös médiatár eredetijei megmaradnak közös helyükön;
a hozzárendelésük az ID révén az új nevet mutatja. Meglévő, ID-val nem igazolt
idegen mappát nem sajátítunk ki. Másik karakter által birtokolt vagy már foglalt
célmappa, több külön forrásmappa, szimbolikus link és veszélyes Windows-név blokkol.
Nincs felülírás, rejtett mappaösszevonás vagy új karakter létrehozása.

## Biztonság és helyreállítás

A rendszer újrahasználja a `rename:v1:*` tartós terveket és auditot. A teljes
tervhash a szövegtervhez és a mappaleltárhoz együtt kötött. Mentés előtt ellenőrzött
SQLite online backup készül az aktív adatkönyvtár `backups` mappájában. A fájlok
tartalma nem változik; egy teljes könyvtár kerül átnevezésre, az összes benne levő
katalóguson kívüli fájllal együtt.

Az adatbázison belüli változások egy IMMEDIATE tranzakcióban mentődnek. A fájlrendszer
és a SQLite nem alkot közös tranzakciót: ezért a könyvtárátnevezés minden fázisát
előre tartós `folder_changes` napló rögzíti. Adatbázishibánál a mappa visszaáll,
a szöveg/név/útvonal módosítás visszagördül. Összeomlás utáni azonos kérésből a
napló és az aktuális leltár alapján biztonságosan helyreáll a félbemaradt lépés,
majd az eredeti pontos terv folytatódik. Idegen/később módosított tartalom esetén
`FILESYSTEM_RECOVERY_REQUIRED` jelez kézi egyeztetést; nincs hamis sikerjelzés.

Más alkalmazásbeli írások az aszinkron teljes átnevezés alatt blokkoltak. Az
előnézet óta módosult katalógus vagy könyvtár új előnézetet igényel. Azonos
request_key ismétlése az eredeti eredményt adja, nem mozgatja újra a fájlokat.
A meglévő karakter-policy TEMP triggerek továbbra is érvényesek. Kánon,
eredeti forrásidézet, import-/generálási proveniencia és régi történeti revízió
nem kerül csendesen átírásra. Az aktuális esemény szerkesztése új revízió.

## Integráció

Új modulok: `app/character-rename.mjs`, `app/hungarian-names.mjs`,
`app/character-rename-files.mjs`, `app/complete-character-rename.mjs`,
`app/character-rename-routes.mjs`, `app/public/character-rename.{html,css,js}`,
`mcp/character-rename.mjs`. A meglévő desktop, privát Tailscale, ChatGPT stdio és
Grok HTTP dispatcher ugyanahhoz a szolgáltatáshoz csatlakozik. Az új writer csak
v2 backend esetén hirdeti a képességet. Régi általános név-PUT és név-autosave
nem kerülheti meg a teljes műveletet; a névjavaslat is az integrált előnézetre visz.

Az aktuális éles forrás a média gyökér `00_SYSTEM/project` könyvtára. A korábbi
fejlesztési checkout önmagában nem frissíti a futó csatlakozót. Kiadáskor a meglévő
helyi módosításokat meg kell őrizni, célzott forrásmentést kell készíteni, majd
az alkalmazást és a két MCP adaptert újra kell indítani. Titok, jogosultság és
publikus hozzáférés változtatása nem része a funkciónak.

## Tesztelés

`node --test tests/complete-character-rename.test.mjs` mesterséges adatbázisokon:
egy trusted MCP kérés, rendezett OneDrive-elrendezés, magyar Áronnal→Ábellel és
Áronhoz→Ábelhez, ID/kánon/fájlbájt megőrzése, preview/review, név/mappaütközés,
hibainjektált visszagörgetés, konkurens szöveg-/fájlmódosítás, új mappa, undo,
újraindítás/idempotencia, megszakadt művelet helyreállítása, kétes név és auth/CSRF.
Éles adatot nem használ tesztként. A felhasználó kifejezetten kért aktuális
Áron→Ábel módosítása külön, mentett éles műveletként hajtható végre.

Ellenőrzés: 2026-10-31, az éles forrásból elkülönített integrációs példány teljes
tesztcsomagja 181/181 sikeres, benne 9 új teljes átnevezési teszttel.
