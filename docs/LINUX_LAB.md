# Elkülönített Linux-próba

Ez a fejlesztési csomag a `055b5ae28db7558482b60d61944bf1df72fb7014` main-checkpointból készült. Nem telepít vagy indít éles szolgáltatást. A direct-ai, plugin-development és rename-integration snapshot külön forrás és külön adatbázis marad.

## Hordozható forráscsomag

Node 24.22.1 a csomag gyökerében:

```sh
node ops/linux/package-lab.mjs --output /absolute/new/lu-linux-lab
```

A kimenetnek új, nem létező, a checkouton kívüli könyvtárnak kell lennie. A csomag ellenőrzőösszeges forrásjegyzéket tartalmaz; Git-előzményt, függőségkönyvtárat, katalógust, médiát, titkot vagy működő kapcsolatot nem másol. A példakonfigurációk nem töltődnek automatikusan. A `.env` fájlt az alkalmazás nem tölti be.

## Linux-futtatás Dockerrel

Külön Linux-gép/VM és Docker szükséges. A helyi Windows gépen külön, szintetikus WSL2-labor is használható; a Docker Engine csak annak Linux-vendégében fut. A forráscsomag könyvtárában:

```sh
sh ops/linux/run-lab.sh
```

Az explicit image build internetet igényel a rögzített Node/pnpm/sharp csomagokhoz. A tesztkonténer hálózata le van tiltva; a saját loopback szolgáltatásai továbbra is működnek. Nincs hostport, éles adatmount vagy titokátadás. A konténer korlátozott felhasználóval, csak olvasható gyökérrel, saját eldobható temp fájlrendszerrel, egy CPU-val és 2 GiB memóriával fut. A 40 MP stressztesztekhez a mért igény alapján növelhető a laborlimit, a production média bevonása nélkül.

Konténer nélkül egy elkülönített Linux VM-en Node 24.22.1 és pnpm 11.25.0 kell:

```sh
pnpm install --frozen-lockfile --ignore-scripts
node ops/testing/run-tests.mjs
```

Utóbbi esetben a tesztek alkalmazásszintű egress-védelme mellett az operációs rendszerben is tiltsd a külső teszthálózatot. A runner friss saját temp/HOME/XDG/LOCALAPPDATA könyvtárakat és kulcsmentes környezetet használ. Csak `tests/*.test.mjs` fájlokat indít; a manuális pilot/full-library programok nem tesztbelépők. Az új képtesztek valódi portable dekódert használnak Windows alatt is; ez nem helyettesíti a valódi Linux-futtatást.

A suite szintetikus DB-t és programozott képeket készít, teszteli az EXIF-orientációt/cropot, eredeti bájtokat/SHA-t és chunkokat, MCP/HTTP/OAuth/CSRF határokat, a kánon/policy védelmét és a mentés/restore folyamatot. Nincs valós AI-hívás. A runner kiírja a platformot, Node/SQLite-verziót, tesztszámokat, hibákat és skip-eket. A Linuxon kihagyott Windows-GUI/DPAPI launcher-tesztek nem Linux-tunnel-validációk.

## Szolgáltatásindítás: létező katalógus, explicit konfiguráció

`node app/start-existing.mjs`, `LU_MCP_CONFIG=/absolute/private/mcp-config.json`, opcionális `PORT`. A fő app loopbacken figyel; mobil alapból 4318, külön Grok gateway 4320. Az MCP stdio használata: `node mcp/server.mjs --config /absolute/private/mcp-config.json`; a `LU_MCP_CONFIG` is támogatott. Az alap config helye az explicit `LU_RUNTIME_HOME`, vagy Windows LOCALAPPDATA, illetve XDG_DATA_HOME/`~/.local/share` alatt van. Az adatbázis neve `universe.sqlite`; más nevű fájlt a service belépő elutasít, nem helyettesít egy másik katalógussal.

A service nem készít üres DB-t és nem bootstrapel Windows recovery-mentésből. A tesztadatbázisokat a tesztkód a `createApp` API-val inicializálja. Az `ops/linux/*.service` fájlok átnézendő sablonok, nem telepített unitok. A szerveroldali titkok, útvonalak és a mountok külön beállítandók. A privát 443 Serve→4318 és az opcionális publikus Grok 8443 Funnel→4320 útvonal nem cserélhető fel; a 4317-es desktop portot nem szabad publikusra állítani.

Linux szolgáltatásnál kötelező a config `mediaRootId` értéke és a hozzá tartozó, privát médiaköteten elhelyezett `.living-universe-storage.json` marker (`{"storage_id":"azonos-privat-azonosito"}`). Ez a kis fájl nem kerül Gitbe. A szolgáltatás induláskor és minden scan előtt ellenőrzi: hiányzó vagy lecserélt mount esetén nem indul tömeges hiányzónak jelölés. A `linux-mcp-config.example.json` mutatja az útvonalakat; a marker létrehozása későbbi explicit környezetbeállítás, most csak szintetikus tesztben történt.

## Titkok és a natív tunnel szolgáltatás

A backend támogatja az explicit `OPENAI_API_KEY_FILE`, `XAI_API_KEY_FILE`, `SOGNI_API_KEY_FILE` opciókat és a systemd `CREDENTIALS_DIRECTORY` azonos nevű credential-fájljait. A megadott környezeti kulcs elsőbbséget élvez; fájlbetöltés nem engedélyez providert vagy indít modellt. Linuxon az olvasható credential-fájl az adott UID tulajdona, csak annak hozzáférhető (0600/0400), és nem lehet symlink. A Windows DPAPI fallback megmarad. Titkot unitfájlba vagy parancssori argumentumba nem szabad tenni.

A `living-universe-tunnel.service` külön, nem telepített sablon. A native wrapperhez hivatalos, a cél Linux-architektúrára való kliens kell az explicit `LU_MCP_TUNNEL_CLIENT` helyen; a provisionált profil a `LU_MCP_PROFILE_DIRECTORY` alatt van. A profil stdio parancsa abszolút Node és `mcp/server.mjs --config /etc/living-universe/mcp-config.json` legyen. A Windows profil nem konvertálódik automatikusan. A wrapper kizárólag doctor→run folyamatot indít, GUI és új kulcs létrehozása nélkül. A tunnelkulcsot külön `CONTROL_PLANE_API_KEY_FILE` vagy systemd `LoadCredential` adja át. Providerkulcs és Node preload nem kerül a kliensbe; az MCP adapter eltávolítja a továbbörökölt tunnelkulcsot is.

A wrapper single-instance lockot használ. Normál kilépéskor eltávolítja; kényszerleállítás után a régi lockot csak az adott teszt/szolgáltatáspéldány leállásának ellenőrzése után szabad helyreállítani. Nincs automatikus locktörlés egy bizonytalan másik folyamat mellett. A natív CLI-t szintetikus fake klienssel teszteltük; ez nem állít élő OpenAI kapcsolatot vagy bináris-kompatibilitást.

## Windowsból származó relatív útvonalak

Linuxon a meglévő Windowsos katalógusútvonalakat az app indulás előtt elutasítja. Az offline, kizárólag másolaton használandó eszköz:

```sh
node ops/linux/paths.mjs preview --database /copy/universe.sqlite --plan /private/new-path-plan.json
node ops/linux/paths.mjs apply --database /copy/universe.sqlite --plan /private/new-path-plan.json --backup /private/new-before-paths.sqlite
```

A másolat minden írója legyen leállítva. Az eszköz nem keres élő telepítést, nem mozgat médiát, és új ellenőrzött SQLite backupot készít az átvezetés előtt. Az előnézet a célplatformhoz tartozik; hibás/ütköző útvonal, stale terv, függő jóváhagyás vagy befejezetlen fájlművelet esetén nincs átvezetés. Csak az aktuális tárolási mutatók módosulnak. A kánon, stabil ID-k, hozzárendelések, történeti journal és hash-kötött payloadok megmaradnak; a történeti műveletek végrehajthatóságát nem teszi automatikusan hordozhatóvá. A példány új helyi írási jogosultságot és a Linux DB-úthoz tartozó `database_id`-t igényel.

## Képdekóder

Linuxon sharp 0.35.5 az alap, Windows alatt a meglevő PowerShell út marad az alap. `LU_IMAGE_DECODER=portable` mindkét rendszeren az új backendet választja. A portable dekóder külön, időkorlátos Node-folyamatban fut, allowlistelt környezettel, kép-bemenettel és korlátos JPEG-kimenettel. Nem örököl API/tunnelkulcsot vagy Node preloadot.

JPEG/PNG/GIF és az ellenőrzött BMP DIB változatok támogatottak; a BMP olvasó az ismeretlen kódolást elutasítja. A WebP browseres képkivágás támogatása külön alkalmazásút, a teljes eredeti MCP-formátumkészlet nem bővül automatikusan a sharp összes támogatott formátumára. A dekódercsere JPEG bájteltérést okozhat; az eredeti bájtok és forrás-SHA változatlanok. Jövőbeli direct-ai átvezetésnél a preprocess/cache/preview verzióit módosítani kell, a korábbi kéréseket nem szabad automatikusan újraküldeni.

## Mentés Linuxon

```sh
node ops/backup/backup.mjs create --config /private/mcp-config.json --destination /private/backups --stage /private/staging --private-runtime omit
```

Az `omit` explicit, credential nélküli adat/forrás/asset mentést jelent. Ez nem teljes hozzáférés-helyreállítás. Alapból a Linux privát runtime mentés hibával leáll, mert nincs bekötött platformfüggetlen titkosított credential-backend; a Windows DPAPI ágat nem próbálja sikernek feltüntetni. A source whitelist az új Linux `.service`, `.sh`, Dockerfile és lock forrásokat is megőrzi. Az eredeti médiabájtok továbbra is külön mentést igényelnek.

## A tényleges Linux-validáció jegyzőkönyve

A csomag generálásakor a Linux-futtatás állapota `pending`. A célgépen rögzítsd: CPU/OS, Node/SQLite/sharp/libvips verzió, futtatási parancs, pass/fail/skip, integritás/FK eredmény, hálózattiltás és 0 valódi providerhívás. A konténeres siker nem bizonyítja a systemd bootot, a valódi mountkiesést, a külön eszközös EXDEV-t, a natív tunnelklienst vagy a tényleges Tailscale/ChatGPT/Grok fiókengedélyt. Ezek a következő külön laborpróbák.

## 2026-11-01 source refresh

The current package integrates the six post-checkpoint main commits and schema 024.
See [Post-labeling source checkpoint](POST_LABELING_LINUX_CHECKPOINT.md).
LAB-MANIFEST.json records both the actual source revision and integrated main.
Build packages from a clean committed Git checkout; actual Linux validation remains pending.

## Linux CI

A .github/workflows/linux-lab.yml a linux-compatibility ágon Ubuntu 24.04
futtatón hajtja végre a hálózat nélküli Docker-próbát. A fő és direct-ai
változat külön, legfeljebb 15 perces, egymás utáni job. A checkout egyetlen
forráscommitot kér, nem őriz Git-credentialt, és csak contents:read jogosultsága van.
Nincs provider-secret, production mount, hostport, cache- vagy artifact-feltöltés.
A build csomagletöltést végez; az alkalmazástesztek network none konténerben futnak.
Ez GitHub Actions compute-keretet használ a privát repository tulajdonosánál,
nem AI-modellhívást. Valós Linux-kernel/dependency teszt, de nem WSL reboot,
systemd boot, éles tunnel vagy médiamigrációs bizonyíték.

## Linux privát mentés

Az explicit age-kulcsos, inaktív helyreállítás és a systemd credential-provisionálás menete: [LINUX_PRIVATE_RUNTIME.md](LINUX_PRIVATE_RUNTIME.md). A DPAPI-fájlok nem hordozható Linux-hitelesítések.
