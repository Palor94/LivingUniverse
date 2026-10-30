# Használható referenciaképek és külön kérhető eredetik

2026-10-29: a közös ChatGPT/Grok MCP képolvasó a kiválasztott referenciákra
optimalizált. A listázás és a normál médiaolvasás csak metaadatot ad; nincs
automatikus teljesgaléria-átadás.

## Alapmód: jó minőségű kiválasztott referencia

A get_media és get_approved_references eszköz include_image:true kapcsolóval
alapból image_quality:reference módot használ. Egy kérés egy kiválasztott képet ad.

- Legfeljebb 2048 pixeles hosszabb oldal és 3 MiB képbájt.
- Ha a JPEG/PNG már belefér, az eredeti bájtjai változatlanul érkeznek.
- Nagyobb forrásból jó minőségű JPEG készül, 90/88/85 minőségi fokozattal.
  Csak a 3 MiB-os korlát miatt csökkenhet tovább a felbontás; a tényleges
  felbontás és méret minden válaszban szerepel. Nincs felnagyítás vagy képkivágás.
- A származtatott képek EXIF tájolását helyreállítja; az átlátszóság fehér
  háttérre kerül. GIF/BMP forrásból JPEG készül; GIF esetén az első képkockából.
- Az image_info.representation eredménye original vagy reference. A sha256
  mindig a ténylegesen átadott bájtoké; származtatásnál a source.sha256 az eredetié.
- Jóváhagyott referenciánál az eredeti hash-nek már származtatás előtt egyeznie
  kell a kiválasztott kánonrevízióval. A visszaadott kép nem új kánonjóváhagyás.
- Négy származtatott kép ideiglenesen memóriában maradhat, forrás-hash szerint.
  Minden új olvasás frissen ellenőrzi a forrást és a hozzáférést. Lemezre nem ír.

A kép vizuális tartalomként érkezik az MCP-válaszban. A 768 px / 192 KiB régi
thumbnail-korlát az általános kép- és referencialekérést már nem korlátozza.
A helyi médiarács és a videók kiválasztott képkockáinak kis előnézete megmarad.

## Eredeti fájl külön kérésre

Az image_quality:original az eredeti fájl formátumát, bájtjait, felbontását és
beágyazott metaadatait változatlanul adja. PNG/JPEG/GIF/BMP, maximum 20 MiB és
40 megapixel; a meglévő Windows-dekóderrel ellenőrizhető, helyben elérhető forrás.

- Legfeljebb 6 MiB: közvetlen MCP image tartalom, delivery:inline.
- 6–20 MiB: delivery:chunks_required, méret/hash és átadási paraméterek.
  Ilyenkor a kép még nincs átadva. A get_media_image_chunk 256 KiB eredeti
  bájtot ad offset és expected_sha256 alapján. Jóváhagyott referenciához a
  character_id és revision_id is szükséges. Minden darab újra ellenőrzi a
  teljes forrás hash-ét, az aktív médiát és a megadott kánonkötést.
- A kliensnek programból kell dekódolnia/összefűznie és teljes SHA-256-tal
  ellenőriznie a darabokat. Ha erre nem képes, használja a privát letöltést.

A [Secure MCP Tunnel teljes válaszkorlátja 10 MiB](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels#limits).
A szerver JSON-válaszkorlátja 9 MiB, ezért a base64 és metaadatok miatt a
teljes eredeti inline határa 6 MiB. Az alap referenciamód rendszerint kisebb.

## Privát fájlátvétel és generátorok

A get_media original_download_url, illetve a referenciák private_original_url
mezője a meglévő, személyazonossággal védett Tailscale-oldalra mutat. A régi
private_preview_url név alatt is az eredeti tölthető le. A /media-original/ID
aktív katalógusképet, az /approved-preview/CHARACTER/ID jóváhagyott eredetit ad.
Ezeket a publikus Grok OAuth-gateway nem szolgálja ki. Nincs új publikus fájltár,
bearer-link, port vagy hitelesítési kivétel.

A [ChatGPT MCP képtartalma](https://developers.openai.com/plugins/reference#tool-results)
és a [Grok custom connector](https://docs.x.ai/grok/connectors) használható
képbájtokat kap. Ebből nem következik, hogy a natív kép-/videógenerátor
automatikusan fájlcsatolmányként megkapja az MCP-képet. Ezt csak tényleges
fájlátadási bizonyíték alapján szabad állítani. Ha a generátor nem veszi át:
nyisd meg a privát linket Tailscale-en, mentsd el a képet és csatold a generátorhoz.
Ne helyettesítsd a referenciafájlt pusztán szöveges leírással, ha azonos arc a cél.

A Living Universe meglévő szerveroldali API-generálása az explicit kiválasztott,
jóváhagyott eredetik bájtjait használja. Ez külön szolgáltatói díjazás és a meglévő
generálási jóváhagyás alá tartozik; ez a fejlesztés nem indít fizetős generálást.
A 2048 px jó minőségű bemenet, de önmagában nem garantál azonossághű generálást.

## Üzemeltetés és példa

Nincs új környezeti változó, API-kulcs vagy adatbázismigráció. A kódot mentés után
frissítsd; indítási sorrend: meglévő katalógusalkalmazás, Grok gateway, privát
MCP-alagút. Az alagút régi gyermekfolyamatai se maradjanak futva. Pontos
folyamatútvonalat ellenőrizz; ne állíts le minden Node-ot.

ChatGPT: Bővítmények → Living Universe → Kezelés → Eszközök frissítése.
Grok: meglévő csatlakozó frissítése vagy új csevegés; külön Botnál annak meglévő
kapcsolata legyen aktív. A képminőség minden meglévő és későbbi karakterre közös.

Mindkét platformon:

> Keresd ki a karakter jóváhagyott referenciáit. A kiválasztott arc- és testképet
> kérd le include_image:true, image_quality:reference módban. Csak ezeket használd
> a generáláshoz. Ellenőrizd, hogy a generátor ténylegesen átvette-e a képfájlt;
> ha nem, jelezd, és add meg a privát fájlletöltési linket.

Ha különösen fontos a teljes fájl: image_quality:original.
Csak a releváns képeket kérd le; sok kép automatikus továbbítása nem cél.

Az elkülönített tesztek a stdio/OAuth HTTP/privát HTTP átadást, eredeti hash-t,
2048-as származtatást, EXIF-tájolást, nagy fájlok darabolását, ismétlést és a
hibás/jogosulatlan kéréseket ellenőrzik. Az éles ellenőrzési jegyzőkönyv külön
rögzíti a megfigyelt kliensválaszokat és a nem tesztelt natív generátorátadást.
