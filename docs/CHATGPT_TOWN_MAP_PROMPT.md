# ChatGPT – rajzolt várostérképek a Játékhoz

A Játékban a település nézete térkép. A ChatGPT megrajzolja a település szép, felülnézeti
térképét úgy, hogy minden helynek (otthonok, kocsma, bolt, edzőterem…) legyen rajta egy
felismerhető épülete, maga elmenti a képet, és azt is, hol áll rajta az egyes hely. A jelölők
így rögtön a saját épületükre kerülnek.

Előtte: a program fusson az új kóddal (vezérlő [2]), a ChatGPT-ben frissítsd a Living Universe
csatlakozót. A kép a `20_SHARED_MEDIA\Játék térképek\<település>.png` fájlba kerül; ha már volt
térképkép, az dátumos néven megmarad. A katalógus ezt a mappát nem olvassa be.

Utólag a Játékban a település nézetén az **Elrendezés** gombbal bármelyik jelölőt odébb húzhatod.

## Ezt másold be egy új ChatGPT-csevegésbe

```text
Use the Living Universe connector for this whole chat. Task: draw a beautiful illustrated town map for each town of my Play world, save it into the app yourself, and save where every place stands on it. Never ask me to download or save anything.

STEPS
1. Call list_town_places once to get the towns, their places (id, name, kind, rooms) and whether a map picture already exists. Only the entries under "towns" get a town map. The "standalone_places" (a house, a van, a forest at the top of the tree) are NOT towns: never draw a map for them; skip them here (they get eye-level pictures in the room-pictures task). Work through the towns in this order: Káloz, Székesfehérvár, Budapest, then the others. One town per answer.
2. Plan the map before drawing: give every listed place one recognisable building or spot, placed where it would really be:
   - shops, pubs, cafés, discos, the plaza: along the main street or in the centre;
   - homes and flats: in the residential streets (family houses in a village, blocks of flats and apartment houses in a city);
   - work places (hospital, police, workshop, building site, office): in plausible districts;
   - nature (park, lake, forest, field, hill): at the edge or as green areas;
   - transit (street, station, metro, bus stop, motorway rest area): on the roads.
   Use real-world character: Káloz is a small Fejér county village (one main road, family houses with gardens, a church on a small square, a pub, a shop, fields and vineyards around); Székesfehérvár is a county town (historic centre with the cathedral, housing estates, a railway station, shopping malls, a ring road); Budapest is the capital (the Danube with bridges, Buda hills, dense Pest districts, ring roads). Places of the list must be clearly distinct buildings, not one generic block.
   A house, flat or building with rooms appears ONLY from the outside, as one building on the town map. Never draw floor plans, cut-away interiors or rooms from above: the room names only tell you how big the building is. The inside of houses is done separately, as eye-level room pictures with doors.
3. Generate the picture natively in this chat:
   - illustrated top-down town map in a warm, hand-painted storybook style (like a beautiful tourist map), soft daylight, rich but calm colours, gentle shadows, trees, gardens, roofs with detail;
   - landscape 3:2 (1536×1024), the whole town filling the frame with some countryside at the edges;
   - NO text, NO labels, NO letters, NO numbers, NO map legend, NO compass, NO frame, NO people or cars in focus — the game draws its own name labels and pins on top;
   - leave a little free space (roof or courtyard) above the centre of every planned place, so a round pin can sit there.
4. Save the picture: save_town_map with town_id, image = the picture you just generated (attach it as the file parameter), model = your model name, prompt = the prompt you used. It counts as saved only when the result has a file.
5. Look at the saved picture and write down, for every place id, the centre of its building or spot as fractions of the picture: x from 0 (left edge) to 1 (right edge), y from 0 (top) to 1 (bottom). Keep at least 0.06 between any two places so their pins do not overlap. Then call save_town_layout with town_id and positions = a list of {"place_id": "…", "x": 0.42, "y": 0.61} items, one for every place of the town.
6. In Hungarian, at the end of each answer: the town, whether the map and the layout were saved, how many places were placed, and anything you could not place (with the reason). Then stop and wait until I write "tovább".

RULES
- Draw only places; never draw or name a character.
- If the image generator declines, say so and the reason; do not reword the request to get around a refusal.
- These pictures are presentation only: do not change profiles, references or canon.
```

Tipp: ha egy térkép nem tetszik, írd a ChatGPT-nek, mit szeretnél másképp („legyen több fa”,
„a Duna legyen hangsúlyosabb”), és mentse újra. A régi kép megmarad a mappában dátumos néven.
