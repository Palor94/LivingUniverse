# Játék – átvizsgálás és tervjavaslat (2026-11-14)

Az utazás, a helyszínfa és a térkép átalakítása után átnéztem a Játék kódját és működését (sandboxon,
élő adatok másolatán). Lent először az általam **feltételezett döntések** jönnek, amelyeket bírálj
felül; utána a talált hibák és az optimalizálási terv.

## A. Bírálatra: amit feltételeztem

1. ✅ **Eldöntve (tulajdonos):** autóval mindig lehet menni. Kálozon belül viszont mindig gyalog
   megy Palor (a tóhoz és az erdőhöz is); az autó ott marad, ahol parkol.
2. ✅ **Eldöntve (tulajdonos):** Pécsre csak autóval vagy vonattal (Budapest–Sárbogárd–Pécs) lehet eljutni, biciklivel nem.
3. ✅ **Eldöntve (tulajdonos):** Sanyi háza „Nagyszoba” a nappali (origó), a neve Nagyszoba marad.
4. Az **új nappalik** (18 db) még képtelenek: amíg nincs saját képük, a ház/lakás képét mutatják.
   A ház meglévő képeit nem soroltam át a Nappaliba, mert sok közülük külső kép lehet. Ha kéred,
   átsorolom azokat, amelyek belső teret mutatnak.
5. **Budapest - Kórház** kapott egy **Radiológia** részleget; Ács Bálint fehérvári kórházi
   munkahely-kapcsolatai (ügyeletes szoba, folyosó, orvosi szoba) átkerültek ide.
6. ✅ **Eldöntve (tulajdonos):** Budapest két utcája összevonva: „Budapest - street” maradt (a fában „Budapest - Utca”), az „Utca” archiválva, 2 képe átsorolva.
7. ✅ **Eldöntve (tulajdonos):** Erdei parkoló (maga a bejárat, onnan az erdő), Hegy, Pécs - Kollégium (Közösségi tér), Budapest - Stadion (új Nézőtér a bejárat), Palor lakása - Nappali, András háza - Konyha (a Nappaliból nyílik). Ahol a háttérmappában már van kép (Erdei parkoló, András konyhája), ott a katalógusnév és a mappa változatlan, csak a fában változott a név.
8. ✅ **Eldöntve (tulajdonos):** 0–4 óra között nincs vonat (az ablakban szürkén látszik).

## B. Hibák és zavaró részek

| # | Mi | Javaslat |
|---|---|---|
| B1 | A település nézetén még ott a **Kártyanézet** és az **Elrendezés** gomb – ugyanaz a fajta extra, mint a megszüntetett lista nézet. | Kártyanézet törlése; Elrendezés az Alkotói stúdió Helyszínek oldalára (vagy rejtett ⋯ menübe). |
| B2 | A felső sáv (idő, AI-mérő, Itt vagy, Várok, Alszom, Menü) **kisebb szélességen két sorba törik**, elveszi a helyet. | Egy sor, ikonos gombokkal; az „Itt vagy” csak ikon + rövid név. |
| B3 ✅ | **Autók szobaként** szerepelnek („Bemész: Sanyi autója”, Domi, Dani, Norbi, Bálint, Pákozdi autója). | Az autók legyenek járművek: az utazási ablakban „Sanyi autójával”, ha a gazdája veled van; a házon belül ne legyenek ajtók. |
| B4 | A **Megérkezel** doboz a jelenet bal alsó részét takarja. | Néhány másodperc után kis sávvá csukódik, kattintásra kinyílik. |
| B5 ✅ | A **vonat és a vasútállomás képei** (51 + 52 kép) nem jelennek meg az utazásnál, csak a térképes útvonal-animáció. | Vonatos útnál az indulási állomás, majd a vonat képe a „pillanat” helyett. Benzinkút autós útnál, ha megállsz. |
| B6 ✅ | Autós útnál az **„útszéli alak”** csak szöveg; nem lehet dönteni. | Kis A/B választás: „Megállsz?” – ha igen, egy útszéli sztori indul. |
| B7 | Régi, már nem használt mentések maradnak (térképjelölők és ajtók áthelyezett/archivált helyekre). | Egyszeri, naplózott takarítás. |
| B8 | Holt kód: a régi kijáratlista (`exitsHtml`), lista nézet szövegei, `mapLead` stb. | Törlés a következő körben. |
| B9 | A Balaton (Strand / fürdés) és a Gárdonyi nudi ugyanúgy működhetne, mint a Tó: parton érkezel, csak fürdeni mész a vízbe. | Origó-szabály kiterjesztése ezekre. |

## C. Optimalizálás

| # | Mi | Mérés | Javaslat |
|---|---|---|---|
| C1 ✅ | **Minden lépés után** a teljes áttekintés újratöltődik. | 83 KB, 30–150 ms lépésenként | Az utazás válasza adja vissza, ami változott (ki hol van), és a kliens azt frissíti. |
| C2 ✅ | Az áttekintés minden helynél külön keresi az origó-szobát. | ~150 hely, négyzetes | Egyszer felépített index. |
| C3 ✅ | A szereplők helyét (`positions`) egy kérésen belül többször számolja. | – | Gyorsítótár napszakonként, változáskor ürítve. |
| C4 | A `play.js` 124 KB egyetlen fájl. | – | Szétbontás: térkép, település, helyszín, beszélgetés, telefon. |
| C5 | Az `i18n.js` 226 KB, mindig betöltődik. | – | A már tervezett 1.6-os lusta betöltés. |

## D. Javasolt sorrend

1. ✅ **B1, B2, B4** – kész (2026-11-14).
2. ✅ **B3 + B5 + B6** – kész (2026-11-14): az autók járművek („Sanyi autójával”, ha veled van),
   vonatos útnál állomás- és vonatkép, barátod autójának képe, benzinkút tankoláskor; autós úton
   „Megállsz?” választás (egy útszéli sztori, utanként egyszer).
3. ✅ **C1–C3** – kész (2026-11-14): az utazás válasza egy kis állapot-különbséget is ad (ki hol van,
   óra, tárgyak), a kliens ezt beolvasztja, és nem tölti újra a teljes áttekintést; az origó-szobák
   indexe fánként egyszer épül; a `positions` gyorsítótárban van, amíg nincs írás, és ugyanaz a nap
   és napszak. Mérés: docs/PERF_BASELINE.md („2026-11-14 Play speed”).
4. **B9, A8** – tópart-szabály a Balatonra, éjszakai vonat.
5. **B7, B8, C4** – takarítás és szétbontás.
