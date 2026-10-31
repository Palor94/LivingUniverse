# Környezet-, akció- és felvételi címkék

2026-10-31. A felhasználó fő célja a helyszín/környezet, a látható tevékenység
és a kép későbbi generálási referenciaként való használhatósága. Az öltözet
önálló részletei nem alapértelmezett célok.

| Terület | Kategória | Tartalom |
| --- | --- | --- |
| Helyszín / környezet | `background` | Általános látható környezet, például hálószoba, park, vízpart vagy semleges háttér. Pontos világhelyet nem következtetünk puszta látványból. |
| Akció | `action` | Rövid, megfigyelhető igei címke: áll, ül, sétál, olvas. Nem ruházat vagy feltételezett szándék. |
| Felvétel: kameraállás | `angle` | Szemből, profil, háromnegyed, hátulról; szükség esetén szemmagasság, alul-/felülnézet. |
| Felvétel: kivágás | `framing` | Arcközelkép, portré, felsőtest, teljes alak vagy részlet, a levágott/takart részek figyelembevételével. |
| Felvétel: referenciahasználat | `reference_use` | Arc-, testarány-, póz-, háttér- vagy kompozíciós referencia javaslata, a látható fedettség és korlátok indoklásával. Nem kánon-, identitás- vagy tréningjóváhagyás. |

Az API és a desktop célválasztó ezt az öt célt használja alapból. Ruházat,
arckifejezés, statikus testhelyzet és megvilágítás továbbra is külön kérhető.
A nem kért kategóriákból az illesztő nem készít címkejavaslatot.

Az `action` a meglévő **Pose & activity** (`group-pose`), a `reference_use`
a **Reference role (media label)** (`group-reference`) csoportot részesíti
előnyben. A kameraállás és kivágás meglévő csoportjai, ID-i és HU/EN/alias-
illesztése megmaradnak. Ismeretlen fogalom külön javaslat marad; automatikus
szótár- vagy helylétrehozás nincs.

A sor, cache, előnézet, illesztés, jóváhagyás és visszavonás ugyanaz a közös
rendszer. A `media-analysis-3` prompt, prompt-/sémahash és kiválasztott célok
érvénytelenítik a korábbi ruházatközpontú cache használatát. Az akció és
referenciahasználat hozzáadó JSON-kategória; a régi hét kategória és a
normalizált eredményforma továbbra is használható. Új SQL-migráció nincs.

A wire-séma legfeljebb 10 megfigyelést és 10 címkét enged, hogy az öt cél
beleférjen. A prompt célonként egy világos címkét, kevés kiegészítő megfigyelést,
60 karakteres nevet és legfeljebb 160 karakteres indoklást kér. A modell-ID-k
nullok, a pontoshely-lista jóváhagyott helykontextus nélkül üres marad.

Egy referenciahasználati **címke** elfogadása csak címkekapcsolatot adhat hozzá.
Nem ír karakterprofilt, `media_roles` besorolást, rendezési állapotot, kánont
vagy jóváhagyott referenciakészletet. Külön regresszió védi ezt a határt.
A modell tartalmi besorolása ettől még ellenőrizendő: egy ruházati főnév
nem válik valódi akcióvá attól, hogy a modell az `action` mezőbe írta.

## A képkiválasztás helyesbítése

A kezdeti privát kiválasztás részszóként keresett a „meztelen” szóra, ezért
„félmeztelen” testreferenciák kerültek bele. A nadrág/rövidnadrág-javaslat
és az akkori keresési találat ebből adódóan önmagában nem ellentmondás;
ebből nem következtetünk vizuális modellhibára.

A félmeztelen és teljes meztelenséget jelölő szavakat most Unicode-szóhatárral
különböztetjük meg; tagadó mondat nem teljes meztelenségi jelölés. Ez szöveges
metaadat-besorolás, nem a kép tartalmának ellenőrzése. A privát futtató az
eredménylapon feltünteti ezt, és opcionális `--require-full-nudity-label`
kapcsolóval már beolvasás előtt visszautasítja a nem megfelelő kijelölést.

Az aktuális metaadatok között teljes szóra illeszkedő egyértelmű jelölés
nem volt. A célzott ismétlés ugyanazon három, most már pontosan félmeztelenként
feltüntetett testreferenciát használja. A helyi eredménylap három fő részre
tagolódik: környezet, akció, felvétel/referenciahasználat. Privát kép, név, ID,
hash vagy modellkimenet nem kerül Gitbe; az éles katalógus read-only.

## A célzott helyi ismétlés eredménye

A változatlan Qwen3-VL 2B Instruct Q4_K_M modellen három új, cache nélküli
kísérlet futott a közös alkalmazási soron. Futási idők: 162,1 / 180,6 / 193,8 s.
Egy válasz megfelelt a strukturált sémának; kettő `INVALID_RESULT` hibával
elutasítva maradt. Nem időtúllépésként könyveljük el a hibás modellkimenetet.
Nem volt automatikus újrapróbálkozás vagy más modellre/felhőre váltás.

Az egyetlen technikailag érvényes válaszban is maradt hibás kategorizálás:
az akciómező ruházati állapotot kapott; a magyar megfogalmazás és a
referenciahasználati címke is kézi értékelést igényel. A kameraállás és
kivágás szótári illesztése önmagában nem bizonyít vizuális helyességet.
Ezen a kis próbán a modell nem elég megbízható a kért önálló címkézésre.

Mindhárom eredeti forrás és az érintett élő rekordok/szótár lenyomata
változatlan; a külön tesztkatalógus integritása `ok`. Jóváhagyás, élő írás,
új letöltés vagy külső képtovábbítás nem történt. Az izolált Ollama és
gyermekfolyamatai leálltak, a tesztporton nem maradt listener. A privát
eredménylap helyi képeket használ, nincs külső erőforrás vagy szkript.

## Regresszió

A célzott fixture-es tesztek 61/61, a teljes `node --test tests/*.test.mjs`
regresszió 235/235 sikeres. Az új ellenőrzések az API/UI alapcélokat, a
ruházat külön választhatóságát, a meglévő akciószótár-csoport illesztését,
a referenciahasználati címke elfogadásának kánon-/szerep-/rendezésvédelmét
és a metaadat-kiválasztási részszóhiba kizárását fedik. A régi hét cél
explicit kiválasztása továbbra is a korábbi regresszió része.

Ezek a programfolyamatot igazolják; nem írják felül a valódi modell gyenge
eredményét. Natív böngészős vagy iOS-vizuális próba nem történt ebben a körben.
