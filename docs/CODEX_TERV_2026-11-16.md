# Living Universe – Codex-utasításterv (2026-11-16)

## Megtartott négy feladat – elkészült (2026-11-22)

A tulajdonos az alábbi négy feladatot tartotta meg. Ez felülírja a lentebbi korábbi munkasorrendet és a lezárási jegyzet eredeti nyitott listáját.

1. **Kész – A16:** gyorsabb navigáció és profilfülváltás.
2. **Kész – V14:** statikus fájlok verziózása és gyorsítótárazása, a privát adatok gyorsítótárazási szabályainak megtartásával.
3. **Kész – V7:** csoportképes borítók karakterre igazított kivágása, kizárólag megjelenítési változtatásként.
4. **Kész – 13. csomag / B21:** figurákat és háttereket közösen kezelő, keretes generálási sor befejezése.

**Ellenőrzés (2026-11-22):** 497/497 teszt sikeres, 170 tesztfájlból, `npm test -- --changed`. T0: előtte `2026-11-22T12-46-31-920Z` (14 kép); utána `2026-11-22T13-05-50-831Z` (14 kép); célzott `--retained-four`: `2026-11-22T13-07-39-138Z` (12 kép). Mindkét méret sikeres; ugyanaz a profilfejléc, 0 új állapotolvasás fülváltáskor, 43 statikus fájl gyorsítótárból és 0 átvitt bájt újranyitáskor. A képek és a `report.json` a `%LOCALAPPDATA%\LivingUniverse\ui-shots` alatt vannak. A generálás szintetikus szolgáltatóval ellenőrizve; igazolt USD-becslés nélkül az éles keretes sor továbbra sem indítható. Kézzel a Képműhely → Generálás → Keretes képsor, illetve a többalakos borító kivágása nézhető át. Ez nem nyitja újra a törölt feladatokat.

**Törölt további igények:** a 16. csomag külön lezárási/mérési/dokumentációs munkája, V8 (diszkrét mód), W7 (teendőszámlálók), W8 (külön fordítási audit), valamint az önálló éles Sogni-ellenőrzési feladat. A már elkészült funkciók eltávolítása nem része ennek a döntésnek. A megtartott fejlesztések kapcsolódó tesztjei és T0-ellenőrzései továbbra is szükségesek.

A keretes generálás változatlanul betartja az AGENTS.md engedélyezési és költségkorlátait: hiányzó igazolt pénzbeli becslés mellett nincs indítás; ez a tervszűkítés nem ad éles futási vagy feltöltési engedélyt.

**A hosszú munkaszakasz a tulajdonos kérésére lezárva (2026-11-17).** A kész és nyitott tételek átadási jegyzete: [CODEX_LEZARAS_2026-11-17.md](CODEX_LEZARAS_2026-11-17.md). Ez a munkaszakasz lezárása, nem a teljes UX-terv befejezése.

Ez az egyetlen belépési pont. Tartalma: munkaszabályok, munkasorrend, majd négy feladatlista:
**A** (hibák, kódolvasásból), **B** (fejlesztések), **V** (a futó program vizuális átnézése), **W** (a korábban kimaradt részek: Élő világ, Képműhely, Gyors címkézés, Szereplőgyár, i18n, tesztek, DECISIONS).

A sorszámok közelítők, a függvénynév a biztos hivatkozás. Ahol „(feltételezés)” áll, előbb ellenőrizd.

## 0. Hogyan dolgozz (Codexnek)

1. **Olvasd el először:** `AGENTS.md`, `PROJECT_VISION.md`, `DEVELOPMENT_PLAN.md`, `docs/DEV_TOOLS.md`. A `DECISIONS.md` 187 KB: ne olvasd végig, hanem keress benne a feladat kulcsszavaira (`grep`), mert sok viselkedés szándékos tulajdonosi döntés.
2. **Egy munkamenet = egy csomag** az 1. fejezetből (vagy egyetlen tétel, ha L méretű). Ne kezdj bele a következőbe.
3. **Soha ne dolgozz az élő adatbázison.** Kipróbálás: `npm run sandbox` (4327-es port, próba-AI, fizetős hívás nem történhet); fájlt érintő művelethez `npm run sandbox -- --empty-media`.
4. **Tilos jóváhagyás nélkül:** fizetős AI- vagy képhívás, csomag- vagy modelltelepítés, privát kép feltöltése, kánonírás, távoli git-beállítás. Ha egy tétel ilyet kíván, állj meg és kérdezz.
5. **Tesztek:** előtte `npm test -- --risk` (megmutatja az érintett képernyőket és teszteket), közben `npm test -- <kulcsszó>`, a végén `npm test -- --changed`. Új viselkedéshez új teszt, szintetikus adattal.
6. **Szövegek:** minden felirat magyarul, az `app/public/i18n.js`-ben, `t('kulcs')` hívással. Új kliensmodult vegyél fel a szerver statikus listájára (a `client-smoke` teszt ezt ellenőrzi).
7. **CSP:** inline `style` attribútum tilos; méretezés CSSOM-on át (lásd az `image-workshop.js` mintáját).
8. **Döntésnapló:** minden csomag végén rövid, dátumozott bejegyzés a `DECISIONS.md` végére (mi változott, miért), a meglévő bejegyzések stílusában.
9. **Képernyőkép:** a T0 szkript elkészülte után minden UI-változáshoz előtte/utána kép (`npm run shots`).
10. **Jelentés a végén:** mit változtattál (fájlok), mely tesztek futottak, mi maradt nyitva, és mit kell a tulajdonosnak kézzel megnéznie.

Indító szöveg mintája:

```
Olvasd el a docs/CODEX_TERV_2026-11-16.md 0. fejezetét, majd végezd el az 1. fejezet
3. csomagját (A5, B8, A6). Tartsd be az AGENTS.md szabályait. Ha bármi fizetős hívást,
telepítést vagy feltöltést kívánna, állj meg és kérdezz.
```

## Tulajdonosi döntések (2026-11-16) – ezek felülírják a tételek szövegét

- **A8 törölve:** a Térkép megnyitása továbbra is kilépteti Palort; mozgás nélküli előnézet nem kell.
- **A13 törölve:** a referencia ✕ törléséhez nem kell megerősítés.
- **B15 törölve:** felolvasás és diktálás nem kell.
- **Munkamenet-szintű jóváhagyás elfogadva** (B19, B21): egy jóváhagyás szólhat időre és keretre („30 percig legfeljebb N kép / X USD, ezekkel a referenciákkal”). Mivel az `AGENTS.md` ma futásonkénti jóváhagyást ír elő, a megvalósítás első lépése egy **javasolt** `AGENTS.md`- és `DECISIONS.md`-szöveg, amelyet a tulajdonos hagy jóvá. Az `AGENTS.md`-t magadtól ne írd át.
- **Telefon = játék, laptop = fejlesztés/stúdió.** A Játék telefonos felülete (`play-mobile.html`, `play-mobile.js`) elsőrendű cél; a stúdió telefonos nézete nem. Érintésre is működjön minden, ami a Játékban ma csak rámutatásra látszik.

## 1. Munkasorrend (csomagok)

**Állapot (2026-11-16):** az 1. Mérőeszközök csomag (T0, B7, W9) elkészült.
A 2. Gyors javítások csomag is elkészült (V1, V2, V3, V13, A9, A10, A12, A17, A25).
A 3. Folyékony helyszínváltás csomag is elkészült (A5 → B8 → A6).
A 4. Előtöltés és figurák csomag is elkészült (B9, A23 → B10).
Az 5. Párbeszéd I. csomag is elkészült (A3 + B11, A4, A2 + B3, B14).
A 6. Utazás csomag is elkészült (A7 + B6, V11, V12).
A 7. Hibák a képeknél csomag is elkészült (V5 → V4).
A 8. Profil csomag is elkészült (V9, A14 + B1, A15, V6, B2; 2026-11-17).
A 9. Útvonalak és indítás csomag is elkészült (A1 → A24 + B24; 2026-11-17).
A 10. Modális és visszavonás csomag is elkészült (A11 + B25, W5 natív ablakai; 2026-11-17).
A 11. Sogni I. csomag kódja és homokozós ellenőrzése elkészült (A20, B20, A21; B17: szolgáltatói kapacitásbecslés és plafon).
**Nyitva:** B17 Spark/USD-válaszséma és éles kulcs ellenőrzése. A tulajdonos 2026-11-17-én Sogni-fiókhibát jelzett; éles hívás nem próbálható, addig csak próbaszolgáltatóval dolgozunk.
A 12. Sogni II. csomag kódja és homokozós ellenőrzése elkészült (B18 + A22 → B22; 2026-11-17).
A 13. csomag pontos jóváhagyási szabályszövegét a tulajdonos jóváhagyta; az AGENTS.md és DECISIONS.md frissítve. Ez nem éles futási engedély.
A döntésre várva a 14. Helyszínek csomag is elkészült és ellenőrizve (A19 + V10 → B4/A18 → B5; 2026-11-17).
A 13. csomagból elkészült B19 (több kimenet és keretes engedély), B23 (pillanatkép) és a B21 figura-munkás, valamint W2 javító hivatkozásai. A vegyes figura/háttér sor 2026-11-22-én elkészült. Igazolt szolgáltatói USD-válasz nélkül a keretes indítás tiltott; külön éles ellenőrzés nincs a megtartott feladatok között.
A 15. Stúdió-képernyők csomag elkészült és homokozóban ellenőrizve (W1, W3, W4, W5, W6). A további munkát a dokumentum elején szereplő szűkített tulajdonosi lista határozza meg; a 16. csomag külön lezárása kikerült az igényből.
A tulajdonos újabb utasítása szerint a fennmaradó csomagok egymás után folytatandók;
ez felülírja a 0. fejezet munkamenetenként egy csomagos korlátját.

| # | Csomag | Tételek | Méret |
|---|---|---|---|
| 1 | Mérőeszközök | T0 (képernyőkép-szkript), B7 (kattintásmérő), W9 (lint kiterjesztése) | M |
| 2 | Gyors javítások | V1, V2, V3, V13, A9, A10, A12, A17, A25 | M |
| 3 | Folyékony helyszínváltás | A5 → B8 → A6 | M–L |
| 4 | Előtöltés és figurák | B9 (benne A23) → B10 | M |
| 5 | Párbeszéd I. | A3 + B11, A4, A2 + B3, B14 | M |
| 6 | Utazás | A7 + B6, V11, V12 | M |
| 7 | Hibák a képeknél | V5 → V4 | M |
| 8 | Profil | V9, A14 + B1, A15, V6, B2 | L |
| 9 | Útvonalak és indítás | A1 → A24 + B24 | M |
| 10 | Modális és visszavonás | A11 + B25 (benne W5 natív ablakai) | M |
| 11 | Sogni I. | B17 → A20 + B20 → A21 | M–L |
| 12 | Sogni II. | B18 + A22 → B22 | M |
| 13 | Sogni III. | jóváhagyási szöveg → B19 → B23 → B21 (benne W2) | L |
| 14 | Helyszínek | A19 + V10 → B4 (benne A18) → B5 | L |
| 15 | Stúdió-képernyők | W1, W3, W4, W5, W6 | M–L |
| 16 | Párbeszéd II. és költség | B12, B13, B16 | M |
| 17 | Maradék | A16, V14, V7, V8, W7, W8 | M |

A 11–13. csomag fizetős hívást érint: a kód homokozóban, próbaszolgáltatóval készül; az első éles próbát a tulajdonos indítja.

Sogni-árak (docs.sogni.ai/pricing, 2026-11-16): 1 Spark ≈ 0,005 USD. FLUX.1 Schnell ≈ 0,004 USD/kép, Z-Image Turbo ≈ 0,008, Krea 2 Turbo ≈ 0,012, Qwen Image ≈ 0,021, Qwen Image Edit 1 referenciával ≈ 0,04, GPT Image 2 közepes ≈ 0,069. A beállított `krea-identity-edit` ára nincs a listán: **bizonytalan**. Az árakat kódba ne égesd be; a szolgáltató becslését használd (B17).

---

## A) Hibák és UX-problémák (kódolvasásból; A8 és A13 tulajdonosi döntéssel törölve)

Súlyosság: kritikus / magas / közepes / alacsony. Munka: S (≤ fél nap), M (1–3 nap), L (ennél több).

### A1. Az oldal frissítése és a böngésző Vissza gombja elveszíti a helyet
- **Mit tapasztal:** F5 után mindig a Kezdőlapra kerül (akár egy profil közepéről); a Vissza gomb nem lép az előző nézetre, hanem elhagyja az appot. Az átnevezés külön oldala (`/character-rename.html`) után is a Kezdőlapra érkezik vissza.
- **Hol:** `app/public/client.js` ~48. sor (`view=location.hash==='#locations'?'location-catalogue':'home'`), `navigate()` ~99. sor (`history.replaceState`, csak a `#locations` kerül az URL-be); átnevezés link a `renderProfile()`-ban (~203. sor).
- **Miért baj:** minden frissítés 2–4 kattintás visszatalálni; könyvjelző, „megnyitás új lapon" nem működik.
- **Javítás:** hash-alapú útvonal (`#/profile/<id>/canon`, `#/play`), `pushState` + `popstate` kezelés; induláskor a hash-ből áll vissza a `view`, `activeCharacter`, `profileTab`.
- **Súlyosság:** magas · **Munka:** M

### A2. A figurára kattintás azonnal (fizetős) AI-megszólalást indít
- **Mit tapasztal:** a jelenetben bármelyik alakra kattintva rögtön elindul a beszélgetés és a karakter nyitómondata; nincs mód előbb megnézni, ki ő. Egy félrekattintás is hívás és nyitott beszélgetés.
- **Hol:** `play.js` › `figure()` (~695), `showPlace()` (`[data-play-talk]` kezelő, ~762), `startTalk()` (~1229: `talkApi({…opener:true})`).
- **Miért baj:** költség és megszakított élmény; a profil a játékból nem látható.
- **Javítás:** első kattintás = kis névjegykártya (portré, kapcsolat szintje, mit csinál, „Megszólítom" / „Csak nézem"); a nyitómondat csak a gombra indul. Billentyű: Enter = megszólítás.
- **Súlyosság:** magas · **Munka:** S–M

### A3. Egysoros beviteli mező a jelenet-párbeszédben
- **Mit tapasztal:** Palor szövege egyetlen sorban gördül vízszintesen, pedig 2000 karakter írható; többsoros szöveg, sortörés nem lehetséges.
- **Hol:** `play.js` › `renderSceneDialog()` (~984) és `renderGroupDialog()` (~1043): `<input id="play-input" maxlength="2000">`. A `bindTalkControls()` (~1185) Shift+Enter kezelője csak `TEXTAREA` esetén él, vagyis itt holt kód; a lebegő csevegő (~1286) viszont textarea.
- **Miért baj:** szerepjátéknál a hosszabb, leíró sor a jellemző; a saját szöveg nem látszik egyben.
- **Javítás:** automatikusan növő `<textarea rows=1>` (max. 5 sor), Enter küld, Shift+Enter új sor; a `renderTalk()` piszkozat-megőrzése változatlanul működik vele.
- **Súlyosság:** magas · **Munka:** S

### A4. Az Esc nem ugyanazt csinálja, mint az „Elköszönök"
- **Mit tapasztal:** Esc-re a beszélgetés eltűnik összegzés és mentés nélkül; ha fotójelenet volt nyitva, a kép a jeleneten marad beszélgetés nélkül.
- **Hol:** `play.js` › `bindKeys()` (~256): `talkCharacter=null;talk=null;renderTalk();refreshStage();` – nem hívja a `leaveTalk()`-ot (~1132), amely a mentést, a `photoMode` és a `groupTalk` törlését végzi.
- **Miért baj:** a kódkomment szerint „egy módja van a beszélgetés lezárásának"; az Esc ezt megkerüli. A nyitva maradt beszélgetést a szerver később folytatja vagy lezárja **(feltételezés – ellenőrizni kell: `closeStale` a `play-mode.mjs`-ben)**, de a képernyő állapota addig hibás.
- **Javítás:** a 2026-11-13-i döntés szerint az Esc csak a legfelső ablakot zárja, a nyitva hagyott beszélgetés pedig „Vissza a beszélgetéshez” pirula. Ehhez igazítsd: Esc-re a beszélgetés **pirulává** váljon (ne tűnjön el), a `photoMode` és a jelenetkép záródjon, a `groupTalk` állapota maradjon meg. Lezárás és összegzés továbbra is csak az „Elköszönök” gombbal.
- **Súlyosság:** közepes · **Munka:** S

### A5. A jelenet minden apróságnál teljesen újraépül és újra „beúszik"
- **Mit tapasztal:** várakozás, tárgy felvétele/letétele, ajtószerkesztés be/ki, háttér feltöltése után a háttér újra elhalványulva jön be, a figurák újra felemelkednek, az ajtók újrarajzolódnak.
- **Hol:** `play.js` › `showPlace()` (~737: `$('#play-body').innerHTML=…`), hívói: `render(root)` a várakozás után (~176), tárgyműveletek (~776–777), `#vn-doors-edit/-cancel/-save` (~765–768). Animációk: `style.css` 217. sor (`.vn-bg{animation:lu-bg .6s}`), `lu-rise`.
- **Miért baj:** villogás, nyugtalan képernyő; a kattintások „nehéznek" érződnek.
- **Javítás:** a jelenetet részenként frissíteni (`refreshStage()`, `paintDoors()`, `itemsRow()` már külön létezik); a belépő animáció csak tényleges helyváltáskor fusson (osztály a gyökéren).
- **Súlyosság:** magas · **Munka:** M

### A6. Helyváltáskor nincs áttűnés; az animáció és az átvezető kép nem várja meg a betöltést
- **Mit tapasztal:** ajtóra kattintva a régi jelenet azonnal eltűnik, szürke váz jön, majd a kép „bepattan"; lassabb betöltésnél a 0,6 mp-es áttűnés üres háttéren fut le. Az utcai/lépcsőházi átvezető kép 1,1 mp-ig látszik, akkor is, ha a kép addig be sem töltött.
- **Hol:** `play.js` › `openPlace()` (~674, váz beírása a régi jelenet helyére), `showPlace()` (`<img class="vn-bg" src=…1600>`), `passageMoment()` (~559: `setTimeout(close,…)` a kép `load` eseményétől függetlenül); `preloadExits()` csak az első 6 kijárat hátterét tölti elő, a figurákat nem.
- **Miért baj:** ez a „nem folyékony képernyőváltás" közvetlen oka.
- **Javítás:** lásd B8–B10 (kétrétegű áttűnés, `img.decode()` megvárása, időzítő a betöltés után indul).
- **Súlyosság:** magas · **Munka:** M

### A7. Települések között mindig felugrik az utazási ablak, miközben a felső sávban is van autó/gyalog kapcsoló
- **Mit tapasztal:** minden városközi útnál külön ablakban kell módot választani; a felső sáv „Autóval / Gyalog" kapcsolója ilyenkor nem számít.
- **Hol:** `play.js` › `chooseTravel()` (~490) és `travelTo()` (~520: `choice.mode?choice:drive&&car?{vehicle_id}`); a kapcsoló a `render()`-ben (`#play-car-on/off`).
- **Miért baj:** +1 kattintás minden útnál, két vezérlő ugyanarra.
- **Javítás:** az utolsó választott mód legyen az alapértelmezés; ablak csak akkor, ha a megszokott mód nem elérhető vagy új lehetőség van (fuvar, vonat) – különben kis „✎ másképp megyek" link az úton-jelzőn.
- **Súlyosság:** közepes · **Munka:** S

### A9. A Játék újranyitása az utoljára nézett menüképernyőre érkezik
- **Mit tapasztal:** ha legutóbb a Beállítások vagy a Napló volt nyitva, a Játék legközelebb is ott nyílik, nem a jelenetben.
- **Hol:** `play.js` ~236 (`lu-play-view` visszaolvasása: `journal/relationships/messages/settings` is), `render()` (~111: a helyhez igazítás csak `map`/`town` módnál fut).
- **Javítás:** csak `map`/`town` módot jegyezzen meg; belépéskor mindig Palor tényleges helye.
- **Súlyosság:** alacsony · **Munka:** S

### A10. „Alszom" egy kattintásra, megerősítés nélkül (otthon)
- **Mit tapasztal:** a felső sávban a „Várok" mellett álló „Alszom" azonnal reggelre ugrik; megerősítés csak akkor van, ha nem otthon alszik.
- **Hol:** `play.js` › `render()` (~144 gomb, ~163–176 kezelő: `until==='morning'&&!sleepable(…)&&!confirm(…)`).
- **Miért baj:** az éjszaka átugrása világköröket futtat (AI-költség), és csak visszatekeréssel vonható vissza.
- **Javítás:** az „Alszom" kerüljön a „Várok" lenyíló menübe, vagy legyen 5 mp-es „Visszavonás" sáv a hívás előtt.
- **Súlyosság:** közepes · **Munka:** S

### A11. Böngésző-natív `prompt()` / `confirm()` ablakok a játékban
- **Mit tapasztal:** tárgy neve, vendég leírása, visszatekerés, alvás, képújítás – mind a böngésző szürke rendszerablakában; a vendégnél a „Mégse" a portré-kérdésnél nem megszakít, hanem „portré nélkül, de hozzáad".
- **Hol:** `play.js` ~776 (`prompt`), ~1162–1163 (`window.prompt` + `window.confirm`), ~1168–1169, napló visszatekerés (`confirm`), ~166. Összesen 7 hívás a `play.js`-ben; a többi fájlban további 15.
- **Miért baj:** kizökkent a teljes képernyős jelenetből (egyes böngészők ki is lépnek a teljes képernyőből **– feltételezés, ellenőrizni kell**); a kétlépcsős vendég-kérdés félreérthető.
- **Javítás:** egy közös, témázott `ask()/confirmBox()` modális a meglévő `.play-album` mintára; a vendégnél egy űrlap (leírás + „kérek portrét (fizetős)" jelölő + Mégse).
- **Súlyosság:** közepes · **Munka:** M

### A12. Csoportos beszélgetés: nem választható, kik vesznek részt
- **Mit tapasztal:** 5+ jelenlévőnél a „Csoportos beszélgetés" mindig az első négyet viszi be.
- **Hol:** `play.js` › `renderSceneDialog()` (~967: `startGroup(p.people.slice(0,4))`).
- **Javítás:** jelölőnégyzetes választó (alapból az első 4), vagy a figurákra Ctrl+kattintás.
- **Súlyosság:** alacsony · **Munka:** S

### A14. A profilszerkesztő nem mutatja, mi tény, mi feltevés, és ki láthatja
- **Mit tapasztal:** minden mező egyforma szövegdoboz; nem látszik, hogy az érték a tulajdonostól, AI-javaslatból vagy régi szövegből származik, sem az, hogy a szereplők „tudhatják-e" (visibility).
- **Hol:** `ghost-profile.js` › `render()` (~84–92: `groupHtml`, csak `shownValue`), miközben az adat megvan (`g.values[id].kind/source/visibility`). A `buildProfileOverview()` (~12) ki is számolja a `kind`/`visibility` értéket, de a `public/` mappában sehol nincs meghívva.
- **Miért baj:** ez a „profilok átláthatatlansága": a 2026-11-15-i tömeges feltöltés óta (`PROFIL_TERV`) sok érték `hypothesis`, de ránézésre nem különböztethető meg.
- **Javítás:** mezőnként kis jelvény (✓ tény / ~ feltevés / régi szöveg), forrás a tooltipben, szem-ikon a láthatóságra; szűrő: „csak feltevések", „csak üresek". Lásd B1.
- **Súlyosság:** magas · **Munka:** M

### A15. Kétféle mentés egy lapon; a kézi javítás csendben „ténnyé" minősít; a mentés nem atomi
- **Mit tapasztal:** a fejléc (becenév, faj, jegyzet) magától ment, az alatta lévő profil csak a felugró „Mentés" sávval. Egy feltevés elírásának javítása után az érték ténynek számít. Hiba esetén „elmentve, de a régi mezőbe másolás nem sikerült" üzenet jöhet.
- **Hol:** `client.js` › `renderProfile()` (komment: „Every header field autosaves"); `ghost-profile.js` › `collect()` (~97: `kind:'fact',source:MANUAL_SOURCE`), `form.onsubmit` (~110–121: javaslat létrehozása → elfogadás → mezőnként külön `profile-field` hívás).
- **Javítás:** egységes automatikus mentés állapotjelzővel (vagy mindenhol mentés-sáv); a `kind` maradjon, ha a szöveg alig változott, vagy legyen mellette választó; a három lépés egy szerveroldali tranzakció legyen.
- **Súlyosság:** közepes · **Munka:** M

### A16. Lassú fülváltás és navigáció a stúdióban
- **Mit tapasztal:** a profil minden fülváltása újratölti a karaktert és újrarajzolja a fejlécet; minden menüváltás lekéri a teljes állapotot.
- **Hol:** `client.js` › `renderProfile()` (~191: minden hívásnál `api('/api/characters/'+id)`), `render()` (~103: `await refresh()` → `/api/state`, majd rendezés). A `client.js` induláskor statikusan betölti az összes modult, köztük a 142 KB-os `play.js`-t és a 237 KB-os `i18n.js`-t (a saját terv C4/C5 pontja is említi).
- **Miért baj:** érezhető késés **(mértéke feltételezés – a `npm run perf` méréssel ellenőrizni)**.
- **Javítás:** karakter gyorsítótár fülváltáshoz; `refresh()` csak író művelet után; ritkán használt nézetek `import()`-tal.
- **Súlyosság:** közepes · **Munka:** M

### A17. Hibaüzenetek: nem JSON válasznál értelmezhetetlen szöveg
- **Mit tapasztal:** ha a szerver leállt vagy HTML-t ad vissza, a piros értesítés „Unexpected token <…" vagy „Failed to fetch".
- **Hol:** `client.js` › `api()` (92. sor: feltétel nélküli `await r.json()`); ugyanez a `location-canvas.js` › `request()` és a `character-generation.js` › `write()` függvényben.
- **Javítás:** `try/catch` a JSON-olvasás körül, magyar üzenet („A program nem válaszol – fut még a fekete ablak?") + Újra gomb.
- **Súlyosság:** közepes · **Munka:** S

### A18. A helyszínkezelés öt helyre van szétszórva
- **Mit tapasztal:** helyszínfa: menü › Helyszínek; helyszínképek: Eszköztár › Helyszínreferenciák; helyszínadatok: Eszköztár › Helyszínszerkesztő (felugró ablak); háttér feltöltése, ajtók elhelyezése: Játék › hely › „⋯ Eszközök"; település-tűk rendezése: Játék › település › „⋯".
- **Hol:** `index.html` (nav `location-catalogue`), `client.js` ~427–430 (`#location-library`, `#location-editor-tool`), `play.js` › `showPlace()` (`.vn-place-tools`), `renderTown()` (`#tm-edit`), `place-tools.js`.
- **Miért baj:** egy új hely „játékkésszé" tétele 4–5 képernyőt érint; nincs egy hely, ahol látszik, mi hiányzik még.
- **Javítás:** lásd B4 (egyesített Helyszínek központ).
- **Súlyosság:** magas · **Munka:** L

### A19. A Helyszínek oldal túlzsúfolt, részben angol, tervezői zsargonnal
- **Mit tapasztal:** a fejlécben 9, az eszközsorban 12 gomb; a főcím „Locations"; „Piszkozat mentése / Terv áttekintése / Jóváhagyott terv" fogalmak; ha a böngészőben megőrzött piszkozat eltér a szerverétől, a régi piszkozat töltődik be, csak egy szöveges figyelmeztetéssel.
- **Hol:** `location-canvas.js` › `mountLocationCanvas()` (~17–37: `el('h1','Locations')`, `actions.append(…)`, `tools.append(…)`), helyi piszkozat betöltése (~15–16), eltérés-üzenet a fájl végén.
- **Javítás:** három elsődleges gomb (Mentés, Áttekintés, Visszavonás), a többi „⋯ További" menübe; magyar cím; eltérésnél kötelező választó ablak betöltéskor.
- **Súlyosság:** közepes · **Munka:** M

### A20. „Generálás Sognival": egy képhez 6 lépés, és a siker elnavigál
- **Mit tapasztal:** jelenet beírása → referenciák kézi kijelölése (semmi nincs előre kijelölve) → „Kérés előkészítése" → jelölőnégyzet → „Jóváhagyom a tervet" → „Egy kép generálása" → várakozás. Siker után a program átdob a „Képek és videók" fülre; új próbához vissza kell kattintani.
- **Hol:** `character-generation.js` › `render()` (~13: `selected:new Set()`), `show()` (~38: `watching.delete(…)` → `onSaved`), `client.js` ~57 (`onSaved` → `profileTab='media'`).
- **Miért baj:** a karakterhűség próbálgatást igényel; itt minden próba ~7 kattintás és egy nézetváltás. (A külön jóváhagyás az `AGENTS.md` szerint szándékos biztonsági kapu – a javítás ezt nem törli, csak rövidíti.)
- **Javítás:** az utoljára használt (vagy arc+test) referenciák előre kijelölve; előkészítés + jóváhagyás egy panelen; az eredmény helyben jelenjen meg „Még egy / Variáció / Megnyitom" gombokkal. Lásd B19–B20.
- **Súlyosság:** magas · **Munka:** M

### A21. Sogni: nincs valós költség, nincs haladásjelzés, egy kép futásonként
- **Mit tapasztal:** „A pontos költség nem ismert" (hacsak kézzel nem írtál becslést a konfigurációba); generálás közben csak „A Sogni dolgozik" szöveg, 3 mp-enkénti lekérdezéssel; mindig egy kép.
- **Hol:** `sogni-provider.mjs` (~41–42: `numberOfVariations:1`, `confirm_cost:true`, `pollMs=3000`, `timeoutMs=600000`); `image-providers.mjs` › `configuredImageProviders()` (`estimated_cost_usd` csak a helyi konfigurációból); `character-generation.js` › `show()`.
- **Javítás:** lásd B17 (szolgáltatói becslés `confirm_cost:false` próbahívással, `max_estimated_capacity_units` plafon) és B19.
- **Súlyosság:** közepes · **Munka:** M

### A22. Hiányzó háttér a játékban: csak vágólap + kézi feltöltés
- **Mit tapasztal:** háttér nélküli helyen az „Eszközök" alatt „📋 prompt másolása", majd másik appban generálás, mentés, feltöltés. A feltöltés a teljes képet (max. 20 MB) szövegként, haladásjelzés nélkül küldi.
- **Hol:** `play.js` › `showPlace()` (`#play-bg-prompt` → `navigator.clipboard.writeText`, `#play-upload` → `FileReader.readAsDataURL` → `/api/backgrounds/upload`), ugyanez a jelenetképnél (`#vn-add-scene`).
- **Miért baj:** a `PROFIL_TERV` szerint 18 új nappali és több otthon kép nélküli; mindegyik 6–8 lépés a játékból kilépve.
- **Javítás:** „Háttér készítése" gomb a meglévő `backgroundPrompt`-tal, API-s szövegből-kép hívással (B18); feltöltésnél bináris küldés + folyamatjelző.
- **Súlyosság:** magas · **Munka:** M

### A23. A figurák kivágása a főszálon, egymás után történik
- **Mit tapasztal:** új helyre érve az alakok egyenként jelennek meg, első alkalommal rövid akadással.
- **Hol:** `play.js` › `paintFigures()` (~724: `for … await cutout(…)` sorosan), `sprite-cutout.js` › `make()` (teljes képes `getImageData` + elárasztásos kitöltés, Worker nélkül; az eredmény data-URL-ként a Cache Storage-ban).
- **Miért baj:** az akadás épp a helyváltás pillanatára esik **(mértéke feltételezés – gyengébb gépen/telefonon mérni)**.
- **Javítás:** párhuzamos `Promise.all`; kivágás Web Workerben (`OffscreenCanvas`), vagy egyszer a szerveren, átlátszó WebP-ként gyorsítótárazva (B9).
- **Súlyosság:** közepes · **Munka:** M

### A24. Indítás után mindig a karbantartó Kezdőlap fogad, nincs „Folytatás"
- **Mit tapasztal:** a program a rendezési teendők műszerfalával nyit; a játékhoz: Kezdőlap → Játék → (esetleg térkép → település → hely).
- **Hol:** `client.js` ~48 (kezdő `view='home'`), `renderHome()` (~316: csak címkézési/rendezési kártyák), `Start Living Universe.cmd` (mindig a gyökér URL-t nyitja).
- **Javítás:** „▶ Folytatás: <hely>, <napszak>" kártya a Kezdőlap tetején; választható „indítás a Játékban"; külön `.cmd`/parancsikon `#/play` címmel (az 1. pont útvonalkezelésére épül).
- **Súlyosság:** közepes · **Munka:** S

### A25. Utazási idő és „ki van ott" csak egérrel, tooltipben látszik
- **Mit tapasztal:** a térképen és a településen az utazási idő, az ajtóknál a percek csak rámutatáskor, a böngésző lassú `title` buborékjában jelennek meg; érintőképernyőn egyáltalán nem.
- **Hol:** `play.js` › `renderMap()` (~468: `<title>` bővítése `etaFor` után), `renderTown()` (~636), `renderSceneDialog()` (ajtók `b.title+=…`).
- **Javítás:** kis állandó felirat a tű alatt („12 p"), vagy azonnali saját tooltip; telefonon hosszú nyomásra.
- **Súlyosság:** alacsony · **Munka:** S

---

---

## B) Fejlesztések (ingyenes vagy olcsó; B15 tulajdonosi döntéssel törölve)

### Profil átláthatóság

**B1. Profil olvasó nézet jelvényekkel**
- **Mit ad:** egyoldalas, olvasható karakterlap: csoportonként a kitöltött mezők, mindegyiken ✓ tény / ~ feltevés / régi szöveg jelvény és láthatóság; kitöltöttség %-ban; „Szerkesztés" gomb váltja a mostani űrlapot.
- **Hogyan:** a már megírt, de nem használt `buildProfileOverview(c,g)` (`ghost-profile.js`) kimenetét kell kirajzolni; a szerkesztőben a `groupHtml` kap jelvényt a `g.values[id]` alapján, plusz „csak feltevések / csak üresek" szűrő.
- **Költség:** ingyenes · **Munka:** M · **Függőség:** nincs (A14-et is megoldja).

**B2. Karakterlista készültségi jelvényekkel és szűrőkkel**
- **Mit ad:** a kártyákon látszik: profil %, van-e figura, van-e heti rutin, van-e otthona a térképen, ismeri-e Palort; szűrő és rendezés ezek szerint.
- **Hogyan:** `client.js` › `renderCharacters()` kártyáihoz a `play-mode.mjs` › `readiness()` és a Képműhely „Készültség" adatainak összevont, egyhívásos végpontja.
- **Költség:** ingyenes · **Munka:** M · **Függőség:** nincs.

**B3. „Mit tud róla Palor" névjegy a játékban**
- **Mit ad:** figurára/névre kattintva kis kártya: portré, kapcsolat mindkét irányban, legutóbbi beszélgetés összegzése, nyitott ígéretek, mit csinál most; gombok: Megszólítom, Üzenet, Album.
- **Hogyan:** a `/api/play/relationship/:id` válasza (ahogy a `renderRelDetail()` használja) kompakt formában; csak résztvevői tudás (az `AGENTS.md` Participant/Creator határa szerint).
- **Költség:** ingyenes · **Munka:** S–M · **Függőség:** A2 javításával együtt.

### Helyszínek menü

**B4. Egyesített „Helyszínek" központ**
- **Mit ad:** egy oldal négy füllel: Fa (a mostani vászon), Térkép (település-tűk), Hátterek (hiányzók listája napszakonként, feltöltés/generálás), Ajtók. A kiválasztott hely részletei oldalt: háttérkép-változatok, ki lakik/dolgozik ott, „Megnyitás a Játékban".
- **Hogyan:** a `location-canvas.js` inspectorának bővítése; a `place-tools.js` (hiányzó hátterek, ZIP), a `location-editor.js` és a Játék ajtó/tű szerkesztője ide költözik (a 2026-11-14-i irányt folytatva: „tools: Alkotói stúdió › Helyszínek"). A Játékban csak egy „✎ Szerkesztés a stúdióban" link marad.
- **Költség:** ingyenes · **Munka:** L · **Függőség:** A1 (útvonalak) hasznos hozzá.

**B5. Gyorsutazás: legutóbbi helyek, kedvencek, parancspaletta**
- **Mit ad:** a felső sávban 3–5 legutóbbi hely chipként; ★ kedvencek; Ctrl+K paletta, amely helyet, embert („oda megyek, ahol Attila van") és képernyőt is keres.
- **Hogyan:** a `data.recent` már érkezik a szerverről (`mergeState()` kezeli, de nincs megjelenítve); a kereső logikája kész a `bindSearch()`-ben (hely, útvonal, ott lévők neve) – ezt kell billentyűvel elérhetővé tenni és emberekre bővíteni.
- **Költség:** ingyenes · **Munka:** M · **Függőség:** nincs.

### Kattintásszám

**B6. Megjegyzett utazási mód, ablak csak ha kell**
- **Mit ad:** városközi útnál 1 kattintás a mostani 2 helyett.
- **Hogyan:** `travelTo()`: ha az utoljára választott mód szerepel az `/api/play/travel-options` válaszában, kérdés nélkül indul; az „Úton ide…" jelzőn „másképp" gomb. Beállítás: „mindig kérdezzen".
- **Költség:** ingyenes · **Munka:** S · **Függőség:** A7.

**B7. Kattintásmérő a meglévő hibakereső nyomvonalra építve**
- **Mit ad:** objektív szám arról, hány kattintás és mennyi idő egy feladat (pl. „indítástól az első mondatig", „új háttér egy helyhez"), így a javítások hatása mérhető.
- **Hogyan:** a `debug-trail.js` (`window.__luTrail`) már naplózza a lépéseket; a `play-debug.js` F9 paneljére egy „feladat indítása/vége" számláló és heti összesítő a `weekly-report.mjs`-be.
- **Költség:** ingyenes · **Munka:** S · **Függőség:** nincs.

### Folyékony képernyőváltás

**B8. Kétrétegű áttűnés a helyszínek között**
- **Mit ad:** ajtóra kattintva a régi kép a helyén marad, az új fölé úszik (300–500 ms), a figurák külön váltanak; nincs szürke váz.
- **Hogyan:** tartós `.vn` gyökér két `<img class="vn-bg">` réteggel; az új kép `await img.decode()` után kap `opacity:1`-et. Ahol elérhető, `document.startViewTransition()` (Chromium/Edge) a teljes váltásra; a meglévő `prefers-reduced-motion` szabály marad.
- **Költség:** ingyenes · **Munka:** M · **Függőség:** A5 részleges frissítése.

**B9. Előtöltés és szerveroldali figurakivágás**
- **Mit ad:** a szomszédos helyek háttere és az ott lévők figurái már a kattintás előtt készen állnak; a figurák egyszerre jelennek meg.
- **Hogyan:** `preloadExits()` bővítése az ott lévők figuráira (`cutout()` hívás előre); a kivágás áthelyezése Workerbe vagy a szerverre (a `thumbnails.mjs` mintájára, a `dataDir` alatti gyorsítótárba, átlátszó WebP-ként, `Cache-Control` fejléccel); a `/api/play/town-layout` válasz kliensoldali megjegyzése.
- **Költség:** ingyenes · **Munka:** M · **Függőség:** nincs.

**B10. Hangulati átvezetők: napszakváltás és úti képek finomítása**
- **Mit ad:** várakozásnál/alvásnál rövid ég-színátmenet a teljes újrarajzolás helyett; az úti képek (állomás, vonat) Ken Burns-mozgással, a betöltés után induló időzítővel.
- **Hogyan:** a `play-slot-N` / `vn-sky-N` osztályok CSS-átmenete; `passageMoment()` időzítője a kép `load` eseményére; a `lu-kenburns` animáció már létezik a `style.css`-ben.
- **Költség:** ingyenes · **Munka:** S · **Függőség:** B8.

### Párbeszéd

**B11. Jobb beviteli élmény: többsoros mező, előző sor visszahívása, szerkeszthető javaslatok**
- **Mit ad:** automatikusan növő szövegmező; ↑ visszahozza az utolsó saját sort; a javasolt válaszra kattintás a mezőbe tölt (Enter küld), dupla kattintás azonnal küld – beállítható.
- **Hogyan:** `renderSceneDialog()` / `bindTalkControls()`; a `[data-quick]` kezelő ma `submitWith()`-tel azonnal küld.
- **Költség:** ingyenes · **Munka:** S · **Függőség:** A3.

**B12. „Újra" és „Visszavonom az utolsó sort"**
- **Mit ad:** ha a válasz nem illik a karakterhez, egy gombbal újrakérhető; az utolsó saját sor visszavonható és átírható (ma csak mentési pontra lehet visszatekerni).
- **Hogyan:** új végpont, amely az utolsó karaktersort (és a hozzá tartozó Palor-sort) érvényteleníti és a `talkOnce()`-ot újrafuttatja; a régi változat a naplóban megmarad. Az „egy fizetős hívást nem ismétlünk automatikusan" szabályt nem sérti, mert kifejezett kattintás.
- **Költség:** válaszonként kb. 0,001 USD a mostani alapmodellel (a `PROFIL_TERV` saját becslése szerinti nagyságrend) · **Munka:** M · **Függőség:** nincs.

**B13. Csevegő nézet kapcsoló a jelenetben**
- **Mit ad:** a VN-doboz (csak az utolsó sor) mellett választható „üzenetfolyam" nézet, ahol az utolsó 10–12 sor mindig látszik.
- **Hogyan:** a fotójelenet `placeBubbles()` csevegőfolyama már kész; ezt kell fotó nélkül is bekapcsolhatóvá tenni (`settings.talk_view`).
- **Költség:** ingyenes · **Munka:** S · **Függőség:** nincs.

**B14. „Előzőleg…" emlékeztető a megszólításkor**
- **Mit ad:** a beszélgetés elején egy sor: mikor és miről beszéltek utoljára, van-e nyitott ígéret vagy találkozó.
- **Hogyan:** a `/api/play/relationship/:id` `talks`, `threads`, `appointments` mezőiből, AI-hívás nélkül; a `renderSceneDialog()` kezdő állapotában.
- **Költség:** ingyenes · **Munka:** S · **Függőség:** B3-mal közös adat.

**B16. Olcsóbb, gyorsabb válaszok: prompt-gyorsítótár és helyi modell lehetősége**
- **Mit ad:** kisebb AI-költség és gyorsabb első szó.
- **Hogyan:** (a) a `talkOnce()` promptjában a változatlan részek (profil, szabályok) kerüljenek előre, a változók a végére, hogy az xAI gyorsítótárazott bemeneti ára érvényesüljön (`world-ai.mjs` már számolja a `cached` tokeneket – az AI-mérőn megjeleníthető az arány) **(a jelenlegi arányt mérni kell)**; (b) a `world-ai.mjs` `complete()` szerződése mögé Ollama-adapter a háttér-világkörökhöz – a magyar szöveg minősége és a gépigény **bizonytalan**.
- **Költség:** ingyenes (megtakarítás) · **Munka:** M · **Függőség:** nincs.

### Képgenerálás és Sogni

**B17. Valós Sogni-költségbecslés és kemény plafon**
- **Mit ad:** indítás előtt a szolgáltató saját becslése Sparkban és USD-ben; beállítható felső határ, amely fölött a kérés el sem indul.
- **Hogyan:** `sogni-provider.mjs`: előkészítéskor próbahívás `confirm_cost:false` értékkel (a dokumentáció szerint 400-as válasz `details.estimatedCapacity`-vel, mentés nélkül), élesben `max_estimated_capacity_units`. A becslés a `manifest.estimated_cost_usd` mezőbe kerül, így a `character-generation.js` meglévő szövege valós számot mutat.
- **Költség:** ingyenes · **Munka:** S–M · **Függőség:** egy kis éles próba a tulajdonos jóváhagyásával.

**B18. Sogni szövegből-kép helyszínhátterekhez**
- **Mit ad:** hiányzó háttérnél egy gomb: „Háttér készítése" (nappal / este / éjszaka), 2–4 változatból választva; nem kell másik app.
- **Hogyan:** új lépéstípus a `sogni-provider.mjs`-ben a dokumentált `generate_image` eszközzel (referencia nélkül – ma az `image-providers.mjs` legalább egy referenciát megkövetel); a prompt a meglévő `backgroundPrompt` (`figure-prompts.mjs`), a mentés a `location-backgrounds.mjs` / `play-assets.mjs` „place" útján. Helyszínképhez nem megy ki privát karakterkép.
- **Költség:** kb. 0,004–0,02 USD/kép; ~150 hely × 3 napszak ≈ 450 kép ≈ 2–9 USD egyszeri. · **Munka:** M · **Függőség:** B17; új modellazonosítók felvétele az engedélylistára.

**B19. Kötegelt variációk és munkamenet-szintű jóváhagyás**
- **Mit ad:** egy kérésből 2–4 változat, kontaktlapon választható; a jóváhagyás szólhat egy munkamenetre („a következő 30 percben legfeljebb N kép / X USD, ezekkel a referenciákkal").
- **Hogyan:** `numberOfVariations` paraméter a `sogni-provider.mjs`-ben; a manifest és a `job-ledger.mjs` több kimenetre bővítése; a munkamenet-jóváhagyást a tulajdonos 2026-11-16-án elfogadta; az `AGENTS.md` módosítását szövegjavaslatként add át, ne írd át magad.
- **Költség:** a képek ára × darabszám · **Munka:** M–L · **Függőség:** B17.

**B20. Háttérben futó generálási sor értesítéssel**
- **Mit ad:** generálás közben tovább dolgozhatsz/játszhatsz; sarokban „2 kép készül" chip, kész képnél értesítés „Megnézem / Még egy / Elvetem" gombokkal, nézetváltás nélkül.
- **Hogyan:** a futások állapota már lekérdezhető (`/api/characters/:id/generation/:run`, `job-ledger.mjs`); globális lekérdező a `client.js`-ben; a `character-generation.js` `onSaved` ne navigáljon (A20).
- **Költség:** ingyenes · **Munka:** M · **Függőség:** nincs.

**B21. Sogni mint a Játék képsorának automatikus munkása**
- **Mit ad:** a „mi hiányzik a Játékhoz" lista (figurák, kifejezések, hátterek) gombnyomásra, költségkerettel fogy, a csevegős út (Grok/ChatGPT prompt bemásolása) mellett.
- **Hogyan:** a `play-assets.mjs` `needs → brief → jobs → place` lánca változatlan; új végrehajtó a `generateProviderImage()`-re. A figurákat a meglévő helyi arcellenőrzés (`identity-suggest.mjs`, InsightFace) szűri, ahogy a Szereplőgyárnál.
- **Költség:** referenciás szerkesztés ≈ 0,04 USD/kép (Qwen Image Edit listaár; a `krea-identity-edit` ára **bizonytalan**); pl. 20 karakter × 6 kifejezés ≈ 5 USD. · **Munka:** L · **Függőség:** B17, B19, B20; tulajdonosi jóváhagyás a privát képek feltöltésére.

**B22. Vendég-portrék választható szolgáltatóval**
- **Mit ad:** a jelenetbe lépő vendég képe olcsóbban és gyorsabban.
- **Hogyan:** `play-mode.mjs` › `guestPortrait()` ma `openaiPicture()`-t hív; a szolgáltató legyen beállítás (Sogni szövegből-kép, B18 kódjával).
- **Költség:** kb. 0,01 USD/kép a mostani kb. 0,07 helyett (a Sogni GPT Image 2 közepes listaára alapján; az OpenAI közvetlen ára eltérhet – ellenőrizni kell) · **Munka:** S · **Függőség:** B18.

**B23. „📸 Pillanatkép" a beszélgetésből**
- **Mit ad:** egy gombbal jelenetkép az aktuális helyről és helyzetről, a két szereplő jóváhagyott referenciáival; a kép a „Közös jelenetek" közé kerül, a média-rendező később is használja.
- **Hogyan:** a meglévő `scenePrompt` (`/api/play/prompts`, ma csak vágólapra megy) + több-referenciás modell; mentés a `scene-images.mjs` útján. A meglévő tartalomszint-kapuk, a `safe_content_filter:true` és a „szolgáltatói elutasítást nem fogalmazzuk át" szabály változatlan marad.
- **Költség:** kb. 0,01–0,04 USD/kép · **Munka:** M · **Függőség:** B17, B19; a több-szereplős hűség nem garantált (a `DEVELOPMENT_PLAN` 4. pontja szerint még mérendő).

### Egyéb, nagy hatású

**B24. Közvetlen indítás a Játékba, telepíthető alkalmazásként**
- **Mit ad:** asztali/telefonos ikon, amely rögtön a jelenetet nyitja; a Kezdőlapon „Folytatás" kártya.
- **Hogyan:** `manifest.webmanifest` + ikon (a `play-mobile.html` már külön belépő); `Start Living Universe.cmd` változata `#/play` címmel.
- **Költség:** ingyenes · **Munka:** S · **Függőség:** A1, A24.

**B25. Visszavonható műveletek és értesítési sor**
- **Mit ad:** a kockázatos egykattintásos műveletek (alvás, „Mindet elfogadom", tárgy letétele) után néhány másodpercig „Visszavonás" gomb; több értesítés egymás alatt, nem egymást felülírva.
- **Hogyan:** a `client.js` › `toast()` ma egyetlen `#toast` elemet cserél; sorrá bővítve, `action` gombbal (a `play.js` `showNotice()` mintája már tud gombot). A visszavonás a hívás késleltetésével vagy – ahol van – kompenzáló revízióval (kánon, visszatekerés).
- **Költség:** ingyenes · **Munka:** M · **Függőség:** A11 közös modálisával együtt érdemes.

---

---

## V) Vizuális átnézés a futó programban (1366×800 és 375×812)

### T0. Képernyőkép-szkript (ezt csináld meg először)

**Cél:** minden UX-változtatásnál legyen gépi előtte/utána kép, így a vizuális hatás ellenőrizhető Claude nélkül is.

- Új fájl: `ops/ui-shots.mjs`. Indítsa a homokozót (vagy csatlakozzon egy futó homokozóhoz a 4327-es porton), és a `playwright-core` csomaggal, a **gépen lévő Edge-dzsel** (`channel:'msedge'`, így nem kell böngészőt letölteni) fényképezze le:
  Kezdőlap, Karakterek, egy karakterprofil (felül és 3000 px-szel lejjebb), Helyszínek, Játék › világtérkép, Játék › Káloz térkép.
- Két méret: 1366×800 és 375×812. Kimenet: `%LOCALAPPDATA%\LivingUniverse\ui-shots\<idő>\<oldal>-<méret>.png` (nem a OneDrive-ba).
- `package.json`: `"shots": "node ops/ui-shots.mjs"`.
- A `playwright-core` fejlesztői függőség telepítése **előtt kérdezz rá a tulajdonosnál**.
- A szkript nem kattinthat olyat, ami időt léptet, utaztat vagy AI-t hív (figura, ajtó, Várok, Alszom, Térkép gomb). A Játékban közvetlen URL-lel vagy állapotolvasással navigáljon.

**Elfogadás:** `npm run shots` 12 képet készít, a homokozón kívül semmit nem ír.

---

### V1. Nézetváltáskor megmarad az előző oldal görgetése

**Mit láttam:** a Karakterek listáról egy profilra kattintva az oldal 311 px-szel lejjebb nyílt, a fejléc és a borító teteje levágva. A Helyszínekre váltva 205 px-en nyílt, az eszközsor félig takarva. A görgetési hely az előző nézetből maradt.

- **Hol:** `app/public/client.js` › `navigate()` / `render()`.
- **Teendő:** nézetváltáskor `window.scrollTo(0,0)`. Ha az A1 (hash-útvonalak) már kész, akkor Vissza gombra az adott nézet korábbi görgetését állítsa vissza (nézetenkénti tárolás).
- **Elfogadás:** a lista közepéről megnyitott profil a tetején kezdődik. Profilból „← Karakterek”-re lépve a lista ott folytatódik, ahol volt.
- **Munka:** S

### V2. A végleges „Törlés” gomb minden oldal fejlécében ott van

**Mit láttam:** a felső sávban, minden oldalon, piros `Törlés` gomb (`#permanent-delete`, `class="danger"`). Letiltva van, csak a tooltip mondja meg, hogy képkijelölésre vár. Profilon, Helyszíneken és a kezdőlapon is látszik, telefonméretben pedig a tartalom fölött áll.

- **Hol:** `app/public/index.html` (topbar), a gombot kezelő kód (`client.js`, keresd: `permanent-delete`).
- **Teendő:** a gomb csak a médiakijelölést támogató nézetekben jelenjen meg, és csak ha van kijelölés: a kijelölési sávban „**N kép végleges törlése**” felirattal. A meglévő megerősítést és lomtár-logikát ne változtasd.
- **Elfogadás:** Kezdőlap, Karakterek, profil, Helyszínek, Játék: nincs Törlés gomb. Médiatárban 2 kép kijelölésekor „2 kép végleges törlése” látszik.
- **Munka:** S

### V3. A kezdőlapi haladásjelzők félrevezetnek, és kétszer mutatják ugyanazt

**Mit láttam:** „32 kép helyszín nélkül – 99% kész” és „32 rendezésre váró kép – 99% kész”, mindkettő **teljesen kitöltött** csíkkal. Ránézésre készen vannak, pedig 32 tétel vár. Ugyanez a két szám alattuk a Teendők kártyákon is szerepel.

- **Hol:** `client.js` › `renderHome()`.
- **Teendő:** a csempe a **hátralévőt** mutassa főszámként („32 hátra”), a csík a valós arányt (99,5%-nál is látszódjon egy rés, pl. a hátralévő rész min. 4 px). A 100% jelzés csak 0 hátralévőnél jelenjen meg. A csempék és a Teendők kártyák vonódjanak össze: egy sor kártya, mindegyiken szám + csík + gomb.
- **Elfogadás:** 32 nyitott tételnél a csík láthatóan nincs tele, és nincs kétszer kiírt szám.
- **Munka:** S

### V4. A kezdőlapi rendszerállapot-kártya nyers technikai szöveget mutat

**Mit láttam:** „Rendszerállapot: javítás kell” kártya öt sorral, ilyenekkel: `GET /api/characters/7e8e…/references/5da3…/image: Thumbnail conversion unavailable.`. Ez két kép hibája, többször ismételve, UUID-kkel.

- **Hol:** `client.js` › `renderHome()` (a rendszerállapot-blokk), a hibák forrása `GET /api/dev/log?kind=errors`.
- **Teendő:** csoportosítás hibatípus és erőforrás szerint, emberi nyelven, a karakter nevével és linkkel: „2 referenciakép nem tölthető be – Attila, …”. A nyers sorok maradjanak a Rendszerállapot › Hibák fülön. Ugyanaz a hiba egyszer szerepeljen, darabszámmal.
- **Elfogadás:** a kezdőlapon nincs UUID és API-útvonal; a csoport linkje a karakter Jóváhagyott identitás fülére visz.
- **Munka:** S–M

### V5. HIBA: a referenciaképek kicsinyítése elszáll, és az ok elvész

**Mit láttam:** a hibanaplóban `Thumbnail conversion unavailable` ugyanarra a két képre, 4 másodpercen belül többször is.

**A kód alapján:** `mcp/images.mjs` › `decodeImage()` minden egyes képhez **új `powershell.exe` folyamatot indít** (15 mp időkorláttal). A `child.stderr.resume()` eldobja a hibakimenetet, így nem derül ki, miért lépett ki hibakóddal a szkript. Sikertelen képre nincs negatív gyorsítótár, ezért minden oldalbetöltés újrapróbálja. Közben az `app/thumbnails.mjs` és az `app/thumb-worker.ps1` alapján már van egy tartós kicsinyítő a projektben.

- **Teendő:**
  1. A stderr első ~500 karakterét tedd az Error üzenetébe, illetve a hibanaplóba.
  2. Derítsd ki és javítsd a két konkrét kép hibáját (formátum? méret a 3 MB / 2048 px kimeneti határ fölött? CMYK JPEG?). Szintetikus tesztképpel reprodukáld.
  3. Negatív gyorsítótár: sikertelen (kép-azonosító, méret) párra 10 percig ne próbálkozzon újra.
  4. Vizsgáld meg, kiváltható-e a folyamatonkénti PowerShell-indítás a meglévő tartós workerrel. Ha igen, egy közös modulból menjen mindkettő.
  5. A felületen a hibás referencia helyén legyen „Nem tölthető be – megnyitás” helyőrző, ne törött kép.
- **Elfogadás:** új teszt a hibaágra; a naplóban látszik a valódi ok; ugyanaz a hibás kép 10 percen belül nem indít új folyamatot.
- **Munka:** M

### V6. Karakterkártyák: következetlen alcím

**Mit láttam:** a kártyák alcíme egyszer becenévlista mondatokkal („András; Bandi. A barátai többnyire Bandinak hívják; hivatalos helyzetekben…”), egyszer zárójeles megjegyzés („Bandó (csak az egykorú barátai szólítják így)”), egyszer egy szó („Barnabás”), egyszer „A profil kidolgozásra vár”.

- **Hol:** `client.js` › `renderCharacters()`.
- **Teendő:** egységes, egysoros alcím: a becenevek **rövid listája** (pontosvessző és zárójel előtti rész, max. 3 név), mellette a foglalkozás első tagmondata, ha van. Ha nincs kitöltve, halvány „Profil: üres” jelvény. A teljes szöveg tooltipben.
- **Kapcsolódik:** B2 (készültségi jelvények) – ugyanarra a kártyára kerülnek, egyeztess.
- **Elfogadás:** egy alcím sem tör két sorba 1366 px-en; nincs mondatvégi pont az alcímben.
- **Munka:** S

### V7. Csoportkép borítóként: nem derül ki, ki a karakter

**Mit láttam:** András kártyáján a borító három embert mutat, és nem látszik, melyikük ő.

- **Teendő:** a borítóválasztó jelezze, ha a kép többszemélyes, és kínálja fel az adott karakter arcára középre igazított kivágást. Az arcdoboz a helyi arcazonosításból (`identity-suggest.mjs`) már elérhető. A kivágás az AGENTS.md szerint csak megjelenítés („Cover crops only change presentation”). A kezdőlap Teendők listájába kerüljön egy „Többszemélyes borító: N karakter” tétel.
- **Elfogadás:** többszemélyes borítónál a kártya a karakter arcát mutatja középen; kánon nem változik.
- **Munka:** M

### V8. Diszkrét mód a borítókhoz

**Mit láttam:** a Karakterek lista és a profilfejléc alapból teljes méretben mutatja a borítóképeket, intim tartalmúakat is. Képernyőmegosztásnál vagy nyilvános helyen nincs gyors elrejtés.

- **Teendő:** a felső sávba egy kapcsoló („Diszkrét mód”, billentyű: Shift+D). Bekapcsolva az intimnek jelölt médiát (a meglévő tartalmi szint alapján) elmosva mutatja a lista, a profil és a médiatár, kattintásra felfed. Az állapot a böngészőben megmarad. A meglévő tartalmi kapukat ne módosítsd, ez csak megjelenítés.
- **Elfogadás:** bekapcsolva a T0 képein egyetlen intim borító sem látszik élesen.
- **Munka:** S–M

### V9. A profiloldal 5600 px hosszú, a csoportsáv elgörgetődik

**Mit láttam:** egy kidolgozott profil (Attila) oldala 5638 px magas, 32 szövegdobozzal. A csoport-gombsor (Alapok … Szexuális preferenciák) `position: static`, görgetés után eltűnik. Egyetlen mező (`#pf-sexuality`) 6202 karakter, teljes magasságra nyitva. A „(Javaslat)” jelölések a szövegbe gépelve állnak.

- **Hol:** `app/public/ghost-profile.js` (`pf-group` details-ek, `groupHtml`), `style.css`.
- **Teendő:**
  1. A csoportsáv legyen `position: sticky`, és az éppen látható csoport kapjon kiemelést (IntersectionObserver).
  2. Egyszerre egy csoport legyen nyitva (accordion). A sávra kattintva az a csoport nyíljon és ugorjon a tetejére.
  3. A 600 karakternél hosszabb mezők alapból 6 sorra csukva, „Teljes szöveg (6 200 karakter)” gombbal.
  4. A szövegbe írt „(Javaslat)” jelöléseket ne alakítsd át automatikusan. Csak számold meg, és írd ki a csoport fejlécében („12 javaslat-jelölés”). A valódi megoldás az A14/B1.
- **Elfogadás:** Attila profilja nyitáskor legfeljebb kb. 1500 px magas; a csoportsáv görgetés közben is látszik.
- **Munka:** M

### V10. Helyszínek: a fa kilóg a képből, a bal oldali lista lapos

**Mit láttam:** a vászon 90%-os nagyításon nyílik, a gyökér alatti települések sora kilóg (a bal szélső csomópont levágva, Sárbogárd a jobb szélen félig). A bal oldali „Címkék a katalógusból” lista lapos ábécérend („Albert háza”, „András háza – Konyha”, „Átjárók”, „Balaton”…) település szerinti csoportosítás nélkül. Az alsó ellenőrző panel a vászon alját takarja.

- **Hol:** `app/public/location-canvas.js` › `mountLocationCanvas()`.
- **Teendő:** induláskor és ablakméret-váltáskor automatikus „Összkép” (fit to view). A bal lista csoportosítva település/szülő szerint, összecsukható fejlécekkel. Az alsó panel legyen összecsukható, és az ellenőrző sáv ne takarjon csomópontot.
- **Kapcsolódik:** A19 (gombzsúfoltság) – ez a vászon és a lista, nem a gombok.
- **Elfogadás:** megnyitáskor minden első szintű település teljesen látszik 1366×800-on.
- **Munka:** M

### V11. Világtérkép: az alakcsoportok rálógnak a településnevekre

**Mit láttam:** Budapest címkéjéből csak „Bu” olvasható, a „32 hely · … szereplő” sort az avatarok takarják. Hasonló a többi nagyobb településnél is.

- **Hol:** `app/public/play.js` › `renderMap()` (avatar-csomagok és címkék SVG-ben).
- **Teendő:** az avatar-csomag a címke **fölé**, attól 6 px-re kerüljön, ütközésvizsgálattal (ha ütközik, jobbra tolva). A címke legyen felül (z-sorrend), és a csomag max. 3 arc + „+N” maradjon.
- **Elfogadás:** a T0 világtérkép-képén minden településnév és alsor teljesen olvasható.
- **Munka:** S–M

### V12. Településtérkép: nem fér ki, és a számjelvények nincsenek megmagyarázva

**Mit láttam:** Kálozon a térképkép alja 13 px-szel lelóg az 800 px-es ablakból, két oldalt széles üres sáv van. A tűkön lévő számok (1, 3, 4) jelentése nincs megmagyarázva, és egymásra csúsznak címkék (Gyuszi háza és a szomszédos ház).

- **Hol:** `play.js` › `renderTown()`, `style.css`.
- **Teendő:** a kép mindkét irányban férjen ki (`contain`, a magasságot a felső sávval együtt számolva). A jelvényeken legyen title / aria-label („3 ember van itt most”). Ütköző címkéknél a második tolódjon el, vagy rövidüljön és rámutatásra nyíljon ki.
- **Elfogadás:** 1366×800-on nincs függőleges görgetés a településnézetben, és minden jelvénynek van magyarázó szövege.
- **Munka:** S–M

### V13. A Játék felső sávja: magyarázat nélküli ikonok

**Mit láttam:** 1366 px-en a felső sáv csak ikonokat mutat. A **„15 percet várok”** gombnak (óra ikon) nincs `title`-je, pedig időt léptet. A Napló gomb title-je csak „(N)”. A menü „10”-es jelvényén nincs magyarázat, és az „AI” felirat melletti csúszka/mérő sem mondja meg, mit jelent.

- **Hol:** `play.js` › `render()` (felső sáv).
- **Teendő:** minden ikongombnak legyen `title` és `aria-label` a teljes jelentéssel, a hatással együtt („15 percet vár – közben telik az idő”). A jelvényen legyen title („10 olvasatlan”). Az AI-mérő kapjon feliratot vagy tooltipet. 1280 px felett az ikon mellett rövid felirat is látszódjon.
- **Elfogadás:** a felső sáv minden interaktív eleme rendelkezik felolvasható névvel (a T0 szkript ezt ellenőrizheti is).
- **Munka:** S

### V14. Statikus fájlok gyorsítótárazása (telefonos eléréshez)

**Mit mértem:** a kezdőlap 48 JS/CSS fájlt tölt (~1,1 MB kicsomagolva), és mindet minden betöltéskor újraellenőrzi (304). A legnagyobbak: `i18n.js` 232 KB, `play.js` 139 KB, `style.css` 116 KB. Helyben ez gyors (DOMContentLoaded 165 ms), ezért **az A16 asztali prioritása csökkenthető**. Tailscale-en, telefonról viszont 48 körút.

- **Teendő:** verziózott URL-ek (pl. tartalomhash vagy `?v=<build>` minden modulon, ne csak a `client.js`-en), és `Cache-Control: public, max-age=31536000, immutable` a verziózott statikus fájlokra; az `index.html` maradjon `no-cache`. A mobil szerver (4318) no-store szabályát **ne** lazítsd, ha az adatvédelmi okból van (lásd `docs/MOBILE_ACCESS.md`). Ott csak a nem privát statikus fájlokra alkalmazd, ha egyáltalán.
- **Elfogadás:** második betöltéskor a statikus fájlokra 0 hálózati kérés megy a 4317-es porton.
- **Munka:** S–M
---

## W) A korábban kimaradt részek (2026-11-16, kód + futó program)

**Amit ezekből megtudtam, és nem igényel feladatot:**
- `mcp/`: a ChatGPT/Grok csatlakozó (olvasó adapter, opcionális jóváhagyott írás, alagút, hívásnapló). Nincs saját kattintható felülete; az egyetlen innen eredő tétel a V5 (`mcp/images.mjs`). Csak átfutottam, nem olvastam végig a ~170 KB-ot.
- `tests/`: 143 tesztfájl, `node:test`. A kliensre statikus tesztek vannak (`client-smoke`, `client-lint`, `client-static`), **böngészőben futó teszt nincs**; ezt pótolja a T0.
- `DECISIONS.md` (2026-11-11…16 bejegyzések): szándékos, **ne változtasd**: az Esc csak a legfelső ablakot zárja; a nyitva hagyott beszélgetés „Vissza a beszélgetéshez” pirula; autó/gyalog kétállású kapcsoló; visszatekerés előtt kérdez; a helyszín hátterén nem lehet karakterhez kötött kép; a világmotor csak játék közben fut.

### W1. Az Élő világ oldal 30 000 px hosszú
- **Mit láttam:** az oldal magassága 30 490 px. Egymás alatt: felkészültség (minden szereplő kártyája), Képgyártás Grokkal, Állapot, „Mi történt, amíg távol voltál” (napok), Üzenetek, Helyszínek (85 szereplő-fejléc), Vélemények és pletykák, Kapcsolati szintek. A beállítások (tempó, modell, napi keret) a közepén vannak.
- **Hol:** `app/public/world-engine.js` › `render()` (178 sor, egyetlen nagy sablon), `renderLevels()`.
- **Teendő:** fülek: **Ma** (állapot + mi történt + elfogadásra váró események), **Felkészültség**, **Helyek és szerepek**, **Kapcsolatok**, **Beállítások**. Csak az aktív fül töltődjön (a `Promise.all` öt hívása bontva). A napok és a szereplőnkénti blokkok alapból csukva.
- **Elfogadás:** nyitáskor az oldal ≤ 2 képernyő magas; a „Ma” fülön látszik a futtatás gombja és a napi keret.
- **Munka:** M

### W2. Felkészültség: a hiány nem kattintható, a pótlás vágólapos
- **Mit láttam:** „○ nincs otthona (éjjel nem látszik)”, „○ 0 kapcsolt hely”, „○ nincs még referenciaképe” sorok – egyik sem link. Kártyánként „📋 Alak-prompt” gomb: vágólapra másol, a képet máshol kell legenerálni. A fájlban öt ilyen vágólapos pont van.
- **Hol:** `world-engine.js` 36. sor körül (`readyHtml`), 131–166. sor (`navigator.clipboard.writeText`).
- **Teendő:** minden hiánysor vigyen oda, ahol pótolható (otthon → Helyszínek, a szereplő kiválasztva; referencia → a karakter Jóváhagyott identitás füle). Szűrő: „csak ahol hiány van”, rendezés hiányok száma szerint. A vágólapos gombok maradnak, melléjük a B21 kész állapotában „Rendelés feladása” kerül.
- **Elfogadás:** egy hiányból 1 kattintással a javító képernyőn vagy, a megfelelő szereplővel.
- **Munka:** S–M

### W3. Képműhely › Új képek: 64 jegyű fájlnevek és ismétlődő teendő
- **Mit láttam:** a kártyák címe alatt 64 karakteres hash-fájlnév áll. Minden kártyán ugyanaz a mondat: „Előbb a helyi elemzés.”, miközben felül egyetlen gomb indítja mind az 57-et. 130 teendő, 30-asával töltve. Több kártyán „Az előnézet nem érhető el · … OneDrive”.
- **Hol:** `app/public/image-workshop.js` › `card()`, `loadInbox()` (`limit:'30'`), `paintInbox()`.
- **Teendő:** a hash-név csak tooltipben; helyette a kép dátuma és mérete. Ha egy lépés az egész listán ugyanaz, egy sáv mondja ki felül, a kártyákról eltűnik. A helyi elemzés ingyenes és helyben fut: az oldal megnyitásakor induljon magától (kikapcsolható), haladásjelzővel. A felhőben lévő (nem letöltött) képek kerüljenek külön csoportba „Letöltés a OneDrive-ról” gombbal, ne törött előnézettel álljanak a sorban. Görgetésre töltsön tovább.
- **Elfogadás:** egy kártyán legfeljebb egy állapotsor van; hash-név nem látszik.
- **Munka:** M

### W4. Gyors címkézés: üres fülön nyit, 80 és 191 elemű legördülők
- **Mit láttam:** az oldal az „Egy személy · 0” fülön nyit („nincs több ellenőrizendő kép”), miközben a menü 32 teendőt jelez, és azok a Helyszínek fülön vannak. Az Ecset 80 nevű, a Helyszín 191 elemű natív legördülő, keresés nélkül. A szűrők jelölőnégyzete és felirata messze kerül egymástól (a címke 350–430 px széles sáv, a négyzet a bal szélén, a szöveg középen).
- **Hol:** `app/public/quick-tag.js` › `render()`, `bindTabs()`, `options()`, `renderLocations()`; `style.css`.
- **Teendő:** az első **nem üres** fülön nyisson; a 0-s fülek halványan. Kereshető választó (gépelésre szűr, legutóbb használtak felül) közös komponensként – nézd meg, bővíthető-e a `sorting-pickers.js`. A szűrők négyzete közvetlenül a felirat előtt álljon. Billentyű az ecsethez: betű gépelésére a névre ugrik.
- **Elfogadás:** 32 helyszínes teendőnél a Helyszínek fül nyílik; egy helyszín kiválasztása ≤ 3 billentyű + Enter.
- **Munka:** M

### W5. Szereplőgyár: többes kijelölés Ctrl/Shift-tel, natív megerősítés
- **Mit láttam:** az „Életpillanatok meglévő szereplőknek” listája natív többes lista („Ctrl/Shift kattintással több is”), ~80 névvel; telefonon és egy kézzel használhatatlan. Két natív `confirm()` van benne (összes kijelölése, rendelés visszavonása).
- **Hol:** `app/public/character-factory.js` (105. és 113. sor körül a `confirm`, a lista a `paint()`-ben).
- **Teendő:** jelölőnégyzetes, kereshető lista gyorsszűrőkkel („van kapcsolata Palorral”, „nincs nyitott rendelése”), élő számlálóval („7 kiválasztva”). A natív ablakok az A11 közös modálisára cserélve. Az új szereplő űrlapja kapjon piszkozatmentést (név + leírás a böngészőben), mert a képek csatolása után egy frissítés mindent elveszít **(feltételezés – ellenőrizd)**.
- **Elfogadás:** kijelölés egérrel, billentyű nélkül; nincs `confirm(` a fájlban.
- **Munka:** S–M

### W6. A hosszú névlisták rendezése és csoportosítása
- **Mit láttam:** a szereplőválasztók (Gyors címkézés, Képműhely, Szereplőgyár) ugyanazt a ~80 nevet sorolják, de eltérő rendezéssel: az egyikben „Ábel, Ács Bálint, Ádám” az A betűnél van, a másikban a lista legvégén (ékezet nélküli összehasonlítás). Valódi szereplők és gyűjtőrekordok („Hajléktalanok”, „Kamionosok”, „Random generáltak”, „Vonatos fiatal srácok 2026.10.12”) keverednek.
- **Teendő:** egy közös `sortNames()` segéd `Intl.Collator('hu')`-val, mindenhol ez. A gyűjtőrekordok (a profil „Ez a rekord csoport” jelölője alapján) külön csoportba a lista végén.
- **Elfogadás:** mindhárom választóban azonos a sorrend; új teszt a rendezésre.
- **Munka:** S

### W7. Tartós teendőszámlálók a menüben
- **Mit láttam:** a menüben „Rendezésre vár 32” és „Gyors címkézés 32” ugyanazt a 32 képet jelzi két helyen, a Kezdőlap pedig harmadszor. A Helyszínek melletti „!” jelvény („Jóváhagyásra váró helyszínterv”) csak tooltipben magyarázza magát.
- **Hol:** `index.html` (nav), `client.js` (jelvények), `/api/tidy`, `/api/quick-tag/summary`.
- **Teendő:** egy teendő egy helyen számítson: ha ugyanaz a kép több sorban vár, a menüben csak a következő lépésnél jelenjen meg. A „!” helyett szám vagy rövid szó.
- **Elfogadás:** 32 helyszín nélküli képnél a menüben összesen egyszer szerepel a 32.
- **Munka:** S–M

### W8. Angol szövegek kiszűrése
- **Mit láttam:** a Helyszínek főcíme „Locations” (kódba írva, `location-canvas.js` 20. sor). Az `i18n.js` 487 kulcsa angol mondat (szerverüzenetek fordítása) – ez rendben van, de ami nincs a listában, angolul jelenik meg.
- **Teendő:** a `location-canvas.js` kódba írt feliratai kerüljenek az `i18n.js`-be. A `translateServerMessage()` lefordítatlan üzenetnél naplózzon egyszer a fejlesztői hibanaplóba (forrás: „i18n”), hogy a hiány látható legyen.
- **Elfogadás:** a T0 képein nincs angol címsor; a hiányzó fordítás megjelenik a Rendszerállapot › Hibák fülön.
- **Munka:** S

### W9. A szövegkulcs-ellenőrzés csak két fájlra fut
- **Mit láttam:** a `tests/client-lint.test.mjs` csak a `play.js` és a `world-engine.js` `play.` / `we.` / `world.` kulcsait ellenőrzi. A többi 40 kliensfájl hiányzó kulcsa futás közben derül ki.
- **Teendő:** a teszt járja be az `app/public/*.js` összes fájlját és minden `t('…')` kulcsot (a futásidőben kiegészülő, pontra végződő előtagok kivételével). Fordítva is: írja ki (figyelmeztetésként, nem hibaként) a sehol nem használt kulcsokat – az `i18n.js` 232 KB.
- **Elfogadás:** egy szándékosan elírt kulcs bármely kliensfájlban megbuktatja a tesztet.
- **Munka:** S

---

## Amit senki nem nézett meg élőben

A futó, élő programban nem történt kattintás figurára, ajtóra, Várok/Alszom gombra, és nem volt utazás, mert ezek időt léptetnek vagy fizetős AI-t hívnak. A helyváltás és a párbeszéd vizuális viselkedése (A2–A6) ezért csak kódból ismert: a 3. és 5. csomag előtt a T0 szkripttel, homokozóban fényképezd le a kiinduló állapotot. A telefonos Játék (4318-as port, Tailscale) kívül esett; a tulajdonos telefonon játszik, ezért a 2., 5. és 6. csomag végén a `play-mobile` nézetet is ellenőrizd 375×812-ben.


### Munkamegszakítási pont (2026-11-17)

A tulajdonos a maradék heti keretből külön a közös hierarchikus fejlesztési feladatlistát kérte. Ez elsőbbséget kapott, elkészült a Feladatok képernyő és a megosztott MCP-eszközkészlet. A korábbi terv 16. csomagja részben megvalósítva, még nem lezárva; a 17. csomag és a 13. csomag vegyes háttér/figura munkamenetes sora hátravan. A Sogni-fiókhibáig nincs éles próba. A folytatás innen induljon, ne tekintse az egész UX-tervet késznek.


Éles kódbetöltés ellenőrizve (2026-11-22): üres futómunkalista mellett a program saját újraindítója lefutott. A kezdőlap és az új modul HTTP 200, a verziózott modul immutable fejlécű, a képsor API elérhető, a kódfrissesség szerint nincs szükség újabb újraindításra. A katalógus, Grok gateway és privát MCP alagút ütemezett szolgáltatásai futnak; generálás nem indult. Tesztnapló: `%LOCALAPPDATA%\LivingUniverse\ux-four-final-tests.log`.
