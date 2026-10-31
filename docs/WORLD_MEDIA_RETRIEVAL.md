# Az AI tudja, hol és mire keressen

Jelenlegi hatókör: a felhasználó egyelőre karaktereket és karakterképeket
gyűjtött a világhoz. Külön helyszínháttereket, backdropokat és backgroundokat
még nem keresett. A mostani előkészítés a karakterképekre és a megjelölt
generálási tervképekre vonatkozik. A karakterképen látható környezet továbbra
is megfigyelhető és kompatibilitásként címkézhető; ez nem jelent már meglévő
helyszín-háttérkönyvtárat vagy pontos világhelyszín-hozzárendelést. A külön
helyszínkép-gyűjtés, backdrop/background besorolás és ezek AI-keresése későbbi
bővítés, amikor a felhasználó ilyen képeket is hozzáad. Most nem indítunk
helyszínkép-keresést, importot vagy további képelemzést.

A felhasználó pontosított fő célja: a címkézésből visszakereshető kapcsolatok
készüljenek, amelyek a világépítés és a későbbi szimuláció számára megmutatják,
melyik karakterhez, helyszínhez, cselekvéshez és felhasználáshoz melyik kép
illik. A későbbi helyszínképek ugyanebbe a rendszerbe illeszkednek.
Az elemzés szünetel; ez keresési specifikáció, nem modellfuttatás.

## Tartós kapcsolatok a címkék mellett

| Kapcsolat | Forrás | Mire használható? |
| --- | --- | --- |
| Média → karakterazonosítók | meglévő katalógus-hozzárendelés, később emberi ellenőrzés | egy karakter képeinek célzott keresése |
| Képbeli alak → karakterazonosító | külön ellenőrzött megfeleltetés | egy konkrét karakter adott tevékenységbeli szerepének keresése |
| Média → jóváhagyott arc-/testreferencia | kánon és referenciajóváhagyás | generálás előtt a megfelelő identitásreferencia kiválasztása |
| Média → pontos helyszínazonosítók | megerősített katalóguskapcsolatok, több kapcsolat is lehet | egy ismert világhely képei és hátterei |
| Média → helyszíntípusok/lehetőségek | képi megfigyelés és indokolt kompatibilitás | például többféle mosdóhoz illő illusztráció |
| Média → akció/testhelyzet/szerepek | tárgyszerű képi osztályozás, bizonytalansággal | jelenethez illő tevékenység és résztvevői viszony |
| Média → kamera és referenciafedezet | strukturált megfigyelés | nézőpont, kivágás, arc/test/pózfedezet |
| Média → felhasználási cél | alkotói cél és ellenőrzött használhatóság | jelenet, karakterbemutatás, generálási terv vagy helyszínreferencia |

A karakterazonosító nem a neve vagy a fájlútja. A képszintű két-karakteres
hozzárendelés nem azonosítja automatikusan, melyik alak az egyikük. Pontos hely
nem következik a fehér csempéből; a kompatibilis helyszíntípus nem pontos
helyszínkapcsolat. Egy akcióképből nem írunk tartós karakterjellemzőt vagy
világeseményt a profilba. Ezek a különbségek a visszakeresésben is megmaradnak.

## Az AI útmutatója és célzott lekérdezése

A világot irányító AI kapjon rövid képességjegyzéket: milyen adatok és eszközök
érhetők el, milyen célra melyikhez forduljon, milyen mezők alapján kereshet,
és mit nem tud még a rendszer. Nem kell megkapnia az összes képet, fájlelérési
utat vagy teljes címkehalmazt minden beszélgetéshez.

| Feladat | Keresési út |
| --- | --- |
| Meglévő karakter megismerése | karakterkereső → profil és jóváhagyott kánon |
| Felismerhető karakter generálása | karakterazonosító → jóváhagyott arc-/testreferenciák |
| Jelenet illusztrálása | résztvevők + akció + helyszín + kamera + jelenet cél |
| Helyszín megmutatása | pontos helyazonosító, vagy külön jelölt helyszíntípus + helyszínreferencia cél |
| Új kép megtervezése | generálási terv cél + keresett akció/póz/kompozíció |

Tervezett közös lekérdezési szerződés, nem jelenleg publikált eszköz:

```json
{
  "purpose": "scene_illustration",
  "character_ids": ["existing-character-id"],
  "participant_role_requirements": [],
  "location_id": null,
  "compatible_settings": ["cafe washroom"],
  "activities": ["sitting"],
  "camera": {"direction": "profile", "framing": "full_body"},
  "accepted_only": false,
  "allow_uncertain": false,
  "limit": 5
}
```

A válasz tartalmazza a médiaazonosítót, karakter- és helykapcsolatokat, a teljesült
és hiányzó keresési feltételeket, az illeszkedés indokát, a bizonytalanságot és
a felhasználási korlátokat. Csak a kiválasztott néhány kép kérhető le külön.
A rangsorolás indokolható szabályokra épül; a modell bizonytalansága nem
kalibrált pontossági százalék.

Nincs megfelelő találat esetén ezt kell visszaadni. Külön jelzett részleges
egyezés vagy generálási terv ajánlható, de nem helyettesíthető észrevétlenül
más szereplővel, más pontos hellyel vagy tervképpel a kért kép. Konkrét személy
akciószerepe csak ellenőrzött képbeli megfeleltetéssel teljesülhet. A nem
azonosított p1/p2 megfigyelés ettől még kereshető séma.

## Meglévő alap és még szükséges összekötés

A helyi fejlesztésben létezik a strukturált jelenet/kamera/referencia-eredmény,
a képszintű karakterindex, a magyar/angol kereső, a cél szerinti szűrés,
a tervek elkülönítése és a törléskövetés. Ezek a külön futási katalógusban
működnek; nem egyenlők az éles szimulációval.

A meglévő MCP-olvasóeszközök között van list_characters, get_character,
search_media, get_media és get_approved_references. A jelenlegi search_media
általános leírás/karakter/kind keresése még nem éri el automatikusan az új
világmédia-index összes összetett mezőjét.

Szükséges következő integráció: az ellenőrzött elemzések biztonságos beillesztése
az aktuális katalógushoz; az élő helyazonosítók és helyszínreferencia-szerepek
megőrzése; külön ellenőrzött képbeli személymegfeleltetés; valamint az AI
képességjegyzéke és a célzott, magyarázható keresőeszköz. A világ médiaválasztója
ezeken keresztül kérjen képet, a profil-, referencia-, helyszín- és történet-
jóváhagyás külön határaival.

Elfogadási feltétel: megadott karakter/helyszín/akció/felhasználás kombinációjára
visszaadhatók legyenek a megfelelő képek és a választás indokai, téves személy-
vagy helyazonosítás és terv/jelenet keveredés nélkül. Ez szintetikus adatokon
is ellenőrizhető, új fizetős képelemzés nélkül.

## Gépi javaslatok engedélyezett használata és helyi próba

2026-10-31: a felhasználó engedélyezte, hogy az AI keresési támpontként
használja a még ellenőrizetlen gépi megfigyeléseket. Ettől címke, személyazonosság,
pontos hely és kánon nem válik automatikusan jóváhagyottá. A read-only
retrieveWorldMedia jelöltkereső alapból használhat javaslatokat; accepted_only
kapcsolóval szigorítható. A korábbi alacsony szintű kereső alapértelmezett
jóváhagyási szűrése megmaradt. A jelöltekhez illeszkedési indok, forrás és
bizonytalansági/ellenőrzési figyelmeztetés jár.

Több karakterazonosító, akció-, testhelyzet-, kompatibilis helyszín- és
referenciahasználati feltételek, valamint kameraadatok kombinálhatók. A még
aktív médiák listáját a valódi próbában külön query-only forrásból szűrtük.
Konkrét karakter képbeli akciószerepének megadásakor az eszköz ellenőrzött
résztvevői megfeleltetést kér: nem következtet személyazonosságra arcból.

A helyi, mentett eredményeken végzett próba: 13 még aktív, indexelt eredmény.
Karakter + portrékivágás: 1 találat, az elvárt mentett kép benne van.
Karakter + akció + kompatibilis környezet + nézőpont: 1 találat, az elvárt kép
benne van. Generálási pózséma: 0 találat, helyesen, mert a tervképek elemzése
még nem indult. A pozitív tervszűrés szintetikus teszttel ellenőrzött. Nem
létező karakterazonosítóra NO_MATCH; elfogadott címkék száma változatlan.
Új modellhívás és képtartalomolvasás: 0. Ez visszakeresési próba, nem a
képi megfigyelések igazságának vagy személyazonosságnak független mérése.

A kereső még helyi prototípus, az éles MCP-kapcsolatba nem telepítettük.
Az eredményjelentés kizárólag a privát futási mappában és helyi nézetben van.

A jelöltkereső, tervelkülönítés, örökölt feldolgozás és megőrzés teljes
szintetikus regressziója 268/268 sikeres. A háromesetes helyi jelentés HTTP 200
választ ad, script és külső beágyazás nélkül; a fizetős hívások száma továbbra
is 16, a számított költség 0,3474455 USD, a futás szünetel.
