# Képcímkézés az interaktív világhoz

Jelenlegi hatókör: a felhasználó egyelőre karaktereket és karakterképeket
gyűjtött a világhoz. Külön helyszínháttereket, backdropokat és backgroundokat
még nem keresett. A mostani előkészítés a karakterképekre és a megjelölt
generálási tervképekre vonatkozik. A karakterképen látható környezet továbbra
is megfigyelhető és kompatibilitásként címkézhető; ez nem jelent már meglévő
helyszín-háttérkönyvtárat vagy pontos világhelyszín-hozzárendelést. A külön
helyszínkép-gyűjtés, backdrop/background besorolás és ezek AI-keresése későbbi
bővítés, amikor a felhasználó ilyen képeket is hozzáad. Most nem indítunk
helyszínkép-keresést, importot vagy további képelemzést.

A 2026-10-31-i felhasználói döntés: a teljes aktív képtár feldolgozása
GPT-6.1 Sol modellel, medium gondolkodással, előbb rögzített, később jól
kereshető és bővíthető szerkezetben. A cél nem ruhaszín-leltár, hanem a
szimulációhoz és referenciaválasztáshoz használható megfigyelési könyvtár.

A felhasználó pontosított elsődleges célja az AI által célzottan használható
karakter–média–helyszín kapcsolatrendszer. A címkék mellé tartós azonosítók,
megőrzött hozzárendelések, keresési útmutató és magyarázható lekérdezés kell.
Ennek aktuális és tervezett határait a [visszakeresési szerződés](WORLD_MEDIA_RETRIEVAL.md)
rögzíti; az éles AI-keresőhíd még integrálandó, a címkézés önmagában nem fejezi be.

## Egyszeri képolvasás, többféle későbbi keresés

Az eredeti kép, stabil médiaazonosító és meglévő karakterkapcsolatok maradnak
az alapok. Egy képről egy tömör, strukturált Sol-válasz készül. Megőrizzük a
modellt, gondolkodási szintet, promptot/sémát, eredeti és küldött kép hashét,
fogyasztási nyugtát és a teljes ellenőrzött eredményt. Az index, szótári
illesztés, magyar/angol keresés és későbbi nézetek helyben újraépíthetők új
modellhívás nélkül. A videók és videóképkockák nem részei ennek a körnek.

| Réteg | Mentett adatok | Felhasználás |
| --- | --- | --- |
| Látható környezet | funkció, rövid képi bizonyíték, bizonytalanság | mosdó, WC-fülke, otthoni fürdő, háló, kültér |
| Kompatibilis helyszínek | több önálló lehetőség, látható jel vagy elképzelhető használat, hiányzó megkülönböztető jel | ugyanaz a kép kávézói és benzinkúti mosdóban is elképzelhető |
| Tevékenységek | rövid cselekvés, testhelyzet, láthatóság, bizonyíték | keresés és jelenethez illesztés |
| Résztvevői kapcsolatok | p1/p2, képbeli hely/régió, tevékenységenként külön végző/fogadó/megfigyelő szerep | több tevékenység és eltérő szerepek egy képen |
| Kamera | külön irány, magasság és kivágás, bizonytalanság | szemből/profil/hátulról; magas/alacsony; portré/teljes alak |
| Referenciafedezet | résztvevőnként látható arc/test, takarás, használható referenciafajta és hiányok | arc-, testarány- és pózreferencia külön értékelése |
| Képi kötöttségek | néhány lényeges látható berendezés; csak indokolható kizárások | azonos bútor, zuhany, autóbelső vagy más elengedhetetlen elem |
| Tartalmi osztály | nem intim / meztelenség / szexuális tevékenység / bizonytalan | megfelelő képtípus szűrése a jelenethez |
| Narratív használat | jelenet / csak karakterbemutatás / külön ellenőrzés | semleges referencia ne illusztráljon megtörtént helyszíni eseményt |

## A gazdagság nem jelent kitalált részleteket

A látható tény, a hihető felhasználás és az ember által megerősített világadat
három külön állapot. Nincs kitalált vállalkozás, pontos helyszínazonosító,
szereplőnév, nem látható tevékenység vagy szándék. Ismeretlen adat ismeretlen
marad. A modell bizonytalansága minőségi jelölés, nem kalibrált százalék.

Az intim jelenet rövid, tárgyszerű osztályozást kap. A szerep a képen látható
adott tevékenységhez tartozik: nincs globális aktív/passzív címke és ebből
személyiségre, irányultságra vagy tartós preferenciára következtetés. A képszintű
karakter-hozzárendelés nem bizonyítja, melyik alak p1. A személyhez rendelés
külön, ember által ellenőrizhető réteg; arcfelismerést nem végzünk.

Semleges hátterű portré/testreferencia: nincs helyszín-kompatibilitás, és a
szimulációs javaslat kizárólag karakterbemutatás/narráció. Kevés bútor egy valódi
szobában nem teszi automatikusan semlegessé a hátteret. Referenciahasznosság
nem hagy jóvá kánont, kilétet, identitáshűséget vagy modelltréninget.

## Hatékony tárolás és visszakeresés

`world-v1` válasz: az eddigi `scene-v1` megfigyelések mellett külön strukturált
kamera, résztvevői referenciafedezet, néhány látható kötöttség és tartalmi osztály.
Az örökölt `scene-v1` és normál eredmények továbbra is érvényesek. A magyar és
angol címkék egy fogalom két neve; nem két független címke. Az enumok stabil
gépi kódok. Az ismeretlen szabad címkék normalizált kulcsai indexelhetők, de
szinonimák és meglévő szótári elemek nem vonhatók össze találomra.

Az elkülönített futási katalógusban a közös elemzési munkasor és nyers eredmény
marad az elsődleges forrás. A keresőindex származék: környezet, kompatibilis
helyszín, tevékenység, testhelyzet, szerep, kamera és referencia külön mezőben,
magyar/angol teljes szöveges kereséssel. Az eredeti hozzárendelt karakterek
helyi kontextusként megmaradnak; nevek, dossziék és jegyzetek nem kerülnek az API-ba.

Például a világ kiválasztója később először szűr a jóváhagyásra, résztvevőkre,
narratív használatra és tartalmi osztályra. Utána rangsorolhat a tényleges
tevékenység, helyszín-kompatibilitás, kamera és referenciafedezet alapján.
Pontos világhelyszín csak emberi hozzárendeléssel lesz megerősített kapcsolat.
Az ismeretlen személyszerep nem teljesíthet egy konkrét karakterhez kötött
szerepfeltételt. A találat mellé az illeszkedés és bizonytalanság magyarázata jár.

## Futási határok

Egy rögzített állománylista, egy modell/beállítás és egy prompt/séma. Helyi
képmásolatok és futási adatbázis OneDrive-on kívül; az éles katalógus csak
olvasható. Eredetieket, rendezést, karakterkapcsolatokat és kánont nem írunk át.
Minden megfigyelés elmentett, átnézhető javaslat, nem automatikusan elfogadott
világigazság. Az éles szimulációs kiválasztóba való beépítés külön lépés.

Mentett haladás, kérésenként fogyasztás/költség, egyszeri kísérlet. Bizonytalan
vagy számlázásában ellenőrizhetetlen kérés után új feltöltés nincs. Folytatás
csak még el nem küldött elemekre; tartós hibák külön listában maradnak.
A sematikus JSON érvényessége nem felismerési pontosság. A modell korlátai
miatt nem ígérhető, hogy minden képre helyes vagy teljes címkekészlet készül.

## Elkészült helyi előkészítés

A rögzített állomány 1121 aktív képből 1119 biztonságosan olvasható helyi
másolat. Egy hiányzó fájl és egy jelenleg nem támogatott WebP külön kimaradási
listán marad. A másolás közben változást jelző 21 forrást még feltöltés előtt
ismét ellenőriztük, stabil másolatuk bekerült a végleges tervbe. A korábbi terv
külön megmaradt. Az előkészítés nem töltött be kulcsot és nem küldött API-kérést.

A 30 USD helyi költségőr nem szolgáltatói számlázási plafon. A gazdagabb
szerkezet becsült költsége kb. 25–30 USD, a tényleges fogyasztás eltérhet;
a keretnél a futás megállhat a teljes képtár vége előtt. A konkrét tömeges
adatátadás és keret külön, a pontos tervhez kötött jóváhagyást igényel.

Kézi parancsok a tests/private-world-library-run.mjs futtatóhoz:
--prepare --config <helyi-konfiguráció> --output <friss-privát-mappa>;
--review --output <privát-mappa>;
--run --output <jóváhagyott-privát-mappa>;
--pause --output <privát-mappa>.
A --refresh csak még el nem indított és jóvá nem hagyott terv helyi,
SOURCE_CHANGED kimaradásait vizsgálja újra; elküldött képet nem ismétel.

## Jóváhagyott teljes futás elindítva

2026-10-31: a felhasználó külön jóváhagyta a pontos 1119 képes OpenAI-adatátadást,
a Sol medium/world-v1 feldolgozást, a 30 USD helyi költségőrt és az ideiglenes
alvásgátlást. Az engedély a végleges terv hashéhez kötötten, privát fájlban
megmarad. Egy rejtett háttérmunkás elindult; az alvásgátló működését ellenőriztük.

Az első háromképes szerződésellenőrzés sikeres, a következő köteg elindult.
Az első állapotellenőrzéskor négy eredmény elmentve és indexelve, nulla hiba,
0,0934507 USD ismert tokenköltség és egy folyamatban lévő új kérés szerepelt.
Ez induláskori pillanatkép, nem a teljes feldolgozás eredménye. A haladás,
fogyasztás és eredmény a privát futási katalógusban követhető. Az éles
katalógusban címke-, helyszín-, karakter- vagy kánonelfogadás nem történt.

## Szünet és egyirányú másolattörlés

2026-10-31: a felhasználó szünetet és a médiatárból eltávolított képek helyi
elemzési másolatainak törléskövetését kérte. A futás OPERATOR_PAUSE állapotban
megállt: 15 sikeres, 1 hibás válasz, 1103 még el nem küldött kép, 16 egyszeri
modellhívás, 0,3474455 USD ismert tokenköltség; függő/ismeretlen fogyasztás nélkül.
Az ideiglenes alvásgátló leállt. A fizetős munkás nem indult újra.

A külön helyi eredménynézet három másodpercenként, query-only kapcsolaton
ellenőrzi a tényleges aktív médiatárat. Csak a jóváhagyott futásba tartozó,
onnan eltávolított képek saját lapos media mappában lévő másolata törölhető;
a célútvonal és a fájlhash ellenőrzött. Az eredeti médiatár, más tesztfutások
és korábbi biztonsági mentések nem részei ennek a törlésnek.

A másolat mellett a futás eredménye, javaslatai, keresőindex-bejegyzései és
a kapcsolódó eredménycache is törlődik. A képet a futásban végleges removed
jelölés tiltja le; visszaállítás a médiatárba nem hozza vissza automatikusan
a másolatot vagy az API-küldést. Az eredeti jóváhagyási terv és a képpontot/
leíró címkét nem tartalmazó fogyasztási nyugták elszámolási adatként megmaradnak.

A későbbi, külön kért folytatás minden köteg és új feltöltés előtt is ellenőrzi
az aktív médiatárat. A futás közben érkező törlés után a már elküldött kérés
nem vonható vissza; a késői helyi eredmény sem kerülhet vissza a keresőbe.
Átmenetileg offline/hiányzó fájl nem minősül médiatári törlésnek. Ha a katalógus
nem olvasható, nincs új feltöltés, és másolatot sem törlünk találomra.

A HTTP-nézet csak olvasható; újraindítása nem tölt be API-kulcsot és nem indít
modellhívást. Szünet alatt is követi a törléseket, amíg ez a helyi folyamat fut.
A következő munkásindítás akkor is elvégzi az egyeztetést, ha a nézetet
közben bezárták. A felhasználó szünetkérését csak új folytatási utasítás oldja fel.

Célzott törléskövetési tesztek és teljes szintetikus regresszió: 265/265 sikeres.

## Generálási ötletek és rajzolt akciósémák

A felhasználó kiegészítése alapján a 20_SHARED_MEDIA/Unassigned alatti
Generation plans, ideas almappa rajzolt/képregényes segédletei külön alkotói célréteget kapnak. A mappába
sorolás jelentése: megvalósítandó generálási terv. Ez felhasználói célmegjelölés,
nem képi modellkövetkeztetés és nem megtörtént világesemény. A rajz/képregény
megjelölés kezdetben a felhasználó csoportszintű leírása; egyedi képet nem láttunk.

Alapcímke: Megvalósítandó terv / Generation plan. Az elemzésben valóban látható
aktivitás, testhelyzet és térbeli elrendezés alapján társulhat hozzá Akcióséma,
Pózreferencia, Kompozíciós referencia vagy Jelenetötlet. Az egyes konkrét pózok
és résztvevői szerepek továbbra is a szokásos tárgyszerű, bizonytalanságot őrző
megfigyelésmezőkben maradnak. Nem találunk ki hiányzó akciót vagy szereplőnevet.

A generation_plan cél planning_only használattal, planned megvalósítási
állapottal tárolódik a külön world_asset_purposes indexrétegben. A magyar és
angol használati címkék kereshetők. A generálási terv lekérdezés ezeket külön
megtalálja; a szimulációs jelenet- és karakterbemutató-választás kizárja őket,
még ha egyébként átnézett képként szerepelnek is. Nem válhatnak automatikusan
karakterazonosság vagy kánon bizonyítékává. Ez nem akadályozza, hogy egy később
elkészült és külön jóváhagyott képet saját új médiarekordként használjunk.

A tényleges mappában 111 JPG-jelölt van. A felhasználó áthelyezte a mappát a
20_SHARED_MEDIA/Unassigned alá; az új helyen mind a 111 képnek meglévő aktív
katalógusazonosítója van. Továbbra sem részei az eredeti 1119 képes futásnak.
A privát planning-supplement.json csak fájlmetaadatokat és a kért használati
célt rögzíti, pending_inclusion állapotban. A kiegészítés előkészítése képmásolást, képtartalom-ellenőrzést vagy AI-hívást
nem indított; az új helyen már létező katalógusazonosítókat használja. A korábbi terv és jóváhagyás
változatlan; a kibővített állomány előkészítése még a későbbi folytatás része.
A függő kiegészítés megakadályozza, hogy a régi futtató észrevétlenül csak a
korábbi képekkel folytatódjon. A felhasználó kifejezetten kérte, hogy most még
ne induljon el a feldolgozás. A törléskövető nézet ettől függetlenül működik.

A tervcél-réteg és a hozzá kapcsolódó megőrzési/keresési regresszió ellenőrzése:
267/267 szintetikus teszt sikeres. A helyi nézet HTTP-ellenőrzése sikeres;
a függő tervképek jelzése látható, fizetős hívásszám és költség változatlan.

A mappaáthelyezés átvezetésekor a 111 fájl mérete és meglévő médiaazonosítója
ellenőrzött; új azonosítót nem osztottunk ki, a korábbi jóváhagyott terv nem
változott, a feldolgozás szünetben maradt. Az elavult Incoming útvonal és az
Unassigned mappa többi képe nem kapja meg véletlenül a tervbesorolást.

## Keresési támpontok és friss költségellenőrzés

A felhasználó engedélyével a gépi javaslatok kereséshez használhatók, saját
bizonytalanságukkal és javaslatállapotukkal. Ez nem címke-, helyszín- vagy
kánonelfogadás. A karakterek képszintű hozzárendeléseit megőrizzük; többalakos
képeken a résztvevői névkapcsolat külön ellenőrzés kérdése, arcfelismerést
nem készítünk. A mentett megfigyeléseken végzett keresési próba részleteit
a WORLD_MEDIA_RETRIEVAL.md rögzíti. Az elemzés változatlanul szünetel.

Az új metaadatleltár: 1435 aktív képrekord, 1433 helyben elérhető támogatott
kiterjesztésű jelölt, 1 hiányzó és 1 nem támogatott fájl. A megmaradt, még
el nem küldött jelöltek száma 1419; a korábbi sikertelen kérést nem ismételjük.
15 sikeres hívás egységköltségéből kivetítve kb. 31,08 USD további, a már
felhasznált 0,3474455 USD-val együtt kb. 31,42 USD teljes számított tokenköltség
várható. Ez kis mintából és metaadatokból becslés, tartalom/dekódolás még
ellenőrizendő, a fogyasztás és adók eltérhetnek. A 30 USD helyi keret változatlan;
a teljes feldolgozás vége előtt megállhat. A várható tiszta API-várakozás
kb. 7,8 óra, előfeldolgozás és egyéb késések ezen felül.

## Teljes helyi keret: 35 USD, folytatás nélkül

A felhasználó kifejezetten 35 USD-ra emelte a teljes helyi költségkeretet.
Ez a korábban felhasznált 0,3474455 USD-t is tartalmazza; a fennmaradó helyi
keret 34,6525545 USD. Nem az OpenAI-fiók tényleges egyenlegét jelenti.
A módosítást külön budget-amendment.json köti az eredeti terv hashéhez,
a korábbi pontos adatátadási jóváhagyás és a modell/cache-specifikáció
átírása nélkül. A munkás összesített költségőre ezt az ellenőrzött módosítást
alkalmazza; a korábbi kötegenkénti előnézetek változatlanok.

A módosítás nem bővíti automatikusan az eredeti adatátadási állományt,
és nem jogosít újraindításra. A függő új képek bevonása és az indítás
továbbra is külön előkészítési/folytatási lépés. A fizetős futás szünetel.
A célzott keret- és keresőtesztek 4/4 sikeresek; a módosítás elutasít
más tervhez kötött, tetszőlegesen megemelt vagy újraindítást állító iratot.

## Kibővített, kifejezetten kért folytatás elindult

2026-10-31: a felhasználó az egyeztetések és a 35 USD teljes keret jóváhagyása
után kifejezetten kérte az indítást. A teljes aktuális aktív képtárból új,
1432 képes futási terv készült, benne mind a 111 generálási tervképpel és
a Needs sorting képekkel. Három kimaradás: egy hiányzó, egy nem támogatott
formátumú és egy korábban fizetetten elemzett, azóta módosult forrás. A változott
forrás régi megfigyelése nem maradt aktuális keresési találatként.

Az eredeti terv és engedélyek metadata-archívumban megmaradtak; vizuális eredmény-
mentést vagy új történeti képmásolatot nem készítettünk. A korábbi 16 fogyasztási
nyugta és 0,3474455 USD költés átkerült a folytatásba. 12 kész, változatlan
eredmény újrahasznált, 1 régi hibás kísérlet újraküldés nélkül megmaradt,
1419 tétel új feldolgozásra várva került a munkasorba. Az új engedély a pontos
kibővített tervhez és a 35 USD teljes kerethez kötött.

A régi, aktuális küldési körön kívüli másolatok retained_items listája továbbra
is a törléskövetéshez tartozik, új feltöltést nem enged. A munkás és a státusz
csak a jelenlegi terv tételeit számolja/feldolgozza; régi történeti sor nem
kerülhet véletlenül újra sorra. Az első három tétel között tervkép is szerepel.

Az első három új eredmény sikeresen elmentődött. Egy helyi SQLite-ütközés után
a munkást a már lezárt kérdések megtartásával folytattuk, 5000 ms busy_timeout
beállítással; bizonytalan kimenetel nem maradt, kérést nem ismételtünk. A javított
munkás túljutott az induló kötegen és a következő kötegen dolgozik. A későbbi
ellenőrzési pillanatkép: 22 sikeres aktuális eredmény, 1 korábbi hiba, 1409
függő tétel, 27 összes eddigi fizetős kísérlet és 0,5637896 USD ismert költség.
Ez indulási állapot, nem teljes feldolgozási eredmény.

Két ténylegesen feldolgozott generálási pózséma már megtalálható az új
keresési próbában. A karakter/portré és karakter/akció/környezet/nézőpont
próbák is megtalálják az elvárt mentett képet. A helyi státusznézet elérhető,
a 35 USD-os költségőr és a törléskövetés aktív, az ideiglenes alvásgátló működik.
A teljes szintetikus regresszió 271/271 sikeres; éles kánon-, profil-,
helyszín-, rendezés- vagy címkeelfogadás nem történt.
