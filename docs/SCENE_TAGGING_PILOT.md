# Jelenetközpontú Terra–Sol próba: követelmények

2026-10-31. Állapot: az opcionális `scene-v1` szerződés, helyi előnézet és kézi
Terra–Sol futtató elkészült a fejlesztési ágon. Az első, külön jóváhagyott
öt kép × két modell próba lezárult, éles telepítés nem történt. A konkrét
privát kiválasztás és modellkimenet a repón kívül marad.
A standard szerződés az alapérték; a jelenetbővítés külön konfigurációval kérhető.
Aktuális működés és korlátok: [CLOUD_SCENE_PREVIEW.md](CLOUD_SCENE_PREVIEW.md).

## A felhasználó által pontosított cél

A hasznos eredmény a látható környezet, a jelenetben végzett tevékenység és
résztvevőnkénti cselekvési szerep, valamint a felvétel felhasználhatósága.
A próba felnőtt, közös intim képeket is tartalmazzon; a félmeztelen portré
önmagában nem helyettesíti ezt a feladatot. A jelölt képek közös karakter-
hozzárendelése és meglévő szövege nem bizonyítja, mi látható a képen.

## 1. Látható környezet és több használható helyszín

Külön tárolandó:

- `observed_environment`: a látható funkció és annak jelei. Például mosdó,
  WC-fülke, otthoni fürdőszoba, semleges referenciaháttér vagy nem eldönthető.
  Egy burkolatszín nem elegendő környezetmegnevezés.
- `compatible_settings[]`: több, egymást nem kizáró felhasználási lehetőség.
  Például ugyanaz a nyilvános mosdó kávézói és benzinkúti jelenethez is illhet.
  Mindegyik külön bizonytalanságot, indokot és megkülönböztető jel hiányát
  tartalmazza. Ez nem annak állítása, hogy a kép ténylegesen ott készült.
- `confirmed_location_ids[]`: kizárólag későbbi alkotói kiválasztásból származó
  meglévő világhely-azonosítók. A modell nem találhat ki ID-t vagy pontos helyet.

Példa tervezett eredményre (nem modellkimenet):

```json
{
  "observed_environment": {
    "label": "nyilvános mosdó",
    "evidence": "mosdókagyló és fülkeelválasztó látszik",
    "uncertain": true
  },
  "compatible_settings": [
    {"label": "kávézó mosdója", "basis": "plausible_use", "uncertain": true},
    {"label": "benzinkút mosdója", "basis": "plausible_use", "uncertain": true}
  ],
  "confirmed_location_ids": []
}
```

Nem kell mindig több helyszínt kitalálni. Kevés vizuális támpont esetén az
általános környezet maradjon, a részletes használati lehetőség bizonytalan.
A kompatibilitások nem egymást kizáró valószínűségek, összegük nem 100%.

A jelenlegi alkalmazás több konkrét helyszín hozzárendelését már támogatja
(`media_locations` + `media_location_links`), de ezek nem különítik el a
bizonytalan jelenet-kompatibilitást a megerősített helykapcsolattól. A meglévő
kapcsolatokba nem szabad észrevétlenül felismert tényként írni a hipotéziseket.
A jelenlegi valódi adapter `locations:[]` követelménye továbbra is érvényes;
az opcionális kompatibilitási mező külön, csak olvasható megfigyelési nézetben
jelenik meg; megerősített világhelykapcsolatot nem hoz létre.

## 2. Pozíció és cselekvésenkénti résztvevői szerepek

Az opcionális `scene_details.activities[]` rekord: rövid tárgyilagos tevékenységmegnevezés,
látható testhelyzet/pozíció, láthatóság, bizonytalanság, rövid bizonyíték és
az érintett `participants[]` helyi képbeli azonosítói.

Az általános „aktív/passzív” helyett cselekvéshez kötött szerepek szükségesek:

- penetrációt végző / penetrációt fogadó;
- orális stimulációt végző / orális stimulációt fogadó;
- más látható tevékenység végzője / fogadója;
- nem eldönthető, takart vagy nem alkalmazható.

Az orális stimulációt fogadó fél és az azt végző fél nem sorolható egy
globális aktív/passzív személyiség- vagy szexualitáscímkébe. Ugyanaz a
résztvevő külön cselekvésekben eltérő szerepet is kaphat. Szexuális orientáció,
állandó preferencia, dominancia, szándék és beleegyezés nem következtethető
ebből; nincs profil- vagy kánonírás. Takart érintkezésből nem állítható biztos
aktus. A szöveges jegyzetben szereplő készülődés nem látható tevékenység.

Résztvevők a modellkimenetben képbeli A/B azonosítót, régiót és semleges
pozícióleírást kapjanak. A karakterekhez rendelés külön ellenőrizendő:
a közös katalógus-hozzárendelés nem mondja meg, melyik alak melyik karakter.
Nincs arcfelismerés, portrékból végzett személyazonosság-következtetés vagy
karakterprofil továbbítása a modellnek. Bizonytalan megfeleltetés maradjon üres.

## 3. Referenciakép és szimulációs felhasználás

Külön mező a felvételi kameraállás/kivágás, az arc/test/póz lefedettsége és
az alkotó által engedélyezett felhasználási kör.

A semleges vagy steril hátterű arc-/alakreferencia javasolt használati köre
`character_introduction` / `narration_only`: karakterbemutatás és narráció.
Nem kerülhet automatikusan helyszíni esemény illusztrációi közé. A semleges
háttérhez nincs erőltetett kávézó-/benzinkút-/szobajavaslat.

A háttér steril kinézete önmagában nem elég: tényleges szobabelső is lehet
steril. A besorolás és a felhasználási korlátozás külön jóváhagyandó. A címke
nem jóváhagyott kanonikus referencia vagy tréningengedély. Szimulációs média-
választó és a használati korlátozás tartós éles tárolása még nincs megvalósítva.

## A próba és értékelés

1. Korlátozott privát jelöltlista a felhasználó által megnevezett párosokból,
   forráskatalógus csak olvasható. Hiányzó pároshoz nem találunk ki képet.
2. A konkrét kijelölés vizuális ellenőrzése, felnőtt kontextus és a képbeli
   szereplők megfeleltetése. Előkészítéskor nincs képküldés a modellnek.
3. Az új mezőket támogató közös eredményszerződés és megfigyelési nézet ellenőrzése;
   azonos prompt, képmásolat és gondolkodási szint a Terra–Sol összevetésben.
   Meglévő feldolgozási sor/adapter újrahasználata, külön éles elemző nélkül.
4. Helyi API-kulcs, pontos kérés-/képlista és költség-előnézet után a konkrét
   felhős adatátadás és díj jóváhagyása. A helyi próba engedélye nem ez.
5. Képenként és modellenként egy kísérlet; elutasítás és hiányos címke is
   mérési eredmény. Nincs automatikus retry vagy más szolgáltatóra váltás.
6. Egymás melletti értékelés: környezeti funkció, többes kompatibilitás,
   pozíció, résztvevői szerepek és identitástévesztés, bizonytalanság,
   referencia-/narrációs korlát, formátum, idő és számlázott token/költség.

A „sexual/felnőtt tartalom” általános jelzés önmagában nem sikeres akcióelemzés.
A helyszín részleteinek kitalálása és a szerepek felcserélése külön hiba.
Az elutasítást és az elfogadott, de rossz eredményt külön mérjük. A jelenlegi
235/235 regresszió az előző implementáció állapota; az új 253/253 regresszió
a bővített szerződés programfolyamatát ellenőrzi, nem a valódi intim képelemzés
pontosságát. A jóváhagyott első felhős próba összesített eredménye a
[CLOUD_SCENE_PREVIEW.md](CLOUD_SCENE_PREVIEW.md) dokumentumban szerepel.

## Helyi képkiválasztó előnézet

A `tests/prepare-scene-pilot-review.mjs` kézi segéd a privát tervezetből
legfeljebb öt csoport × három jelölt ellenőrzött helyi másolatát készíti el.
Paraméterei: `--config`, `--manifest`, `--output`; a kimenet friss és OneDrive-on
kívüli mappa. A forráskatalógus query-only, a beolvasás a közös ellenőrzött
képolvasót használja. Hiányzó vagy offline képet nem tölt le automatikusan.

A privát kimenet `review.html`, `review-receipt.json` és `serve-review.mjs`
fájlokat tartalmaz. A szerver kézzel indítandó, kizárólag numerikus loopback
címen véletlen portot használ és 30 perc után leáll. Csak az explicit másolatok
és a statikus HTML érhetők el; nincs API-kulcsmező, űrlap, szkript, külső
erőforrás vagy modellhívás. CSP, same-origin CORP és no-store válaszfejlécek
védik a helyi előnézetet. A kódok a chatben megadhatók, például A2/B1/C3/D1/E2.
A képkiválasztás nem felhős adatátadási vagy költségjóváhagyás.

A kézi előkészítésben 15/15 jelölt helyi másolata elkészült, a HTTP-ellenőrzés
200 választ és 15 képelemet igazolt, külső erőforrás és script nélkül. Ez
nem vizuális tartalomellenőrzés; a képeket a felhasználó választja ki.

## Külön helyi OpenAI-tesztkulcs

Kézi indítás: `node tests/setup-scene-pilot-key.mjs`. A natív Windows WPF
PasswordBox mezőbe a felhasználó közvetlenül adja meg a titkos kulcsot; nincs
konzolos, parancssori vagy chatbeli kulcsbevitel. A Mentés gomb külön
`analysis-trial/credentials/openai-analysis-key.dpapi` fájlba ment a helyi
LivingUniverse adatkönyvtár alatt, OneDrive-on kívül. A Windows DPAPI CurrentUser
titkosítás és csak az aktuális felhasználó/SYSTEM számára engedélyezett fájl-ACL
védi. A meglévő tesztkulcs cseréjéhez külön helyi jelölés kell.

A segéd nem érinti a tunnel hitelesítőjét, nem módosítja az éles provider-
konfigurációt vagy a rendszer környezeti változóit, és nem hívja az OpenAI-t.
A nyugta kizárólag a helyi mentés tényét jelzi; a kulcs érvényessége, modell-
jogosultsága és egyenlege ettől még nincs igazolva. A titkos érték nem kerül
naplóba. A tesztfuttató védett betöltése az `app/analysis-credentials.mjs`
modulban elkészült. Külön, képbájt és fizetős inferencia nélküli modell-metaadat-
ellenőrzés mindkét kiválasztott modellre 200 választ és egyező modell-ID-t adott;
ez az API-egyenleget nem igazolja.

`node tests/setup-scene-pilot-key.mjs --self-test` mesterséges értékből létrehozott
egyedi ideiglenes fájllal ellenőrzi a DPAPI mentés/visszafejtést és a fenti ACL-t,
majd csak azt a tesztfájlt távolítja el. A Windows hoston sikeres; valódi kulcsot
és hálózati hívást nem használ. A kulcsablak indítása és címe külön ellenőrzött,
titkos mezőt nem olvastunk ki.
