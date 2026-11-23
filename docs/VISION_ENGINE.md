# Vision engine for tag / sort / auto-canon

**Rule (owner, 2026-11-10; replaces the 2026-11-06 gpt-6.1-sol lock):** each job uses the model
best suited to it (local or cloud) by measured quality, cost, privacy and whether the provider
allows the task. A change of model for a job is benchmarked and recorded in `DECISIONS.md`;
results keep model/method/version in provenance. Never reword a request to get around a refusal.

## Engines (current choice per job)

| Job | Provider | Model ID | API | Output | Why |
| --- | --- | --- | --- | --- | --- |
| **Tagging** (scene, people regions, camera, reference coverage, bilingual labels) | OpenAI | `gpt-6.1-sol` | `POST https://api.openai.com/v1/responses` | `world-v1` JSON (`app/world-v1-contract.json`) | works; measured ≈ $0.02–0.03 per picture |
| **Video content level** | OpenAI | `gpt-6.1-sol` | same | `world-v1` per still (`app/run-video-analysis.mjs`) | same contract as pictures |
| **Character identity – face** | local | InsightFace buffalo_l (SCRFD det_10g + ArcFace w600k_r50) | `app/local-identity.mjs` (offline) | cosine similarity per offered character | OpenAI refused identity matching (40/40, 2026-11-10); local benchmark: 82% hits, 0/38 false alarms at 0.30–0.35 |
| **Character identity – body** | local | DINOv2-small (interim) | same | cosine similarity | weak without person boxes; a better person re-ID model is an open choice |
| ~~Identity sort via cloud~~ | OpenAI | `gpt-6.1-sol` identity-v1 | kept for reference | | refused by the provider; not used |
| **Auto-canon** | chosen identity method + local gates | n/a | writes only via existing `saveCanon` / crop approve shape | immutable machine-attributed revision | gates unset until owner lock-in |

2026-11-22: separate quality-review workflow (`app/identity-quality.mjs`, Identity page) measures face and body independently, using the installed models, exact current approved-reference hashes/crops and an explicit per-person visible-body scope. Its body method is `local-dinov2-small-crop-letterbox-v1`: aspect-preserving input, never an automatic identity verdict. Old running identity methods and thresholds are unchanged. Human face/body output reviews are separate, attributed and never canon promotion. A changed source/reference/revision invalidates pending review.

Bounded local benchmark (12 approved body references selected, 11 usable; original-source duplicates excluded): 7 positive and 47 negative pairs. At similarity 0.8, hit rate 0.286 and false-alarm rate 0.085; at 0.9, no hits. This sample does **not** establish reliable body identity or anatomical proportions. No threshold is selected and no auto-canon gate is enabled. Private report: `%LOCALAPPDATA%/LivingUniverse/reports/body-quality-2026-11-22.json`. A stronger body method and a larger reviewed benchmark remain open; a new model installation requires separate owner authorization.

Settings for tagging match the already-approved library plan: `image_detail: high`, `reasoning_effort: medium`, `max_output_tokens: 8192`, `result_contract: world-v1`. Env key: `OPENAI_API_KEY` (app process only; never Git / MCP tunnel).

Why this stack: the collection already has a paused/partial **Sol world-v1** tagging contract and review UI. Reusing it avoids a second incompatible label schema. Grok remains fine for chat/MCP; it is **not** the catalogue tagger here.

## Video sampling (owner lock 2026-11-07)

Videos are not sent as continuous streams. Extract stills at **1 frame every
4 seconds** (e.g. 15 s → about 4 frames; 30 s → about 8). Also keep the **last
frame** when it is not already on that grid. Tag each extracted still with the
same world-v1 contract as ordinary pictures. Cap and provenance must record
source `media_id`, timestamps, and frame hashes.

Auto-canon from video frames stays **off by default** (prefer clear still
references). Generation-plan folders remain excluded.

Stills are extracted for free in the creator's browser (Kezdőlap › Helyi
médiaelemzés, `app/media-signals.mjs`), at most 12 per video, spread over long
videos. The paid step is `app/run-video-analysis.mjs` (`--estimate` first;
`--trial` with all three acks and `--max-usd`). `--plan minimal` sends only the
first, last and most different stills (about one per 6 s: 15 s → 3, 30 s → 5);
the default `lock` sends every saved still. Videos longer than 35 s are skipped
(owner decision 2026-11-10). Measured 2026-11-10 on the 390
videos: lock ≈ 1,924 stills ≈ $39; minimal ≈ 1,279 stills ≈ $26 (≈ $0.0205 per
still from the real usage of 1,376 tagged pictures, cached input at $0.10/M).

## Excluded from categorize / sort / auto-canon

Drawn **generation plans and idea sheets** under
`20_SHARED_MEDIA/Unassigned/Generation plans, ideas` are creator planning
material (`planning_only`). They stay in the library, but by default they are:

- omitted from **Needs sorting** (desktop + mobile)
- skipped by the vision trial CLI (opt-in only with `--include-plans`)
- skipped by character-sorting suggestions
- never eligible for machine auto-canon

They may still be browsed in the media library and filtered in AI-javaslatok as
`generation_plan`. Move other drawings/illustrations into that folder if they
should get the same treatment.

## How pictures are tagged

One paid call per image (JPEG/PNG, ≤20 MiB):

1. Send the image + fixed world-v1 prompt/schema (no biographies, no character names, no admin notes).
2. Model returns bilingual observations: background, tags, `scene_details.participants` `p1…p8` with optional normalized regions, activities/roles, camera enums, per-person face/body reference usefulness, content class.
3. Local `reviewRaw` validation rejects malformed JSON.
4. Results are proposals for **AI-javaslatok / world-review**. Accepting them still does not write visual canon.

Taxonomy mapping (angle / framing / clothing / …) stays a later apply step from accepted world fields onto `/api/taxonomy/apply`. World tags are the source of truth for this engine.

## How sorting and approval work

1. **Tag pass** finds people and crops (regions).
2. **Identity pass** sends the target image plus up to four **approved** face/body reference images per candidate character (1–5 candidates). Model returns per-participant `match` / `unknown` / `abstain` with separate face and body verdicts.
3. **Sort**: a `match` may create a depiction suggestion / assignment path (not implemented as a live batch writer in this commit’s CLI).
4. **Auto-canon**: only character-bound crops; whole multi-person frames never promote. Gates in `app/auto-canon-gates.mjs` / `docs/AUTO_CANON.md`:
   - writer disabled by default
   - numeric gates unset until benchmark lock-in
   - require existing approved face **and** body refs before machine appends more (human bootstrap)
   - abstain on overlap, missing region, or face/body failure for the requested role

## Cost (order of magnitude)

Using Sol Standard short-context list prices ($2 / $10 per 1M input/output) and the plan’s ~10k input-token/image allowance:

- Tagging alone ≈ **$0.10–$0.30 per image** depending on reasoning/output (prior live sample was ~$0.02–$0.03 early; richer world-v1 ran higher).
- Full library (~1400 images) tagging ≈ **~$30–$45** (prior owner budget was **$35** total local cap for the Sol run).
- Identity pass adds roughly **2–5×** image tokens when references are attached → budget separately before enabling.

Always run `--estimate` before `--trial`. No automatic retry after uncertain/failed paid calls.

## Operator commands

Reports must stay **outside OneDrive**.

```text
node app/run-vision-tag.mjs --estimate --config <local-config.json> --report <local\estimate.json> --limit 20 --max-usd 5

node app/run-vision-tag.mjs --trial --config <local-config.json> --report <local\trial.json> --limit 3 --max-usd 2 --ack-upload --ack-cost --ack-adult
```

Config needs absolute `database` and `mediaRoot` / `media_root`. Optional `auto_canon.writer_enabled` / `numeric_gates` stay off until you lock numbers after a held-out benchmark.

## Code map

- `app/vision-engine.mjs` — Sol world-v1 tag call + cost estimate
- `app/vision-identity.mjs` — identity-v1 compare call
- `app/auto-canon-gates.mjs` — promote/abstain policy
- `app/run-vision-tag.mjs` — estimate/trial CLI
- `app/world-v1-contract.json` — prompt + JSON schema extracted from the 2026-10-31 plan
- Import/review of full library runs remains `app/import-world-review.mjs` + world-review UI

## Still required before unattended full-library approve

1. Resume or rebuild the private world-library runner for the bulk Sol queue (previous runner lived outside this Git tree).
2. Held-out identity benchmark; owner locks numeric gates.
3. Explicit `writer_enabled: true` in local auto-canon config.
4. Separate cost ack for identity+canon traffic.

## Identity at work (2026-11-12)

The face method above now runs inside the app (view **Arcazonosság**, `app/identity-suggest.mjs`):
suggestions of who is in a picture, likely wrong links, and a consistency check of approved face
references. Suggestion thresholds: top score ≥ 0.50 (0.35 until the 2026-11-12 gate benchmark) and a 0.05 lead over the next character; a
reference "stands out" below 0.25 mean agreement with the character's other face references;
references of two characters closer than 0.45 are flagged as easy to confuse. These are review
aids, not auto-canon gates, which stay unset. Body similarity is not used here (still weak).

## Gate benchmark (2026-11-12)

`app/run-identity-gates-benchmark.mjs` (read-only, cached embeddings, report in
`%LOCALAPPDATA%\LivingUniverse\reports`). 59 usable approved face references of 30 characters;
1,274 pictures scanned (1,831 faces, 7 unreadable). Test sets: references leave-one-out (48),
one-face pictures linked to one character with references (397), and one-face pictures linked
to a character without any face reference (288, "unknown": any acceptance is wrong).

| Top score / lead | Linked: accepted (wrong) | Unknown: wrongly accepted | Wrong share of all accepted |
| --- | --- | --- | --- |
| 0.35 / 0.05 | 372/397 (0) | 75/288 | ≈ 17 % |
| 0.50 / 0.05 | 338/397 (0) | 28/288 | ≈ 8 % |
| 0.55 / 0.05 | 311/397 (0) | 13/288 | ≈ 4 % |
| 0.60 / 0.05 | 274/397 (0) | 3/288 | ≈ 1 % |
| 0.65 / 0.10 | 228/397 (0) | 1/288 | ≈ 0.4 % |
| 0.70 / 0.10 | 169/397 (0) | 1/288 | ≈ 0.6 % |

Same-person reference pairs: median 0.61 (lowest tenth below 0.13, i.e. some references disagree);
different-person pairs: median 0.05, 99th percentile 0.34, highest 0.67 (Dezső–Pákozdi). The
real risk is not confusing two known characters but taking an unknown face for a known one.
Linked pictures carry image-level links, so their "0 wrong" is an upper bound on quality, not proof.

## 2026-11-23: Next offline body-shape candidate

Owner approved the recommended SAM 3D Body ViT-H local trial and raised public downloads to 5 GB. This is a source/preflight candidate, not a live identity-method switch. Pinned source and cumulative artifact ledger stay in AppData; no private uploads, training, automatic identity passes or canon writes. The owner submitted the gated Hugging Face request; the authenticated page says Meta review is pending. Core CUDA transfers must be ported and CPU compatibility measured on this Windows/integrated-AMD host before a bounded reference trial. Existing face/body methods stay in place. Exact scope, source hash and blockers: [review](CONVERSATION_MODEL_REVIEW_2026-11-23.md), `ops/sam3d-body-plan.mjs`.
