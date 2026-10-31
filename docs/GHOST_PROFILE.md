# Szellemprofil

A Szellemprofil külön, nem játszható sablonkarakter a karaktergyűjteményben. Stabil technikai azonosítója system:ghost-profile; nem résztvevője a történetnek, nincs saját életrajza vagy kapcsolata. A mezőszerkezete minden karakter rendes profiljára vonatkozik. A korábban elfogadott strukturált értékek ugyanott, a rendes profilban jelennek meg. A korábbi szabad szövegek és kapcsolatok megmaradnak.

## Használat

1. A karaktergyűjteményben nyisd meg a külön Szellemprofil sablonkaraktert a közös mezők szerkesztéséhez. Az elfogadott adatok és a letöltő/feltöltő műveletek a rendes karakterprofilon vannak.
2. Meglévő karakternél a szövegátvétel gomb változatlan munkaszövegekből készít
   javaslatot. Ez nem AI és nem következtet számszerű személyiségre.
3. Új vagy meglévő karakterhez a mezőket kézzel is szerkesztheted. Jelöld ki a
   mentendő mezőket, és készíts javaslatot.
4. A javaslatok között válaszd a szerkesztést, ellenőrizd a típust és a forrást,
   majd hagyd jóvá a kijelölt mezőket. A kimaradó mezők nem változnak.
5. Az AI-csomagot a választott modellnek adhatod. Új karakter részleteit
   hipotézisként javasolhatja; meglévő karakter adathiányát ne töltse fel tényként.
   Az eredmény .json fájlként feltölthető az AI-javaslat betöltése részben, vagy szövegként beilleszthető. A teljes values-burkoló objektum és a külön mezőobjektum is elfogadott. A fájl legfeljebb 1 MiB lehet. A fájl kiválasztása csak előkészíti a szöveget; a Javaslat betöltése gomb menti a javaslatot, ezt követi a külön jóváhagyás. A csomag szerzői információt is tartalmazhat;
   letöltése önmagában nem küldi el szolgáltatónak.

Minden mező értékből, rövid értelmezésből, forrásból, állítástípusból
(`fact`, `impression`, `hypothesis`) és tudáshatárból (`creator`, `public`) áll.
Skálán az ismeretlen `null`, szövegnél üres szöveg. A skálák 0–10, a
memóriahajlamok 0–5 közöttiek. A skáláknál is megőrizhető a szöveges értelmezés.
A születési dátum egyelőre szöveg: az életkort nem számítjuk automatikusan.

A sablon JSON-szerkesztőben bővíthető és a feliratok átnevezhetők. Meglévő
mezőazonosító, típus és skála nem törölhető/módosítható. Új mező mindenkinél
látható, de ettől még senkinél sem lesz kitöltve. A kapcsolatspecifikus
kommunikáció most szöveges kiegészítés; az irányított kapcsolatok külön maradnak.

## AI-csatlakozás

A helyi MCP és HTTP gateway karakterenkénti műveletei:
`get_ghost_profile`, `propose_ghost_profile`. Előbbi visszaadja a sablont,
verziókat és az engedélyezett adatokat; utóbbi csak javaslatot tárol,
trusted módban is. A jóváhagyás a helyi szerzői felületen történik.
Nincs új fizetős modellhívás. A hívó ChatGPT/Grok állítja elő a javaslatot.
Az új eszközök használatához a futó szolgáltatás/MCP-kliens újraindítása és a
kliens eszközlistájának frissítése szükséges. A telepített távoli plugin
eszközleírásának frissülése külön ellenőrizendő; a JSON-beillesztés enélkül is működik.

Alapértelmezésben csak nyilvános, tényként jóváhagyott strukturált mezők mennek
az MCP-olvasónak. A szerzői adatlekéréshez explicit `include_admin_notes: true`
és a meglévő helyi adminengedély kell. Piszkozatok és hipotézisek nem válnak
szereplői tudássá. A `get_character` az engedélyezett strukturált értékeket is adja.

## Megőrzés és visszaállítás

Az új rekordok a meglévő, exportált `application_settings` táblában vannak,
`ghost:` kulcsokkal. Nincs új sémamigráció vagy eredeti profilfelülírás.
Minden elfogadás új verzió, előző értékekkel és szerzői attribúcióval.
A korábbi kitöltött verzió visszaállítása új javaslat és új jóváhagyás;
a közben hozzáadott mezők ismeretlenre állítását is megmutatja.
A teljes előzmény külön letölthető, a katalógusexport szintén tartalmazza.
A sablonváltozások előző és új verziói megmaradnak. Strukturált előzménnyel
rendelkező karakter nem törölhető az üres karakterek törlőgombjával.

Profil-, sablon- és munkaszövegverzió-ellenőrzés akadályozza a régi javaslatok
ráírását új adatra. A változatlan függő javaslat ismételt beküldése ugyanazt
az azonosítót adja. Az elutasítás nem módosít karakterértéket.

## Hatókör és további fejlesztés

Ez a szellemprofil és javaslatkezelés első működő változata. Nem állítja késznek
a mentések teljes világszimulációs tervét. A hangulati reaktivitás és
memóriahajlam most profiladat, nem futó szimuláció. A pillanatnyi hangulatot,
öltözetet és programot nem szabad ezekre ráírni.

Következő külön fejlesztési fázisok: karakterenkénti konkrét emlékezet a meglévő
eseménynaplóhoz; helyzetfüggő kontextusösszeállítás; monotón történeti idő és
ismétlésmentes visszatérési rekonstrukció; eseményfüggőségek és meglepetésmód;
átmeneti hangulat/program; végül opcionális Concordia-összehasonlítás.
Ezeket a szellemprofil bevezetése nem kapcsolja be automatikusan.

## Ellenőrzés

Szintetikus adatbázisokon: sablonbővítés, skálahatárok, kézi jóváhagyás,
elutasítás, elavult javaslatok, ismételt kérés, kánon és szövegek megőrzése,
export/visszaállítás és az MCP privát/nyilvános projekciója. Böngészőben külön
szintetikus karakterrel a JSON-javaslat betöltése, kiválasztása és elfogadása.
Éles karakterek automatikus kitöltése nem történt.

## Grok és privát interaktív elbírálás (2026-10-29)

A propose_ghost_profile approval_url címet is ad: a meglévő, Tailscale-identitással védett /ghost-profile/<character_id> oldalt. Itt ugyanaz a fájlfeltöltés, javaslatlista és mezőnkénti szerkesztés/elfogadás/elutasítás működik. A Grok megbeszélheti és beküldheti a javaslatot; a szerző a kapott linken dönt. A Grok chatablakába ágyazott egyedi UI nem igazolt képesség. Nem nyitunk új publikus jóváhagyási végpontot: a meglévő login-, Origin- és CSRF-ellenőrzés védi. A döntésekhez a hitelesített login kerül attribúcióként.

Kompatibilitás: a Grok-fájlok type mezője a kind szinonimája; ellentmondó type/kind érték hibát ad. Szöveges mezőnél a null ismeretlen üres szöveggé alakul. Hiányzó forrást, állítástípust vagy tudáshatárt nem találunk ki: a hiba pontos mezőfelirattal és tulajdonságnévvel jelenik meg. Mindkét meglévő Barni-JSON 44 mezőjét olvasással ellenőriztük; profilmódosítás nélkül.

### Betöltött javaslat láthatósága

A sikeres JSON-betöltés azonnal megnyitja az érintett javaslatot a szerkeszthető mezőnézetben. A fejléc jelzi, hogy ez még javaslat, nem elfogadott profil. A függő javaslatok felül külön választóval megnyithatók; a privát oldal proposal lekérdezési paraméterrel konkrét javaslatot is megnyit. A betöltés továbbra sem jelent jóváhagyást. A Barni-fájl éles böngészős próbáján 44 mező megjelent; a meglévő azonos javaslatot újrahasználta, elfogadás nélkül.

### Felugró kérdéssor

A javaslatok elbírálása felugró dialogban, mezőnként történik. Elfogadás, szerkesztés, kihagyás és visszalépés lehetséges. Az Elfogadom gomb még csak az áttekintés döntését jegyzi meg; adatbázisba kizárólag az összefoglaló külön jóváhagyó gombja ír. A kimaradó és át nem nézett mezők megmaradnak. A bezárás/folytatás a böngészőlap sessionStorage-piszkozatát használja, profil- és sablonverzióhoz kötve.

Az anatómiai lépés opcionális alkérdései: péniszhossz nyugalmi és merev állapotban, körfogat, fityma/körülmetéltség, herék/herezacskó, intim szőrzet és sajátosságok. A megadott válaszok feliratozva a meglévő anatomy szövegmezőbe kerülnek, csak a szerző végső jóváhagyásával. Az üres méreteket nem egészíti ki a rendszer. Nincs automatikus új tény vagy új anatómiai kánon.

Böngészős szintetikus ellenőrzés: hárommezős javaslatból két szerkesztett mező elfogadása, egy skálamező kihagyása, visszalépés, bezárás és folytatás, összefoglaló és végső mentés. A kihagyott mező nem került az elfogadott profilba. Éles Barni-javaslaton csak az ablak megnyitása és az anatómiai kérdések megjelenése lett ellenőrizve, profiljóváhagyás nélkül.

### Közös sablonkarakter és normál profil (pontosítás)

A felhasználó pontosítása felülírja a korábbi, karakterenkénti Szellemprofil-fül megoldást. Az új, nem játszható sablonkarakter nem kap játékbeli rekordot, így nem keveredik kapcsolatokba, eseményekbe vagy médiagenerálásba. A profil mezőszerkesztője egyszerű mezőnév/csoport/adattípus űrlap. Új mező automatikusan megjelenik minden meglévő és későbbi karakter normál profilján; kitöltése ettől nem történik meg. A korábban elfogadott adatokra ugyanaz a tárolás épül, nincs másolás vagy újrajóváhagyás.

A normál asztali és mobil karakterprofilba beépült az üres sablon letöltése, a karakteradatokkal készített AI-csomag letöltése és a JSON-javaslathalmaz feltöltése. A felugró elbírálás végső mentése azonnal frissíti a profil integrált mezőit. A megőrzött korábbi szabad szövegek külön jelöltek, nem írjuk felül őket automatikusan.

Böngészős szintetikus próba: külön sablonkarakterben egy új Péniszméret szövegmező hozzáadása, mentés, két karakter normál profilján megjelenés; az elsőn kitöltés és kérdéssoros jóváhagyás, a másodikon üres mező. Meglévő személyiség és korábbi profilűrlap megmaradt.

### Teljes profilgenerálás és a profilrészek sorrendje

A régi profil és a kapcsolatok maradnak felül; a Szellemprofilból származó teljes mezőstruktúra és a generálási/feltöltési műveletek alattuk vannak, asztali és mobilnézetben is. Az elfogadott strukturált adatok a profil ezen részébe kerülnek.

A Teljes profilgenerálási csomag kifejezetten megköveteli az összefüggő háttértörténet (identity), személyiség (personality), szexualitás (sexuality), kommunikáció (speech) és rövid megjelenés javaslatát, majd a további sablonmezőket. A meglévő profilszövegeket, elfogadott értékeket és kapcsolati kontextust adja alapul. Új fikció csak jelölt, jóváhagyandó hipotézisként javasolható, kitalált proveniencia nélkül. Ez a csomag a hívó AI munkáját készíti elő; letöltése nem indít fizetős modellhívást.

A kérdéssor a háttértörténettel, személyiséggel és szexualitással kezd, ha ezek szerepelnek a javaslatban, és csak utánuk jönnek a részletes skálák. A főbb kérdések részletesebben részben életút/család/tanulmányok/fordulópontok, jellemvonások/társas viselkedés/stressz és szexualitás/orientáció/vonzalom/libidó/kezdeményezés/preferenciák/intimitás adható meg. A jóváhagyott kiegészítések az adott profilmező szövegébe kerülnek, nem külön elvesző űrlapadatokba.

Ellenőrzés: szintetikus böngészőtesztben a korábbi életrajz fölül maradt, a három fő témakör és kiegészítéseik elmentődtek a profilmezőkbe; a kihagyott skála nem mentődött.

### Külön szexuális preferenciamezők

A közös sablon négy opcionális szövegmezővel bővült a Szexuális preferenciák csoportban: sexual_penis_use, sexual_anal_use, sexual_tongue_use, sexual_hand_use. A négy testi terület használatával kapcsolatos preferenciák külön adhatók meg. A mezők minden karakteren megjelennek, a generálási csomagban és a kérdésenkénti elbírálásban is szerepelnek. A megjelenés nem jelent kitöltést vagy jóváhagyást; a meglévő értékek és tudáshatárok megmaradnak.

Az éles közös sablon explicit verziózott mentéssel bővült, előzetes ellenőrzött katalógusmentéssel. A karakterrekordok, elfogadott strukturált rekordok és vizuális kánon hash szerint változatlanok. A böngészőben a négy új szövegmező üresen megjelent. A korábbi sablonverzióhoz tartozó függő javaslatokat az eddigi verzióellenőrzés védi; új generáláshoz friss csomag használható.

### Adatok jóváhagyása (2026-10-30)

A profilűrlap korábbi Kijelölt mezők javaslatának mentése gombja Adatok jóváhagyása lett. A szerző kattintása a kijelölt, aktuális mezőértékeket a meglévő verzióellenőrzött javaslat- és döntési útvonalon jóváhagyja és menti; nincs újabb kérdéssoros kör. A JSON-betöltés és a varázsló továbbra is külön elbírálási folyamat. Üres kijelölés nem menthető, mentés közben a gomb tiltott, hiba esetén a mezők megmaradnak.

### Felső profiláttekintő (2026-10-30)

A normál asztali/mobil profil és a privát elbíráló oldal felső részén automatikus, területenkénti összefoglaló jelenik meg. Minden sabloncsoport szerepel, az egyéni bővítésekkel és az irányított kapcsolatokkal együtt. A szöveg az elfogadott mezők tömörített kivonata; megfelelő strukturált érték hiányában a kapcsolódó meglévő profilszöveg külön megjelölt forrásként használható. Explicit elfogadott üres érték nem töltődik vissza régi szöveggel. A nulla skálaérték megmarad. Hipotézis, benyomás, korábbi munkaszöveg és vizuális kánon külön jelöltek; privát jelölés megmarad. Függő javaslat és adminjegyzet nem kerül az összefoglalóba.

A nézet kizárólag származtatott megjelenítés: nincs külső modellhívás, új tény, tárolt profilfelülírás vagy automatikus kánonváltozás. Jóváhagyás után azonnal újraépül. Böngészős szintetikus próba igazolta a felső elhelyezést, az elfogadott személyiség módosítása utáni frissülést és az egyetlen áttekintő/eredeti profilűrlap megmaradását.

## Közös kitöltési útmutatók (2026-10-30)

A közös sablon mezői opcionális guidance szöveget tartalmazhatnak (legfeljebb 20000 karakter). A sablon szerkesztőjében ez módosítható, és a kérdésenkénti áttekintőben megnyitható. Az anatomy útmutatója az A–C anatómiai/szőrzeti, az appearance_detail útmutatója a D testszőrzeti szempontokat tartalmazza. A teljes profilgenerálási csomag 2. változata a közös útmutatót is exportálja; a képfájlokat nem csatolja. A sablon útmutatójának módosítása nem tölt ki karakteradatot és nem hagy jóvá új anatómiai részletet. A kiegészítés kizárólag kifejezetten felnőtt, önálló fiktív karakter szerzői kidolgozásához enged kreatív javaslatot; nem tesz képről vagy származásból igazolatlan intim következtetéseket.


## Közös profilgenerálási sablon szerkesztése a pluginból (2026-10-30)

A get_profile_template karakterazonosító nélkül olvassa a közös sablont: visszaadja
a template_version értékét, az összes mező rövid indexét és legfeljebb 20 mező
teljes definícióját/útmutatóját. A field_ids célzott olvasást, a limit/offset
lapozást biztosít. Nem ad ki karakterértéket vagy privát adminjegyzetet.

Az update_profile_template a kifejezetten kért közös sablonmódosítást menti:

- request_key: azonos kérés újrapróbálásakor azonos, 8–128 karakteres kulcs;
- expected_version: a frissen olvasott template_version;
- field_updates: meglévő mezők id szerinti label/group/guidance módosítása;
- add_fields: új, üres meződefiníciók id/label/group/type tulajdonságokkal;
- field_order: opcionálisan az összes meglévő és új mezőazonosító pontos sorrendje.

A kimaradó mezők és tulajdonságok megmaradnak. Egy kérés legfeljebb 20 módosított
és 20 új mezőt, valamint 200000 UTF-8 bájtnyi JSON-t tartalmazhat. A sablon
összesen legfeljebb 100 mező, az útmutató mezőnként legfeljebb 20000 karakter.
Új skálamező max értéke 5 vagy 10. Meglévő mezőazonosító, adattípus, skálahatár
és régi profilszöveghez kötött source nem módosítható; mezőt törölni nem lehet.

Trusted módban a közös sablon mentésére szóló explicit kéréshez nincs újabb
beszélgetéses jóváhagyás. Review módban ez az eszköz nem ír: a meglévő privát
szerzői felületen, a Szellemprofil sablonkarakterben kell szerkeszteni. A
karakterenkénti propose_ghost_profile ettől független: továbbra is javaslatot
tárol, és a karakterértékek elfogadása külön szerzői döntés marad.

A mentés ugyanazt a validátort és sablonelőzményt használja, mint a webes felület.
A korábbi/további sablon és a szerver által megadott actor az application_settings
ghost:template-history:<verzió> rekordjába kerül. A ghost:template-request:<kulcs>
megőrzi a kérés lenyomatát és a mentési eredményt. Mindkettőt tartalmazza a meglévő
export/visszaállítás. Azonos kérés nem hoz létre új verziót; megváltoztatott kérés
azonos kulccsal IDEMPOTENCY_CONFLICT, elavult verzió STALE_TEMPLATE hibát ad.
A változást nem tartalmazó kérés changed:false választ kap verziónövelés nélkül.
Régebbi kérés újrapróbálása a saját eredeti verzióját adja vissza, és nem írja
vissza a közben módosított sablont: olvasd vissza az aktuális állapotot.

A sablon az összes meglévő és jövőbeli karakterre, valamint az újonnan letöltött
profilgenerálási csomagokra vonatkozik. Karakteradatot nem tölt ki, nem ír felül
profilszöveget, kapcsolatot, médiát vagy kánont. Régi, még függő profiljavaslat
elfogadása a sablonváltozás után az eddigi verzióellenőrzés miatt elutasítható;
ilyenkor friss csomagból kell új javaslatot készíteni.

Példa ChatGPT-ben vagy Grokban: „A közös profilgenerálási sablon goals mezőjének
útmutatójához add hozzá, hogy a rövid és hosszú távú célokat külön írja le.
Minden más útmutatót és a karakteradatokat hagyd változatlanul.” Az asszisztens
először olvassa a goals aktuális útmutatóját, majd annak megőrzésével egészíti ki.

Telepítés: a katalógus, a Grok gateway és a privát MCP tunnel újraindítása után
frissítsd a meglévő csatlakozó eszközlistáját. Nincs új környezeti változó,
hitelesítő adat, publikus végpont, séma-migráció vagy fizetős modellhívás.
A writer a /api/mcp-ghost capabilities műveletével ellenőrzi a
template_editing_version:1 képességet, mielőtt meghirdeti az íróeszközt.
