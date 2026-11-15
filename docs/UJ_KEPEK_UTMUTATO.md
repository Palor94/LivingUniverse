# Új képek: feltöltés, elnevezés, beolvasás

## Röviden

1. Tedd az új képet vagy videót ide: `20_SHARED_MEDIA\Új képek\`
2. A fájl neve (vagy az almappa neve) mondja meg, ki van rajta.
3. A program kezdőlapján megjelenik az **Új képek beolvasása** feladat. Megnyitva látod, mit olvasott ki a nevekből, egy kattintással pedig beolvasod és a helyükre teszed a képeket.

A képek ide kerülnek:

| Ki van a képen | Hova kerül |
|---|---|
| egy szereplő (Palorral vagy nélküle) | `10_CHARACTERS\<szereplő>\` |
| csak Palor | `10_CHARACTERS\Palor\` |
| két vagy több szereplő (Palor nem számít bele) | `20_SHARED_MEDIA\Scenes\<A + B>\` |

A szereplők a képhez kapcsolódnak, Palor is, ha szerepel a nevében. A Palorral közös képek ezért megjelennek a játékban a „Közös fotók” között is. Ha a helyszín és a tartalom szerepel a névben, a program felcímkézi a helyszínt és beállítja a tartalom szintjét.

## Fájlnév

```
Szereplő + Szereplő - Helyszín - tartalom - bármi.png
```

- **Elválasztó:** ` - ` (szóköz, kötőjel, szóköz). A részek sorrendje szabad, csak a szereplőknek kell egy részben lenniük.
- **Szereplők:** a meglévő nevek `+` jellel összekötve. Az ékezet és a kis- vagy nagybetű nem számít (`Peter` = `Péter`). A hosszú nevek rövid alakja is működik, ha egyértelmű: `Dávid` = „Dávid - ikea mellizmos srác”.
- **Helyszín** (nem kötelező): a Helyszínek fa egyik helyének neve, például `Kávézó`.
- **Tartalom** (nem kötelező): `hetkoznapi`, `meztelen` vagy `szex`. **Érdemes megadni:** a jelöletlen képet a játék intimnek veszi, ezért csak később mutatja meg.
- **Bármi:** sorszám vagy rövid leírás. Ezt a program nem értelmezi.

Példák:

```
Norbi - Kávézó - hetkoznapi - 1.png             → 10_CHARACTERS\Norbi\
Palor + Norbi - Strand - hetkoznapi - 2.png     → 10_CHARACTERS\Norbi\   (Palor is jelölve)
Norbi + Péter - Edzőterem - 1.png               → 20_SHARED_MEDIA\Scenes\Norbi + Péter\
Palor - reggel a lakásban.png                   → 10_CHARACTERS\Palor\
```

## Legkényelmesebb: almappák, átnevezés nélkül

A ChatGPT vagy a Grok letöltött fájljait nem kell átnevezni. Elég, ha a szereplőkről elnevezett almappába teszed őket:

```
Új képek\Norbi\                      (bármilyen fájlnév)
Új képek\Palor + Norbi\
Új képek\Norbi + Péter\
Új képek\Norbi\hetkoznapi\           (második szint: tartalom vagy helyszín)
Új képek\Norbi\Kávézó\
```

Beolvasás után a program eltávolítja a kiürült almappákat, az `Új képek` mappa megmarad.

## Amikor valami nem stimmel

A program nem találgat. Ha egy fájl nevét nem tudja értelmezni, a fájl a mappában marad, és a feladat megmutatja az okát:

- **Ismeretlen név:** elírás, például `Atila + Péter`.
- **Több szereplőnek ez a neve:** írd ki a teljes nevet (`Gábor - rendőr`).
- **Nincs benne szereplőnév:** például egy `ChatGPT Image …` nevű fájl almappa nélkül.

Javítsd a nevet, vagy tedd a fájlt a megfelelő almappába, és kattints újra. Új szereplőt a beolvasás soha nem hoz létre: előbb hozd létre a programban.

Ha a célmappában már van ugyanilyen nevű fájl, az új fájl ` (2)` végződést kap. Semmi nem íródik felül, minden áthelyezés naplózva van, a kánon és a jóváhagyott referenciák nem változnak.

## Milyen jeleneteket érdemes generálni

A játék a képeket öt helyen használja, és mindegyiknek más kell. A lista ehhez igazodik. Egy szereplőnek érdemes legalább az alapcsomagot megcsinálni.

### Alapcsomag szereplőnként (egyedül, hétköznapi)

| # | Jelenet | Hol jelenik meg | Forma |
|---|---|---|---|
| 1 | Portré: fej, váll, semleges háttér, nyugodt arc | profil, portré | álló |
| 2 | Derékig, a jellemző ruhájában, mosolyog | portré, telefon | álló |
| 3 | Szelfi a telefonnal, hétköznapi helyen | telefonos üzenet | álló |
| 4 | Teljes alak a saját helyén (munkahely, otthon, kedvenc hely) | jelenet | fekvő |
| 5 | Reggel: kávé, ébredés, készülődés | jelenet, napszak | fekvő |
| 6 | Este vagy éjszaka: lámpafény, pihenés, hazaút | jelenet, napszak | fekvő |
| 7 | Munka vagy hobbi közben (amit a profilja tényleg tartalmaz) | jelenet, napló | fekvő |

A napszakot érdemes a leírásba vagy a fájlnévbe írni („reggel”, „este”). A játék a napszakhoz illő képet választja.

### Palorral közösen (hétköznapi)

| # | Jelenet | Hol jelenik meg |
|---|---|---|
| 8 | Első találkozás vagy beszélgetés egy ismert helyszínen | jelenet, Közös fotók |
| 9 | Közös kávé vagy evés | Közös fotók, napló |
| 10 | Séta, közös út (utca, park, jármű) | jelenet, napló |
| 11 | Közös szelfi | Közös fotók, telefon |
| 12 | Közös tevékenység (edzés, munka, játék, buli) | jelenet, napló |

### Két másik szereplő együtt (Palor nélkül)

Csak olyan pároknak készíts ilyet, akiknek a világban tényleg van közük egymáshoz (kollégák, barátok, egy helyen dolgoznak):

| # | Jelenet | Hol jelenik meg |
|---|---|---|
| 13 | Ketten beszélgetnek a közös helyükön | napló (pontosan ők ketten) |
| 14 | Közös munka vagy tevékenység | napló, jelenet |
| 15 | Csoportkép (3 vagy több fő) egy eseményen | napló |

### Kapcsolat fokozatai szerint (csak felnőtt, a meglévő kapuk mögött)

Az intimitási szint a kapcsolatnál feljebb lépve oldódik fel. A tartalom szintjét mindig írd a névbe.

| Fokozat | Tartalom a névben | Példák |
|---|---|---|
| Flört | `meztelen` | félmeztelen szelfi, strand, öltözés utáni kép (egyedül vagy Palorral) |
| Intim | `szex` | közös jelenetek Palorral: csók, vetkőzés, utána |

Az intim képek generálásánál a meglévő szabály érvényes: referenciaként csak bizonyítottan generált képek használhatók.

### Melyik szereplővel kezdd

1. Akikkel a játékban a legtöbbet beszélgetsz: náluk a hiányzó portré és szelfi tűnik fel elsőként.
2. Akiknek még nincs Palorral közös képük: náluk üresek a „Közös fotók”.
3. Akik ugyanazon a helyen élnek vagy dolgoznak: belőlük lesznek a kettős jelenetek.

A hiányzó szereplő-alakokat (a látványos regény figuráit) továbbra is az Ötletláda vagy a `CHATGPT_FIGURES_PROMPT.md` kezeli. Azok nem ide kerülnek, hanem a `Szereplő-alakok` mappába.
