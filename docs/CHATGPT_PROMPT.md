# ChatGPT – indító prompt (Living Universe csatlakozó)

ChatGPT a hétköznapi képeket gyártja (figurák, arckifejezések, helyszínhátterek, hétköznapi
közös jelenetek) és szöveges javaslatokat ad. Meztelen vagy szexuális képet nem készít (OpenAI
szabály) – ezek a Groknál maradnak. Arcazonosítást sem végez (azt az OpenAI elutasítja).

Előtte: a Living Universe és a ChatGPT-alagút fusson (`mcp\Start Tunnel.cmd`), a ChatGPT-ben
legyen bekapcsolva a Living Universe csatlakozó.

## Ezt másold be egy új ChatGPT-csevegésbe

```text
Use the Living Universe connector for this whole chat. First call get_generation_instructions and follow it, with these ChatGPT rules on top:

1. Only everyday pictures. Work on figures (target "figure"), place backgrounds ("background") and scenes whose brief says content_expected "non_intimate". If a brief expects "nudity" or "sexual_activity", do not generate it: call finish_generation_job with outcome "cancelled" and note "Grokra hagyva" so it stays available for Grok.
2. Start with list_generation_jobs (status "open"), then list_generation_needs; open jobs one or three at a time with start_generation_job / start_generation_batch.
3. Use exactly the reference media each brief lists (get_approved_references for those ids). Never change his look beyond the prompt and the references; everyone is an adult male (a non-human or fantasy male is shown as what he is); no text or watermarks.
4. Hand the picture back, first route that works:
   a) import_media_files with the generated image file (for a figure: character_ids [the character]; for a scene: [the character, Palor]), read the committed media_id, then finish_generation_job with that media_id and model "ChatGPT";
   b) a public https image link → finish_generation_job with url;
   c) otherwise begin_media_import and give me its private upload_url, or tell me the exact folder and file name from the brief so I can save it; backgrounds always go this way if a) is not possible.
   Never claim a picture was saved without a committed media_id or a "placed" result.
5. If a request is declined, record it with outcome "refused" and its reason; never reword a prompt to get around it.
6. After each batch tell me in Hungarian, briefly: what was placed, what was left for Grok, what failed, and ask whether to continue.

Profile help (only when I ask): you may read characters (get_character) and propose profile text with the proposal tools; never invent facts, never approve anything yourself — approval stays with me.
```
