# Development plan

## Separate direct-ai Linux port, 2026-10-31

Compatibility changes are isolated on linux-compatibility-direct-ai from snapshot
18a04672c8e20f8295a7a37efecf1d7c196d2d33. Portable decoding, explicit runtime
config/credential scopes, a new preprocessing cache identity and source-only lab
packaging are implemented. Windows portable-backend regression: 279/279 passed.
Actual Linux, native services and the manual runner lifecycle remain unverified.
No main schema merge, deployment, provider call or live worker change occurred.

## 2026-10-31: Expanded Sol-medium processing resumed under explicit start instruction

The user explicitly requested starting after agreeing scope, candidate retrieval
and 35 USD total budget. Prepared and approved a new 1432-image exact active
scope, including all 111 planning images and Needs sorting. Three exclusions:
missing, unsupported and a changed previously paid source. Its stale projection
was removed. Reused 12 unchanged results; retained the old failed attempt without
retry. All 16 previous receipts and cost 0.3474455 USD remain accounted for.

The new scope filters pending queue/status queries, retains old copy manifests for
one-way deletion retention, archives immutable previous plans/approvals and clears
pending inclusion markers. Provider/wire settings remain unchanged; global cap 35.
The worker includes a planning asset in the first three-item schema gate.

Three initial results saved, then a local SQLite conflict stopped the first worker.
Resumed only untouched items after adding a 5000 ms SQLite busy timeout; all calls
were settled and none retried. The replacement worker passed its first batch and
continued into the next batch. Startup checkpoint: 22 succeeded current results,
1 previous failure, 1409 queued, 27 total paid attempts, known cost 0.5637896 USD,
no unknown outcomes. Two real planning/pose candidates are retrievable locally.

Full synthetic regression 271/271 passes. Background processing and temporary
system sleep inhibition are active; standalone progress/deletion retention remains
on the existing local URL. This is running work, not completion or live deployment.


## 2026-10-31: User increased total local library budget to 35 USD; pause retained

Recorded explicit 35 USD total-budget amendment against the immutable original
plan hash; prior spent cost is included, leaving 34.6525545 USD locally. No
transfer scope expansion or resume permission. The global next-transfer guard
and review UI use the validated amendment while old exact approval/provider
specifications remain unchanged. Focused budget/retrieval tests 4/4 pass.
The review-only process was refreshed; paid attempts remain 16 and analysis paused.


## 2026-10-31: Proposed-label candidate retrieval verified without resuming analysis

User approved using machine labels as search hints, requested the saved-result
retrieval trial and refreshed budget check. Implemented a read-only local retrieval
prototype with multi-character/facet/camera filters, explained matches, explicit
no-match and unreviewed/uncertain warnings. No automatic acceptance; named
per-figure role requests require reviewed bindings, without face recognition.
Existing low-level accepted-only defaults remain unchanged. MCP deployment pending.

Actual saved-index trial: 13 retained active results; character/portrait and
character/activity/setting/view queries each found the intended saved result.
Plan/pose query correctly found none because planning images remain unanalyzed;
positive plan isolation is covered synthetically. No new model call, image-content
read, approval or live write. Private local report is available beside progress.

Fresh metadata scope: 1435 active images, 1433 local extension-supported candidates,
1419 unattempted candidates. Extrapolated additional cost 31.0750 USD, total 31.4225
including spent 0.3474455; this is not a guarantee. Budget remains 30 USD and may
stop before completion. The user's analysis pause remains in force.


## 2026-10-31: Current collection is character-focused; standalone backdrops are future scope

The user clarified that they have only gathered characters so far and have not
yet sought standalone location pictures, backdrops or backgrounds for the world.
Keep the current scope to character media plus the explicitly selected generation
plans. Observed backgrounds in character images still support scene compatibility;
they do not establish an existing backdrop library or exact-world-place identity.
Standalone location/background acquisition and retrieval are a later extension.
No new search, import, image analysis or paid run is started. The pause remains.


## 2026-10-31: AI retrieval is the central acceptance criterion

The user clarified that the purpose is easy world-building placement and retrieval
of character media, later location media: the AI must know which resource to query
and which structured criteria to use. Recorded the retrieval contract and current
gaps in docs/WORLD_MEDIA_RETRIEVAL.md. Preserve stable character/media/place links;
distinguish image-level assignment from per-figure identity, and known exact places
from compatible setting hypotheses. Return explained matches and explicit no-match.

Existing MCP character/media/reference reads do not yet expose the full new local
world index. The capability directory, integrated filtered search and reviewed
participant/place bindings are remaining work, not claimed deployed behavior.
Paid analysis remains paused. This turn made documentation changes only.


## 2026-10-31: User-moved generation-plan folder reconciled

Updated the explicit planning-purpose rule and private pending supplement to
20_SHARED_MEDIA/Unassigned/Generation plans, ideas. All 111 JPG candidates exist
at the new path, match the previously recorded sizes and now have existing active
catalogue IDs. Preserve those IDs; no import, image read, copy or model call.
The approved 1119-image snapshot and paused state remain unchanged. Expanded run
inclusion is still pending. Focused purpose/world checks pass 6/6, including old
path and unrelated Unassigned-image exclusion.


## 2026-10-31: Planning/comic folder purpose prepared without resuming analysis

The user explicitly kept analysis paused and added the Incoming generation-ideas
folder as unrealized plans/action schemas for future generation. Found 111 JPG
candidates; none is currently catalogued, hidden or part of the approved 1119-image
snapshot. Recorded a private pending-inclusion supplement containing metadata only;
no import, copy, visual inspection or API call occurred. Old plan/approval unchanged.

Implemented an explicit folder-intent layer separate from model observations:
generation_plan, planned, planning_only, with conditional action/pose/composition/
scene-idea usage labels. Generation-plan search includes these assets; story-scene
and character-introduction selectors exclude them even after generic review. This
is not an inference that illustrated events happened or figures have known identity.
The local review shows a planning badge/filter and pending supplement notice.
Future old-snapshot execution is blocked while this required addition is pending.
No paid run is resumed. See docs/WORLD_MEDIA_TAGGING.md for remaining inclusion work.


## 2026-10-31: User-paused library run and live-deletion retention enabled

The user requested a pause and matching analysis-copy deletion. The worker stopped
at OPERATOR_PAUSE: 15 successes, 1 invalid result, 1103 untouched items, 16 attempts,
0.3474455 USD known cost and no unsettled calls. Sleep inhibition ended. Do not
resume without a later explicit user instruction.

The standalone local review process now follows actual live-catalogue deletions
query-only every three seconds, even while analysis is paused. Purge only matching
current-run copies, visual observations/proposals/cache and world/search projections;
keep immutable approval and sanitized cost receipts. Tombstones prevent accidental
recreation or upload after restoration. Source path/hash checks refuse unsafe or
changed targets. Offline files remain distinct from removed catalogue entries.
Future workers reconcile before batches/transfers and discard late removed results.
No production deployment, original-file operation or automatic paid restart.

Full synthetic suite 265/265 passes. The actual current-run owner comparison found
no newly removed assets, so no real image copy needed deletion at activation.
The local status/review endpoint remains on the existing port. See
docs/WORLD_MEDIA_TAGGING.md for scope, limitations and verification.


## 2026-10-31: Explicitly approved full Sol-medium world-library worker started

The user explicitly approved the exact 1119-image OpenAI transfer, world-v1
contract, 30 USD local budget guard and temporary system sleep inhibition.
The prior exact-transfer approval block is resolved. The matching approval was
persisted privately and one hidden background worker started; sleep inhibition
is verified active. No production rollout or live-catalogue migration occurred.

The first three-image schema gate passed and the next processing batch started.
At the initial health check four results were committed and indexed, none failed,
with 0.0934507 USD known token cost and one additional request in flight. Progress,
usage, source-bound results and bilingual/faceted index are durable in the private
run folder. This is a startup checkpoint, not completion of the full collection.

The frozen snapshot contains 1119 images from 1121 active image records; one
missing file and one unsupported WebP remain recorded exclusions. Twenty-one
transient SOURCE_CHANGED reads were refreshed locally before approval. Keys,
images, names, IDs, hashes, raw results and runtime paths remain outside Git.
Full synthetic regression 261/261 passed before launch; an additional escaping
test and the focused world/guard checks also passed. See docs/WORLD_MEDIA_TAGGING.md.

## 2026-10-31: Approved Sol-medium/Astra-low follow-up completed

Ten single calls on the same selected adult-context images returned valid structured
results, with matching models and verified usage; cost 0.5213984 USD. Reused Sol-low
baseline locally without resubmission. Original/copy hashes, live invariants and
isolated database integrity held. Full synthetic suite 255/255 passes.

Metadata-only library preflight found 1119 locally available supported-extension
candidates among 1121 images; one missing and one WebP remain excluded. Content,
dimension and decode checks remain mandatory. Full-library paid processing has
not started; model/settings, exact scope and budget still need selection.
See docs/CLOUD_SCENE_PREVIEW.md for measured costs, extrapolations and boundaries.

## 2026-10-31: First explicitly approved Terra/Sol image comparison completed

The user approved the exact five-image/two-model upload and displayed budget.
Ten single attempts completed with valid structured results, matching model IDs
and usage receipts; no retries or cache hits. Calculated token cost 0.1210716 USD
(Terra 0.0328072, Sol 0.0882644), total elapsed 159.6 seconds. This is technical
completion, not a measured accuracy ranking. Human review remains necessary,
especially for uncertain activities and participant role/identity mapping.

All original/copy hashes and selected live-catalogue invariants held. Separate
test catalogues passed integrity/foreign-key checks. Private side-by-side results
include model-proposed figure regions; no automatic tag/canon acceptance or live
deployment. Existing 253/253 synthetic regression remains the code baseline;
the new local report renderer was syntax-checked and verified on the completed
private artifact without another API call. See docs/CLOUD_SCENE_PREVIEW.md.

## 2026-10-31: Optional scene contract and exact cloud preview ready

Implemented scene-v1 on the existing provider/queue/result/export/restore path:
non-exclusive compatible environments, anonymous per-activity roles, proposed
narration-only reference use and read-only desktop review. Additive JSON only;
standard mode remains default. Cloud detail/reasoning settings and actual usage
are request/cache-bound. The dedicated Windows key loader never modifies global
environment or production enablement. Full synthetic regression 253/253 passes.

The bounded five-image/two-model preview is ready with exact request hashes,
0.7344 USD conservative token estimate and a proposed 2 USD approval budget
(not a hard provider billing cap). Execution requires separate exact upload,
cost and adult-context approval. Two free model metadata checks succeeded; no
paid inference or external image upload occurred. See docs/CLOUD_SCENE_PREVIEW.md.

## 2026-10-31: Scene-focused private comparison preparation

Recorded user requirements and prepared a bounded private metadata candidate
list. Existing multiple-location links represent confirmed associations, not
uncertain compatibility. A new reviewed result contract for compatible settings,
activity-specific participant roles and simulation usage restrictions is still
needed before the Terra–Sol comparison. Participant identity mapping needs
explicit spatial/user context; image-level assignments do not identify each
figure. Credential setup and exact cloud transfer/cost preview also remain.
No actual model call, media upload, live write or simulation rollout occurred.
See docs/SCENE_TAGGING_PILOT.md for the proposed contract and scoring criteria.

## 2026-10-31: User-directed environment, action and camera/reference focus

Default analysis goals now cover general environment, visible action, camera
angle, framing and practical reference use. Clothing, expression, static pose
and lighting remain optional. Prompt media-analysis-3 and schema hashes separate
the new cache; the existing queue, matching, human approval and undo stay shared.
Action/reference-use reuse existing vocabulary groups; a reference-use tag never
approves canon, reference membership or sorting. No SQL migration was added.

A separately authorized local three-image pilot left live records and originals
unchanged. The focused repeat returned one schema-valid and two INVALID_RESULT
responses in 162.1/180.6/193.8 seconds; the valid result still misclassified an
action. This model is not validated for unattended tagging. Private evidence
stays outside Git/OneDrive and the own Ollama process was stopped. See
docs/ANALYSIS_TAG_FOCUS.md and docs/PRIVATE_LOCAL_PILOT.md. No production rollout,
cloud transfer, paid call, push or main merge is implied.

Focused synthetic regression 61/61 and full regression 235/235 pass. The private
pilot remains manual and is never launched by the automated test glob.

## 2026-10-30: First separately authorized real local vision trial

Installed a verified portable Ollama 0.40.13 and pinned Qwen3-VL 2B Instruct
Q4_K_M outside OneDrive with explicit user approval. Real CPU inference through
the existing application queue exposed repeated labels and an invented place ID;
validation correctly rejected the latter. Ground the schema in the Ollama prompt,
use media-analysis-2 with compact fields, null tag IDs and no exact-place outputs
without approved place context. Preserve the mock and normalized result contract.

The corrected three-image synthetic trial completed with valid structured
responses in 65.7/71.1/43.8 seconds; all originals/catalogue invariants held.
Model quality remains poor (bilingual contradictions and wrong scene category),
so this is transport validation and a qualitative smoke trial, not an accuracy
benchmark or production recommendation. Full regression 230/230, focused 56/56.
The isolated server was stopped; no production configuration, private images,
paid calls, deployment or main merge. See docs/REAL_OLLAMA_TRIAL.md.

## 2026-10-30: Direct media analysis adapters implemented with fixture verification

On `codex/direct-ai-model-adapters`, the existing mock/review queue now accepts
explicitly configured local Ollama vision and OpenAI Responses adapters. Both
default off. Added bounded interruptible HTTP, pinned local model digest and
cloud snapshot, strict output schema, input/config-bound cache, source/derivative/
request previews, separate cloud upload/cost acknowledgement and durable approval.
Interrupted cloud attempts are never automatically resubmitted, across pause,
cancel, restart and restore. Existing catalogue approval/undo stays shared.

Baseline 190/190, final 229/229 tests; 39 added adapter/UI tests. Real Windows
derivation is checked on synthetic BMP; Ollama HTTP is a synthetic loopback server,
OpenAI is fixture fetch. No new migration, model installation/inference, private
upload, payment, deployment or main merge. See docs/DIRECT_AI_ANALYSIS.md for the
file list, rollback, exact limits, main-branch divergence and first real-trial needs.
Next is a separately approved small benchmark after model/hardware/license or
cloud model/pricing/data-transfer checks; fixture success is not model accuracy.

## 2026-10-30: Hierarchical Locations implemented in development

Completed: parent/child catalogue tree, same-name places under different parents,
qualified Hungarian breadcrumbs and optional English names, explicit subtree
reparenting, interactive desktop/mobile editor, safe migration 022, verified
pre-migration backup, portable old/new restore and guarded undo/downgrade. Exact
background assignments preserve character sorting roles and completion. Existing
IDs, media/event links, notes and canon remain intact. The canvas stays a separate
plan. Full suite: 174 passing tests, including 13 new hierarchy tests; prior phase
baseline: 161 passing tests. No production deployment or live-data migration.

Operation and recovery: docs/LOCATION_HIERARCHY.md. Next: implement the mock-adapter
analysis job/review foundation described in docs/AI_MEDIA_ANALYSIS_PLAN.md.
Actual model selection, reference-based exact-place recognition and optional
external API access remain later, explicitly evaluated steps.

## 2026-10-30: Media Notes hashtags and bilingual vocabulary

Implemented and tested on a separate development branch: automatic deterministic
hashtag matching on desktop/mobile note saves, Hungarian display names, explicit
English equivalents and aliases, stable IDs, duplicate prevention, unknown and
ambiguous proposals, and exact-location exclusion. Added dry-run review, migration
021, verified pre-migration backup, guarded export/restore and selective rollback.
All 161 tests pass, including 12 new feature tests. No live database or originals
were used; no production deployment or paid/provider call occurred.

Operation, limitations and changed components: docs/MEDIA_NOTE_TAGS.md.
Next-phase design: docs/LOCATION_TREE_DESIGN.md. Recommended next increment is a
read-only location inventory/preflight and qualified breadcrumb reader. Location
schema migration and canvas promotion remain unimplemented.

## Media-library phases requested by the user

Phase 1 implemented: page-scoped checkbox/Ctrl/Shift selection, additive bulk character assignment, additive tags with explicit tag removal, explicit categorization completion, status filtering, and a fixed filtered sequence with save-and-next/previous. No physical file operations or canonical changes occur in these bulk actions. Completion is persisted in one additive table and included in exports. See README for use and migration rollback.

Phase 2 implemented: mandatory folder preview/confirmation with counts and representative samples; metadata-based scan reports; retained missing/unavailable records; staged possible moves and explicit path relinking or import-as-new. Current canon is fingerprint-checked before relinking. Two additive observation tables are included in backups, with rollback scripts.

Phase 3 implemented: optional folder-scoped or collection-wide SHA-256 analysis, browser-local versioned dHash image fingerprints, cached results invalidated by live file metadata, and paginated manual exact-group/similar-pair comparisons. Windows cloud recall flags gate uncached reads unless downloads are explicitly enabled. No automatic file or metadata merging/deletion. Crops and substantially changed generations remain a limitation of the initial visual hash.

Phase 4 implemented: custom grouped vocabulary, stable tag IDs with editable names/groups, single-item and additive/removal bulk labels, structured filtering/search, and explicit legacy-text mapping that retains original text. Optional structured labels remain separate from character links and canonical reference approval. Additive migration and export support preserve older data.

Phase 5 review foundation implemented: optional local approved-reference hash suggestions with provenance, manual multi-character additive acceptance, rejection/reopening, separate human face/body feedback, suppression of repeated rejected evidence, stale-evidence checks, and export/restore. This baseline is not AI recognition. Local learned encoders, local vision-language models, and external APIs are compared in `docs/ASSISTED_SORTING.md`; actual AI model selection, a held-out benchmark, and provider connection remain pending the user's preference. No external upload, paid call, model installation, automatic assignment, or canon mutation is enabled.

## 1. Character identity library: first useful prototype

Implemented in the first local build: editable characters/profiles, folder discovery and explicit assignments, shared media, sorting inbox, tags and notes, directed relationships, per-character reviews, versioned canon, reference integrity checks, side-by-side reference comparison, export/restore, and a laptop launcher. Integration checks cover persistence, canon boundaries, shared assignments, missing originals, video range delivery, and restore. Face/crop tools, richer feature fields, duplicate reconciliation, and bulk individual selection remain later increments.

- Create and edit characters with stable IDs and intentionally incomplete profiles.
- Catalogue selected existing images without moving originals or assuming approval.
- Tag face/body, expression, angle, clothing, and other user-defined features; allow multiple characters and character-specific regions in one image.
- Draft, approve, and inspect versioned appearance profiles and reference memberships.
- Import externally generated results; approve, reject, rate, and annotate each depicted character separately.
- Compare references and outputs side by side, including full-body views.
- Export and restore the catalogue, canon history, review history, and media manifest.

Acceptance: changing a name preserves links; approval survives restart; rejecting an output leaves canon unchanged; approving an output does not promote it; a canon revision leaves earlier generation records intact; missing media is reported; backup restores working links. Confirm those behaviors with focused integration checks when implemented.

## 2. One reference-aware image provider

Implemented foundation (2026-10-28): optional OpenAI/xAI/Sogni reference-edit adapters,
exact approved revision/hash selection, immutable multi-character manifests,
private per-run upload/cost approval, asynchronous attempts, recoverable verified
registration, receipts, withdrawal, MCP tools and mobile review. Providers remain
disabled until locally configured. Native host handoff is unverified. See
`docs/IMAGE_GENERATION.md`. Live provider access and the held-out identity benchmark
below remain to be evaluated with explicit user authorization.

Desktop Sogni workshop (2026-10-28): a character dossier tab now supports scene
input, approved-reference selection, preview, separate upload/cost approval and
generation, polling, run history and opening saved outputs for review. It uses
the same protected generation service and adds no schema migration or automatic
canon approval. Desktop controls retain prompt/selection drafts while navigating
and retain request keys after an ambiguous preparation response.

Implement capability discovery, explicit reference selection, cost preview, and a complete generation manifest. Evaluate Pákozdi on fixed held-out scenes spanning views, expressions, clothing, and body visibility. User review determines whether the provider is useful. Record rejected attempts and cost per accepted result.

## 3. Improve consistency based on evidence

Compare reference conditioning, regional edits, and supported character LoRA training against the same benchmark. Preserve dataset versions and separate held-out references. Add advisory visual comparisons without automatic canon promotion.

## 4. Multiple characters and video

Add per-character spatial bindings, confusion checks, approved scene keyframes, and timestamped video feedback. Benchmark identity under motion, occlusion, and camera changes before presenting the feature as reliable.

## 5. Broader living world

Extend relationships, conversations, memory, knowledge boundaries, locations, and timelines around the same stable character IDs. Visual identity remains part of every relevant milestone.

## 2026-10-29: Structured character profiles

Implemented source: shared extensible ghost template, field review, provenance and visibility, legacy-text proposals, JSON AI workflow, MCP read/proposal tools, conflict protection and export/restore. See docs/GHOST_PROFILE.md. Concrete subjective memories, selective scene context, story clock, background-event reconciliation and dynamic character state remain subsequent phases.

Reference retention update (2026-10-29): explicit reference removal now scrubs historical reference memberships, associated reasons and proposal copies. Completed generation manifests and offline backups remain separate. Covered by reference-retention and catalogue integration tests.

2026-10-29 user correction implemented: separate non-playable template character; remove per-character Ghost tab; integrate shared fields, accepted values and download/upload controls into regular desktop/mobile profiles. Template additions appear empty for all characters.

2026-10-30: Shared anatomy/appearance_detail field guidance now covers the supplied A–D checklist; full-generation package version 2 exports the current shared guidance. Existing field values and canon remain unchanged.

## 2026-10-30: Media analysis phase three infrastructure

Implemented on `codex/media-analysis-review`: provider-independent result
contract, deterministic mock, bounded read-only derivatives, persistent jobs,
pause/resume/cancel, cache, bilingual stable-tag matching and separate exact
place proposals. Desktop single/page-selection workflows support dry-run review,
selective accept/reject and ownership-aware undo. Additive migration 023,
verified pre-migration backups and compatible export/restore are included.
Original notes, character links, canon, media bytes and sorting remain protected.
See docs/MEDIA_ANALYSIS.md for contracts, rollback and limits.

Next: select a specific real-provider benchmark route using
`docs/AI_PROVIDER_COMPARISON.md`, confirm hardware/model/license or cloud
cost/data-transfer scope, then implement one adapter and evaluate on fixed
synthetic/public images. No real recognition, automatic new-place creation,
private external upload, paid request, merge or production rollout happened
in this development phase.
