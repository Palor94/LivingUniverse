# Image protocol for Élő világ / Játék (2026-11-10)

How pictures are made, inserted, placed and gated in Play mode. All routes are free
(Grok app or own photos); the paid image API is never used here.

## 1. Kinds of pictures

| Kind | Folder (inside the media root) | Used for | Becomes canon? |
|---|---|---|---|
| Place background | `…/Helyszín hátterek/<place>/` (`nappal`, `este`, `ejjel` in the name pick the time of day) | scene backdrop, town cards | no |
| Character figure | `…/Szereplő-alakok/<character>/alap.png` (+ `mosoly`, `ideges`, …) | standing figures in scenes | no (display asset; catalogue scan skips the folder) |
| Shared scene | `…/Közös jelenetek/<character>/<place> - <n>.png` | photo scenes and "Közös fotók" with Palor | no |
| Own catalogue photos | wherever they are | photo scenes, shared photos | unchanged |

Prompts: Élő világ → readiness → "📋 Alak-prompt"; place screen → "📋 Háttér-prompt";
conversation → "📋 Jelenet-prompt"; Grok MCP: `list_character_figures`, `get_scene_prompts`,
`list_locations`, `import_location_background`. Prompts use only approved appearance and
approved references; never invent a look; everyone is an adult male (a non-human or fantasy male is shown as what he is).

## 2. Insertion

- Folder watchers (start + every 5 min, or "🖼 Képek beolvasása"): backgrounds, figures, scenes.
- In-game uploads: place background ("🖼 Háttérkép feltöltése"), scene ("➕ Kép a jelenethez").
- Checks: decoded JPEG/PNG ≤ 20 MiB, inside the media root; a new character figure replaces the previous one of that expression (the old file is backed up under the local backups\figures folder), backgrounds and scenes never overwrite; identical bytes reuse
  the existing media; friendly names; every insertion is logged (`play_inserts`, Élő világ list).

## 3. Placement

- Backdrop: a location shot of the exact place matching the time of day, else the best photo of
  the place or its sub-places; photos with people are blurred (atmosphere only).
- Figures stand on the backdrop; the speaker steps forward; the AI may pick a saved expression.
- Photo scene order: this place → (intimate scene ? intimate first : everyday first) → match to
  the conversation words → unseen before seen → with Palor. Speech bubbles point at the confirmed
  p1/p2 box, else the left/centre/right side; bubbles never overlap.

## 3b. Grok pipeline over MCP (2026-11-10)

`list_generation_needs` → `start_generation_job` / `start_generation_batch` (brief: prompt, allowed
references, save target) → Grok generates natively → uploads the bytes with the existing media
import tools → `finish_generation_job` (or `place_play_asset`). The app copies the picture into
Szereplő-alakok / Helyszín hátterek (`nappal-…`, `este-…`, `ejjel-…`) / Közös jelenetek, never
overwriting; the uploaded source stays in the catalogue with a note and is never shown again as a
photo of the character (`play_asset_sources`). Also: `get_generation_brief`,
`get_character_visual_pack`, `get_character_origin`, `list_generation_jobs`; owner panel in Élő
világ ("Képgyártás Grokkal").

**Start and hand-back (2026-11-10):** Grok reads the owner's standing instructions with
`get_generation_instructions` (text in `app/generation-playbook.mjs`, pasteable copy and starter
message in `docs/GROK_GENERATION_PROMPT.md`). A result comes back by public HTTPS `url` on
`finish_generation_job`/`place_play_asset` (SSRF-safe download, decoded, 20 MiB), by chunked upload,
or by the owner saving it into the brief's folder: open jobs whose picture arrived that way close
themselves.

**Refusals:** a declined generation is recorded (`refused`, with the reason) and skipped for 7
days. Nothing rewords a prompt to get around a refusal; only the owner can offer it again.

**Collection-origin rule (owner, 2026-11-11; supersedes the C2PA gate):** the owner
declares the existing and future images/videos inside the configured Living Universe media
root AI-generated from fictional descriptions. Directory membership defines the declaration's
scope, not cryptographic proof. Active files must actually resolve within that root; missing
files, path escapes and symbolic links/junctions do not qualify. No media bytes are read for
this classification, including cloud placeholders.

Old origin labels, camera-like metadata, missing/invalid C2PA and `media_provenance` cache
entries are historical only. They are neither consulted nor overwritten by this rule. The
read-only origin response identifies `origin_basis:owner_declaration`,
`independently_verified:false` and a versioned `origin_policy`. A reliable authentication
procedure remains future work.

References still require a current approved selection and character assignment. Keep exact
reference IDs, crops and source hashes; existing delivery/generation integrity checks remain.
Approved historical videos remain stored but are not offered as still-image generator inputs.
Candidates/imports/folder inputs do not become canon. Characters with assigned in-scope media
have a declared fictional origin; free-text biographies and old origin fields do not authorize
use. A character with no in-scope media stays text-only/everyday. Organized figure inputs keep
their separately authorized character-folder rule and block when that folder is empty.

**Origin is separate from usage permission.** The declaration never establishes real-person
consent, adulthood, provider permission or canon approval. Existing content/consent rules,
provider refusals and separate external-upload/cost approval remain in force.

## 4. Content gate (intimacy protocol)

Content level per picture: world-review analysis (`non_intimate` / `nudity` /
`sexual_activity`), else the owner's mark (☀ 🔥 🔞 in the photo viewer, or `hetkoznapi` /
`meztelen` / `szex` in the file name). Unanalysed and unmarked pictures and all videos count
as intimate.

| Stage | When | Allowed |
|---|---|---|
| none | adult switch off, or open hostility (level -2) | everyday pictures, normal talk |
| flirt | switch on, level -1..0 (strangers, tense) | + nude pictures, sexually charged talk |
| intimate | switch on and level ≥ 1, or an intimate moment with Palor in the last 14 days | + sexual pictures/videos, sex scenes with explicit profile fields (in person) |

Owner decision 2026-11-10: the game is NSFW from the start, so the switch is **on by default**.
Scenes are written openly; the only rules are adults and the character's own will (he may say
no). The owner switch always wins. With the switch off, the journal and the story export keep
intimate moments but hide their details. The off-screen world may also have sexual events
between characters (`intimate:true`).
