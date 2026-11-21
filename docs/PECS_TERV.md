# Pécs – durva ütemterv (bármely AI-nak)

2026-11-15. A tulajdonos szerint Pécs „még elég kiforratlan helyszín”, ezért Jiwan Budapestre került
(DECISIONS.md, 2026-11-15). Ez a terv **vázlat**: élesítéskor a tulajdonos a 3. rész kérdéseire
válaszol, és csak utána kezdődik munka. Claude, Codex, ChatGPT és Grok is követheti.

**Mindig érvényes szabályok** (AGENTS.md): nem találunk ki szereplőt, női szereplő nincs; a
helyfa csak jóváhagyott revízióval változik; fizetős generálás csak a tulajdonos jóváhagyásával;
élő adatbázison nem fut második szerver (a tulajdonos programja a 4317-es porton fut, próbához
`npm run sandbox`); kép csak helyet ábrázol, szereplőt soha; profil és canon nem változik a
helyekkel együtt.

---

## 1. Jelenlegi állapot (2026-11-15, csak olvasva)

| Mi | Állapot |
|---|---|
| **Helyfa** (`location-canvas.json`, jóváhagyott fej) | `Pécs` (település) → `Pécs - Kollégium` (javasolt szülőhely, nincs saját katalógushelye) → `Pécs - Kollégium - Közösségi tér` (belépő szoba, 1 kép) és `Koli fürdőszoba` (4 kép). Más pécsi hely nincs: se utca, se állomás, se egyetem. |
| **Vonat** (`app/place-network.mjs`) | 40-es vonal: Budapest – Sárbogárd (70 perc) – Pécs (175 perc). Pécsre csak autóval vagy vonattal lehet menni, biciklivel nem. A vonat a településre érkezik (nincs pécsi állomáshely); az út képei az általános `Vasútállomás` és `Vonat` helyek. |
| **Utcai átjáró** | Nincs `Utca` gyereke Pécsnek, így a városon belüli séta átjáró nélkül történik. |
| **Térkép** | Van mentett jelölő-elrendezés egyetlen jelölővel (Kollégium, 2026-11-15). A térképkép meglétét a `list_play_orders {for:"chatgpt"}` mutatja. Térkép = mindig ChatGPT. |
| **Hátterek, ajtók** | Városi felosztás szerint Grok-é (`GROK_TOWNS` a `app/play-mode.mjs`-ben); helyenként átírható (`play:order-worker`). |
| **Szereplők** (`world_places`) | Pécshez egyetlen kapcsolat sincs. Profilban csak **Levi** említi Pécset (fül-orr-gégész, „Professional location: Pécs”), de munkahelyként a fehérvári kórház van bekötve – ezt az eltérést már jelentették, nem javították. |

---

## 2. Ütemterv

Minden szakasz után: rövid jelentés a tulajdonosnak, és csak jóváhagyás után jön a következő.

### 0. szakasz – Döntések begyűjtése
- **Cél:** a 3. rész kérdéseinek megválaszolása.
- **Ki:** bármely AI kérdez, a tulajdonos válaszol. A válaszok a `DECISIONS.md`-be kerülnek.
- **Kész, ha:** a helylista, a szereplők és a rajzolók kiosztása le van írva.

### 1. szakasz – Helyfa (törzshelyek)
- **Cél:** néhány törzshely, nem teljes város.
- **Javasolt kezdőlista** (a tulajdonos szűri): Vasútállomás (Pécs), Egyetem / Orvoskar, Kollégium
  (már van), Kávézó, Kocsma, Széchenyi tér (tér), Park vagy Mecsek (természet), `Utca` átjáró.
  Ház vagy lakás csak annak a szereplőnek, akinek kell.
- **Lépések:** helyek felvétele a Helyszínszerkesztőben (`docs/LOCATION_EDITOR.md`), név
  `Pécs - …` formában; minden épületnek belépő szobája (`Közösségi tér`, `Nappali` stb., lásd
  `isOriginName`); a `Pécs - Kollégium` saját katalógushelyet kap, ha háttér kell neki;
  revízió jóváhagyása.
- **Ki:** Claude vagy Codex javasol, a tulajdonos hagyja jóvá.
- **Kész, ha:** a jóváhagyott fában megvannak a helyek, és `list_town_places {town_id: Pécs}` mind
  kilistázza.

### 2. szakasz – Kijáratok és átjárók
- **Cél:** minden helyről el lehessen jutni a szomszédaiba.
- **Lépések:** szülő–gyerek és szomszédsági kapcsolatok ellenőrzése; `Utca` átjáró a város alá
  (csak átsétálni, nem jelölő); az állomás legyen az, ahová a vonat „érkezik” (ehhez kódváltozás
  kellhet az `arrivalOf` / `trainBetween` körül – külön kérdés, lásd 3. rész).
- **Ki:** Claude vagy Codex.
- **Kész, ha:** a játékban (sandboxban) Pécs minden helyéről van kijárat, és nincs zsákutca.

### 3. szakasz – Térkép (ChatGPT)
- **Cél:** Pécs térképe minden jelölővel.
- **Lépések:** ha a helyfa változott, Pécs átrajzolásra jelölése (`play:map-redo`); ChatGPT-ben
  „nézd meg a nyitott rendeléseket” → `save_town_map`, `save_town_layout`
  (`docs/CHATGPT_RENDELESEK.md`, `docs/CHATGPT_TOWN_MAP_PROMPT.md`).
- **Kész, ha:** a `list_play_orders` nem mutat pécsi térképrendelést.

### 4. szakasz – Hátterek és ajtók (Grok, vagy ChatGPT átírással)
- **Cél:** minden pécsi helynek legyen háttere, rajta minden kijárattal.
- **Lépések:** Grok: `list_play_orders {for:"grok"}`, képek egy ZIP-ben a `zip_path` szerint, a
  tulajdonos betölti a stúdióban, majd ajtók `save_room_exits`-szel. Ha Grok elakad, a
  `play:order-worker` helyenként ChatGPT-re állítható. Leírás: `docs/CHATGPT_RENDELESEK.md`
  („Grok: a hátterek másik fele”, „Háttércsomag”).
- **Kész, ha:** nincs nyitott pécsi háttér- vagy ajtórendelés.

### 5. szakasz – Utazás
- **Cél:** Budapestről és Sárbogárdról vonattal vagy autóval értelmesen lehessen Pécsre jutni.
- **Lépések:** ellenőrizni, hová érkezik Palor (település vagy állomás), és hogy a biciklitiltás
  működik-e; az időtartamok (175 perc + 25) maradnak, hacsak a tulajdonos mást nem kér.
- **Kész, ha:** a sandboxban Budapest → Pécs vonattal és autóval is a várt helyre visz.

### 6. szakasz – Ki él vagy dolgozik ott
- **Cél:** csak **meglévő** szereplők kapnak pécsi helyet; új szereplőt nem találunk ki.
- **Lépések:** a profilok szövegéből javaslat (pl. Levi munkahelye: a profil Pécset mond, a
  bekötés Fehérvárt); a tulajdonos jóváhagyása után mentés a világmotor útvonalán
  (`POST /api/world-engine/places`, a profilmondattal mint forrással), ahogy 2026-11-13-án.
- **Kész, ha:** a jóváhagyott szereplők `world_places` kapcsolatai megvannak, a többi nem változott.

### 7. szakasz – Sandbox-ellenőrzés
- **Cél:** a kész város végigjárása a valódi adatbázis érintése nélkül.
- **Lépések:** `npm run sandbox`; odautazás vonattal és autóval, minden hely megnyitása, kijáratok,
  térképjelölők, egy találkozás egy pécsi szereplővel; piros hibaüzenet nincs.
- **Kész, ha:** a végigjárás hibamentes, és a jelentés a `DECISIONS.md`-be került.

---

## 3. Kérdések a tulajdonosnak élesítéskor

1. Mely helyek kellenek az 1. szakasz listájából, és mi kerüljön még bele vagy maradjon ki?
2. Kinek a története vezet Pécsre? (Levi? Más meglévő szereplő? Palor saját okból?)
3. Levi munkahelye Pécs legyen, ahogy a profilja mondja, vagy maradjon a fehérvári kórház?
4. Mekkora legyen Pécs: pár törzshely, vagy Budapesthez hasonló méret?
5. Legyen-e pécsi Vasútállomás saját hellyel, és ott érkezzen-e a vonat? (Ez kódváltozás.)
6. Kollégium: melyik egyetemé, és kell-e Palornak ott szoba?
7. Egyetem: általános egyetem, vagy konkrétan Orvoskar?
8. Természet: Mecsek, park, vagy mindkettő? Lehessen-e autóval a hegyre menni?
9. Ki rajzol: a hátterek maradjanak Grok-éi, vagy egyes helyek menjenek ChatGPT-hez?
10. Térképstílus: ugyanaz a mesekönyvszerű, mint a többi városé?
11. Városon belül séta (mint Kálozon) vagy autó is?
12. Legyenek-e pécsi felugró történetek (`play-stories`), és ha igen, melyik szakasz után?
13. Fizetős képgenerálás megengedett-e ehhez, és milyen keretig?
14. Ki dolgozzon rajta: Claude, Codex vagy más, és egy munkamenetben vagy szakaszonként?
