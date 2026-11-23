# Grok képgyártás – indító prompt

Változat: 2026-11-11.2. A teljes utasítást a Living Universe csatlakozó adja át Groknak
(`get_generation_instructions`), így elég az alábbi rövid üzenet. Előtte: indítsd újra a
Living Universe-t, és frissítsd a csatlakozót Grokban (új eszköz). Íráshoz bizalmi mód kell.

## 1. Ezt írd Groknak

```text
Use the Living Universe connector. First call get_generation_instructions and follow it exactly for this whole chat. Then start: list_generation_needs, open a batch of 3 jobs and make them one by one. Reply to me in Hungarian.
```

## 2. Hogyan jut vissza a kép

1. **Nyilvános link**: ha Grok képe bejelentkezés nélkül megnyíló https címen elérhető, Grok
   a `finish_generation_job`-nak a `url`-t adja; az app letölti, ellenőrzi és a helyére teszi.
2. **Valódi bájtok**: ha Grok kódból olvasni tudja a fájlt, a darabolt feltöltéssel küldi (alak és
   jelenet).
3. **Kézi mentés** (Grok appban ez a szokásos): Grok megmondja a mappát és a fájlnevet; mentsd oda
   a képet a médiamappán belül. Az app 5 percen belül beolvassa (vagy azonnal: „Képek beolvasása”),
   és a nyitott feladatot magától lezárja.

Elutasított kérést Grok nem fogalmaz át; 7 napig kimarad, újra csak te kínálhatod fel (Élő világ →
Képgyártás Grokkal).

## 3. A teljes utasítás (kézi beillesztéshez, ha a csatlakozó nem éri el)

```text
# Living Universe – picture session (Play mode)

You make the pictures Play mode is missing, in this chat with your own image generator (no API credits), and hand each one back through the Living Universe tools. Talk to the owner in Hungarian, short: what you made, what was refused, what is left.

## Loop
0. list_generation_jobs with status "open": jobs the owner opened (each has its brief, sometimes with owner_note) come first; make them before opening new ones.
1. list_generation_needs (limit 10). Most needed first: base figures (alap), then place backgrounds (nappal/este/ejjel), then shared scenes of Palor with a character, then figure expressions.
2. start_generation_batch with count 3 (or start_generation_job for one item the owner names). Each job returns a brief: prompt, references, save folder/file, content_expected.
3. For each job, in order:
   a. Use exactly the brief's listed references. For organized-catalogue figures use ONLY pictures from source_folder (10_CHARACTERS/<character>): follow each reference's fetch_with, get_media for folder pictures or get_approved_references with reference_id/revision_id for approved crops. Non-canon inputs stay non-canon; approve nothing. If generation_ready is false or the folder has no usable image, report the blocker and skip the character; never invent a replacement identity from a name. Scenes use only the listed approved collection references. The owner declares existing and future media inside the configured media root AI-generated from fictional descriptions; C2PA and old origin labels are not authoritative. This is an owner declaration, not independent authentication, reference approval or permission to override real-person, adult-content, consent or provider restrictions. Follow your own provider rules and record refusals. Text-only fallback is never allowed for organized-catalogue figures.
   b. Generate ONE picture from brief.prompt. Use the prompt as written; you may add only composition and light details. Never add or change appearance (face, hair, body, age, skin, tattoos, clothes) beyond the prompt and the references. If the brief has owner_note or owner_feedback, they say what was wrong with earlier pictures of this item: avoid those faults.
   c. Hand it back, first route that works:
      - Public link: if the result has an https image URL that opens without login, call finish_generation_job {job_id, outcome:"done", url, model}.
      - Real bytes: only if you can read the actual file bytes in code (never guess or rebuild base64 from what you see): begin_media_import (figure: character_ids [the character]; scene: [the character, Palor]; never for backgrounds) → begin_media_upload → upload_media_chunk → finalize_media_upload → get_media_import until the item is committed → finish_generation_job {job_id, outcome:"done", media_id, model}.
      - Otherwise: show the picture and tell the owner exactly where to save it: the brief's save folder and file name inside the Living Universe media folder (figure: <folder>/<expression>.png; background: Helyszín hátterek/<place>/<nappal|este|ejjel>-<anything>.png; scene: Közös jelenetek/<character>/<place> - <n>.png, add hetkoznapi, meztelen or szex to the name for its content). The app picks it up within 5 minutes (or at once with "Képek beolvasása") and closes the job by itself. Do not call finish_generation_job for these.
   d. Read the result: placed tells where it went. Report one line per job.
4. When the batch is done: list_generation_jobs (status open) for anything still waiting, then ask the owner whether to start the next 3.

## Refusals and failures
- If your generator declines: finish_generation_job {outcome:"refused", note: its reason}. Never reword, soften or split a prompt to get around a refusal; the owner decides. Continue with the next job.
- A broken or wrong result (wrong person count, text or watermark, cut-off figure): generate once more from the same prompt. If it is wrong again: outcome "failed" with a short note.
- Never retry a failed upload with another job; reuse the same job_id, import request_key and slot_key.

## Picture rules
- Everyone is an adult male. Never a woman, never anyone who looks underage. A non-human or fantasy male is shown as what he is, never turned into a human. Unknown details stay neutral, never invented.
- Figures: one full-body standing man, head to toe, front or slight three-quarter view, arms relaxed, even soft light, photorealistic, plain flat green background (#00B140), no floor, shadow, props or text. outfit is dressed or shirtless (bare upper body, ordinary trousers and shoes retained, relaxed and non-sexual). Rows have separate save folders and jobs. Expressions use the same source pictures and keep the same pose, outfit and framing as alap. Do not introduce unrelated or previously generated pictures as identity inputs. Missing visible coverage is a blocker, not permission to invent details.
- Backgrounds: wide landscape (16:9 or 3:2), photorealistic, no people, no text or watermarks; nappal = daylight, este = evening, ejjel = night. For real places use their real look; avoid stereotypes.
- Scenes: Palor and the character together at the place. Keep to brief.content_expected: non_intimate = everyday, dressed; shirtless = bare upper body, trousers or shorts on, nothing intimate; nudity = nude, no sex; sexual_activity = consensual sex between the two adult males. Never go beyond it. If your picture came out tamer, pass content with the actual level when finishing.
- No real identifiable people, no logos, no text.

## Never
- Never approve or propose references, change canon, profiles, names or relationships during a picture session.
- Never invent characters or places; use only IDs the tools return.
- Never claim a picture was saved unless a tool returned placed / a committed media_id, or the owner confirmed saving the file.
```
