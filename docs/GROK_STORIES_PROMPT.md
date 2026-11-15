# Grok – útközbeni és városi sztorik (A–B–C–D)

Mire jó: a Játékban két település közti úton, vagy Kálozon, Székesfehérváron és Budapesten,
mielőtt odaérsz, felugorhat egy rövid, választós történet. Ezeket a Grok írja meg, és a Living
Universe csatlakozón keresztül **maga menti el** (`save_play_stories`), mind a 38-at egy
menetben. A program minden sztorit ellenőriz; a hibásakat a Grok kijavítja és újra elküldi.

Előtte: a program fusson az új kóddal (vezérlő [2]), és a Grokban frissítsd a Living Universe
csatlakozót. Ha a Grok válasza a hosszkorlát miatt megszakad, írd: „tovább”.

Kézi betöltés is lehet: Játék › ⚙ Beállítások › Útközbeni sztorik › „Sztorik betöltése”
(JSON bemásolása, Ellenőrzés, Mentés).

A gyakoriságot ugyanott állíthatod (Soha / Ritkán / Néha / Gyakran). A szexuális és flörtös
sztorik csak bekapcsolt felnőtt tartalommal jönnek elő.

A sztorik szereplői egyszeri idegenek. Nem lesznek karakterek, nem kerülnek a profilokba, és
nem írnak semmit a kánonba.

## Ezt másold be egy új Grok-csevegésbe

```text
Írj interaktív, választós rövid történeteket egy magyar nyelvű, felnőtteknek szóló szerepjátékhoz. A főszereplő Palor, egy felnőtt férfi; a történetet második személyben írod („Megállsz a pihenőnél…”), az olvasó Palor bőrébe bújik. Minden szereplő felnőtt férfi.

ÖSSZESEN 38 TÖRTÉNET, MIND EGY MENETBEN
- 20 db "road": úton két település között (M7, 63-as út, falusi mellékutak, benzinkút, kamionparkoló, buszmegálló, vonat, stoppolás, defekt, éjszakai út).
- 6 db "kaloz": Káloz, Fejér megyei falu (kocsma, bolt, templomtér, kertek, határ, szőlőhegy, tanyák, cigánytelep, buszforduló).
- 6 db "szekesfehervar": megyeszékhely (belváros, Palotai út, pályaudvar, lakótelep, plázák, kocsmák, sportpályák).
- 6 db "budapest": főváros (metró, villamos, éjszakai busz, romkocsma, Duna-part, aluljárók, kerületi utcák, fürdők).
Használd a Living Universe csatlakozót. Előbb hívd meg a list_play_stories eszközt, hogy lásd a már meglévő azonosítókat (ezeket ne használd újra, és a meglévőkkel együtt számold a 38-at). Aztán írd meg a hiányzó történeteket, és mentsd el őket a save_play_stories eszközzel, hívásonként legfeljebb 5 történettel: a stories_json paraméterbe a történetek JSON-tömbjét írd szövegként, a model mezőbe a saját modellneved. Ne kérdezz, ne várj jóváhagyásra és ne mutasd meg a JSON-t a csevegésben: írj, ments, és folytasd a következő adaggal, amíg mind a 38 el nem készült. Ha egy történet a válaszban "invalid", javítsd ki pontosan a felsorolt hibákat, és küldd el újra; a felnőtt és csak-férfi szabályt soha ne kerüld meg átfogalmazással. Ha a válaszod hosszkorlátba ütközik, állj meg, és amikor azt írom, "tovább", folytasd onnan. A végén írd meg magyarul: hány történet mentődött el beállításonként (road, kaloz, szekesfehervar, budapest), és melyik nem, miért.

KIKKEL TALÁLKOZHAT
Idegenekkel, a helyhez illően: kamionosok, stopposok, benzinkutasok, buszsofőrök, rendőrök, vasúti kalauzok, utcai és piaci árusok, építkezésen dolgozók, önkéntesen az utcán élő csavargók, lovaskocsis öregemberek, vadászok, horgászok, borosgazdák, biztonsági őrök, futárok, turisták, focisták, motorosok, rablók és útonállók. Egy történetben 1–3 idegen.

TARTALOM
- Legyen változatos: kaland, humor, veszély, segítségnyújtás, flört és szexuális kaland is.
- A "content" mező a történet legmerészebb lehetséges ágát jelöli: "everyday" (nincs flört), "flirt" (flört, vetkőzés, csók), "sexual" (szex is lehet benne). Nagyjából egyharmad legyen mindhárom.
- A szexuális jelenetek kifejezőek lehetnek, de kizárólag felnőtt férfiak között, kölcsönös, kimondott, önként vállalt beleegyezéssel. Soha ne legyen benne kényszer, zsarolás, fenyegetés, fizetségként „levont” szex, ittasan vagy kábultan beleegyezésre képtelen fél, vagy alárendeltség miatti nyomás. Egy rabló vagy útonálló története is fordulhat flörtbe vagy szexbe, de csak akkor, ha a fenyegetés már véget ért, és mindketten szabadon akarják.
- Minden sztoriban legyen legalább egy út, amely flört és szex nélkül ér véget.
- Kötelező szóhasználat: soha ne szerepeljen nő, lány, asszony, csaj, néni, feleség, barátnő, nővér, anyuka, és a „nő” szó igeként sem („nő a feszültség” helyett: „egyre nagyobb a feszültség”). Ne írj életkort 18 év alatt, és ne szerepeljen gyerek, kamasz, tinédzser, diák, gimnazista, kisfiú szó.
- Az idegeneknek nem kell név; ha kell, adj becenevet („a kopasz kamionos”, „Sanyi bácsi”). Ne használj valós, létező személyek nevét.

SZERKEZET (szigorúan)
- Egy történet 12–20 szövegblokk (node). Egy végigjátszás 6–9 blokkon megy át.
- Minden nem befejező blokk 2–4 választást kínál A, B, C, D kulccsal, ebben a sorrendben. Minden választás másfelé visz; legyen köztük óvatos, merész, vicces vagy segítőkész is.
- Legalább 3 különböző befejezés: "good", "neutral", "bad" vagy "spicy".
- Egy blokk szövege 3–6 mondat, legfeljebb 1000 karakter; érzékletes, a helyhez illő részletek.
- A választás szövege legfeljebb 120 karakter, Palor cselekvése vagy mondata.
- Nem lehet körbe vezető ág: minden út befejezésben ér véget, és minden blokk elérhető a kezdőblokkból.
- Ha egy történet csak bizonyos napszakban hihető, add meg a "slots" mezőt: "reggel", "delutan", "este", "ejszaka". Ha csak autóval vagy csak gyalog/tömegközlekedéssel van értelme, add meg a "transport" mezőt: "car" vagy "foot" (különben "any" vagy hagyd el).

FORMÁTUM (a save_play_stories "stories" tömbjének elemei; csatoló nélkül egyetlen ```json tömbben add vissza)
Minden történet pontosan így néz ki:
{
  "id": "kamionos-a-pihenoben",          // kisbetű, szám, kötőjel; 2–60 karakter; minden történetnél más
  "title": "Kamionos a pihenőben",       // legfeljebb 80 karakter
  "setting": "road",                      // road | kaloz | szekesfehervar | budapest
  "content": "sexual",                    // everyday | flirt | sexual
  "slots": ["este","ejszaka"],            // nem kötelező
  "transport": "car",                     // nem kötelező: car | foot | any
  "summary": "Egy éjszakai pihenőben egy unatkozó kamionos szóba elegyedik veled.",  // legfeljebb 300 karakter
  "start": "n1",
  "nodes": {
    "n1": {"text": "…", "choices": [{"key": "A", "text": "…", "to": "n2"}, {"key": "B", "text": "…", "to": "n3"}]},
    "n2": {"text": "…", "choices": [ … ]},
    "v1": {"text": "…", "ending": "good"}
  }
}
A befejező blokknak nincs "choices" mezője, csak "ending". A JSON-ban ne legyen megjegyzés (a fenti // csak magyarázat).
```

## Ha a Grok hibásat ad

A program blokkra pontosan megmondja a hibát (pl. „n7: a(z) C választás nem létező blokkra
mutat: n12”, vagy „elutasított szó: …”). A mentő eszköz ezt a Groknak is visszaadja, így ő maga
javítja és küldi újra. Ha a csatlakozó nem érhető el, a Grok a JSON-t adja vissza: azt a
Beállításoknál kézzel töltheted be.

A végeredményt a Játék › ⚙ Beállítások › Útközbeni sztorik listájában látod; ott bármelyiket
kipróbálhatod (▶) vagy kikapcsolhatod.
