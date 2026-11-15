# ChatGPT – szobaképek belülről, ajtókkal (point-and-click)

A házakon belül Palor úgy mozog, mint egy kalandjátékban: mindig benne van egy szobában (a
szoba szemmagasságból látható képe a háttér), és a képen ott áll egy jelölő, ahol a szomszéd
szobába vezető ajtó, lépcső vagy átjáró van. Ahol nincs megjelölve ajtó, ott a kép szélén nyíl
mutatja az irányt. A Játékban a szoba „⋯ Eszközök” menüjében az **Ajtók elhelyezése** gombbal
bármelyik jelölőt át is húzhatod.

Előtte: a program fusson az új kóddal (vezérlő [2]), a ChatGPT-ben frissítsd a Living Universe
csatlakozót, és nyiss új csevegést.

## Ezt másold be egy új ChatGPT-csevegésbe

```text
Use the Living Universe connector for this whole chat. Task: make eye-level interior pictures of the rooms of the houses in my Play world, save each as that room's background, and save where its doors are on the picture. Never ask me to download or save anything.

STEPS
1. list_town_places once. Work house by house (a place with rooms), in the towns' order, then the "standalone_places" (houses, vehicles and nature spots outside the towns: the place itself gets an eye-level picture too, saved with its own location_id).
2. For each room of the house: get_room_exits with its place_id. It gives the room's location_id and its neighbours: rooms inside, the next rooms of the same house ("next"), back to the house ("back") and out to the street ("street").
3. Plan the room so that its neighbours are reachable through things you can see: a door to each "next" room you can place naturally, the front door or hallway towards "back"/"street", stairs for another floor. Not every neighbour needs a visible door.
4. Generate the picture natively in this chat:
   - photorealistic interior seen from eye level, as if standing in the room, a slightly wide 16:9 view; believable Hungarian home of the kind the house is (village family house, city flat, workers' hostel…);
   - doors and passages clearly visible, not hidden behind furniture; a free floor area in the lower middle where people will stand;
   - no people, no text, no labels, no arrows, no watermark.
5. Save it as the room's background: place_play_asset with target "background", location_id of the room, time_of_day "nappal", image = the picture you just generated (attach it as the file parameter), model = your model name, prompt = your prompt.
6. Look at the picture and call save_room_exits for the room: exits = a list of {"to_place_id": …, "direction": "left|right|forward|back|up|down", "x": …, "y": …}. x and y are fractions (0–1) of the picture width and height at the middle of the drawn door, stairs or passage. For a neighbour that has no visible door in the picture, give only the direction (the game shows an arrow at that edge).
7. Do not stop between houses and do not ask: go on with the next house until every house is done. After each house write one short Hungarian line (the house, how many rooms got a picture and doors, what was skipped and why). Only if your answer reaches its length limit, stop, and continue from there when I write "tovább". At the very end, a short Hungarian summary.

RULES
- Draw only places; never draw or name a character.
- If the image generator declines, say so and the reason; do not reword the request to get around a refusal.
- These pictures and door positions are presentation only: do not change profiles, references or canon.
- A room that already has a background from my earlier chat: do not make a new picture; only save directions for its exits with save_room_exits.
```
