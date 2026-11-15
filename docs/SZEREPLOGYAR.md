# Szereplőgyár – használati útmutató

A Szereplőgyár egy űrlapból hoz létre új szereplőt. A profilt Grok írja meg, az avatarokat és a
galériaképeket ChatGPT készíti, mindkettő a saját csevegésében, API-kredit nélkül. A program
ellenőrzi és a helyére teszi, amit kapott.

## Egyszer, a legelső használat előtt

1. Indítsd újra a programot (vezérlő **[2]**).
2. **ChatGPT:** frissítsd a Living Universe csatlakozót, és nyiss új csevegést.
3. **Grok:** távolítsd el, majd add hozzá újra a Living Universe csatlakozót.
4. Másold be mindkettőnek a saját parancsát (lent, vagy a Szereplőgyár oldalán a 📋 gombokkal).
   Mindkettő csak a saját részét kapja meg: Grok a profilt, ChatGPT az avatarokat és a galériát.
   Ha korábban már bemásoltad a régi parancsot, másold be az újat.
   Ettől kezdve ugyanabban a csevegésben elég ennyit írni: **„nézd meg a nyitott rendeléseket”**.

## Az űrlap kitöltése után

### 1. Nézd meg a rendelés kártyáját

A **Létrehozás** után a szereplő azonnal létezik: saját mappát kap (`10_CHARACTERS\<név>\`), a
csatolt képek odakerülnek, és hozzá kapcsolódnak. A Szereplőgyár oldalán megjelenik a rendelés
kártyája, rajta egy-egy jelzés mindhárom részhez:

| Jelzés | Jelentése |
|---|---|
| folyamatban | dolgozni kell rajta |
| a profilra vár | az avatarok és a galéria csak a kész profil után indulnak |
| visszaküldve | Grok profiljában hiányos mezők maradtak |
| kész | elkészült |
| nem kért | ezt a részt nem pipáltad be |

### 2. Grok: a profil

Ha kértél profilt, **ezzel kezdd**, mert a képek erre várnak.

1. Grokban írd be: **„nézd meg a nyitott rendeléseket”**.
2. Grok elolvassa a leírást és a csatolt képeket (a képekhez írt megjegyzéseidet is), majd megírja
   a teljes Szellemprofilt. A program azonnal elfogadja.
3. A program ellenőrzi, hogy minden mező ki van-e töltve valódi szöveggel (a születési dátum és a
   technikai eredet kivételével). Ha valami hiányzik, Grok a válaszban visszakapja a listát, és
   kiegészíti.
4. Ha a kártyán **visszaküldve** áll, írd Groknak újra: „nézd meg a nyitott rendeléseket”.

Kész, ha a kártyán **Profil: kész** áll. Ha nem kértél profilt, ez a lépés kimarad, és rögtön
ChatGPT jöhet.

### 3. ChatGPT: az avatarok és a galéria

1. ChatGPT-ben írd be: **„nézd meg a nyitott rendeléseket”**.
2. **Avatarsorozat** (17 kép, zöld háttéren, amit a program automatikusan eltávolít):
   - 7 arckifejezés felöltözve, teljes alakban;
   - ugyanez félmeztelenül (a nadrág és a cipő marad);
   - 3 intim kép (alap, mosoly, flörtöl): derékig, ruha nélküli felsőtest, a kép a köldök alatt
     véget ér; a játék ott elhalványítja.

   A képek a `Szereplő-alakok\<név>\` mappába kerülnek (a félmeztelenek a `felmeztelen`, az intimek
   az `intim` almappába).
3. **Galéria:** a bepipált jelenetek, mindegyik a hozzá választott jelöléssel. ChatGPT a leírásból
   és a profilból értelmezi, ki a szereplő, és ehhez igazítja a jeleneteket. Ami nem illik hozzá
   (például egy humanoid szörny nem szelfizik), helyett ugyanarra a célra mást készít. A képek a
   szereplő `Galéria` almappájába kerülnek; a Palorral közösek Palorhoz is kapcsolódnak, ezért a
   játék „Közös fotók” részében is megjelennek.
4. ChatGPT egyszerre csak néhány képet készít. Ha megáll, írd neki: **„folytasd”**, vagy újra:
   „nézd meg a nyitott rendeléseket”.

### 4. Ha valami nem sikerül

- **Nem egyezik az arc:** a program minden képet összevet a csatolt fotókkal (helyi
  arcfelismerővel, internet nélkül). A nem egyező galériaképet nem tartja meg; a nem egyező
  avatart újrakészítendőként listázza. Ezeket a kártya „Újrakészítendő avatarok” és „Visszaküldött
  galériaképek” listája mutatja. ChatGPT a következő „nézd meg a nyitott rendeléseket” után újra elkészíti őket.
- **ChatGPT visszautasít egy képet:** ezt rögzíti, és megy tovább. Az elutasított jelenet
  elkészültnek számít, nem kéri újra, és nem fogalmazza át a kérést.
- **ChatGPT azt kéri, hogy mentsd el te a képet:** mentsd a megadott mappába, a megadott névvel. A
  program 5 percen belül észreveszi.
- **Az arcfelismerő nincs telepítve:** a kártya alatt ezt kiírja, és a képeket ellenőrzés nélkül
  fogadja el.
- **„nem engedélyezett” a galériánál:** a félmeztelen vagy intim jelenetet a program ugyanúgy csak
  akkor engedi, mint a játék többi része: ha a szereplő (közös jelenetnél Palor is) származása ezt
  megengedi. Ha nem, a jelenet kimarad, és nem tartja nyitva a rendelést.
- **Mégsem kell a rendelés:** a kártyán a **Rendelés lezárása** gomb. A szereplő és az addig elkészült képek
  megmaradnak.

### 5. Ha minden kész

A kártya a **Lezárt rendelések** közé kerül. A **Profil megnyitása** gombbal megnézheted a
szereplőt. A képek mostantól a játékban is használhatók, mindegyik a saját jelölése szerint (a
félmeztelen és az intim képeket a játék csak a megfelelő kapcsolati szinten mutatja).

**Kánon nem lesz semmiből automatikusan.** Ha egy képet jóváhagyott referenciának szeretnél, azt
továbbra is te jelölöd ki (kivágással, a Kijelölés mentése gombbal).

## Mi hova kerül, milyen néven

A fájlnevek az „Új képek” szabályát követik (`docs/UJ_KEPEK_UTMUTATO.md`). A jelölés a fájlnévben:
hétköznapi = `hetkoznapi`, félmeztelen = `meztelen`, intim = `szex`.

| Mi | Hova | Példa |
|---|---|---|
| Csatolt képek | `10_CHARACTERS\<név>\` | `Bandi - forrás - hetkoznapi - 2026-11-14-1.png` |
| Galéria, egyedül | `10_CHARACTERS\<név>\Galéria\` | `Bandi - reggel - hetkoznapi - 2026-11-14-1.png` |
| Galéria, Palorral | `10_CHARACTERS\<név>\Galéria\` | `Palor + Bandi - közös kávé - hetkoznapi - 2026-11-14-1.png` |
| Avatarok | `Szereplő-alakok\<név>\` (+ `felmeztelen`, `intim`) | `mosoly.png` |

Semmi nem íródik felül: foglalt név esetén a sorszám nő.

## A galéria jelenetei

**Alapcsomag (egyedül):** portré · derékig, a jellemző ruhájában · szelfi · teljes alak a saját
helyén · reggel · este vagy éjszaka · munka vagy hobbi közben.

**Közös rész Palorral:** első találkozás, beszélgetés · közös kávé vagy evés · séta, közös út ·
közös szelfi · közös program.

Közös képet csak akkor lehet rendelni, ha Palor már létezik a világban. Az arcegyezés küszöbe
(0,45) ideiglenes, és független a kánonkapuktól.

## Parancs Groknak

```text
Use the Living Universe connector. Call list_character_orders with for:"grok" and write the profile of every listed order exactly as it says: the complete Szellemprofil with propose_ghost_profile, every field in real Hungarian text, adult males only (a non-human or fantasy being is fine if he is male). Only the profile is yours: avatars and gallery pictures are made by ChatGPT, so never start them and do not say you will continue with them. Do not stop between orders. Reply to me in Hungarian, short.
```

## Parancs ChatGPT-nek

```text
Use the Living Universe connector. Call list_character_orders with for:"chatgpt" and work through every listed order exactly as it says (avatars with the figure jobs, gallery pictures with save_order_picture, attaching the picture you generated). The profile is Grok's: never write it; an order whose profile is not done yet waits. Remake what failed the face check. If the generator declines, record it and move on; never reword around a refusal. Do not stop between orders. Reply to me in Hungarian, short.
```
