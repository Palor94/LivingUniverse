# Grok – képek a felugró sztorik szereplőiről

A Játék felugró sztorijaiban (út közben és a városokban) a szöveg mellett egy kisebb kép
mutatja, kivel találkozik Palor:

- **találkozás**: a sztori idegene (vagy idegenei) felöltözve, jól látható arccal, abban a
  helyzetben, ahol Palor összefut velük;
- **felhevült** (csak flörtös és szexuális sztoriban): ugyanaz a férfi félmeztelenül, vagy
  félmeztelenül kigombolt nadrággal, amikor a hangulat forrósodni kezd.

A kép attól a szövegblokktól kezdve látszik, amelyhez tartozik, és ott marad, amíg egy későbbi
blokknak saját képe nincs. Nem tölti be a képernyőt: asztali gépen a szöveg mellett, telefonon
fölötte jelenik meg kisebben. A felhevült képet csak akkor mutatja, ha a Játék beállításaiban
a felnőtt tartalom be van kapcsolva. A sztorik idegenei nem lesznek szereplők a katalógusban.

## Mentés (kézzel, a Grok-alkalmazásból)

A Grok a képet nem tudja maga átadni a programnak: a saját generált képének fájljához nem fér
hozzá, és a képcíme bejelentkezéshez kötött. Ezért minden kép után megírja a fájlnevet, te pedig
elmented, **mindet ugyanabba a mappába, almappa nélkül**:

`20_SHARED_MEDIA\Játék sztorik\`

- találkozás: `<sztori azonosító> - <blokk>.png`, pl. `benzinkutas-flort - n1.png`
- felhevült: `<sztori azonosító> - <blokk>-forro.png`, pl. `benzinkutas-flort - n4-forro.png`

(.jpg és .webp is jó.) A Játék a következő sztorinál már mutatja, beolvasni nem kell. A katalógus
ezt a mappát nem olvassa be, és nem kerül a Rendezésre vár közé.

Előtte a program fusson a legújabb kóddal (vezérlő [2]). Új csatlakozó-eszköz nem kell: a prompt a
Grok által már ismert `list_play_stories` eszközt használja, ami minden hívásnál a következő 3
képre váró sztorit adja, minden blokkal.

## Ezt másold be egy új Grok-csevegésbe

```text
Use the Living Universe connector for this whole chat. Task: make pictures of the strangers in my Play pop-up stories, so the player can see who Palor meets. Reply to me in Hungarian, short.

STEPS
1. Call list_play_stories. Its "picture_work" part gives the next 3 stories that still need pictures, each with all its blocks (text, choices, endings), its content (everyday, flirt, sexual), wants_heated_picture and the pictures it already has. Every further call of list_play_stories gives the next 3 stories (it starts over at the end). Stop when picture_work.missing is 0 or you get stories you have already done.
2. For each story, read every block and decide:
   - who the stranger(s) are: only the men the story text describes (one to three of them). Palor is the reader ("you"): never draw Palor.
   - the MEETING block: the first block where Palor meets or first clearly sees the stranger(s).
   - only if wants_heated_picture is true: the HEATED block: the first block on the way to the spicy ending where clothes start coming off or the mood turns openly sexual.
3. Write a short look sheet for each stranger from the clues in the text (age if given, job, clothes, build, hair, beard). Where the text says nothing, choose an ordinary, believable Hungarian man aged 25–55. Use exactly the same look sheet in both pictures of the story, so it is visibly the same man.
4. MEETING picture, generated natively in this chat: photorealistic, portrait 3:4, waist-up or three-quarter body, face clearly visible, natural expression fitting the moment, in the story's own setting and light (night train, motorway rest area, village pub, city street…), seen as Palor sees him, dressed as the story says. Only the stranger(s). No text, no logos, no watermark.
5. HEATED picture (only when wants_heated_picture is true), generated natively: the same man, same place and light, portrait 3:4, framed from mid-thigh up, face visible; shirtless, or shirtless with the trousers' top button undone and the fly slightly open (underwear waistband may show); confident, inviting, consensual mood. Nothing explicit: no nudity below the waist, no genitals, no sex act. No text.
6. After each picture, show it and tell me in one line the exact file name to save it under, all in the same folder "20_SHARED_MEDIA\Játék sztorik" (no subfolders):
   - meeting picture: <story id> - <block id>.png
   - heated picture: <story id> - <block id>-forro.png
7. Do not stop between stories and do not ask: after each story write one short Hungarian line (story, which blocks got pictures, what was refused and why), then call list_play_stories again for the next ones. Only if your answer reaches its length limit, stop and continue when I write "tovább". At the very end, a short Hungarian summary.

RULES
- Everyone is an adult male (clearly over 25 in the picture). Never a woman, never anyone who looks underage. No real or famous people.
- If the image generator declines, say so with its reason and move on; never reword, soften or split a prompt to get around a refusal.
- The strangers are one-off story figures: never create, name or save them as characters; do not change profiles, references or canon.
- Do not change the stories themselves.
```

## Megjegyzés

- Ha egy kép nem tetszik, kérj újat Groktól, és mentsd el ugyanazzal a névvel (a régit töröld
  vagy írd felül a mentéskor).
- A `list_play_stories` minden hívásnál továbblép; egy sztori addig marad a listán, amíg a
  találkozós (és ha kell, a felhevült) képe meg nincs.
