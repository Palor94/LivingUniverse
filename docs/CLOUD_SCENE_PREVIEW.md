# Ötképes Terra–Sol próba: előnézet és első jóváhagyott futás

2026-10-31. Fejlesztési ág: `codex/direct-ai-model-adapters`. Privát képek,
nevek, stabil médiaazonosítók, hashek, kulcsok és konkrét kimeneti utak nem
részei ennek a dokumentumnak vagy a Gitnek. A felhasználó a pontos előnézetet
jóváhagyta, a tíz felhős kísérlet lezárult. Nincs éles telepítés vagy push.

## Opcionális jelenetszerződés a közös folyamatban

OpenAI konfigurációban `result_contract: "scene-v1"` választja a bővített
wire-sémát és `media-analysis-scene-1` promptot. A normál szerződés változatlan
alapérték. A séma-/prompthash és a részletesség/gondolkodási szint a provider
specifikációban, előnézetben és cache-kulcsban szerepel. Nincs új SQL-migráció.

A `scene_details` tartalmazza a funkcionális környezetet, legfeljebb hat
egymást nem kizáró `compatible_settings` lehetőséget, nyolc képbeli résztvevőt
és nyolc, résztvevőnkénti szerepekkel leírt tevékenységet. A hely- és karakter-
azonosítók kötelezően nullok. Duplikált/hiányzó résztvevő-hivatkozás, érvénytelen
régió, kitalált ID és automatikus szimulációs jóváhagyás elutasítandó.

Semleges referenciaháttérhez üres helyszín-kompatibilitás és csak narrációs
karakterbemutatás szükséges. Ezek javaslatok; az éles szimulációs médiaválasztó
és a jóváhagyott használati korlátozás alkalmazása továbbra is jövőbeli munka.
A desktop közös eredménynézete megmutatja a megfigyeléseket és szerepeket,
de nem hagyja jóvá a képbeli alakok karakterekhez rendelését vagy a hipotetikus
helyszíneket. A közös sor/export/restore megőrzi a struktúrát; az eddigi címke-
elfogadás nem írja ezeket pontos helykapcsolatként, profilként vagy kánonként.

## Modellek és díjbecslés

A kézi próba mindkét modellhez ugyanazokat a képszármazékokat, promptot,
sémát és célokat használja: `gpt-6.1-terra` / `gpt-6.1-sol`, `image_detail:high`,
`reasoning_effort:low`, legfeljebb 8192 kimeneti token/kérés. A kimeneti korlát
a gondolkodási tokeneket is tartalmazza. Képenként 8000 becsült bemeneti tokennel
és a teljes kimeneti korláttal számolunk, nem feltételezünk cache-kedvezményt.

A 2026-10-31-én ellenőrzött Standard rövid kontextusú árak: Terra 1/5 USD,
Sol 2/10 USD / millió bemeneti/kimeneti token. Öt kép × két modell becslése
így 0,7344 USD, a javasolt jóváhagyási keret 2 USD. A bemeneti tokenek becsültek;
ez nem kemény szolgáltatói számlázási plafon, és nem tartalmaz adókat vagy
esetleges fiókspecifikus díjakat. Az egyenleget a felhasználó ellenőrzi.

Az adapter a valós Responses `usage` számait külön rögzíti, ellenőrzi az
összegeket és a cached/reasoning részszámok határait. A gondolkodási tokeneket
nem adja hozzá még egyszer az outputhoz. Hibás/refused modellkimenetnél is
megmarad az elérhető, tartalomtól megtisztított fogyasztási nyugta. Ennek
alapján számított költség nem szolgáltatói számla. Cache-találatot külön kell
kezelni; ez a kézi próba friss privát katalógusokból indul.

Hivatalos források:
[Modellek/árak](https://developers.openai.com/api/docs/pricing),
[gondolkodás és kimeneti korlát](https://developers.openai.com/api/docs/guides/reasoning),
[képbemenet](https://developers.openai.com/api/docs/guides/images-vision),
[strukturált kimenet](https://developers.openai.com/api/docs/guides/structured-outputs).

## Kézi előkészítés és külön végrehajtás

```powershell
node tests/private-cloud-scene-pilot.mjs `
  --config <helyi-mcp-config.json> `
  --selection <privat-selected-images.json> `
  --output <friss-OneDrive-on-kivuli-mappa>
```

Az előkészítés nem tölt be titkos kulcsot és a külső transzportot tiltó
függvényt használ. A forrás SQLite readOnly/query_only; csak öt ellenőrzött
képmásolat és két külön privát tesztkatalógus készül. A már meglévő közös
előnézet készíti a JPEG-eket és a tíz pontos kéréslenyomatot. A privát
`plan.json`, `preview.html`, `prompt.txt`, `schema.json` és a csak loopback
`serve-review.mjs` együtt teszik ellenőrizhetővé a beküldést. Az eredeti képek
és az érintett rekordok/kapcsolatok/profil/kánon lenyomatát a futtató védi.

Kizárólag a felhasználó konkrét, előnézethez kötött jóváhagyása után készülhet
külön privát approval JSON: `plan_hash`, `selected_codes`, `ack_upload:true`,
`ack_cost:true`, `ack_adult_context:true`, `max_total_usd:2`, `expires_at`.
Ez nem része a kulcsmentési vagy képkiválasztási engedélynek.

```powershell
node tests/private-cloud-scene-pilot.mjs --execute `
  --output <ugyanaz-a-privat-elonezetmappa> --approval <privat-approval.json>
```

A végrehajtás újraellenőrzi az egész előnézet hashét, a modellbeállításokat,
forrásokat, katalógusállapotot és képenkénti előnézetet. Csak utána tölti be a
külön Windows DPAPI-kulcsot, és a közös munkasor külön adatátadási jóváhagyását
használja. Egyszeri végrehajtási marker védi a véletlen újraküldést. Képenként/
modellenként egy kísérlet van; nincs automatikus retry. Ismeretlen kimenetel,
hiányzó fogyasztási nyugta vagy modelltévesztés után nem küld újabb képet.
A helyi becslési költségőr a következő hívás előtt ellenőrzi a keretet.

Küldött adatok: kijelölt JPEG, rögzített prompt, célok és JSON-séma, hitelesítés
az OpenAI-nak. Nincs Media Notes, profil, adminjegyzet, fájlút, név vagy helyfa.
`store:false` nem jelent nulla szolgáltatói adatmegőrzési garanciát. Minden
modellkimenet privát, ellenőrizendő javaslat; nincs automatikus éles írás.

## Ellenőrzött állapot

- 253/253 szintetikus teszt sikeres: örökölt adapterek, új séma, hamis ID/
  jóváhagyás kizárása, többes helyszínjavaslat, szerepek, HTML-escape, közös
  sor, export/restore, védett kulcsbetöltés és pontos approval/költségkezelés.
- Öt kiválasztott kép × két modell helyi előnézete elkészült. Az utasítás és
  séma a helyi oldalon külön megnyitható, öt képpel és külső beágyazás nélkül.
- Jóváhagyási fájl nélküli tényleges CLI-indítás helyben megállt, végrehajtási
  marker vagy modellhívás nélkül. Nem a képek küldésével teszteltük ezt a kaput.
- A külön kulcs helyben titkosítva tárolt. A megelőző két díjmentes modell-
  metaadatkérés 200 választ és egyező modell-ID-t adott. Ezután a felhasználó
  külön jóváhagyta az öt kép továbbítását és a bemutatott fizetős próba keretét.

## Első jóváhagyott felhős futás: összesített eredmény

2026-10-31: öt kép × két modell, tíz külön kísérlet, automatikus újraküldés
és cache-találat nélkül. Minden válasz megfelelt a strukturált sémának, minden
modell-ID egyezett és mind a tíz fogyasztási nyugta rendelkezésre állt.

| Modell | Sémának megfelelő válasz | Számított tokenköltség | Átlagos mért idő/kép |
| --- | --- | --- | --- |
| GPT-6.1 Terra | 5/5 | 0,0328072 USD | 14,25 s |
| GPT-6.1 Sol | 5/5 | 0,0882644 USD | 14,75 s |
| Összesen | 10/10 | 0,1210716 USD | a teljes futás 159,6 s |

Az összes API-használat 35 462 bemeneti és 10 919 kimeneti token; a kimeneten
belül 101 gondolkodási token szerepelt. A díj a nyugták és ellenőrzött árak
alapján számított összeg, nem szolgáltatói számla vagy adóval növelt végösszeg.

A helyszínmezők több helyen több kompatibilis környezetet adtak. Konkrét
szexuális adó/fogadó szerepet a Sol egy képnél jelölt; a Terra egyik képnél
sem. Más képeken nem alkalmazható vagy bizonytalan jelölések is születtek.
Ezekből képi igazságadat és emberi értékelés nélkül nem állapítható meg,
hogy melyik modell pontosabb. A részletes magyar címkék, szövegek és a képek
csak a privát eredménylapon maradnak; itt nem közlünk modellkimenet-részleteket.

Az öt eredeti forrás és helyi másolat hash-ellenőrzése sikeres; az érintett
élő rekordok/kapcsolatok/profil/kánon lenyomata változatlan. Mindkét külön
tesztkatalógus integritása `ok`, idegenkulcshibák nélkül, öt munkával és öt
kísérlettel. Az éles katalógus nem kapott írást vagy címke-/kánonelfogadást.

A `tests/render-cloud-scene-report.mjs` ugyanazt a strukturált megfigyelési
nézetet használja, két modellpanellel képenként. A modell által jelölt p1/p2
régiókat a képen is megmutatja; ezek nem jóváhagyott személyazonosságok.
Összesítő táblázat, öt képcsoport és tíz modellpanel, script és külső beágyazás
nélkül. A helyi HTTP-ellenőrzés 200 választ adott. A futtató ezt a megjelenítőt
használja; meglévő jelentés újrarenderelése hálózati hívás nélkül:

```powershell
node tests/render-cloud-scene-report.mjs --output <privat-eredmenymappa>
```

## Második jóváhagyott összehasonlítás: Sol medium és Astra low

2026-10-31: a felhasználó külön jóváhagyta az előző öt felnőtt jelenet újabb
OpenAI-feldolgozását, tíz egyszeri kéréssel és 2 USD helyi költségőrrel.
A felhős próba lezárult: tíz sémának megfelelő válasz, egyező modellazonosítók,
tíz fogyasztási nyugta, ismétlés és cache-találat nélkül. Azonos eredeti képek,
JPEG-származékok, prompt, séma, célok és high részletesség. Teljes idő 185,821 s.

| Változat | Érvényes válasz | Számított tokenköltség öt képre | Átlagos idő/kép |
| --- | --- | --- | --- |
| Sol low, korábbi eredmény újraküldés nélkül | 5/5 | 0,0882644 USD | 14,75 s |
| Sol medium, új próba | 5/5 | 0,0959244 USD | 19,22 s |
| Astra low, új próba | 5/5 | 0,425474 USD | 14,86 s |

Az új tíz kérés összesen 0,5213984 USD számított tokenköltséget használt.
Az összeg nem szolgáltatói számla vagy adózott végösszeg. A konkrét szerepet
jelölő képek száma rendre 1/5, 2/5 és 2/5; ez nem pontossági mérés.
A felhasználó az első összehasonlításban a Solt részesítette előnyben.
A mostani három változat végső minőségi rangsora még emberi képi értékelést igényel.

Az öt eredeti és másolat változatlan; a kiválasztott élő rekordok invariánsai
megmaradtak. Mindkét elkülönített tesztadatbázis integritása ok, idegenkulcshiba
nélkül. A helyi eredménylap öt képcsoportban tizenöt panelt mutat, script vagy
külső beágyazás nélkül; HTTP 200 ellenőrzés sikeres.

A kézi előkészítő választható --suite sol-medium-astra-low kapcsolót kapott;
a végrehajtás kizárólag a pontos előkészített tervet használja. A korábbi terv
nem használható új beállítás engedélyezésére. A
 tests/compare-cloud-scene-reports.mjs helyben illeszti hozzá a korábbi Sol low
válaszokat, új API-hívás nélkül. A három változat külön azonosító alatt marad,
így két Sol-beállítás eredménye nem keveredik. Teljes szintetikus regresszió:
255/255 sikeres.

## Teljes képtár: metaadatok alapján előkészítve, még nem elindítva

A tests/private-library-preflight.mjs kizárólag readOnly/query_only SQLite-ot,
fájlmetaadatokat és Windows elérhetőségi attribútumokat olvas. Nem nyit képi
tartalmat, nem tölt be kulcsot, és nem küld hálózati kérést. A privát leltár
OneDrive/Git területen kívül marad. Az aktív állomány: 1121 kép és 387 videó.
1119 kép helyben elérhető, támogatott kiterjesztésű metaadatjelölt; egy hiányzik,
egy WebP formátumú. A jelölteknek továbbra is át kell menniük a forrás-, méret-,
képméret-, formátum- és dekódolási ellenőrzésen; a leltár nem tartalmi vagy
életkor-ellenőrzés. Automatikus OneDrive-letöltés nincs.

1119 képre, az ötképes minta soros sebességét és egységköltségét kivetítve:
Sol low kb. 20 USD / 4,6 óra; Sol medium kb. 22 USD / 6 óra; Astra low kb.
95 USD / 4,6 óra. Ezek becslések, nem költség- vagy reggeli elkészülési garanciák.
A Standard soros futáshoz folyamatos internet és ébren maradó gép szükséges.
A Batch alternatíva 50%-os díjjal, 24 órás feldolgozási ablakkal működik, így
nem ígérhető biztos reggeli befejezés; az adapter jelenleg Standard Responses.
Forrás: https://developers.openai.com/api/docs/guides/batch

A teljes képtár fizetős feldolgozása nincs elindítva. A következő lépés a
modell/gondolkodási szint választása, a pontos átadandó állomány és költségkeret
rögzítése, majd tartós, megszakítás után a még el nem küldött tételektől
folytatható futás. Bizonytalan kimenetelű kérés nem küldhető újra automatikusan.
Minden eredmény átnézendő javaslat marad; a próba nem módosít éles címkét,
karakter-hozzárendelést, profiladatot, pontos helyszínt, kánont vagy rendezést.
