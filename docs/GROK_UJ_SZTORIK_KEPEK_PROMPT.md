# Grok – képek a 8 kép nélküli sztorihoz (2026-11-22)

A két plázás sztorihoz és a hat új „veszélyes” sztorihoz még nincs kép. Ez a prompt csatlakozó
nélkül is működik: minden adat benne van, és a blokkok úgy vannak kiválasztva, hogy a képek a
megfelelő pillanatban jelenjenek meg a sztoriban.

**Mentés:** minden kép a `20_SHARED_MEDIA\Játék sztorik\` mappába kerül, almappa nélkül, azzal a
névvel, amit Grok a kép után kiír. A Játék a következő sztorinál már mutatja.

**Előtte:** a hat új sztori legyen betöltve a játékba (`30_IMPORTS\sztorik-veszelyes-uj.json`, vagy
a `sztorik-ujrairva-1.json` + `-2.json` cserével).

## Ezt másold be egy új Grok-csevegésbe

```text
Task: make pictures of the strangers in 8 interactive pop-up stories of my game. The player is Palor, the reader ("you"): never draw Palor. Reply to me in Hungarian, short. Do not stop between stories and do not ask; if your answer reaches its length limit, stop and continue when I write "tovább".

For each story make TWO pictures of the same man (or men), using exactly the same look in both, so he is visibly the same person:
1. MEETING picture: photorealistic, portrait 3:4, waist-up or three-quarter body, face clearly visible, natural expression fitting the moment, in the story's own setting and light, seen as Palor sees him, dressed as described. Only the stranger(s). No text, no logos, no watermark.
2. HEATED picture: the same man, same place and light, portrait 3:4, framed from mid-thigh up, face visible; shirtless, or shirtless with the trousers' top button undone and the fly slightly open (underwear waistband may show); confident, inviting, clearly consensual mood. No nudity below the waist, no genitals, no sex act. No text.
After each picture, show it and give me in one line the exact file name:
   meeting: <story id> - <meeting block>.png
   heated:  <story id> - <heated block>-forro.png
After each story, one short Hungarian line: what was made, what was refused and why. At the end, a short Hungarian summary.

THE STORIES

1. id: plaza-fiatal-szekesfehervar | meeting block: n1 | heated block: n4
   Márk, about 23, a shop assistant in a small clothing store in a Székesfehérvár shopping mall, afternoon. Slim, tight black shirt, carefully styled dark hair, nervous shy smile. Meeting: behind the clothes rails, slightly blushing. Heated: inside a narrow fitting room with a mirror and a curtain, shirt open and off one shoulder.

2. id: plaza-idos-szekesfehervar | meeting block: n1 | heated block: n5
   László, 63, a mall security guard: strong, broad-shouldered, grey hair, grey moustache, dark security uniform. Meeting: standing by a fountain in a busy Székesfehérvár mall, watching with a warm, knowing smile. Heated: in a small dark monitor room lit only by a dozen CCTV screens, uniform shirt off, hairy grey chest.

3. id: szokott-stoppos-road | meeting block: n1 | heated block: n7
   Ricsi, 32, an escaped prisoner hitchhiking: shaved head, tattoo on the side of his neck, athletic build, short-sleeved grey T-shirt in cold November night, tired serious eyes. Meeting: at night on the side of a forest road in the headlights, thumb out, shivering. Heated: in a plain roadside motel room lit by a bedside lamp, sitting on the bed edge in a towel or shirtless, a tattooed muscular body, an old scar on his back, vulnerable expression.

4. id: betoro-budapest | meeting block: n1 | heated block: n8
   Márk, about 25, a former cook turned desperate burglar: lean and wiry, stubble, hollow cheeks, big dark eyes, black hoodie and gloves. Meeting: caught in a Budapest apartment living room at night when the light comes on, frozen, holding a laptop and a screwdriver, more scared than threatening. Heated: in the small apartment kitchen at night, hoodie off, lean torso with a fresh bruise on his ribs, burn and knife scars on his hands, a shy smile.

5. id: kidobo-budapest | meeting block: n1 | heated block: n7
   Attila, about 40, a huge bald nightclub bouncer: black T-shirt, arms thick as thighs, a rosary tattoo on his wrist. Meeting: at 2 a.m. in front of a club door in Budapest's 7th district, neon light, stern protective look. Heated: in the club's back courtyard / storeroom among drink crates, bass light through the wall, T-shirt off, huge hairy chest with old scars, a bandage on his right hand, a gentle look that surprises.

6. id: autoverseny-szekesfehervar | meeting block: n1 | heated block: n7
   Krisz, about 30, an illegal street racer and car mechanic: beard, leather jacket, a snake tattoo on his forearm. Meeting: at midnight in an empty industrial-park car park, leaning on a black tuned BMW, blue neon, smoke, other cars in the background, a cocky grin. Heated: in a dark warehouse yard next to the same BMW, inside or leaning on the car, leather jacket off, adrenaline grin, shirt open.

7. id: csempesz-hatar-road | meeting block: n1 | heated block: n8
   Viktor, about 45, an elegant bearded man with sad dark eyes: leather coat, expensive watch. Meeting: at 1 a.m. at the counter of a fuel station shop near the Croatian border, a small sealed box and an envelope on the counter. Heated: in a worn but clean roadside motel room, shirt open, a long old scar along his ribs, warm tired look.

8. id: pince-tolvaj-kaloz | meeting block: n1 | heated block: n7
   Laci, about 32, a broad-shouldered village man in dark clothes and a cap. Meeting: at night at a row of wine cellars in a Hungarian village, moonlight, prying a padlock with a crowbar, turning around caught. Heated: inside the vaulted wine cellar by candlelight among barrels, sweater off, broad hairy chest, a small name tattoo on his arm, tears and a shy smile.

RULES
- Everyone is an adult male, clearly over 25 in the picture. Never a woman, never anyone who looks underage. No real or famous people.
- If the image generator declines, say so with its reason and move on; never reword, soften or split a prompt to get around a refusal.
- These are one-off story figures: do not create, name or save them as characters anywhere.
```
