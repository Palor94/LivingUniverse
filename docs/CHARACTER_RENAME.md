# Karakterátnevezés előnézettel

A karakterprofil Név mezője mellett az **Átnevezés előnézettel és előzmények**
nyitja meg az új oldalt. Az új név megadása először csak mentett előnézetet készít;
a karakter rekordja és hivatkozásai ekkor változatlanok. A névváltoztatás kötelező,
a szövegtalálatok egyesével kijelölhetők. Az **Összes egyértelmű kijelölése** csak
az ID-val kapcsolt javaslatokat választja ki. Kétes/más személyre utaló találathoz
külön egyenkénti megerősítés szükséges. A mentés a kijelölés kifejezett jóváhagyása.
Az elvetés nem módosít karakteradatot. Az előnézet 24 óra után lejár.

Az átnevezés a meglévő UUID-t használja. A kapcsolatok source_id/target_id,
eseményrésztvevők, médiamegjelenések és strukturáltprofil-kulcsok már stabil
ID-kra mutatnak: ezeket a rendszer nem hozza létre újra név alapján. A névütközés
NFC-normalizált, kis/nagybetűtől és többszörös szóköztől független; más karakter
nevével vagy vesszővel/pontosvesszővel/sortöréssel elválasztott aliasával ütköző
új név nem fogadható el. Archivált/összevont karakter neve is foglalt marad.

## Keresés és nyelvi határok

A keresés az összes alkalmazástábla szöveges értékeit és JSON-szövegértékeit
vizsgálja: karakterprofilok, adminjegyzetek, strukturált értékek és előzményeik,
kapcsolatok, események minden revíziója, helyszínek, médiajegyzetek/címkék,
import- és generálási metaadatok. A találatok mezőnként és előfordulásonként
azonosíthatók, 100-as lapokban. Nincs csendes csonkolás: 100 000 rekord / 40 MiB
bejárt adatok, 3000 találat vagy 8 MiB tárolt terv fölött a művelet leáll.
Elsődleges kulcsok, JSON-kulcsok, bináris képadatok, data URL-ek és hash/titok
oszlopok nem névhivatkozások. A rename saját tervei/naplói kimaradnak a keresésből.

A determinisztikus magyar alaklista kezeli a gyakori eseteket, például
**Áronnal → Ábellel, Áronhoz → Ábelhez, Áronnak → Ábelnek, Áront → Ábelt**,
valamint a -ban/-ben, -ból/-ből, -ról/-ről, -tól/-től, -nál/-nél, -ra/-re,
-on/-en/-ön, -ig, -ért, -ként, -vá/-vé, -é és -ék alakokat. A szóhatárok,
kis-/nagybetűk, NFC/NFD alakok és gyakori magyar többjegyű mássalhangzók kezeltek.
Az ismeretlen/összetett toldalék külön, nem írható találat. Ez nem teljes magyar
morfológiai elemző: becenevek, névmások, idegen nevek kiejtése, rendhagyó tövek,
új névhez kapcsolt egyéb nyelvtani egyeztetés és egy teljes név rövidített változata
nem oldható fel megbízhatóan. Ezeket kézzel kell ellenőrizni/szerkeszteni.

A kapcsolt ID támpont, nem nyelvi személyazonosítás. A katalógusbeli névrokonok
és aliasok kétes/más személyre utaló jelölést okoznak; a többi személyemlítés
jelentését a felhasználó ellenőrzi. A saját korábbi aliasok megmaradnak.

## Mentés, kánon és visszavonás

Írható mezők: a munkaprofil szövegei és adminjegyzetei, strukturált profil aktuális
value/interpretation mezői, kapcsolati leírások, médiajegyzetek és szövegcímkék,
helyszínnév és leíró mezők, aktuális eseménycím/összefoglaló/részletek/következmények,
résztvevői szerep, időcímke és eseménycímkék. Helyszínnévnél a name_key is frissül,
a testvérnévütközés és faérvényesség újraellenőrzött. A kapcsolt általános
taxonómiacímkék és stabil helyszín-ID-k megmaradnak.

Kánon, régi esemény-/profilrevízió, eredeti idézet és proveniencia, generálási
manifest, alias, fájlútvonal/mappanév külön védett találat. Ezeket ez a művelet
nem írja át. Az aktuális eseményszöveg új revíziót kap, a korábban approved
esemény proposed állapotba kerül. Az eredeti jóváhagyott revízió változatlan.
A strukturált profil előző értékei új history-bejegyzésbe kerülnek.
Kanonikus megjelenés módosításához továbbra is külön kánonjóváhagyás szükséges.

Az eredeti médiafájlok és mappák mozgatása nincs egy adatbázis-tranzakcióban.
Ezért az átnevezés nem mozgat fájlt: külön, a meglévő **Synchronize folder names**
előnézetével lehet később a mappaneveket hozzáigazítani. A régi közvetlen név-
autosave és általános profil-PUT eltérő névvel 409 választ ad; más mezők menthetők.

Minden elfogadott előfordulás, a név, az esemény/profil új revíziói, a mentési
nyugta és auditbejegyzés egy `BEGIN IMMEDIATE` SQLite-tranzakcióban készül.
Bármilyen hiba minden írást visszagörget. A teljes bejárt katalógus digestje
elutasítja a közben megváltozott/újonnan hozzáadott találatokat is. Ez szándékosan
szigorú: egy független katalógusmódosítás is új előnézetet kérhet.

A tartós request_key azonos kérésnél az eredeti tervet/nyugtát adja; más tartalom
ugyanazzal a kulccsal hibás. A jóváhagyási döntés hash-e a kijelölt és egyenként
megerősített ID-khoz kötött; eltérő ismétlés nem írhat újra adatot. A mentési
nyugta a korábbi művelet eredménye, nem a jelen állapot helyettesítője.

Az **Előzmények → Visszavonás előnézete** az eredetileg elfogadott módosítások
pontos inverzét készíti. Külön jóváhagyás után minden inverz együtt mentődik.
Érintett rekord későbbi módosítása esetén `UNDO_CONFLICT`; a rendszer nem írja
felül a későbbi munkát. Esemény/profil visszavonáskor is új történeti változat
keletkezik, régi revízió törlése és story/kánon automatikus jóváhagyása nélkül.
Az alkalmazott átnevezési előzmény az üres karakter későbbi törlését is blokkolja.

## MCP és skill

- `rename_character({request_key, character_id, new_name})`: előnézet, soha nem
  végrehajtás; `approval_url`, `plan_id`, `plan_hash` és lapozható találatok.
- `get_character_rename({plan_id, offset?, limit?})`: összes találat/status.
- `apply_approved_character_rename({plan_id, plan_hash})`: a privát oldalon már
  jóváhagyott és mentett művelet nyugtája; pending/rejected tervet nem hajt végre.
- `undo_character_rename({plan_id, request_key})`: visszavonási előnézet,
  külön privát jóváhagyással.

A stdio ChatGPT adapter és a meglévő Grok HTTP dispatcher ugyanazt a képességgel
ellenőrzött writer klienst használja. Régi backendhez az új eszközök nem jelennek
meg. A szolgáltatás `/api/mcp-rename` végpontja a meglévő helyi bearer-hitelesítést
használja, és nem tartalmaz approval/decision műveletet. **Trusted módban is
kötelező a privát emberi jóváhagyás.** MCP-n csak a névtoken-diff és találatmetaadat
látszik; teljes szöveg/adminjegyzet kizárólag a privát felületen érhető el.

A desktop írás saját CSRF tokent és pontos loopback Origint igényel. A meglévő
Tailscale mobil listener csak a konfigurált azonosítóval, pontos HTTPS Originnel
és session CSRF-fel engedi a terv olvasását/jóváhagyását és undo előkészítését.
Nem hoz létre új listenert, publikus oldalt vagy hitelesítő adatot. A privát review
csak egyező MCP/mobile konfiguráció esetén érhető el. Lokális desktop mindig
használható; privát mobile eléréshez a korábbi Tailscale beállítás szükséges.

A repo projekt-skillje: [.agents/skills/rename-character/SKILL.md](../.agents/skills/rename-character/SKILL.md),
Codexben `$rename-character`, MCP-n `rename_character`. A plugin kliensben az
új backend/MCP-adapter újraindítása és connector refresh kell a felfedezéshez.
ChatGPT/Grok nem tölti be automatikusan a Codex projekt-skill fájlt; ott az MCP
eszközleírás és a privát review biztosítja ugyanazt a folyamatot.

## Tárolás, tesztelés és kiadás

Nincs adatbázisséma-migráció: a már exportált/restaurált `application_settings`
táblában `rename:v1:plan:*`, `request:*`, `audit:*`, `undone:*` kulcsok tárolják a
terveket, kijelöléseket, előtte/utána képeket, szerzőt, időt és nyugtát. A teljes
export privát profilszövegeket és ezek előképeit is tartalmazhatja. A naplóhoz nincs
törlő API. A korábbi auditbejegyzéseket az átnevezés nem módosítja.
Kiadás előtt a szokásos katalógusexport/SQLite-mentés ajánlott; ez a fejlesztés nem
telepít vagy indít újra éles példányt és nem készít éles átnevezést.

Fő komponensek: `app/character-rename.mjs`, `app/hungarian-names.mjs`,
`app/character-rename-routes.mjs`, `app/public/character-rename.{html,js,css}`,
`mcp/character-rename.mjs`; bekötés: server/mobile, MCP writer és profil UI.

Tesztparancsok:

```sh
node --test tests/character-rename.test.mjs
node --test --test-concurrency=1 tests/*.test.mjs
node tests/character-rename-preview.mjs
```

Az utolsó parancs kizárólag új ideiglenes adatbázist és mesterséges karaktereket
indít; a kiírt URL böngészőben próbálható. `close` a folyamat bemenetére vagy
Ctrl+C leállítja és eltávolítja a saját ideiglenes könyvtárát. A tesztek sosem
használják az éles Áront vagy a desktop katalógust.

Ellenőrzés (2026-10-31): a teljes, soros tesztfájlfuttatás **214/214 sikeres**
(ebből 12 célzott átnevezési teszt). A mesterséges böngészős próba ellenőrizte az
előnézetet, összes egyértelmű kijelölését, kétes találat kihagyását, mentést,
újratöltés utáni pontos kijelölés-visszajelzést és jóváhagyott visszavonást.
A skill hivatalos `quick_validate.py` ellenőrzése sikeres. A korábbi párhuzamos
tesztfutásnál egy meglévő médiateszt 15 ms-os időkorlátja terhelés alatt lejárt;
külön és a soros teljes futtatásban sikeres, az időkorlátját nem módosítottuk.
