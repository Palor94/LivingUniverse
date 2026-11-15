# ChatGPT – szereplő-alakok (felöltözött + félmeztelen sor)

Előtte: a Living Universe és a ChatGPT-alagút fusson az új kóddal (vezérlő [2]), a ChatGPT-ben
frissítsd a Living Universe csatlakozót. A ChatGPT csak a hiányzó alakokat készíti el, és maga
menti őket a `20_SHARED_MEDIA\Szereplő-alakok\<név>\` (felöltözött) és
`…\<név>\felmeztelen\` (félmeztelen) mappába, `alap.png`, `mosoly.png` … néven.

Egy alakot a program csak akkor ismer fel, ha a fájl neve a kifejezés neve (`alap`, `mosoly`,
`nevet`, `ideges`, `szomoru`, `meglepett`, `flortol`). A kézzel letöltött, leíró nevű fájlokat
(pl. Attila, Péter mappája) ezért át kell nevezni.

A ChatGPT képgenerátora csak a csevegésbe csatolt képeket látja. Ezért minden szereplő előtt
kér képet („Csatolj képet róla: <név>”); te választod ki és csatolod, és folytatja.
Ha nem akarod az adott szereplőt, írd: „kihagy”.

## Ezt másold be egy új ChatGPT-csevegésbe

```text
Use the Living Universe connector for this whole chat. Task: complete the Play-mode figure sets — for every character a dressed row and a shirtless row of full-body figures, plus a short waist-up intimate row made from the shirtless one — making ONLY the missing ones, and save every picture into the app yourself. Never ask me to download or save anything, except for the one reference step below.

REFERENCE PICTURES (your image generator only sees pictures I attach in this chat, not the ones the connector returns)
- Before a character's first figure, write one short Hungarian line: "Csatolj képet róla: <name>", then stop and wait. I choose the pictures myself; do not suggest or list any.
- When I have attached them, use exactly those attached pictures as the image inputs for all his figures in this answer.
- If I write "kihagy", skip him.

THE FIGURE TEMPLATE (identical for every figure, so the new ones match the existing sets)
- Photorealistic, one man, full body from head to toe with a little space above the head and below the shoes, standing upright, slight three-quarter turn, arms relaxed at his sides, looking at the camera.
- Soft even studio light from the front, no harsh shadows.
- Vertical 2:3. Flat chroma-key green background (#00B140) filling the whole frame, no floor line, no shadow, no props, no text, no watermark, no frame.
- Same camera distance and framing in every figure, so the figures line up when shown side by side.

THE TWO ROWS
- dressed: his everyday clothes from his profile and appearance (if unknown: plain, neutral everyday clothes).
- shirtless: the same man, pose, light and framing, bare upper body, his ordinary trousers and shoes kept on, relaxed and non-sexual.
- Within a row only the facial expression changes; clothes, pose and framing stay the same. The shirtless row matches the dressed row exactly except for the shirt.

THE INTIMATE ROW (for everyone who has shirtless figures)
- outfit "intimate": made from his shirtless figure — the same man, bare upper body, framed from a small margin above the head down to the waist, just below the navel. The picture ends there: nothing below the waist is in the frame. Same light, green background and three-quarter turn as his other figures. Calm, warm and non-sexual. The game fades it out softly at the waist.
- Expressions for this row: alap, mosoly, flortol only.
- Make it after his shirtless "alap" exists.

EXPRESSIONS (these are also the file names)
alap = calm, neutral · mosoly = warm smile · nevet = laughing · ideges = annoyed, slight frown · szomoru = sad · meglepett = surprised, eyebrows raised · flortol = confident, teasing half-smile.

IDENTITY
- Every character is an adult male. A non-human or fantasy male is shown as what he is, never turned into a human.
- Use ONLY the pictures I attached for him, plus his approved appearance text. Never invent a man from his name and never generate from text alone. If generation_ready is false or there are no usable references, skip him and say so.
- Keep the same source pictures for both rows. Never change his face, body, age or build.
- Do not change profiles, references or canon, and approve nothing.

STEPS
1. list_character_figures → the cast, in that order.
2. For each character: get_character_visual_pack; if he has missing figures, do the reference step first. figures.missing = missing dressed expressions; figures.shirtless.missing = missing shirtless ones; figures.intimate.missing = missing intimate ones. A character with nothing missing is skipped. Order: dressed row, then shirtless, then intimate; in each row "alap" first, then the others in the order above.
3. For each missing figure: start_generation_job with target "figure", character_id, expression and outfit ("dressed", "shirtless" or "intimate"). The brief gives the exact prompt, the references and the save target; follow it together with the template above.
4. Generate the picture natively in this chat.
5. Save it: finish_generation_job with job_id, outcome "done", model "ChatGPT" and image = the picture you just generated (attach it as the file parameter).
   If attaching is not possible: begin_media_import (character_ids: [him]) → begin_media_upload → upload_media_chunk (all chunks) → finalize_media_upload → finish_generation_job with outcome "done", media_id = the committed media id and model "ChatGPT".
   A figure counts as saved only when the result says "done" with a placed figure. If saving fails, close the job with outcome "failed" and the exact error in note, and continue.
6. If the image generator declines something, close the job with outcome "refused" and the reason in note, and continue. Never reword a request to get around a refusal. If it rejects the attached pictures themselves, stop his row and tell me; I may attach other pictures.

HOW TO WORK
One character per answer: ask for his references, wait for them, make all his missing figures, then stop and wait until I write "tovább".
At the end of each answer, in Hungarian: which dressed, shirtless and intimate expressions were saved, refused or failed (with the reason).
```
