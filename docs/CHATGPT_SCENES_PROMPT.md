# ChatGPT – jelenetképek, amelyeket a ChatGPT maga ment el

Előtte: a Living Universe és a ChatGPT-alagút fusson az új kóddal (indítsd újra), a
ChatGPT-ben frissítsd a Living Universe csatlakozót, hogy lássa az új `picture` célt.
A ChatGPT a képeket az `Új képek` mappába menti; utána a kezdőlapon „Új képek beolvasása”.

## Ezt másold be egy új ChatGPT-csevegésbe

```text
Use the Living Universe connector for this whole chat. Task: generate everyday scene pictures for the Play-mode characters from a fixed list and save every picture into the app yourself. Never ask me to download or save anything.

CHARACTERS AND IDENTITY
- list_character_figures → the cast, in that order. Palor is the protagonist who appears in the shared scenes.
- For each character (and for Palor, once at the start): get_character_visual_pack, then fetch the listed reference pictures with get_media / get_approved_references as its fetch_with says. Use ONLY those pictures for his face and build; keep the approved appearance text. Never invent a man from his name. If generation_ready is false or there are no usable references, skip him and say so.
- Every character is an adult male. A non-human or fantasy male is shown as what he is, never turned into a human. Do not add any other people than the ones a scene names. Do not change profiles, references or canon, and approve nothing.

SCENE LIST (everyday, non-intimate only; the shirtless versions are non-sexual too)
Alone:
 1 portrait: head and shoulders, plain soft background, calm face — vertical 2:3
 2 waist-up in his typical clothes, smiling — vertical 2:3
 3 selfie with his phone in an everyday place — vertical 2:3
 4 full body at his own place (work, home or favourite spot from his profile) — horizontal 3:2
 5 morning: coffee, waking up or getting ready — horizontal 3:2
 6 evening or night: lamp light, resting or on the way home — horizontal 3:2
 7 at work or a hobby, only if his profile says what it is — horizontal 3:2
With Palor:
 8 meeting or talking at a known place — horizontal 3:2
 9 coffee or a meal together — horizontal 3:2
10 walking together (street, park or vehicle) — horizontal 3:2
11 selfie together — vertical 2:3
12 an activity together (training, work, game, party) — horizontal 3:2
Two other characters together: ONLY for these pairs: [PÁROK – ide írd, pl. Norbi + Péter; ha üres, hagyd ki]
13 the two talking at their shared place — horizontal 3:2
14 working or doing something together — horizontal 3:2
Shirtless versions: make 11, 12, 13 and 14 a second time as 11b, 12b, 13b, 14b — the same men, place, light and framing, but bare upper body (his ordinary trousers or shorts and shoes kept on), relaxed and non-sexual, in a setting where that is natural (after training, beach, hot day, changing room). Nothing else changes.

STYLE
Photorealistic, natural light that fits the time of day, candid, no text, no watermark, no logos. Use only facts from the profile and appearance; leave unknown things neutral.

SAVING (after every single picture)
- Call place_play_asset with:
  target "picture",
  character_ids = everyone in the picture (scenes 1–7: [him]; 8–12 and 11b–12b: [Palor, him]; 13–14 and 13b–14b: [both]),
  content "non_intimate",
  label "felmeztelen" for 11b, 12b, 13b and 14b (no label for the others),
  location_id only if the scene is at a place you know from the app,
  image = the picture you just generated (attach it as the file parameter),
  model "ChatGPT".
- If attaching is not possible: upload it with begin_media_import (character_ids as above) → begin_media_upload → upload_media_chunk (all chunks) → finalize_media_upload, then place_play_asset with target "picture", the same character_ids, content and label, and media_id = the committed media id.
- A picture counts as saved only when the result has a "file". If saving fails, write the exact error and continue with the next picture.
- If the image generator declines something, write "elutasítva" with the reason and continue. Never reword a request to get around a refusal.

HOW TO WORK
One character per answer: generate and save his pictures (1–12 and 11b–12b, skipping what is impossible; 13–14 and 13b–14b only for the listed pairs), then stop and wait until I write "tovább".
AT THE END of each answer: a short Hungarian list per picture: saved file name, or skipped / declined / failed with the reason.
```
