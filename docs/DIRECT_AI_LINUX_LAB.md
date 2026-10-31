# direct-ai: külön Linux-próbacsomag

Alap: `pre-cloud/direct-ai-20261031`, `18a04672c8e20f8295a7a37efecf1d7c196d2d33`. Fejlesztési ág: `linux-compatibility-direct-ai`. Ez külön képelemzési változat, nem a main frissítése. A 021/022/023 migrációk itt note-hashtags/location-hierarchy/media-analysis; a main adatbázisa nem használható hozzá. A main újabb owner-policy/organized storage/rename/crop-approval moduljai nincsenek automatikusan integrálva. Ezért ez a csomag nem telepíthető a jelenlegi fő app helyére.

Átvezetett kompatibilitási elemek: explicit config/XDG feloldás, létező DB-re korlátozott szolgáltatásindítás, médiakötet-marker, szigorú útvonal-átvezetési eszköz, portable sharp-dekóder külön kulcsmentes folyamatban, POSIX útazonosság és célkötetes crop staging, explicit credential nélküli backup, scoped credential-fájlbetöltő és natív tunnel-wrapper. Ezek kiválasztott forrásváltoztatások; nem történt ág- vagy sémamerge.

Node 24.22.1, pnpm 11.25.0, sharp 0.35.5. Windows alatt is a portable backendet választja az izolált runner:

```sh
pnpm install --frozen-lockfile --ignore-scripts
node ops/testing/run-tests.mjs
```

A runner csak `.test.mjs` fájlokat indít, kulcsmentes friss temp/HOME/XDG/LOCALAPPDATA környezettel, egy tesztworkerrel és alkalmazásszintű egress-tiltással. A tesztnevekben előforduló „real HTTP” itt loopback fixture-szervert jelent, nem valódi modellt. Manuális `private-*.mjs`, pilot vagy full-library runner nem indul.

Hordozható forráscsomag:

```sh
node ops/linux/package-lab.mjs --output /absolute/new/direct-ai-linux-lab
```

Új, a checkouton kívüli könyvtárba ír. Nem tartalmaz függőségeket, Git-előzményt, éles katalógust, médiát, kulcsot vagy meglévő elemzési tervet/eredményt. A fájlok SHA-256 jegyzéke a LAB-MANIFEST.json-ban van. A Linux-validáció állapota csomagoláskor `pending`.

Külön Linux-gépen Dockerrel:

```sh
sh ops/linux/run-lab.sh
```

A build függőségletöltést végez; a tesztkonténer hálózata tiltott, nincs hostport/production mount vagy titokátadás. A fő alkalmazás próbacsomagja és ez a változat külön konténerben, külön adatállapotban tesztelendő. Linux szolgáltatásnál `LU_MCP_CONFIG` és a `mediaRootId`-hoz tartozó `.living-universe-storage.json` marker szükséges; az új teszt-DB-t a saját `createApp` inicializálja. A default szolgáltatás nem készít üres pótkatalógust.

A Linux képszármazék más JPEG-bájtokat adhat, ezért a preprocess verzió most `reference-2048-jpeg-portable-2`. Ezzel cache/preview/request azonosság változik. Régi jóváhagyott tervet nem frissítünk vagy küldünk újra automatikusan. A forrásmanifest mtime/ctime értékei másoláskor is változhatnak. A Windows decoder alapútja külön, a korábbi preprocess-verzióval megmarad.

Az explicit manuális elemzési runner Linux-kulcsforrása `LU_ANALYSIS_CREDENTIAL_FILE`, vagy a systemd `CREDENTIALS_DIRECTORY/OPENAI_ANALYSIS_KEY` külön fájlja. Egy tetszőlegesen örökölt OPENAI_API_KEY nem helyettesíti ezt. Az adapterek és az előnézeti adat/költségengedély továbbra is külön kapuk. A fájlt csak az adott UID olvashatja; nincs valódi kulcs a csomagban. A jelen munkában a manuális runner nem futott, ezért annak Linuxon történő teljes élettartama még külön ellenőrzendő.

Az adatbázison kívül megőrzendő: plan/approval/budget amendment/receipts/status, staging média, world-index és retention, worker.lock és az egyes próbálkozások állapota. A Linux útvonal-átvezetés blokkolja a queued/running/paused elemzési jobokat is. A `PROVIDER_OUTCOME_UNKNOWN` és az ismeretlen költségű started/unknown próbák nem tehetők automatikusan queued-ba. A régi lockot nem szabad másik futó példány mellett törölni. A Windows sleep guard Linuxon kihagyódik; a cél tesztszerver alvás/reboot/szabályos leállítás feltételeit külön kell ellenőrizni.

Nem történt deployment, main merge/push, valódi modellhívás, modelltelepítés vagy az élő képcímkéző állapotának megváltoztatása. A Linux-futtatás, a valódi CLI/systemd/Tailscale/tunnelkapcsolat és a manuális runner szintetikus végponttal végzett teljes próbája még hátravan.
