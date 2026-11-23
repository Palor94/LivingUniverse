# NPC-k egymás közötti kapcsolatdimenziói

2026-11-23. A korábbi Palorhoz kötött hat dimenzió most a világmotor alkalmazott NPC-eseményeiből is változhat: bizalom, ismerősség, sérelem, számíthatóság, vonzalom és határok tisztelete. A pontok az igazolt események óta gyűlt változások; nem kitalált kezdeti kapcsolati értékek. A korábbi kapcsolatszintek, leírások, profilok és vizuális canon változatlanok.

## Esemény és irány

A meglévő játékmester-hívás opcionális, legfeljebb hat elemű `interactions` listát adhat az eseményhez:

```json
{"actor_id":"cselekvő stabil ID","recipient_id":"címzett stabil ID","kind":"help","quote":"*Segítek elpakolni.*"}
```

Az esemény összegzésének egy teljes, külön sorában a tényleges nevekhez kötött bizonyítéknak is szerepelnie kell, például `Teszt Béla: Teszt Aladár, *Segítek elpakolni.*`. Mindkét ID az esemény valódi résztvevője, két külön, egyértelmű nevű NPC kell legyen. Hiányzó vagy eltérő bizonyíték, bizonytalan megszólítás, kérdés, hallott hír, jövőbeli ígéret és nem támogatott típus esetén nincs változás. Palor ebből az útból kimarad. A modell nem adhat dimenziópontokat; a helyi szabály számolja azokat.

Kezdeti konzervatív magyar kifejezéskészlet, a korábbi beszélgetési ellenőrzővel közös szabályokkal. Ez nem általános nyelvi eseményfelismerő; sok átfogalmazásnál tartózkodik. Nem kötelező minden találkozásból interakciót készíteni. A hat típus és a súlyozás változatlanul a `social-experiences.mjs` szabályai szerint működik; ezek játékszabályok, nem mért pszichológiai együtthatók.

A segítség, dicséret, kritika, visszautasítás és a határ tisztelete a címzett cselekvőhöz való viszonyát módosíthatja. Kimondott vonzalom kizárólag a beszélő címzetthez való viszonyát módosítja. A másik irány és a beleegyezés nem következik belőle. Egy esemény egy irányában és típusában legfeljebb egy új rekord készül; a pontok továbbra is telítődnek.

## Tartósság, tudáshatár és felület

A ténykapu a már elmentett `applied`/`accepted` eseményből, ugyanabban a tranzakcióban rögzíti az emléket, az NPC-reakciót és az alkalmazási bizonylatot. A komoly esemény jóváhagyásig nem változtat dimenziót; az elutasított esemény sem. Ismételt alkalmazás nem ír új pontot. Az interakciós forrás hash-e az összegzést is lefedi. A rekord megtartja az eseményt, az eredeti bizonyítéksort, az érintett emléket (ha készült), a személyes értelmezést és a `world-social-experience-v1` módszert. Nem keletkezik kitalált beszélgetés- vagy sorazonosító.

Új adatbázistábla és visszamenőleges adatfeltöltés nincs. A meglévő `social_experiences` export/restore és rewind/undo működés megőrzi ezeket a rekordokat is. A hallott hír csak hallomásként jelenik meg, dimenziót nem módosít; a privát/intim esemény és a vonzalmi vallomás terjedésvédelme megmarad.

Az NPC saját világköri szándékpromptja csak a saját irányított változásait kapja meg. A játékmester külön megnevezett saját nézőpontokként kapja az érintett párokat. A Creator az Élő világ → Kapcsolatok → Egymás közötti változások alatt látja az irányokat, pontokat és bizonyítéksorokat. Ez az adminnézet nem kerül át más karakterek tudásába.

A rejtett események dimenziófeltétele opcionális `target_id` mezővel NPC-párt is vizsgálhat. Enélkül megmarad a korábbi Palor-célpont. Bizonyíték nélküli dimenzió a `not` alatt is ismeretlen.

## Ellenőrzés

`tests/npc-relationships.test.mjs`: tényleges világkör mind a hat típussal, helyes irány és személyes súlyozás, komoly jóváhagyás/elutasítás, hiányzó vagy hamis bizonyíték, hibás modelladat, Palor kizárása, ismétlés- és forrásváltozás-védelem, saját promptok, hallomás, tranzakciós visszagörgetés, rewind/undo és külön üres katalógusba export/restore. A történetbeállítások változatlanságát is ellenőrzi.

Teljes Windows-készlet: 598/598 sikeres. Elkülönített szintetikus katalóguson az igazi Kapcsolatok-felület 1366 és 375 px-en megjelenítette az irányt, a pontokat és a forrást. A fejlesztés nem használt élő szolgáltatót, fizetős hívást, új telepítést, privát feltöltést vagy élő tesztkaraktert. A valódi modell válaszminősége továbbra is külön mérés tárgya.

Élesítés: ellenőrzött helyi SQLite-mentés után a beépített újraindítás sikeres. Az élő adatbázis integrity/foreign-key ellenőrzése rendben; 81 karakter, 2290 média és a meglévő reakciók száma változatlan. A játék/történet és világmotor beállításai bájtra változatlanok. A páros áttekintő API és a felületi modul elérhető; kódeltérés, futó/elakadt job és új naplózott hiba nincs. Az élő katalógusba próbaesemény nem került.
