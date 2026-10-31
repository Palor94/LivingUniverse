# Első valódi helyi Ollama-próba

2026-10-30. Az adapterek eredeti, kizárólag fixture-es fejlesztése után a
felhasználó külön engedélyezte a hordozható Ollama és a kiválasztott modell
letöltését, valamint a valódi helyi inferenciát szintetikus képekkel.
Ez az engedély nem éles telepítésre, privát médiára vagy felhős próbára szólt.

Később külön felhasználói kérésre egy háromképes privát helyi adatpróba is
elkészült. Annak leírása és név/ID nélküli összesítése külön dokumentum:
[PRIVATE_LOCAL_PILOT.md](PRIVATE_LOCAL_PILOT.md). Az alábbi jelentés a megelőző
szintetikus próba saját hatókörét és bizonyítékait őrzi.

## Ellenőrzött környezet

- Windows; AMD Ryzen 7 7730U, 8 mag / 16 szál; kb. 16 GB RAM, integrált Radeon.
- Ollama `v0.40.13`, hivatalos hordozható Windows amd64 kiadás. A ZIP SHA-256:
  `7afa38624fa62ee5d8293422d0ab084c1bb4603134c7f4dafce11a033b57cc19`.
  Az `ollama.exe` Authenticode aláírása érvényes, kiadója Ollama Inc.
- Modell: `qwen3-vl:2b-instruct-q4_K_M`, összesen 1 930 568 531 bájt helyi
  modellméret. Az eredeti registry-manifest és a telepített modell azonos hashű:
  `afc393e3572c07db0bc84aa460d928a16c75f3fbb9ca9e0dccc4fbd2dafb573e`.
  A modell `vision` képessége és Apache 2.0 licence helyben is ellenőrizve.
- Külön szerver: `http://127.0.0.1:11435`; `OLLAMA_NO_CLOUD=1` és elkülönített
  profilban `disable_ollama_cloud:true`. A szervernapló megerősítette a felhőtiltást.
  CPU-futtatás, `OLLAMA_VULKAN=0`, letiltott GPU-kiválasztás, 8192 tokenes
  kontextus, egyetlen párhuzamos kérés. Az API 0 bájt GPU-memóriát jelzett.
- A modell, hordozható runtime, saját profil, szintetikus képek, naplók és
  külön SQLite-tesztkatalógusok a OneDrive-on kívüli
  `%LOCALAPPDATA%\LivingUniverse\analysis-trial\20261030-qwen3vl-2b` alatt vannak.
  Nem módosult globális PATH, automatikus indítás vagy az éles alkalmazás.

## A valódi próba által feltárt és javított hiba

Az első prompttal az alakzatos kép átment a strukturális ellenőrzésen (86,8 s),
de ismétlődő mondatokból álló címkéket és indokolatlan helyjavaslatot adott.
A tengerpartkép 77,4 s után `INVALID_RESULT` lett. Egy külön, ugyanazon helyi
képen futó diagnosztikai ismétlés megőrizte a nyers választ: a HTTP-kérés
sikeres volt, nem történt truncálás, de a modell kitalált egy nem megfelelő
helyazonosítót. A meglévő védelem helyesen elutasította az eredményt.

A javítás nem lazította az ellenőrzést:

- `media-analysis-2` prompt: rövid leírások/címkék/indoklások, üres tartalom
  kezelése és a puszta grafika megkülönböztetése valódi megvilágítástól.
- Ollama esetén a JSON-séma a promptban is megjelenik a `format` mező mellett,
  a hivatalos séma-grounding útmutatásnak megfelelően.
- A valódi adapterek wire-sémája legfeljebb három megfigyelést és három címkét,
  60 karakteres neveket, 160 karakteres bizonyítékot és 1000 karakteres
  nyelvenkénti leírást enged. A `tag_id` csak null lehet.
- Mivel a modellnek nem adunk helyszínkatalógust vagy jóváhagyott helyreferenciát,
  a valódi adapter pontoshelyszín-listája csak üres lehet. Nem generálunk
  megalapozatlan világhelyazonosítót. A leíró háttércímke továbbra is támogatott.
- A közös `analyzeImage` eredményforma és a mock korábbi helyszínjavaslatai
  megmaradtak. A meglévő illesztés/emberi jóváhagyás továbbra is közös.
  Prompt- és sémahash változott, így régi cache nem használható az új bemenetre.

## Szintetikus képkészlet és értelmezés

Mindhárom kép saját, determinisztikus 384 × 256-os BMP, előre leírt elvárt
tartalommal. A tényleges Windows dekódoló készítette a modell JPEG-bemenetét.
Nem volt fixture-válasz vagy helyettesített képtartalom: valódi loopback HTTP
és valódi, CPU-n futó modell válaszolt. A diagnosztikai trace a tényleges
HTTP-válasz korlátos másolatát menti, nem helyettesíti a transzportot.

A geometriai kép piros négyzetet, kék kört és zöld háromszöget tartalmaz fehér
háttéren. A tengerpart egyszerű sávos illusztráció: ég, víz, homok, sárga nap.
A harmadik kép egyszínű fehér, objektum és szöveg nélkül.

| Javított futás | Teljes elemzési idő | Technikai eredmény | Tartalmi megfigyelés |
| --- | --- | --- | --- |
| Alakzatok | 65,7 s | Sikeres, sémája érvényes | A három alaptípus felismerhető; a magyar háttérszín hibás, az angol és a háttérmező helyes. |
| Tengerpart | 71,1 s | Sikeres, sémája érvényes | A napot és fő színsávokat részben leírja; a jelenet nem megbízhatóan azonosított, semleges/fehér hátteret állít. |
| Fehér kép | 43,8 s | Sikeres, sémája érvényes | A tartalom hiányát és a fehér hátteret felismeri; a magyar megfogalmazás pontatlan. |

A javított sor teljes ideje kb. 183 s, három külön valódi inferenciával,
cache-találat nélkül. Mindhárom válaszban `locations:[]` és minden változatlansági
ellenőrzés sikeres. SQLite integritás: `ok`, idegenkulcs-hiba: 0.
Összesen hat valódi hívás történt a kezdeti/diagnosztikai/javított futásokban;
két kezdeti válasz elutasítása is megmaradt a jelentésekben. A sikeres 3/3 itt
**strukturált feldolgozási eredmény**, nem 100%-os képfelismerési pontosság.

A javított alakzatos válaszban a magyar és az angol leírás ellentmondott egymásnak:
a magyar szöveg fekete hátteret említett, az angol és a háttérmezők helyesen
fehéret. Nem választott kategóriát is megadott nyers megfigyelésként; a meglévő
illesztő abból nem készített javaslatot. A „nincs megjelölve” címke sem hasznos
osztályozás. Ezek tartalmi modellhibák, amelyeket a JSON-séma önmagában nem
tud kizárni. Automatikus címkeelfogadásra ez a modell/próba nem ad alapot.

A tengerpartkép hibás semleges besorolása miatt a leíró háttérjavaslatot az
alkalmazás kizárta. Ez biztonságos visszatartás, de nem helyes jelenetfelismerés.
Az üres kép nyers kimenete a kérés ellenére háttérmegfigyelést/címkét tartalmazott;
a semleges háttér szabálya azt is kizárta. Nem nevezzük ezeket helyes nyers
modellválasznak pusztán azért, mert a további feldolgozás megfogta őket.

Az első valódi kapcsolat tehát működik; a kis 2B modell magyar/angol
következetessége, jelenetbesorolása és címkeminősége ebben a próbában gyenge.
Privát karakterfotókra, identitásfelismerésre, valós fotós pontosságra vagy
automatikus feldolgozásra ebből nem következik alkalmasság. Nem történt ilyen
próba. A következő minőségi vizsgálatnak előre címkézett, engedélyezett fotókat
és több, külön jóváhagyott modelljelöltet kell összehasonlítania.

## Lezárás és regresszió

A külön Ollama folyamatot és saját modellrunner gyermekeit a próba után
leállítottuk, a loopback listener megszűnt. A futtatható állomány teljes útját
előbb ellenőriztük. A modell és tesztanyag újrahasználatra megmaradt; az egész
helyi tesztmappa kb. 5,8 GB a letöltött ZIP-pel együtt. Nincs automatikus
indulás és nincs éles provider-engedélyezés. OpenAI továbbra is kizárólag
fixture-rel ellenőrzött.

A regressziós részhalmaz 56/56, a teljes regresszió **230/230** teszttel sikeres.
Új teszt védi a kitalált tag-/helyazonosítók és a túl hosszú vagy túl sok
wire-javaslat elutasítását. A teljes regresszió a valódi kézi futtatót nem
indítja el. Új SQL-migráció nincs. A korábbi eredmények megmaradnak, régi
promptverziójú függő feladat provider-változás miatt új áttekintést igényel.
Visszalépéshez a tesztpéldány leállítása és a korábbi forráscommit használata
elegendő; a letöltött runtime/modell külön, nem szinkronizált telepítés.

## Ismételhető futtatás

`tests/real-ollama-smoke.mjs` kizárólag kézzel indítható; nincs a `*.test.mjs`
regressziós tesztek között. `--prepare` képeket és elvárt tartalmat készít,
modellhívás nélkül. `--run` külön, explicit loopback végpontot, pontos modellt
és teljes SHA-256 digestet igényel. Meglévő jelentést nem ír felül.

```powershell
node tests/real-ollama-smoke.mjs --prepare --output <külön-helyi-mappa>
node tests/real-ollama-smoke.mjs --run --output <új-külön-helyi-mappa> `
  --endpoint http://127.0.0.1:11435/api/chat `
  --model qwen3-vl:2b-instruct-q4_K_M `
  --digest sha256:afc393e3572c07db0bc84aa460d928a16c75f3fbb9ca9e0dccc4fbd2dafb573e `
  --limit 3 --trace
```

A futtató nem indít szervert, nem telepít vagy tölt le modellt, és nem használ
éles adatbázist. Új, saját katalógust hoz létre, a meglévő alkalmazás API-ján és
munkasorán indítja a kijelölt szintetikus képeket, végül összehasonlítja a
védett táblákat és forráslenyomatokat. Nem fogad el címkét, helyet vagy kánont.

A kezdeti futás `report.json`, a külön diagnózis
`diagnostic-original/report.json` és `response-trace-1.json`, a javított futás
`prompt-v2/report.json` és annak trace-fájljai a helyi tesztmappában maradnak.
Nyilvános modellnyugták/manifestek és az aláírásellenőrzés adatai is megmaradnak.
A generált képek, SQLite-adatbázisok, modellsúlyok és runtime nem kerülnek Gitbe.

Források: [Ollama Windows](https://docs.ollama.com/windows),
[hivatalos kiadás](https://github.com/ollama/ollama/releases/tag/v0.40.13),
[konkrét modell és licence](https://ollama.com/library/qwen3-vl:2b-instruct-q4_K_M),
[eredeti modelladatlap](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct),
[helyi mód](https://docs.ollama.com/faq),
[CPU/GPU-beállítások](https://docs.ollama.com/gpu),
[strukturált kimenet és séma a promptban](https://docs.ollama.com/capabilities/structured-outputs).
