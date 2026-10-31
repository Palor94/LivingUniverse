# Living Universe – mentés és helyreállítás

Ez a közös belépőpont az alkalmazáshoz, a ChatGPT/Grok MCP-csatlakozóhoz és a privát adatmentésekhez. GitHub: **Palor94/LivingUniverse**, napi forrás: **main**. Az `app/` és `mcp/` könyvtárak maradnak a helyükön; az importok és indítók ezekre épülnek. A mentési egységek géppel olvasható jegyzéke: `ops/backup/components.json`.

| Egység | Forrás a GitHubon | Privát mentési parcella |
|---|---|---|
| Living Universe alkalmazás | app/, package.json, indítók, tests/, docs/ | source/app/ és közös források |
| ChatGPT/Grok-csatlakozó | mcp/ és az integrációs dokumentumok | source/mcp/, private/runtime.dpapi, platform/mcp-runtime/ |
| Katalógus, karakterek, kánon, események, sablonok | Sémák és kezelők; konkrét adatok nincsenek az aktuális forrásfában | catalogue/universe.sqlite, catalogue/catalogue.json, catalogue/schema.sql |
| Helyszínvászon és tervek | app/location-canvas.mjs, docs/LOCATION_CANVAS.md | state/location-canvas*.json |
| Helyi fájl-visszaállítás és folyamatban lévő importok | app/image-crops.mjs, médiaimport/-generálás kezelők | local-assets/: vágás előtti eredetik, import-/feltöltési munkafájlok, generálási helyreállítás |
| Futtatási környezet | Indítók, telepítőszkriptek, dokumentáció | platform/: verziók, alagútkliens és licencek; private/: beállítások, feladatdefiníciók |
| Média | A fájlkezelő kód | media/manifest.json; eredetik a meglévő OneDrive-médiagyökérben |
| Mentési eszközök | ops/backup/, ez az útmutató | A source/ másolat részei |

## Friss mentés készítése

1. Fejezd be az aktív importot, képkivágást vagy mappamozgatást, és a mentés alatt ne szerkeszd az adatokat. Az alkalmazásnak nem kell leállnia.
2. Kattints a **Backup Living Universe.cmd** fájlra. A parancs a meglévő helyi MCP-konfigurációból olvassa a tényleges adatbázis- és médiagyökeret; nem hoz létre üres pótkatalógust.
3. Alapértelmezett cél: `%OneDrive%\LivingUniverse Backups`. Minden futás új, dátumozott `snapshots/<azonosító>/` könyvtárat készít. Korábbi mentést nem ír felül és nem töröl. A sikeres ellenőrzés után frissül a `LATEST.json` mutató.
4. A mentés először helyi ideiglenes könyvtárban készül, majd ellenőrzés után kerül a OneDrive-mappába. Minden fájlhoz SHA-256 és méret tartozik. A `MANIFEST.json` külön rögzíti a SQLite-pillanatkép és a teljes mentés idejét. **A helyi másolás sikere nem igazolja a OneDrive felhőszinkron befejezését.** Ellenőrizd a OneDrive kliens szinkronállapotát is.

Haladó használat (Node.js 24+):

```powershell
node ops/backup/backup.mjs create --destination "D:\LivingUniverse Backups"
node ops/backup/backup.mjs verify --snapshot "D:\LivingUniverse Backups\snapshots\AZONOSITO"
node ops/backup/backup.mjs restore --snapshot "D:\LivingUniverse Backups\snapshots\AZONOSITO" --target "D:\UJ-helyreallitas"
```

A SQLite-pillanatkép a Node beépített online backup API-jával készül, a nyitott WAL-ban lévő, már véglegesített tranzakciókkal együtt. A mentett adatbázison teljes integrity_check, foreign_key_check és táblánkénti rekordszámlálás fut. A JSON és a séma ugyanebből a lezárt másolatból származik. Az SQLite önmagában konzisztens; a külön JSON-tervek, beállítások és külső média megfigyelései nem közös, minden fájlt egyszerre lezáró tranzakcióból származnak.

## Helyreállítás hiba esetén

1. Egy segítő chatnek add meg ezt a repositoryt és a `RECOVERY.md` útvonalat. Ha a Living Universe bővítmény hibás, a GitHub-csatlakozón keresztül még lekérhető a forrás és az útmutató. Ehhez a megfelelő GitHub-fiók/repository-hozzáférés szükséges. Nem támaszkodunk arra, hogy egy későbbi chat emlékezni fog a helyi útvonalakra vagy önállóan eléri a számítógépet.
2. Keresd a privát mentési gyökér `LATEST.json` fájlját. Régebbi mentés is kiválasztható a snapshots/ alatt. Ellenőrizd a fájlokat a fenti verify paranccsal; a LATEST manifest_sha256 értékét is őrizd meg az azonosításhoz.
3. A restore mindig **új, nem létező könyvtárba** dolgozik. source/ alá kerül a kód, data/ alá a katalógus és a helyi állományok. Nem indít szolgáltatást, nem írja felül az élő adatbázist, nem regisztrál feladatot és nem aktivál hozzáférést. Először ezt az elkülönített példányt ellenőrizd.
4. Az eredeti OneDrive-média ugyanazzal a relatív könyvtárszerkezettel szükséges. A media/manifest.json megőrzi a stabil médiaazonosítókat, útvonalakat, katalógusbeli méreteket és rendelkezésre álló korábbi ujjlenyomatokat. A mentőprogram nem tölti le és nem másolja végig az eredeti médiatárat; a metadata-visible állapot nem bizonyít teljes helyi letöltést vagy felhőbeli épséget. A hiányzó és elérhetetlen állományokat külön jelzi. Ne indíts új importot/rescant pusztán azért, mert más médiagyökeret adtál meg.
5. Csak a próba után, az alkalmazás/MCP leállításával és egy újabb biztonsági másolat mellett válts az ellenőrzött példányra. Az eredeti aktív adatbázis fájljának egyszerű felülmásolása futás közben tilos; WAL/SHM mellékfájlokkal nem keverhető más pillanatkép.

## Hozzáférések és rendszerfüggőségek

A private/runtime.dpapi a jelenlegi Windows-felhasználóhoz kötött DPAPI-titkosítást használja. Benne lehetnek a helyi MCP/Grok/mobil/képgenerálási beállítások, meglévő védett kulcsok, OAuth-állapot, alagútprofilok, Windows-feladatdefiníciók és Tailscale Serve/Funnel-állapotleírások. Ezeket a program nem írja a GitHubra, és a mentés közben nem mutatja meg.

Ugyanazzal a Windows-fiókkal/profillal, kizárólag új, privát vizsgálati könyvtárba:

```powershell
powershell -NoProfile -File ops/backup/Unprotect-Runtime.ps1 -InputFile "MENTES\private\runtime.dpapi" -NewDirectory "UJ-privat-vizsgalat"
```

Másik gépen vagy elveszett Windows-profilnál új hitelesítés, új alagútkulcs és szükség szerint új OAuth-kapcsolat kell. Ez a mentés **nem hordozható jelszószéf**. A titkosított konfiguráció önmagában nem garantálja a későbbi kapcsolati jogosultságot. A visszafejtett OAuth/feladatfájlokat ne aktiváld automatikusan.

Csatlakozó helyreállítás: docs/MCP_RECOVERY.md, docs/MCP_INTEGRATION.md, docs/GROK_INTEGRATION.md. A ChatGPT stdio adapter az OpenAI Secure MCP Tunnel kliensén át kapcsolódik; a Grok OAuth gateway külön útvonal. A platform/ könyvtár megőrzi a telepített alagútkliens fájljait/licenceit; Node 24+ és szükség szerint Windows/Tailscale külön szükséges. A ChatGPT/Grok oldali plugintelepítés és fiókengedély nem helyi forrásfájl: a szolgáltatói felületen is helyre kell állítani vagy újra kell engedélyezni. A működés bizonyítéka tényleges olvasó eszközhívás; a nyitott port önmagában kevés.

## GitHub és archívumok

A main a közös, frissíthető forrás. A korábbi backup/* ágak dátumozott történeti pillanatképek maradnak. A régi gyökérbeli katalógusexportok az aktuális forrásfából kikerülnek, de a korábbi Git-commitokból továbbra is visszakereshetők; nem történt előzménytörlés. Új katalógusexport, privát média vagy kulcs nem kerülhet Gitbe. Git-munkapéldányból futtatva a mentő automatikusan teljes helyi Git-bundle-t is készít és ellenőriz, így a nem publikált commitok és archív ágak is megmaradnak a privát platform/ parcellában. Külső forráskönyvtárnál külön `--history-bundle` fájl is megadható. A nem commitolt forrásváltozásokat a source/ fájlmásolat őrzi.

Új önálló részegységnél a components.json jegyzékbe add meg a forrását, tartós adatait és visszaállítását; egészítsd ki a mentőprogram engedélyezett útvonalait és a próba-visszaállítás tesztjét. A jelenlegi eszköz nem általános teljes lemezmentő: naplókat, gyorsítótárakat, teljes régi mentésgyűjteményeket és tetszőleges új könyvtárakat nem gyűjt automatikusan.

Technikai hivatkozás: [Node.js SQLite backup API](https://nodejs.org/api/sqlite.html#sqlitebackupsourceDb-path-options).
