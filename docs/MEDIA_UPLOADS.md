# Képfeltöltés ChatGPT-ből és Grokból

Ellenőrzés dátuma: 2026-10-28. A meglévő katalógus, stabil karakter- és
médiaazonosítók, hitelesítés, privát fájltároló és importszolgáltatás bővítése.
Nem készül második éles adatbázis. Nincs új publikus port, szolgáltatókulcs vagy
fizetős API-hívás.

## Melyik átadás használható?

| Kliens | Elsődleges út | Tartalék út |
| --- | --- | --- |
| ChatGPT plugin | `import_media_files`, a host által feloldott natív fájlparaméterekkel | Valós HTTPS URL; programozott darabolás, ha elérhetők a bájtok; privát feltöltőoldal |
| Grok chat / app | Valós, elérhető HTTPS URL, ha a kliens ilyet ad | MCP-darabok, ha programból olvasható a fájl; egyébként privát feltöltőoldal |
| Grok Bot | Ugyanazok az MCP-eszközök; a Bot saját gépén elérhető bájtok programozott átadása lehetséges kliensfeladat | Privát feltöltőoldal |

A [ChatGPT hivatalos fájlparaméter-leírása](https://developers.openai.com/plugins/reference#file-apis)
az `openai/fileParams` metaadatot és a `download_url`, `file_id`, opcionális
`mime_type`, `file_name` mezőket írja elő. A szerver ezek teljes sémáját hirdeti,
és a tényleges letöltött bájtokat ellenőrzi. Ez nem az OpenAI Files API, nem kér
API-kulcsot. A hoszt fájlfeloldásának elérhetőségét valódi bejelentkezett
ChatGPT-feltöltéssel külön kell igazolni; a helyi protokollteszt ezt nem bizonyítja.

A [Grok custom MCP leírása](https://docs.x.ai/grok/connectors) egyedi eszközsémákat
és hitelesített csatlakozást támogat. Nem dokumentálja a fenti OpenAI-metaadat
vagy a csevegési mellékletek automatikus átadását. A
[Grok Bot fájlkezelése](https://docs.x.ai/grok-bot/files-and-results) a Bot saját
munkakörnyezetére és megnevezett alkalmazásaira vonatkozik; nem jelenti azt,
hogy egy egyedi MCP-szerver hozzáfér a Bot fájlútvonalaihoz. Az
[xAI API távoli MCP-je](https://docs.x.ai/developers/tools/remote-mcp) külön API,
nem bizonyítja a fogyasztói felület fájlátadását. Ezeket nem kezeljük azonosként.

A szerver nem olvas be asszisztens által megadott helyi útvonalat, sandbox-hivatkozást,
attachment handle-t vagy kitalált base64-et. Egy képet látni nem egyenlő az eredeti
bájtok elérésével. Ha nincs tényleges átadási lehetőség, a visszaadott privát
`upload_url` oldalon kell kiválasztani a fájlokat. Ehhez a meglévő Tailscale
azonosság és a működő laptopkapcsolat szükséges.

## Közös műveletek

1. `list_characters` / `get_character`: az aktuális karakterazonosítók ellenőrzése.
2. `begin_media_import`: `request_key`, `character_ids` (1–50), opcionális
   `title`, `description`, `reference_candidate`, `provenance`. A régi
   `character_id` továbbra is használható, de a két alak egyszerre nem.
3. Fájlonként válassz tényleges átadást:
   - `import_media_url`: egy letölthető HTTPS URL és stabil `slot_key`;
   - `begin_media_upload` → `upload_media_chunk` → `finalize_media_upload`;
   - vagy nyisd meg az import privát feltöltőoldalát.
4. `get_media_import` / `get_media_upload`: ellenőrizd a képenkénti eredményt,
   `media_id`, tényleges méret, SHA-256 és `associations[].linked` értékeket.
5. `get_media` és `search_media` ellenőrzi a létrejött katalógusadatot. A
   `get_media(include_image:true)` jó minőségű referenciaképet ad (legfeljebb
   2048 px / 3 MiB); image_quality:original külön kéri az eredeti bájtokat.
   Lásd [referenciák és eredetik](ORIGINAL_IMAGES.md).

ChatGPT-ben a `import_media_files` ezt egy hívásba vonja össze: `request_key`,
`character_ids`, `files[]`, opcionális közös cím/leírás/proveniencia. Minden fájl
külön eredményt kap; egy hibás fájl után a többit is megpróbálja. A host által
adott fájlobjektumokat kell használni. Eltérő címhez vagy célkarakterekhez külön
import szükséges. Új karakter esetén előbb a meglévő idempotens karaktermentési
művelettel hozz létre rekordot, majd annak visszaadott ID-ját használd.

Minden sikeres kép az import összes karakteréhez kapcsolódik. A profilok,
kapcsolatleírások, borítók és kánon nem változnak. A cím az import eredetadatában
marad és kereshető; a rövid leírás új média esetén az eddigi `media_notes.notes`
mezőbe is bekerül. Meglévő megjegyzést nem ír felül. Az importeredetben tárolt
`reference_candidate:true` csak jóváhagyatlan javaslat; nem hoz létre
face/body/general szerepet vagy kánonrevíziót.

## Darabolt feltöltés és helyreállítás

- PNG/JPEG, tényleges dekódolással: legfeljebb **20 MiB / 40 megapixel**.
- Darabméret: **262144 bájt**; base64-ben legfeljebb 349528 karakter.
- Az utolsó darab a fennmaradó méret. A darabok sorrendben, bájtoffsettel mennek.
- Egy import: legfeljebb 20 fájlhely és 250 MiB. Legfeljebb 50 aktív import;
  a félkész darabolt feltöltések összes lefoglalt mérete legfeljebb 256 MiB.
- Az import és feltöltés 24 óráig él. A határidő nem hosszabbodik újrapróbálástól.
- Azonos offset + bájtok biztonságosan ismételhetők. Más bájtok ugyanazon
  offsethez, más tartalom ugyanahhoz a kéréskulcshoz hibát adnak.
- Újraindítás után `get_media_upload.received_bytes` alapján folytatható.
  Az eredeti fájlt újra kiválasztva a privát oldal is ezen az offseten folytatja.
- Lejárt feltöltésnél új importot kell kérni. Az eredeti képek hash-alapú
  deduplikációja megőrzi a már elmentett média ID-ját. Staging-sérülésnél is új
  import szükséges; a szerver nem találja ki vagy cseréli le a hiányzó bájtokat.
- Lejárt staging-fájlok következő induláskor vagy új darabolt feltöltés
  előkészítésekor törlődnek. Siker után a darabok azonnal felszabadulnak.
- A befejezett import átvételi bizonylata megmarad. Ha egy későbbi kézi művelet
  eltávolította a hozzárendelést, az ellenőrzés `linked:false` értéket mutat;
  az újrapróbálás nem vonja vissza a későbbi kézi rendezést.
- Natív fájlköteg újrapróbálásakor ugyanaz a sorrend és fájl-ID szükséges.
  Lejárt letöltési URL frissíthető, a sikeres elemeket nem tölti le újra.
- MP4/MOV korábbi URL- és privátoldalas importja megmarad, 100 MiB határral;
  az új darabolt és natív fájlművelet képekre korlátozott.

## Biztonság, adatmegőrzés

A stdio ChatGPT-alagút és az OAuth-védett Grok HTTP gateway ugyanazt a
hitelesített loopback írási szolgáltatást használja. `trusted` módban a kifejezett
mentési kéréshez nincs új képenkénti beszélgetéses jóváhagyás. `review` módban a
közvetlen natív/URL/darabolt eszközök nem írhatnak; a személyesen használt privát
oldal a meglévő Tailscale-, Origin- és CSRF-ellenőrzéseken át tölthet fel.

Minden szakasz és a végső tranzakció újra ellenőrzi a karakterek létezését és
aktív állapotát. Az új fájl és minden kiválasztott kapcsolat egy közös adatbázis-
tranzakcióval kap bizonylatot. Adatbázishiba után a hash-címzett eredeti újra
felhasználható; nincsenek félkész karakterkapcsolatok. Az import nem ír felül
eredetit, nem állít vissza eltávolított médiát és nem változtat kánont.

A közös URL-letöltő megtartja a nyilvános HTTPS/443, DNS-rögzítés, belső címek
kizárása, átirányítás-újraellenőrzés, idő- és méretkorlát szabályait. Nem továbbít
hitelesítő fejlécet vagy sütit. Natív fájlok átmeneti URL-je és nyers fájl-ID-ja
nem kerül naplóba/átvételi bizonylatba; csak az ID hash-e tárolódik. A kliens
fájlnév nem tárolási útvonal. Staging: adatkönyvtár/`upload-staging`, bélyegképek:
adatkönyvtár/`import-thumbnails`; mindkettő OneDrive-on kívül. Az eredetik a
meglévő médiagyökér `Imported media` könyvtárába kerülnek.

## Telepítés, újraindítás, frissítés

Nincs új környezeti változó vagy titok. Megmarad a `LIVING_UNIVERSE_DATA`, a
gateway meglévő `LU_MCP_CONFIG` / `LU_GROK_CONFIG` felülbírálata és a stdio szerver
`--config` opciója. Használd a már működő beállításokat; ne hozz létre új katalógust.

A 019-es migráció csak importcél-, eredet- és feltöltési állapottáblákat ad hozzá.
Meglévő katalógus első frissített indulásakor ellenőrzött online SQLite-mentés
készül a helyi `backups/before-media-uploads-<UUID>.sqlite` fájlba. A korábbi
importok az eredeti egy karakterükkel továbbra is olvashatók. A logikai export
az új táblákat is tartalmazza. Visszaállításkor a félkész feltöltések lejárnak,
mert az export nem tartalmaz ideiglenes fájldarabokat; a befejezett átvételi
bizonylatok és kapcsolatok megmaradnak.

Újraindítás sorrendje, ha a szolgáltatások nem indulnak automatikusan:

1. Internet és Tailscale; Windows-bejelentkezés. Ellenőrizd, hogy a laptop ébren van.
2. A meglévő **Living Universe catalogue runtime** / **Start Living Universe.cmd**.
   Ellenőrizd a 4317-es alkalmazást és a megszokott adatbázishelyet.
3. **Living Universe Private MCP Tunnel** és **Living Universe Grok Gateway**.
   Ezek egymáshoz képest bármilyen sorrendben indulhatnak, az appnak már futnia kell.
4. ChatGPT: **Plugins → Living Universe → Manage → Refresh tools**; új beszélgetésben
   válaszd a Living Universe-t. Új képes eszközök: `import_media_files`,
   `begin_media_upload`, `upload_media_chunk`, `get_media_upload`, `finalize_media_upload`.
5. Grok: a meglévő Living Universe connector marad a
   `https://laptop.taild897f8.ts.net:8443/mcp` címen. Frissítsd az eszközlistát,
   illetve nyiss új üzenetet/beszélgetést a már csatlakoztatott Botban. Ha a kliens
   nem veszi át az új sémákat, a meglévő kapcsolat újracsatlakoztatása szükséges.

Ne állítsd vissza az adatbázist pusztán egy connector- vagy hotspot-hiba miatt.
Forrás-visszaállításhoz a mentett régi kódot használd, majd indítsd újra a
szolgáltatásokat. A 019 down migráció csak külön, mentés utáni helyreállítási
eljárásban indokolt; nem törli az eredeti képeket vagy karakterkapcsolatokat.

## Használati példák

ChatGPT, a képek csatolása után:

> Keresd ki A és B karakter azonosítóját a Living Universe-ben. Mentsd ezt a két
> csatolt képet, mindkettőt rendeld mindkét karakterhez. A leírás: közös jelenet.
> Ne jóváhagyott referenciaként mentsd. Ellenőrizd a médiaazonosítókat és a hash-eket.

Grok / Grok Bot:

> Mentsd ezt a kiválasztott képet a Living Universe-be A karakterhez. Ha eléred
> a tényleges fájlbájtokat, használd a darabolt feltöltést; ha van valódi letöltési
> URL, importáld azt. Máskülönben készíts privát feltöltőlinket. Csak ellenőrzött
> bizonylat után mondd, hogy elmentetted. Ne változtass profilt vagy kánont.

Az A és B helyére bármely meglévő vagy később létrehozott karakter neve kerülhet;
az eszközök a keresésből kapott UUID-ket használják, nincsenek kódba írt szereplők.

## Ellenőrzés határai

Automatizált izolált tesztek: valódi 3 MiB feletti PNG dekódolása, szolgáltatás-
újraindítás utáni folytatás, több célkarakter és később létrejött karakter, hash és
bélyegkép, visszaolvasás és címkeresés, natív fájlköteg részleges hibája és friss
URL-es javítása, idempotencia, hibás formátum/méret/ID/base64/hash, lejárat,
korlátok, tranzakciós hiba, jogosulatlan és review-módú kérések, privát oldal
azonosság/Origin/CSRF, export/restore, valamint a meglévő teljes tesztcsomag.

ChatGPT-külön teszt: valódi stdio JSON-RPC-n natív `fileParams` sémával és
ellenőrzött fixture-bájtokkal. Grok-külön teszt: OAuth/PKCE jóváhagyási folyamaton
át hitelesített HTTP MCP feltöltés és visszaolvasás. A host fájl-URL-feloldás,
Grok chat/Bot tényleges melléklet-hozzáférés és generált kép közvetlen átadása
csak bejelentkezett klienssel igazolható; a protokolltesztek ezt nem helyettesítik.
Az aktuális futás pontos tesztszáma és telepítési állapota a külön átadási
jegyzőkönyvben szerepel. Valódi karakteren nincs feltöltési kísérlet.


## List and cancel imports (2026-10-30)

The shared backend exposes **list_media_imports** and **cancel_media_import** to
ChatGPT stdio and Grok OAuth/Streamable HTTP. Import capability version 3 gates
these tools; older backends do not advertise them. No new credentials or public
routes are required. Refresh the connector tools after restarting the catalogue,
Grok gateway and private MCP tunnel.

An import reserves one of 50 open sessions until expiry or explicit cancellation,
even if all currently selected files have already committed. Partial chunk
uploads additionally reserve their declared sizes within the 256 MiB limit.
The list returns capacity, per-import committed/failed counts, reserved/received
bytes, target characters, dates, status and bounded pagination. Default status
is open; filters are open, expired, cancelled, all, and optional character_id.
An old session is not automatically unwanted. Inspect it before cancellation.

Cancel by exact import_id to close a finished or abandoned session. Only temporary
upload chunks are removed. Saved originals, thumbnails, character associations,
profiles, approved canon and import receipts remain unchanged. Cancellation is
an append-only media_import_events receipt, included by existing export/restore;
no schema migration is required. Retrying cancellation is safe and retries any
incomplete cleanup. A cancelled request_key never creates a replacement import;
start a new request_key for a new upload. Cancelled sessions reject URL, native
file and chunk writes, including delayed downloads. Active byte processing
returns BUSY; retry the same cancellation after that operation finishes.

cleanup_complete:false means logical capacity was released but temporary-file
cleanup remains pending. Do not report those bytes deleted. Retry cancellation;
startup/new-upload cleanup also retries. Unexpected files/junctions are preserved
and reported as pending cleanup, never traversed or deleted. Cancelled status
survives expiry, restart and logical restore. Committed upload receipts remain
readable and finalize retries remain idempotent.

In trusted mode, the user's explicit cancellation request needs no additional
conversational confirmation. Review mode allows listing, but cancellation uses
the private **/media-imports** page at the existing Tailscale origin. This page
also works in trusted mode; it requires the existing allowed Tailscale identity,
same Origin and CSRF token. The existing upload page links to it.

Example on either platform: “List the open Living Universe imports and their
reserved capacity.” Then: “Cancel import <import_id>; keep the saved images.”
For API callers: list_media_imports({status:"open",limit:20,offset:0}), then
cancel_media_import({import_id:"returned UUID"}). Verify capacity and
cleanup_complete. Never issue a bulk cancellation merely to suppress a quota
error without knowing which sessions the user wants closed.
