# Harmadik fázis: AI-képelemzés és ellenőrizhető javaslatok

Műszaki terv, 2026-10-30. A mock infrastruktúra, tartós kötegek, cache,
kétnyelvű javaslatillesztés, desktop ellenőrzés/visszavonás és a 023-as additív
migráció elkészült külön fejlesztési ágon, tesztadatbázison. A ténylegesen működő
rész és a visszaállítás leírása: [MEDIA_ANALYSIS.md](MEDIA_ANALYSIS.md).
A valódi modellkapcsolat és minőségi értékelés továbbra is tervezett;
nincs modelltelepítés, privát képfeltöltés, fizetős kérés vagy éles migráció.
Lásd a [szolgáltatói összehasonlítást](AI_PROVIDER_COMPARISON.md).

## Cél és határok

Egy explicit kiválasztott képből készüljön vizuális leírás és strukturált
javaslatlista. Példa: kültér, vízpart, álló testtartás, oldalnézet; opcionálisan
ismert helyszínjelöltek. Az eredmény magyarul jelenjen meg, angol megfelelővel
és meglévő nyelvfüggetlen címke-/helyszínazonosítókkal.

Három eltérő feladatot kell elkülöníteni:

| Feladat | Lehetséges eredmény | Jóváhagyás hatása |
| --- | --- | --- |
| Képleírás | Megfigyelés és bizonytalanság, régióhoz kötött bizonyíték | Külön elemzési rekord; eredeti jegyzetet nem ír felül. |
| Leíró címkézés | Meglévő strukturált tag UUID-k vagy új szótári javaslatok | Kiválasztott címkék hozzáadása; rendezési státusz változatlan. |
| Pontos világhelyszín | Meglévő hely UUID-je + teljes szülői útvonal, alternatívák vagy „ismeretlen” | Explicit kiválasztás után háttérhelyszín; karakterképből nem lesz helyszínreferencia. |

A „strand” felismerése nem bizonyítja, hogy a kép **Fenyves / Strand** vagy
**Kőváros / Strand** helyet ábrázolja. Név, mappanév, általános vizuális hasonlóság
vagy egy modell magabiztos mondata nem elegendő pontos helyszín-hozzárendeléshez.
Új világhelyszín, hierarchikus szülő vagy referenciajóváhagyás nem keletkezik
automatikusan. Karakterazonosítás, életrajz, kánon, testméretek és történeti
tudás jóváhagyása nem része ennek a fázisnak.

## Feldolgozási folyamat

1. A felhasználó kijelöl egy képet vagy egy rögzített, legfeljebb konfigurált
   elemszámú köteget. A rendszer előnézetben megmutatja a fájlazonosítókat,
   elemzési célt, adaptert és a helyi/külső feldolgozás módját. Nincs induláskori
   teljes könyvtárelemzés vagy háttérben folyamatos modellhívás.
2. Rögzíti a média UUID-jét, elérhetőségét, hashét/méretét/módosítási idejét, az
   elemzési sablon és szótár verzióját, valamint a helyszínfa verzióját.
   Csak aktív, határon belüli, engedélyezett formátumú képet dolgoz fel.
3. A meglévő ellenőrzött képbeolvasásból létrehoz egy korlátozott méretű
   elemzési származékot. Eredetit nem módosít. Származék és forrás hashét
   külön tárolja; távoli szolgáltatásnak nem ad nyers fájlrendszerútvonalat.
4. Az adapter strukturált, sémaellenőrzött eredményt ad. Képen látható szöveg
   és OCR nem végrehajtandó utasítás; nem kezdeményezhet feltöltést, fájlműveletet
   vagy új eszközhívást. A szabad szöveg nem közvetlen adatbázis-parancs.
5. Egy determinisztikus illesztő ellenőrzi a visszakapott tag ID-ket és az
   aliasokat az aktuális szótárral. Az ismeretlen/multiértelmű címkék javaslatok.
   Pontos helyre csak megengedett katalógus-UUID lehet jelölt; ismeretlen ID-t
   nem találunk ki és nem hozunk létre.
6. A felhasználó külön megtekinti a leírást, címkéket és helyszínjelölteket.
   A jóváhagyás előnézete rögzíti a kiválasztott elemeket és minden védőverziót.
7. Az alkalmazás újraellenőrzi a fájlt, szótárat, helyszínfát és a média aktuális
   hozzárendeléseit. Változás esetén 409 és új áttekintés; siker esetén egy
   tranzakcióban hozzáadja a választott címkéket/háttérhelyszínt, naplóval.

## Adapter és modellválasztás

Vezessünk be szolgáltatófüggetlen `analyzeImage(input, signal)` határt. Bemenete
a korlátozott kép, elemzési cél, engedélyezett tagcsoportok és a szükséges minimális
helyszínjelölt-metaadat. Kimenete megfigyelések, címkejelöltek, helyszínjelöltek,
bizonyíték, bizonytalanság, modell-/előfeldolgozás-/promptverzió és futási bizonylat.

Első adapter: determinisztikus tesztadapter, valódi szolgáltatás nélkül. Utána
választható egy helyi, ténylegesen offline képi modell. Konkrét modellt és runtime-ot
csak a gép erőforrásigénye, licenc, dokumentált képességek és a kis benchmark
alapján válasszunk. A helyi futtatás nem jelent automatikusan GPU-t vagy megfelelő
sebességet; ezeket mérni kell. Külső API opcionális későbbi adapter legyen.

Külső szolgáltatás előtt külön előnézet és kifejezett engedély szükséges a pontos
képekre, szolgáltatóra és költségkeretre. Az aktuális díjakat/képességeket akkor
kell elsődleges dokumentációból ellenőrizni. Kulcsok, munkafájlok és naplók a helyi
adatkönyvtárban, OneDrive-on és Giten kívül maradnak. Adminjegyzet, privát profil,
teljes életrajz vagy teljes médiakönyvtár nem része az elemzési csomagnak.
A trusted MCP szövegszerkesztési mód nem jelent automatikus AI-/feltöltési engedélyt.

## Pontos helyszínfelismerés

A leíró helyszíntípus és a konkrét világhely külön modellkimenet legyen.
Konkrét helyhez később egy külön, kifejezetten jóváhagyott helyszínreferencia-
készletet érdemes használni. Egy háttérhelyszín-hozzárendelés, képértékelés vagy
AI-javaslat nem avat automatikusan referenciává egy képet.

A referencia tartalmazza a hely UUID-jét, forrásmédia UUID/hashét, opcionális
kivágást, releváns vizuális jellemzőket, jóváhagyó szerepkört és verziót. Egy
karaktert is ábrázoló kép lehet explicit helyszínreferencia, anélkül hogy a
karakterkép rendezési szerepe megváltozna. Az elemzés céljához csak a szükséges
régiót/származékot használjuk.

Lehetséges lépcsők: általános jelenetleírás → korlátozott helyszínjelölt-keresés →
referenciaalapú összevetés → alternatívák/bizonyíték megjelenítése. Az embeddingek
és indexek helyben újraépíthető származékok, nem identitásforrások. Pontos találat
hiányában a helyszínjelölt-lista maradjon üres. A modell saját confidence értéke
nem kalibrált valószínűség; ne jelenjen meg kitalált felismerési százalékként.

## Javasolt hozzáadó adatmodell

| Rekord | Fontos mezők |
| --- | --- |
| `media_analysis_runs` | UUID, idempotency key/hash, cél, státusz, adapter/modell/prompt verzió, határértékek, létrehozás, kezdés/befejezés, hibakód, költségbizonylat. |
| `media_analysis_inputs` | Run ID, media ID, forráshash/signature, származékhash, szótár-/faverzió, explicit referenciakészlet és régiók. |
| `media_analysis_observations` | Bounded megfigyelés, régió, bizonytalanság, módszer és eredeti modellkimenet verziózott metaadata. |
| `media_analysis_proposals` | Egy tag- vagy helyjelölt; cél UUID/null, magyar/angol javasolt szöveg, bizonyíték, pending/accepted/rejected/stale státusz. |
| `media_analysis_decisions` | Jóváhagyó, kiválasztott javaslatok, előnézethash, előtte/utána linkek, visszavonási kapcsolat, időpont. |
| `location_reference_revisions` | Külön jóváhagyott helyszínreferencia-verzió; nem ír karakterkánont. |

A média- és helyszín-ID-k idegen kulcsok, az idempotency key egyedi. Korábbi
elemzést nem ír felül új futás. Az elfogadott címkéket/hozzárendeléseket
nem töröljük pusztán modellváltáskor. Ismeretlen címke megalkotása külön szótári
jóváhagyás; a meglévő kétnyelvű alias-/ütközésellenőrzés újrahasználandó.
Az elemzési szöveg külön tárolódik; a Media Notes változatlan marad.

## Ütemezés, hibakezelés és visszavonás

Kezdetben egy aktív helyi munka, konfigurált sor-/képméret-/időkorlát. A futási
állapotok különböztessék meg a queued/running/succeeded/failed/cancelled/uncertain
eseteket. Lemondás után a későn érkező eredmény nem alkalmazható. Újraindításkor
a félbeszakadt fizetős munkát nem szabad automatikusan újraküldeni.
Ugyanazon request key az eredeti futásra/bizonylatra mutasson.

A jóváhagyási tranzakció soha nem módosít `media_roles`, `media_categorization`,
karakterprofilt vagy kánont. A felhasználó által kézzel elfogadott elemek eredete
megmarad. Visszavonás csak a művelet által hozzáadott és azóta kézzel nem átvett
linkeket érintheti, a 021/022 fázis tulajdonlási és konfliktusvédelmi mintájával.
Utólagos kézi szerkesztést nem írhat felül.

## Tesztek és elfogadási feltételek

Először mesterséges adatokkal és mock adapterrel: hibás JSON, túl nagy válasz,
ismeretlen UUID, többértelmű tag, azonos nevű helyek, változott forrás/szótár/fa,
rejtett/eltűnt média, szakadás, timeout, megszakítás, ismétlés, újraindítás,
engedély-/költségkorlát, export/restore és visszavonás.

Kiemelt regresszió: egy karakterkép helyszín-/tagjavaslatának jóváhagyása után
a karakterkapcsolatok, kánon, jegyzet, szerepkör, completion és eredeti fájlbájtok
változatlanok. A helyek névazonossága nem okozhat téves UUID-illesztést.

Valódi modellhez külön kiválasztott és jóváhagyott, kis tesztkészlet szükséges.
Legyen benne általános strand két külön világhelyről, ismeretlen hely,
megtévesztően hasonló háttér, beltér/kültér, kivágás, több szereplő és megváltozott
fényviszony. A referencia- és tesztképek ne legyenek ugyanazok.
Mérendő: téves pontoshely-javaslat, lemaradt címke/hely, tartózkodás, elfogadott és
elutasított javaslatok, késleltetés, memóriaigény és esetleges költség. Elfogadási
küszöböt a mért eredmények és a felhasználó téves hozzárendeléssel kapcsolatos
toleranciája alapján kell rögzíteni; a terv nem állít be nem mért pontosságot.

## Javasolt megvalósítási sorrend

1. Hozzáadó séma + futás-/javaslatservice + mock adapter; csak kiválasztott képek,
   költség és tényleges modell nélkül. Migráció előtt ellenőrzött mentés.
2. Áttekintő UI, verziókötött jóváhagyás, export/restore és visszavonás.
3. Helyi adapter kiválasztása és kis benchmark; először leíró címkézés.
4. Explicit helyszínreferenciák és pontoshely-jelöltek; alternatívák és „ismeretlen”.
5. Csak külön igény esetén külső API, pontos feltöltési/költségjóváhagyással.

Az első következő fejlesztési csomag ezért a **mock adapteres, kézzel áttekinthető
elemzési futás** legyen. Ez bizonyítja a teljes adatvédelmi és jóváhagyási folyamatot
anélkül, hogy egy konkrét modell megbízhatóságára vagy fizetős elérhetőségére építene.
