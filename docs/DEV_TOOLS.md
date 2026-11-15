# Fejlesztői és hibakereső eszközök

Ezek az eszközök csak olvasnak és helyben (a gépen) futnak. Kivétel a „Mindent újraindít” gomb.

## A programban: Rendszerállapot

Bal alsó sarok, **Rendszerállapot** gomb. A kezdőlapi figyelmeztetésből a **Részletek** gomb vezet ide.

| Fül | Mit mutat |
|---|---|
| Ellenőrzések | A program kódja (kell-e újraindítás), az adatbázis mérete, a médiamappa, a szabad hely, a mobilos felület, a Tailscale, az indítási feladatok, a Grok gateway, a ChatGPT alagút, a szerverhibák és a kérések. A **Mély ellenőrzés** gomb az SQLite `quick_check`-et is lefuttatja. |
| Hibák | Az utolsó szerverhibák, kinyitva a teljes hibaúttal (stack). |
| Kérések | Az utolsó 300 API-kérés: módszer, útvonal, állapot, idő. Lekérdezési paraméter, kéréstörzs és fejléc nem kerül a naplóba. |
| AI-hívások | Az utolsó 100 Grok-hívás. Hívásonként: modell, időtartam, az első szóig eltelt idő, tokenek (be, gyorsítótárazott, ki), és hogyan ért véget: `length` = levágva, vagy egy hibakód, pl. `AI_UNCERTAIN`. A kérés és a válasz szövege nem kerül naplóba. Fájl: `logs/ai-calls.log`. |
| Lassú lekérdezések | A 150 ms-nál lassabb SQL-utasítások, csak a szövegük, értékek nélkül. Figyelmeztetés akkor jelenik meg, ha az utolsó órában legalább 20 volt. |
| Újraindítási napló | A legutóbbi újraindítás kimenete. |

A böngészőben keletkező hibák (képernyőhiba, el nem kapott ígéret) is a Hibák fülre kerülnek „client” forrással, a nézet és a fájl nevével. Legfeljebb 30 hiba kerül be 10 percenként. A Mély ellenőrzés a 15 legnagyobb táblát is kiírja, a sorok számával.

A **Mindent újraindít** gomb az `ops/lu-control.ps1 restart` parancsot indítja el, a programon kívül (WMI-n keresztül), így a program leállítása nem állítja le magát az újraindítót. Ez újraindítja a programot, a Grok gatewayt és a ChatGPT alagutat. A gomb csak akkor működik, ha a program a valódi szolgáltatásként fut (`installProcessGuards`). Tesztben, homokozóban és másolaton nem működik. Futó munka (import, generálás, törlés, átnevezés, áthelyezés) közben, és percenként egynél többször sem indít újra.

API: `GET /api/dev/doctor[?deep=1]`, `GET /api/dev/log?kind=errors|requests|restart|ai|queries`, `POST /api/dev/client-error`, `POST /api/dev/restart {confirm:true}`.

## Parancssor

```
npm run doctor                  a futó program állapota (--deep, --errors, --requests, --port 4327)
npm test                        minden teszt
npm test -- play sprites        csak a nevükben „play” vagy „sprites” szót tartalmazó tesztek
npm test -- --changed           a módosított fájlokhoz tartozó tesztek (git nélkül: az utolsó 120 percben módosított fájlok; --since 30)
npm test -- --list              csak kiírja, mi futna
npm run sandbox                 a program a valódi katalógus friss másolatán, a 4327-es porton
npm run perf                    teljesítménymérés a katalógus másolatán (docs/PERF_BASELINE.md)
npm run coverage                tesztlefedettség soronként (app/ és mcp/); szűrhető: npm run coverage -- play
npm run doctor -- --report      minden egy Markdown-fájlba: %LOCALAPPDATA%\LivingUniverse\diagnostics\
npm run dbdiff -- snapshot      pillanatkép az adatbázisról (--name előtte)
npm run dbdiff -- diff [név]    mi változott azóta: táblánként +új −törölt ~módosult sor, módosult oszlopok, példakulcsok
npm run dbdiff -- list          a pillanatképek listája
```

### Homokozó

- A katalógust az SQLite online mentésével másolja, futó program mellett is biztonságosan. A másolat helye: `%LOCALAPPDATA%\LivingUniverse\sandbox\<idő>\`.
- Kulcsot, mobil-, MCP-, Grok- és képgenerálási beállítást nem másol. Az AI csak próbaválaszt ad, ezért fizetős hívás nem történhet.
- **Média:** alapból a valódi médiamappát használja, de csak olvasásra. Fájlt érintő művelet nem futhat le; csak a játék, a világmotor, a fejlesztői eszközök és néhány tisztán adatbázis-írás engedélyezett. Az `--empty-media` kapcsolóval üres mappát kap, és akkor minden művelet kipróbálható.
- Leállításkor (Ctrl+C vagy az ablak bezárása) törli a másolatot (`--keep` esetén megtartja). Ha a törlés mégsem sikerül, a következő indítás törli; az egy napnál régebbi másolatokat és a két legutóbbinál régebbieket is. Csak a `sandbox` mappán belül töröl.

### Adatbázis-különbség

Ezzel az eszközzel kideríthető, mit változtatott egy gomb az adatbázisban:
1. Készíts pillanatképet.
2. Végezd el a műveletet a programban.
3. Futtasd a diff parancsot.

A kimenet táblánként mutatja az új, a törölt és a módosult sorok számát, a módosult oszlopok nevét, az új és megszűnt oszlopokat, és néhány példakulcsot. Új oszlop miatt egy sor nem számít módosultnak. Cellaértékeket nem ír ki. Az élő katalógust csak olvassa: a pillanatképet online mentéssel készíti, a különbséget csak olvasható kapcsolaton számolja. A pillanatképek helye: `%LOCALAPPDATA%\LivingUniverse\db-snapshots`. A `--db <fájl>` kapcsolóval más adatbázissal is összevethető, például egy homokozó-másolattal.

### Válaszkészség

A Rendszerállapot „Válaszkészség” sora azt mutatja, hány ms-ra akadt meg a program az előző ellenőrzés óta: a tipikus akadás felső értéke (p99) és a leghosszabb. Ilyenkor minden képernyő vár. Ha 500 ms fölött van, nézd meg ugyanarra az időre a Lassú lekérdezések és a Kérések fület.

### Egyéb

- `.ignore`: a kódkeresés kihagyja a média-, mentés- és archívummappákat.
- `tests/client-smoke.test.mjs` három dolgot ellenőriz:
  - minden kliensfájl hibátlanul értelmezhető;
  - minden importált modult kiszolgál a szerver;
  - minden `t('…')` kulcshoz van magyar szöveg.
