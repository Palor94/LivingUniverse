# Kis elemszámú helyi próba meglévő privát képekkel

A szintetikus próba után a felhasználó külön kérhet legfeljebb három meglévő
katalóguskép helyi elemzését. Ez nem éles telepítés vagy automatikus címkézés:
az eredmények külön helyi próbatárban maradnak, emberi értékelésre.

`tests/private-local-analysis-pilot.mjs` kézzel indítható, nincs a normál
`*.test.mjs` regressziós tesztek között. Nem keres automatikusan további képeket,
nem telepít modellt, és nem indítja el az Ollama-szervert. Előfeltétel a külön
ellenőrzött, felhő nélküli loopback Ollama és az engedélyezett pontos modellhash.

## Határok és adatmegőrzés

- Egy–három explicit, különböző média-UUID és `--ack-private-local` szükséges.
  A kiválasztásnak külön felhasználói felhatalmazáson kell alapulnia.
- A forráskatalógus `DatabaseSync({readOnly:true})` és `PRAGMA query_only=ON`
  mellett nyílik meg. Nem fut rajta app-indítás, migráció vagy mentés-visszatöltés.
- A kiválasztott karakterekhez kifejezett felnőtt életkor-állítás kell a
  katalógusban. Ez meglévő szöveges metaadat, nem a fénykép alapján végzett
  életkor- vagy személyazonosság-meghatározás. A tényleges kiválasztáskor
  ellenőrizni kell, hogy a mező a jelenlegi életkorra vonatkozik.
- A már meglévő ellenőrzött képbeolvasó vizsgálja az aktivitást, elérési utat,
  helyi fájlállapotot, formátumot, méretet és változatlan SHA-256-ot. Nincs
  automatikus OneDrive-letöltés. Eredeti fájlba nem írunk.
- Csak a kijelölt képek bitazonos helyi másolatai kerülnek friss, OneDrive-on
  kívüli mappába. Az elemzőnek a normál Windows-dekódoló készít JPEG-bemenetet.
  Az eredeti médiaazonosítók és forráslenyomatok megmaradnak a privát nyugtában.
- Az alkalmazás kizárólag egy új, külön tesztkatalógust nyit írhatóan; a már
  meglévő elemzési munkasort és Ollama adaptert használja. Az aktuális alapcélok:
  környezet, akció, kameraállás, kivágás, referenciahasználat. A ruházat külön
  választható extra; nincs második feldolgozó szolgáltatás.
- Jegyzet, adminadat, életrajz, név, életkor, szótár és világhely nem része a
  modellkérésnek. A képbájtok kizárólag numerikus loopback végpontra mehetnek.
  OpenAI és más felhős adapter kikapcsolt marad.
- A közös determinisztikus illesztő a modellkimenetet a valódi katalógus
  aktuális címkeszótárával is összeveti. Ez helyi utófeldolgozás, nincs új
  modellhívás. A valódi címke-UUID-k és szótárhash a privát jelentésben szerepelnek.
- A kiválasztott élő rekordokról és szótárról készített lenyomatot újraellenőrizzük;
  változásnál a próba megáll. Az eredeti képfájl minden eredmény után ismét
  hash- és állapotellenőrzésen megy át. Más chat módosítását nem írjuk felül.
- Képenként legfeljebb egy kísérlet fut. Egy elemhiba külön eredmény, nem
  automatikus újraküldés; a többi kijelölt kép ettől még feldolgozható.
- Sem címke-/helyelfogadás, sem referencia- vagy kánonjóváhagyás nem történik.
  Az elemzési kimenet ellenőrizendő javaslat, nem tényállítás.

## Kézi indítás

```powershell
node tests/private-local-analysis-pilot.mjs --ack-private-local `
  --config <helyi-mcp-konfiguracio.json> `
  --ids <elso-uuid>,<masodik-uuid>,<harmadik-uuid> `
  --output <uj-egyedi-OneDrive-on-kivuli-mappa> `
  --endpoint http://127.0.0.1:11435/api/chat `
  --model <engedelyezett-helyi-vision:tag> `
  --digest sha256:<teljes-64-jegyu-modellhash>
```

Meglévő kimeneti könyvtárat nem használ újra; így régi privát jelentést vagy
próbát nem írhat felül. A konfigurációból csak a forrásadatbázis és médiagyökér
szükséges; a hitelesítési beállítások nem kerülnek modellkérésbe vagy jelentésbe.

A `report.json` helyi privát nyugta és teljes modellkimenet. A `review.html`
ugyanott mutatja egymás mellett a kijelölt képet és a leírást/javaslatokat.
Nincs külső JavaScript, font vagy képkérés; a HTML minden dinamikus szöveget
escape-el, és CSP-vel tiltja a hálózati tartalmakat. A képeket nem kell a
beszélgetésbe vagy külső AI-szolgáltatáshoz feltölteni az értékeléshez.

A képek, karakternevek, életkor-állítások, UUID-k, fájlutak, egyedi hashek,
modellkimenetek és helyi jelentések privát adatok: **nem kerülnek Gitbe**.
A repó csak a kiválasztástól független futtatót és az összesített, név/ID nélküli
ellenőrzési eredményt tartalmazhatja. A külön Ollama folyamat a próba végén
leállítandó; az éles provider-konfiguráció változatlan marad.

A modelloldali állítások vizuális helyességét az eredménylapon kell ellenőrizni.
Egy sémának megfelelő válasz vagy a korábbi kézi jelöléssel való egyezés önmagában
nem bizonyít pontos felismerést, személyazonosságot vagy kánonhűséget.

## Első kis elemszámú próba – összesített eredmény

2026-10-30: a felhasználó által kért három meglévő, felnőtt karakterhez rendelt
privát képen valódi helyi Ollama-inferencia futott. A korábbi, már engedélyezett
Qwen3-VL 2B Instruct Q4_K_M modell és annak változatlan teljes digestje volt
használatban. Nem töltöttünk le új modellt és nem hívtunk felhős API-t.

Mindhárom elem érvényes strukturált eredményt adott, cache-találat nélkül;
futási idők: 89,1 / 97,0 / 61,6 s. A saját tesztkatalógus integritása `ok`.
Az érintett élő rekordok lenyomata és az eredeti fájlok változatlanok maradtak.
Minden eredmény javaslat maradt, nem történt jóváhagyás vagy éles írás.
Az izolált Ollama-szerver és modellrunner gyermekei a próba után leálltak.

A ruházati javaslatok és a keresési találat közti kezdeti eltérést később
helyesbítettük: a részszókeresés valójában félmeztelen testreferenciákat
választott, így nadrág jelenléte ebből önmagában nem hiba. Zavaros/ismétlődő
magyar címkék is megjelentek, amelyek kézi értékelést igényelnek. A képeket
nem továbbítottuk a beszélgetés modelljének vizuális értékelésre.
A 3/3 technikai siker nem pontossági mutató. A későbbi, felhasználó által
pontosított címkefókusz: [ANALYSIS_TAG_FOCUS.md](ANALYSIS_TAG_FOCUS.md).

A privát képek és kimenetek nem kerültek a repóba. A teljes automatikus
regresszió szintetikus fixture-ekkel fut; a kézi privát pilotot nem indítja el.

2026-10-31: a pontosított öt címkecél külön ismétlésében egy érvényes és két
`INVALID_RESULT` kimenet született. Az érvényes válaszban is maradt hibás
akcióbesorolás. A források, másolatok és élő rekordok ellenőrzése sikeres,
az Ollama leállt; részletes, kizárólag összesített értékelés és 235/235
regresszió: [ANALYSIS_TAG_FOCUS.md](ANALYSIS_TAG_FOCUS.md).
