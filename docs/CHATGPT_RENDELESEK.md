# ChatGPT – térkép- és háttérrendelések (Térképgyár, Háttérgyár)

2026-11-14. A Szereplőgyárhoz hasonlóan a program maga számolja ki, mit kell rajzolni, és ezt
rendelésként adja ki a ChatGPT-nek. A rendelés magától lezárul, amikor a kép, a jelölők vagy az
ajtók elmentődtek; külön nyilvántartás nincs.

| Rendelés | Mikor nyílik | Mit csinál a ChatGPT |
|---|---|---|
| **Térkép** | egy település vagy táj (Káloz határa) térképe hiányzik, átrajzolásra jelölt, vagy egy hely jelölője nincs rajta | megrajzolja (`save_town_map`), majd felrakja a jelölőket (`save_town_layout`) |
| **Háttér** (Háttérgyár) | egy helynek nincs saját háttere | olyan hátteret készít, amelyen **minden kijáratnak látható helye van** (ajtó, lépcső, folyosó, kapu, ösvény), elmenti, majd elhelyezi rajta az ajtókat (`save_room_exits`) |
| **Ajtók** | van háttér, de nem minden kijárat van rajta elhelyezve | megnézi a képet, és a meglévő ajtókra/lépcsőkre teszi a kijáratokat; ha nincs hely, csak irányt ad (nyíl a kép szélén) |

Az átrendezés után (2026-11-14) átrajzolásra jelölve: **Káloz** (az utca már nem hely, új hely Káloz
határa), **Káloz határa** (új tájtérkép: tó a tóparttal, erdei parkoló, nagy erdő, hegy) és
**Budapest** (Max háza, Laci háza, Kórház, Lángosozó; az utca nem hely).

## Egyszer: ezt másold be egy új ChatGPT-csevegésbe

Előtte: indítsd újra a programot (vezérlő **[2]**), és a ChatGPT-ben frissítsd a Living Universe
csatlakozót.

```text
Use the Living Universe connector for this whole chat. Whenever I write "nézd meg a nyitott rendeléseket", call list_character_orders with for:"chatgpt" and then list_play_orders with for:"chatgpt", and produce what they ask for, yourself, inside the app. Never ask me to download or save anything.

ORDER OF WORK
1. Character orders first (avatars and gallery), as list_character_orders describes.
2. Then list_play_orders {for:"chatgpt"}: maps first (Káloz, Káloz határa, Székesfehérvár, Budapest, then the rest), then backgrounds, then doors. One town, or up to five places, per answer. At the end of each answer report in Hungarian what was saved, what is left, and anything you could not do (with the reason); then wait until I write "tovább".

MAPS (map_orders)
- Call list_town_places {town_id} for the current places. Illustrated top-down map, warm hand-painted storybook style, landscape 3:2 (1536×1024), NO text, labels, letters, numbers, legend, compass, frame or people.
- Every listed place gets one recognisable building or spot where it would really be. Houses and flats appear only from outside as one building; never rooms or floor plans. Streets are roads, not places.
- Káloz határa is a landscape, not a town: the big lake (Tó) with a small sandy shore on the village side; right beside it a large dense forest like the Bakony or Vértes hills; the forest car park at the forest edge nearest the village with a dirt road from the fields; the mountain rising out of the far side of the forest, wild and little explored, with a hiking spot high up.
- Save: save_town_map {town_id, image}. Then look at the saved picture and save_town_layout with the centre of every place (fractions 0–1, at least 0.06 apart). If the order only lists missing pins, keep the picture and only save the layout.

BACKGROUNDS (background_orders, "Háttérgyár")
- get_generation_brief {target:"background", location_id, time_of_day:"nappal"} gives the prompt and save target.
- Compose the picture so that EVERY way out listed in the order's exits has a clear visible place: a door for a room inside, an open doorway or hallway to the next room, the front door or gate to the street, stairs for up/down, a path or the shore for outdoor places. Eye level, wide, photorealistic, empty of people, no text.
- Save: place_play_asset {target:"background", location_id, time_of_day:"nappal", image}. Then look at the saved picture and save_room_exits {place_id, exits:[{to_place_id, x, y, direction}]} with x, y at the middle of each drawn door, stairs or path (fractions 0–1).

DOORS (door_orders)
- get_media {media_id: background_media_id}; find each listed way out on the picture and save_room_exits. If a way out has no plausible spot, give only direction (left, right, forward, back, up, down). Never redraw a picture just for doors.

RULES
- Draw only places; never draw or name a character. Presentation only: no canon, profile or catalogue change.
- If the generator declines, say so with the reason; never reword a request to get around a refusal.
```

Utána ugyanebben a csevegésben elég ennyit írni: **„nézd meg a nyitott rendeléseket”**.

Tipp: ha egy kép nem tetszik, írd meg, mit szeretnél másképp; a régi kép dátumos néven megmarad.
A jelölőket és az ajtókat a Játékban kézzel is odébb húzhatod (Elrendezés, Ajtók elhelyezése).

## Grok: a hátterek másik fele

A munka meg van osztva (2026-11-14). **Grok** készíti a Káloz környéki (Káloz határa is),
székesfehérvári, sárbogárdi, gárdonyi és pécsi helyek hátterét és ajtóit; **ChatGPT** az összes
térképet és a többi helyet (Budapest, M7, Balaton, utazási helyek). Mindkettő csak a saját részét
kapja meg.

Grok a képet nem tudja maga átadni a programnak. Minden kép után megírja, **melyik mappába** mentsd
(`20_SHARED_MEDIA\Helyszín hátterek\<hely neve>\`) és milyen néven. A program a mappát magától
beolvassa (vagy azonnal: Alkotói stúdió › Helyszínek › Képek beolvasása). Ezután a hely
ajtórendelésként jelenik meg, és Grok elhelyezi rajta az ajtókat.

Egyszer másold be egy új Grok-csevegésbe (a Living Universe csatlakozó legyen bekapcsolva):

```text
Use the Living Universe connector for this whole chat. Reply to me in Hungarian, short. Whenever I write "nézd meg a nyitott rendeléseket", call list_character_orders with for:"grok" (do only your part there), then list_play_orders with for:"grok", and work through your play orders.

BACKGROUNDS (background_orders, "Háttérgyár")
- get_generation_brief {target:"background", location_id, time_of_day:"nappal"} gives the prompt.
- Compose the picture so that EVERY way out listed in the order's exits has a clear visible place on it: a door for a room inside, an open doorway or hallway to the next room, the front door or gate to the street, stairs for up/down, a path or the shore outdoors. Eye level, wide 16:9 or 3:2, photorealistic, empty of people, no text. Generate it here, natively.
- You cannot hand the picture to the program. After each picture write me the exact folder (save_folder, inside my Living Universe folder) and a file name ending in .png; I save it there and the program reads it in by itself.
- If you can, deliver all pictures of this session as ONE ZIP whose entries are exactly the zip_path values of the orders (folder = the catalogue name of the place, never the town or the tree path). If you cannot make a ZIP, name the folder and file per picture as above.

DOORS (door_orders: pictures already in)
- get_media {media_id: background_media_id}; find each listed way out on the picture and call save_room_exits {place_id, exits:[{to_place_id, x, y, direction}]} with x, y at the middle of the drawn door, stairs or path (fractions 0–1). If a way out has no plausible spot, give only direction (left, right, forward, back, up, down).

RULES
- Maps and the other towns are ChatGPT's: never do them.
- Up to five places per answer, then report what is done and what is left, and wait until I write "tovább".
- Draw only places; never draw or name a character. If the generator declines, say so with the reason; never reword around a refusal.
```

## Háttércsomag: sok kép egy ZIP-ben (2026-11-14)

Minden háttérrendelésben van egy `zip_path`, például `Péter háza - konyha/konyha-nappal.png`: a mappa
a hely **katalógusneve** (nem a város, nem a fa útvonala), utána a javasolt fájlnév. Ha egy alkalmazás
tud ZIP-et adni, kérd tőle egy menet összes képét **egyetlen ZIP-ben**, pontosan ezekkel az útvonalakkal.
Hogy Grok vagy ChatGPT tényleg tud-e ZIP-et készíteni, az alkalmazáson múlik; ha nem, marad a képenkénti
mappa + fájlnév. A ZIP-et te is összerakhatod: tedd a képeket a megadott nevű mappákba, jelöld ki a
mappákat, és Windowsban „Küldés › Tömörített mappa”.

Betöltés: Alkotói stúdió › Helyszínek › **Háttércsomag (ZIP) betöltése**. A program minden képet a hely
figyelt mappájába másol (`Helyszín hátterek\<hely>`), és rögtön háttérként veszi fel. Semmit nem ír felül:
azonos névnél „ (2)” kerül a név végére, a már meglévő ugyanolyan kép kimarad (duplikátum). Kisebb
eltérést elnéz a mappanévben (ékezet, kis-nagybetű, kötőjel, előtte a városnév, pl. „Káloz - Péter háza -
Konyha”). Ha egy mappanév egyik helyre sem illik, vagy többre is, nem találgat: a képet félreteszi a
`30_IMPORTS\Háttércsomagok\<dátum> - <zip neve>\` mappába, és felsorolja a hasonló helyeket. Csak PNG és
JPEG lehet háttér (a WebP-t is félreteszi); a nem képfájlokat és a mappán kívülre mutató útvonalakat
elutasítja. Minden betöltésről napló készül az adatmappa `backups` mappájába.

A sima „Képek beolvasása” is szól, ha a `Helyszín hátterek` alatt rossz nevű mappát talál, amely
valószínűleg egy helyé („rossz nevű mappák”), de ezeket nem mozgatja: nevezd át őket a megadott névre.

## Gemini?

A Gemini-alkalmazás nem tud csatlakozni a programhoz (nincs benne saját csatlakozó), ezért csak
kézi segítő lehet: a háttér-promptot a Helyszínek › Hiányzó hátterek listából másolod ki, a képet
pedig te mented a hely mappájába. A hátterekhez (üres helyek, emberek nélkül) jól használható.
## Grok – rövid parancs ZIP-es szállításhoz

Új Grok-csevegésbe (Living Universe csatlakozó bekapcsolva), az újraindítás után:

```text
Use the Living Universe connector. Reply in Hungarian, short. When I write "nézd meg a nyitott rendeléseket": call list_play_orders with for:"grok" and kind:"background", take the first 8 orders, and for each call get_generation_brief {target:"background", location_id, time_of_day:"nappal"}.
Generate one picture per order: eye level, wide 16:9 or 3:2, photorealistic, empty of people, no text, and every way out listed in the order's exits clearly visible (door, open doorway, front door or gate, stairs, path or shore). PNG or JPG, never WebP.
Then pack all pictures of this round into ONE ZIP whose entry paths are exactly the orders' zip_path values (folder = the place's catalogue name; never add the town or the tree path) and give me the ZIP to download.
If you cannot make a ZIP, say so in one sentence and instead list, in the order you made the pictures: picture number → zip_path, so I can rename and pack them myself.
Never draw or name a character. If the generator declines, give the reason; never reword around a refusal. After the round, wait until I write "tovább".
```

Utána: Alkotói stúdió › Helyszínek › **Háttércsomag (ZIP) betöltése**, és válaszd ki a ZIP-et. Amit
a program nem tud biztosan egy helyhez kötni, azt félreteszi és megmutatja. Az ajtókat Grok a
következő körben, az ajtórendeléseknél helyezi el.
