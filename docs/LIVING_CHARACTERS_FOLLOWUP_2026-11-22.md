# Élő karakterek: az öt következő feladat (2026-11-22)

Ez az öt, a tulajdonos által ebben a munkamenetben kért rész megvalósítása. Nem teljes történetmotorcsere és nem élő szolgáltatós minőségmérés. A próbatörténetek szintetikusak: nem kerültek be az élő világba, és nem változtattak karakterprofilt vagy vizuális canont.

## 1. Harminc rögzített beszélgetési helyzet

`tests/conversation-regression.test.mjs`: tíz külön ellenőrzés személyesen, telefonon és csoportban, összesen 30 helyzet. Saját hang, belső motívumok, Palor adminjegyzeteinek kizárása, távollevő tudásának kizárása, explicit mezők kizárása hétköznapi jelenetben, fontos emlékek felidézése, promptkeret, játékosi döntési szabadság, mentési ténykapu és saját profil elkülönítése.

Kiinduló mérés: **30/30**, a szintetikus készletben legfeljebb **2076 becsült bemeneti token** (4096-os regressziós őr), 200 emlékből mindhárom releváns fordulópont elérhető. A becslés a meglévő `estimateTokens()` alapján történik; nem szolgáltatói számlázási mérés és nem általános futásidejű kontextuskorlát.

A csoportos promptból hiányzott a résztvevők felidézett emlékezete; most minden személy saját blokkjában szerepel, saját állapotával és reakcióival együtt. A korábbi külön 200-emlékes felidézés-benchmark és hosszú beszélgetéses hangteszt továbbra is része a készletnek.

## 2. Többféle személyes eseményreakció

`app/appraisal.mjs` és `app/social-experiences.mjs`: dicséret, kritika, visszautasítás, konkrét segítség, határ elfogadása és a szereplő saját kimondott vonzalma. Az értelmezés a meglévő motívumok és kommunikációs skálák alapján változik.

A meglévő mentési hívás legfeljebb három `experiences` osztályozási javaslatot adhat. A helyi ellenőrző a teljes eredeti mondatot, a tényleges beszélőt és egy szűk magyar kifejezéskészletet ellenőriz. Kérdés, idézett hír, feltétel, jövőbeli segítségígéret, vendég másnak tulajdonított vonzalma és hiányzó bizonyíték esetén tartózkodik. Ez konzervatív kezdeti lefedés: nem általános magyar eseményfelismerő, sok természetes átfogalmazásból nem készül automatikus rekord.

A karakter válaszának minőségét továbbra is a tényleges szolgáltató határozza meg. A mock tesztek az adatfolyamot és a szabályokat igazolják.

## 3. Végigvezetett következménylánc

`tests/narrative-pilots.test.mjs`: Aladár saját tapasztalata → Aladár és Béla világköri találkozója → Béla későbbi találkozója Csabával → Csaba saját, eltérő értelmezése → Csaba későbbi beszélgetésének feltételes fordulata. A teszt a tényleges világkör- és beszélgetéskódot futtatja a próbaszolgáltatóval.

A forrásesemény, a továbbadó, a találkozó, a hallás napja és az emlék megmarad. A régi esemény nem jelenhet meg olyan nap tudásában, amelyen még nem hallottak róla. A jelentős, igazolt események előnyt kapnak a puszta találkozóhírekkel szemben, az eddigi terjedési korlátokon belül. Nincs új szolgáltatói hívás.

Hallott hír nem ír kapcsolatpontot, és az értelmezése nem állít saját élményt. A privát/intim esemény nem terjed; a privát leiratból nem emelünk át olyan mondatot, amely nem szerepelt a megosztható eseményösszegzésben. Vonzalmi vallomásból nem terjed új reakciórekord.

A rejtett esemény új feltételei: `{"dimension":"trust","character_id":"<stabil ID>","gte":2}` és `{"knowledge":"<világesemény-ID>","character_id":"<stabil ID>"}`. Ismeretlen érték a `not` alatt is ismeretlen marad. Ezek a már meglévő feltételfában kombinálhatók.

## 4. Irányított kapcsolatdimenziók

`social_experiences`, 039-es hozzáadó migráció: külön bizalom, ismerősség, sérelem, számíthatóság, vonzalom és a határok tisztelete. Minden rekord eseményhez, beszélgetéshez, eredeti sorazonosítóhoz és – ha a mentés adott ilyet – emlékhez kötött. A módszer verziója `social-experience-v1`.

Ezek az **ismert események óta gyűlt változások**, nem a karakter teljes kapcsolati profiljának kitalált alapértékei. Bizonyíték nélküli dimenzió hiányzik. Az eddigi összesített kapcsolatszint és jóváhagyott kapcsolati szöveg megmarad. Palor érzéseit nem következtetjük ki: a másik irány automatikusan nem változik. Vonzalom nem jelent bizalmat vagy beleegyezést.

Kezdeti játékszabályok, nem mért pszichológiai együtthatók:

- Dicséret: ismerősség +1; nincs automatikus bizalom vagy vonzalom.
- Kritika: sérelem +1, érzékeny kötődés/elismerés/sérelemőrzés esetén +2; erős elismerésigénynél bizalom −1.
- Elutasítás: erős kötődésigénynél sérelem +1; nincs automatikus nyomásgyakorlás vagy viszonzás.
- Konkrét segítség: bizalom +2, számíthatóság +1, ismerősség +1.
- Határ elfogadása: bizalom +1, határok tisztelete +2.
- A szereplő saját vonzalmi mondata: vonzalom +1, kizárólag az ő irányában.

A pontok −10…+10 között telítődnek; ismerősség és sérelem 0…10 között. A Kapcsolatok részleteiben az ismert változások és forrásmondataik megnyithatók.

## 5. Három eltérő történeti próba

`tests/fixtures/narrative-pilots.mjs`, kilenc végigtesztelt út:

- **Hétköznapi konfliktus:** konkrét segítség, kritika vagy a határ elfogadása; másnapi eltérő következmény.
- **Titok feltárulása:** diszkréció, javításban segítés vagy bírálat; a jelenet tulajdonosi privát jelölése akkor is megmarad, ha a modell nem ad privát flaget. Egy későbbi valódi találkozó sem terjeszti a titkot.
- **Közeledés:** kedvesség, elutasítás vagy lassítás; egyik út sem kényszerít kölcsönös vonzalmat, szerelmet vagy beleegyezést.

A döntések a szokásos szabad szöveges beszélgetésen mennek át. Nincs új A/B választásmotor; a három javaslat mellett a játékos továbbra is saját szöveget írhat. A későbbi fordulat a ténylegesen rögzített következmény feltételétől függ.

Az eseményszerkesztő új **Privát esemény** jelölése a belőle születő beszélgetési eseményt kizárja a hírterjedésből. Meglévő, jelöletlen eseményeket ez a változás nem minősít át.

## Mentés, visszatekerés és korlátok

A migráció előtt meglévő adatbázisról ellenőrzött SQLite online mentés készül a helyi adatkönyvtár `backups` mappájában. A 039-es táblához van down SQL; a külön hozzáadott privát oszlop visszaállításkor adatvesztés nélkül megmaradhat. Az inaktív feladatsor ellenőrzése után a beépített újraindítással élesítve: új tábla és privát oszlop jelen van; a mentés utólagos integrity/foreign-key ellenőrzése is sikeres. A kódállapot friss, a főoldal és a Play-modul 200-as választ ad, nincs futó/elakadt háttérfeladat. Élő adatot próbatörténettel vagy tesztbeszélgetéssel nem töltöttünk fel.

A visszatekerés és visszavonása a reakciókat, dimenziókat, hírláncot és rejtett fordulatot is helyreállítja. A logikai export/restore most megőrzi az új rekordokat, a világismeretet és a rejtett eseményeket/feltárásokat. A teljes lánc külön üres katalógusba való visszaállítása tesztelt.

Futtatás: `npm test -- conversation-regression social-experiences narrative-pilots`. A teljes `npm test` a meglévő regressziókat is ellenőrzi. A tágabb régi feladatokból a teljes rögzített-story rendszer cseréje és a valódi szolgáltatós minőségmérés továbbra is külön munka.
