# Képelemző szolgáltatók: helyi és felhős lehetőségek

Dokumentációs összehasonlítás, ellenőrizve: 2026-10-30. Nem minőségi benchmark,
nem bekötési jóváhagyás; az összehasonlítás készítésekor modell nem lett telepítve vagy meghívva.
A konkrét modell elérhetőségét, feltételeit és árát bekötés előtt újra ellenőrizni kell.

Implementációs frissítés: a helyi Ollama és a külön OpenAI Responses adapter
kikapcsolt alapértékekkel elkészült, kizárólag fixture-rel ellenőrizve:
[DIRECT_AI_ANALYSIS.md](DIRECT_AI_ANALYSIS.md). A kód nem használja az alábbi
összehasonlítás példamodelljeit vagy árait alapértékként. Ezek történeti
összehasonlító adatok; valódi próbához friss ellenőrzés és külön jóváhagyás kell.

Későbbi, külön jóváhagyott helyi próba: [REAL_OLLAMA_TRIAL.md](REAL_OLLAMA_TRIAL.md).
A kis Qwen3-VL 2B modell technikailag működött, de a három szintetikus kép
alapján a kétnyelvű következetesség és címkeminőség gyenge. Ez nem igazolja
a korábbi összehasonlító példamodellek vagy árak aktuális alkalmasságát.

| Út | Előny a Living Universe számára | Költség | Korlát / ellenőrizendő feltétel |
| --- | --- | --- | --- |
| Helyi Ollama + helyben tárolt vision modell | A kép helyben maradhat; nincs kérésszintű külső API-függőség. Az Ollama vision API képet és szöveget fogad. | Nincs felhős tokendíj valóban helyi futtatásnál; hardver, energia, tárolás és modelllicenc számít. | A konkrét gépen mérendő RAM/VRAM, késleltetés, modelllicenc, magyar címkék és sémafegyelem. Az Ollama felhős modellje külön szolgáltatás: nem tekinthető helyi feldolgozásnak. |
| OpenAI vision, példaként GPT-5.6 Terra | Dokumentált képbemenet és strukturált kimenet; a provider-séma külön adapterbe illeszthető. | Publikált normál tokenár: $2 / 1M bemeneti és $12 / 1M kimeneti token, a modell dokumentációja szerint. A képtokeneket a modell/detail/méretezés szabályai alapján kell számolni. | Külső képtovábbítás, hálózat, költségkeret és szolgáltatói korlátok. Az API-adat alapértelmezetten nem tréningadat, de ez nem jelent automatikusan nulla megőrzést. |
| Google Gemini, olcsó összehasonlítási példaként 2.5 Flash-Lite | Dokumentált kép-tokenárazás, kis költségű benchmarkjelölt. | Standard fizetős tarifa: $0.10 / 1M szöveg/kép/videó bemeneti és $0.40 / 1M kimeneti token, gondolkodási tokenekkel együtt. | Külső képtovábbítás; a free tier és paid tier adatkezelése eltér. A forrás szerint a free tartalom termékfejlesztésre használható, a paid tartalom nem. Az olcsóság nem bizonyít megfelelő felismerést. |

Források: [Ollama vision](https://docs.ollama.com/capabilities/vision),
[Ollama adatkezelés és local-only mód](https://docs.ollama.com/faq),
[hardvertámogatás](https://docs.ollama.com/gpu),
[GPT-5.6 Terra modelladatlap](https://developers.openai.com/api/docs/models/gpt-5.6-terra),
[OpenAI képbemeneti szabályok](https://developers.openai.com/api/docs/guides/images-vision),
[OpenAI adatkezelés](https://developers.openai.com/api/docs/guides/your-data),
[Gemini árak és tier-adatkezelés](https://ai.google.dev/gemini-api/docs/pricing).

Az Ollama FAQ `OLLAMA_NO_CLOUD=1` beállítást is dokumentál. Egy későbbi helyi
adapterhez loopback-végpont, felhős funkciók tiltása, rögzített modell/digest és
helyi hálózati ellenőrzés javasolt. Ezek itt tervezett követelmények: a gépen
nem állítottunk át semmit. Nem állítható mérés nélkül, hogy egy adott modell
elfér a felhasználó GPU-ján, vagy gyorsabb/pontosabb a felhős jelölteknél.

Az OpenAI adatkezelési dokumentáció alapértelmezésben legfeljebb 30 napos
abuse-monitoring megőrzést ír le, kivételekkel; a ZDR jogosultság és végpontfüggő.
A későbbi adapternek a konkrét fiók és végpont beállításait kell ellenőriznie,
és az előnézetben érthetően jeleznie kell a továbbítást. Nem elegendő az
„API-adatból nem tanítanak” mondatot teljes adatvédelmi garanciának tekinteni.

## Költségtervezés

Általános becslés: `N × ((szöveginput + képtoken) × inputár + outputtoken × outputár) / 1 000 000`.
Ehhez jön minden ismétlés, gondolkodási token, extra szolgáltatás vagy tárolás,
ha az adott termék felszámítja. A különböző modellek tokenjei és képfeldolgozása
eltér: azonos felbontás nem jelent azonos számlát.

Kizárólag szemléltető számítás, nem mérés: ha egy kérés **összesen** 2000
számlázott inputtokent és 400 outputtokent használ, akkor 1000 kép a fenti
normál árakkal $8.80 (Terra) vagy $0.36 (Flash-Lite). A tényleges képtokenszám
és kimenet nincs megmérve. A mock implementáció 0 API-költsége ettől független.
A felhős batch-kedvezmény nem azonos a Living Universe helyi munkasorával;
külső batch-kérést a mostani kód nem küld.

## Javasolt értékelés a bekötés előtt

Először helyi, jogtisztán használható szintetikus/nyilvános képkészletet
válasszunk: semleges referencia, kültéri jelenet, hasonló helyek, takarás,
többszereplős kép és bizonytalan háttér. Ugyanazt a változatlan tesztsort kell
lefuttatni minden választott adapteren, előre kézzel rögzített elvárt címkékkel.
Privát képet csak a konkrét szolgáltató és továbbítás külön jóváhagyása után.

Mérendő: kategóriánkénti helyes/hibás/hiányzó javaslat, indokolatlan pontos
helyszínállítás, bizonytalanság jelzése, HU/EN alias-illeszkedés, érvényes JSON
aránya, p50/p95 idő és tényleges költség elfogadott javaslatonként. Nincs
automatikus helyazonosítás általános tájképből, és a helyszínfa ID-jeit sem
ismerheti egy modell a nevük vagy a látvány puszta hasonlósága alapján.

Az eredeti összehasonlítás következő lépésre vonatkozó javaslata az adapterek
implementálása előtti állapotot rögzíti. Most az első külön engedélyezett,
kis valódi benchmark következhet. Eredeti javaslat: válasszunk helyi vagy engedélyezett felhős
benchmarkutat, rögzítsük a pontos modellt és keretet, majd készítsünk egyetlen
adaptert a meglévő szerződéshez. Ezután jöhet valódi minőségi összehasonlítás.
Felhő esetén előbb még külön képkiválasztási, adatátadási és költségjóváhagyási
előnézetet kell implementálni; a mock bekapcsolása nem jogosít fel erre.
