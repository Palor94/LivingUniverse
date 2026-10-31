# Közvetlen AI-képelemzés: implementáció és ellenőrzés

2026-10-30 · fejlesztési ág: `codex/direct-ai-model-adapters`.

Elkészült a helyi Ollama vision és a külön OpenAI Responses adapter a meglévő
képelemzési munkasorhoz. Mindkét valódi adapter alapértelmezetten kikapcsolt.
A mock továbbra is alapértelmezett és használható. A kód tényleges HTTP- és
jóváhagyási viselkedését teszteltük; **képfelismerési pontosságot nem mértünk**.

Későbbi, külön engedélyezett frissítés: az első valódi helyi Ollama-próba is
elkészült. A feltárt hibát, a `media-analysis-2` prompt/sémaszűkítést, a három
szintetikus kép eredményét és a 230/230 regressziót a
[valódi helyi próba jelentése](REAL_OLLAMA_TRIAL.md) rögzíti. Az alábbi eredeti
implementációs jelentés saját fázisának fixture-es állapotát őrzi.

2026-10-31: a felhasználó pontosított céljai alapján az alapértelmezett
elemzés helyszínre, akcióra és felvételi referenciaértékre fókuszál, a ruházat
külön választható extra. A `media-analysis-3` változás és a háromképes helyi
ismétlés korlátai: [ANALYSIS_TAG_FOCUS.md](ANALYSIS_TAG_FOCUS.md).

## Forrás és munkavégzési határ

A tiszta eredeti checkout és a GitHub `codex/media-analysis-review` ága is
`925a56364adeee75eb4057af800cac7b8232805e` commiton állt. A munkapéldány ennek
izolált helyi klónja, új ággal. Nem váltottunk ágat a másik fejlesztés checkoutjában.
A GitHub `main` ellenőrzéskor `9c1afcd18661781511f4016a155877ec5d23bd30` volt;
a közös alap `85104d5`, a main két külön commitja nincs ebbe a változásba olvasztva.
A későbbi integrációnál a tárolási elrendezés és a kánonvédelmi módosításokkal
közös regresszió szükséges. Ez a fejlesztés a kért képelemzési ágra épül.

Nem történt modelltelepítés, valódi inferencia, külső modellkérés, privát
médiatovábbítás, éles adatbázis-indítás/migráció, deploy, main merge vagy push.
A tesztadatbázisok, szintetikus képek és futási állapotok az operációs rendszer
ideiglenes könyvtárában, OneDrive-on kívül voltak; a tesztek takarítják őket.
Nem lett függőség telepítve. A lokális Git-klón `origin` értéke az eredeti helyi
checkout; ez nem egy újonnan konfigurált GitHub-publikálási cél.

## Működő folyamat

1. Egy kép adatlapján vagy az aktuális médiatári oldal kijelölésénél:
   **Képelemzés…**. Az alapválasztás mock; valódi adapter csak engedélyezett
   helyi konfigurációból választható. Nincs HTTP-s provider-beállító végpont.
2. Az előnézet ellenőrzött olvasást és korlátozott JPEG-származékot készít.
   Rögzíti az ID-ket, forrás- és származék-SHA-256-ot, MIME-t, dimenziót,
   méretet, célokat, provider-/modell-/prompt-/séma-/előfeldolgozás-verziókat,
   katalógusvédő verziókat és a tényleges JSON-kérés SHA-256-át. Az előnézet
   nem hívja meg egyik modellt vagy az Ollama inventory végpontját sem.
3. Ollama esetén a worker előbb a beállított loopback szolgáltatás
   `GET /api/tags` válaszában ellenőrzi a modell pontos nevét és SHA-256
   lenyomatát. A dokumentált puszta hex és a `sha256:` előtagos alak támogatott.
   Eltérés, távoli modelljelölő vagy hiányzó modell esetén nincs képküldés.
   Utána `POST /api/chat`, `stream:false`, base64 JPEG és JSON-séma következik.
4. OpenAI esetén a pontos képek/adatok/cél és a költségbecslés előnézete után
   két külön, alapból üres jelölés kell: adattovábbítás és költségkorlátok
   elfogadása. A `transfer_approval` kötelező, az előnézethash-hez kötött;
   a tartós job `provider_json` mezőjében helyi alkotóval és időponttal,
   képenkénti forrás-, származék- és kéréslenyomattal kerül naplózásra.
   Ez különbözik a későbbi címke-/helyjavaslatok elfogadásától.
5. A Responses kérés rögzített végpontot, `input_image` JPEG data URL-t,
   `detail:low`, `store:false`, `stream:false`, `text.format` szigorú JSON-sémát
   és kimeneti tokenkorlátot használ. Nincs eszközhívás vagy automatikus retry.
   A választ a konfigurált pontos modellsnapshothoz is ellenőrizzük.
6. A teljes wire-séma és a meglévő normalizált eredményszerződés is ellenőrződik.
   A modelleknek kötelező nullable mezőket normalizáljuk; a mock régi szerződése
   megmarad. A nyers eredményből a meglévő determinisztikus HU/EN/alias-illesztő
   készít külön javaslatot. Ismeretlen modell-azonosító mellett is elsőbbséget
   kap a meglévő, egyértelmű megfelelő címke. Általános strandból nincs konkrét
   világhely-kiválasztás. Új szótári elem/hely továbbra is külön szerkesztés.
7. A meglévő előnézet/elfogadás/elvetés/visszavonás működik. A Media Notes,
   kánon és referenciák, karakterkapcsolatok, rendezési státusz, helyszínfa és
   eredeti képbájtok változatlanságát integrációs teszt védi.

A provider csak a JPEG-et, rögzített promptot, célokat és kimeneti sémát kapja.
Jegyzet, adminadat, karakterdosszié, útvonal, szótár és helyszínfa nincs a
modellbemenetben. A képen látható szöveg adat, nem végrehajtható utasítás.

## Konfiguráció és korlátok

A már meglévő helyi `dataDir` könyvtár `analysis-providers.json` fájlját olvassuk
indításkor; a `createApp({mediaAnalysis: ...})` konfiguráció is támogatott.
A konfiguráció nem tartalmaz API-kulcsot és Gitből kizárt. Kulcs csak a backend
`OPENAI_API_KEY` környezeti változójából származhat. A fixture-tesztek saját
transzportot és használhatatlan tesztértéket injektálnak, valódi kulcsot nem kérnek.

Kikapcsolt konfigurációs minta, minden modellérték helykitöltő:

```json
{
  "providers": {
    "ollama": {
      "enabled": false,
      "endpoint": "http://127.0.0.1:11434/api/chat",
      "model": "REPLACE_LOCAL_VISION:v1",
      "model_revision": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      "local_only_confirmed": false,
      "timeout_ms": 30000,
      "max_response_bytes": 131072,
      "max_output_tokens": 4096
    },
    "openai": {"enabled": false}
  }
}
```

Ollama végpont: kizárólag numerikus `127.0.0.1` vagy `::1`, HTTP/HTTPS,
pontosan `/api/chat`; nincs redirect, DNS-név, URL-jelszó, query vagy fragment.
Nincs felhős tartalék, modell-pull vagy modellindító parancs. A `local_only_confirmed`
üzemeltetői nyilatkozat; a külön Ollama folyamat tényleges `OLLAMA_NO_CLOUD=1`
beállítását/hálózati izolációját külön kell ellenőrizni. Egy loopback cím
önmagában nem bizonyítja egy tetszőleges helyi szolgáltatás belső működését.
A modelleket elemzés közben nem szabad más tartalomra cserélni; az inventory
ellenőrzés nem a külön futó runtime feletti zárolás.

OpenAI végpont: alkalmazásban rögzített `https://api.openai.com/v1/responses`.
Engedélyezéshez kötelező a `model`, `model_revision` pontos snapshot és `cost`:
`input_usd_per_million`, `output_usd_per_million`, `input_tokens_per_image`,
`max_total_usd`, továbbá emberileg olvasható `basis` és `limitations`.
Nem kódoltunk be aktuális modellnevet vagy tarifát. Az inputtokentétel teljes,
képenkénti szöveg+kép becslés legyen. A becslés minden kijelölt képre a megadott
inputot és a maximális outputot számolja; a lehetséges cache-találatokat sem
vonja le. A konfigurált keretet meghaladó becslésnél nincs indítás.
Ez **nem kemény szolgáltatói számlázási plafon**; a valós képtokenek,
modelleltérések és szolgáltatói szabályok miatt a számla eltérhet.
A `store:false` nem nulla megőrzésre vonatkozó adatvédelmi garancia.

Alap HTTP-időkorlát 30 s, konfigurálható 10 ms–300 s; az adapteren kívüli worker
is megszakít. A fejléc és a teljes body olvasása korlátos, a streamelt body is.
Az HTTP-válasz alapkorlátja 128 KiB (256 B–1 MiB), a belső elemzési JSON
legfeljebb 64 KiB. Érvénytelen UTF-8, hiányos/truncált válasz, refusal,
eszközkimenet, eltérő modell és sémasértés elutasított. Nincs upstream hibatörzs,
HTTP-fejléc, kulcs vagy kivételüzenet a naplózott/felületi hibában.

A cache forrás- és származéklenyomatot, teljes nyilvános provider-konfigurációt,
modellrevíziót, prompt- és sémahash-t, előfeldolgozási verziót és célokat köt.
API-kulcs és emberi jóváhagyás nincs a cache-ben. A szótár és helyszínfa csak
illesztési/előnézeti védőverzió; változásuk nem igényel új modellhívást.

## Megszakítás, bizonytalan kérés, visszaállítás

Egy képenkénti aktív felhős próbálkozás pause/cancel/shutdown/restart/restore
után `failed` + `PROVIDER_OUTCOME_UNKNOWN`. Ez szándékosan konzervatív:
ha az átadás pillanata nem bizonyítható, akkor sem küldjük újra magától.
A job szünetelhet, de a resume kizárólag az érintetlen queued elemeket kezeli.
Azonos request key ugyanazt a rekordot adja. Késői válasz nem írhat eredményt,
cache-t vagy javaslatot. A kötegen belül azonos tényleges kéréslenyomatú
duplikált kép sem ismétli meg automatikusan a bizonytalan adatátadást.
Új, kézi kísérlet előtt a szolgáltatói használatot és
költséget ellenőrizni kell. Az elemzési bizonytalan státusz nem állítja, hogy
fizetés biztosan történt vagy biztosan nem történt.

**Nincs új SQL-migráció.** A 023-as tábla- és exportséma maradt; a külön
adatátadási jóváhagyás a meglévő job JSON-mezőben hordozható. Restore szigorúan
ellenőrzi ezt a kötést, és a félbemaradt felhős képeket nem teszi újra queued-ba.
A 023-as up/down és előzetes ellenőrzött backup működése változatlan.

Visszalépés: leállított tesztpéldányon készíts teljes SQLite-backupot/exportot,
kapcsold ki az új providereket, majd térj vissza a korábbi commitra. Saját
SQL-down nem szükséges. A meglévő, jóváhagyott címke-/helykapcsolatok csak a
meglévő döntés-visszavonással távolíthatók el. Teljes korábbi állapot külön
üres célba visszatöltött ellenőrzött backupból állítható helyre. Eredeti média
nem módosult. Az éles alkalmazást ebben a munkában nem indítottuk újra.

## Módosított fájlok

| Fájl | Változás |
| --- | --- |
| `app/analysis-http.mjs` | Közös egyszeri, korlátos, megszakítható HTTP-transzport. |
| `app/analysis-schema.mjs` | Rögzített prompt, szigorú wire-séma és helyi ellenőrzés. |
| `app/analysis-ollama.mjs` | Helyi modell-inventory ellenőrzés, vision request/response leképezés. |
| `app/analysis-openai.mjs` | Külön Responses image/JSON request/response leképezés. |
| `app/analysis-providers.mjs` | Kikapcsolt alapértékek, konfiguráció, provider-registry és adaptergyár. |
| `app/analysis-model.mjs` | Nullable wire-ID normalizálás, meglévő címke/alias elsőbbsége. |
| `app/media-analysis.mjs` | Meglévő sor bővítése, kötött előnézet/jóváhagyás, bizonytalan próbák kezelése. |
| `app/analysis-restore.mjs` | Jóváhagyáskötés és félbemaradt felhős munka biztonságos restore-ja. |
| `app/analysis-routes.mjs` | Elérhető/tiltott providerek és feldolgozási módok képességválasza. |
| `app/server.mjs` | Helyi konfiguráció bekötése a meglévő szolgáltatásba. |
| `app/public/media-analysis.js` | Módválasztó, pontos előnézet, külön adat/költségjelölések és hibák. |
| `app/public/sorting.js` | Szolgáltatófüggetlen Képelemzés gombfelirat. |
| `tests/analysis-providers.test.mjs` | Ollama HTTP-loopback, OpenAI fixture és katalógusintegráció. |
| `tests/media-analysis-ui.test.mjs` | Felületi módok, jóváhagyási határ és idempotens újrapróbálás. |
| `.gitignore` | Helyi provider-konfiguráció kizárása. |
| `docs/DIRECT_AI_ANALYSIS.md` | Ez a műszaki/ellenőrzési és visszaállítási jelentés. |
| `docs/MEDIA_ANALYSIS.md`, `docs/AI_MEDIA_ANALYSIS_PLAN.md`, `docs/AI_PROVIDER_COMPARISON.md` | Aktuális implementációs állapot és hivatkozás. |
| `DECISIONS.md`, `DEVELOPMENT_PLAN.md` | A leszállított fejlesztési döntés és állapot. |

## Tesztek és első valódi próba

Kiinduló teljes regresszió: **190/190**. Az új adapter-/UI-tesztek száma **39**;
az új és meglévő képelemzési részhalmaz **55/55**, teljes regresszió **229/229**.
A parancsok: `node --test tests/analysis-providers.test.mjs tests/media-analysis.test.mjs tests/media-analysis-ui.test.mjs`
és `node --test tests/*.test.mjs`. `git diff --check` hibamentes.
Az első sandboxos kísérlet a loopbacket EACCES-szel blokkolta; az engedélyezett
helyi tesztfuttatás eredményei szerepelnek itt. Nem a sandboxhibákat tekintettük
termékhibának. A Windows tényleges JPEG-dekódolója is szintetikus BMP-n futott.
A UI-próba determinisztikus vezérlőteszt, nem natív böngésző-/iOS-teszt.

A fixture eredménye csak a programfolyamatot igazolja. Az Ollama HTTP-szerver
saját szintetikus szerver volt; az OpenAI fetch kizárólag rögzített helyi választ
adott. Nem bizonyított a valós modell kompatibilitása, rendelkezésre állása,
sebessége, licencmegfelelősége, hardverigénye vagy felismerési pontossága.

Az első valódi próbához külön kiválasztott/engedélyezett képkészlet, konkrét
vision modell és snapshot/digest, helyi hardver-/licenc-/offline-konfiguráció
ellenőrzés kell. Modelltelepítéshez külön engedély szükséges. OpenAI esetén
aktuális modell-/ár-/adatkezelési ellenőrzés, backend kulcs, szolgáltatói keret,
majd a konkrét képtovábbítás és költség előnézeti jóváhagyása is kell.
Kezdetben kis, előre címkézett szintetikus/engedélyezett nyilvános tesztkészletet
használjunk; a pontosságot és a téves pontoshely-javaslatokat azon kell mérni.

Hivatalos források, ellenőrizve 2026-10-30:
[Ollama chat](https://docs.ollama.com/api/chat),
[vision](https://docs.ollama.com/capabilities/vision),
[structured outputs](https://docs.ollama.com/capabilities/structured-outputs),
[modell-inventory](https://docs.ollama.com/api/tags),
[Ollama local-only FAQ](https://docs.ollama.com/faq),
[OpenAI képbemenet](https://developers.openai.com/api/docs/guides/images-vision),
[Responses structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses),
[OpenAI adatkezelési kontrollok](https://developers.openai.com/api/docs/guides/your-data).
