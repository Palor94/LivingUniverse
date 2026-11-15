# Development plan

## Media-library phases requested by the user

Phase 1 implemented: page-scoped checkbox/Ctrl/Shift selection, additive bulk character assignment, additive tags with explicit tag removal, explicit categorization completion, status filtering, and a fixed filtered sequence with save-and-next/previous. No physical file operations or canonical changes occur in these bulk actions. Completion is persisted in one additive table and included in exports. See README for use and migration rollback.

Phase 2 implemented: mandatory folder preview/confirmation with counts and representative samples; metadata-based scan reports; retained missing/unavailable records; staged possible moves and explicit path relinking or import-as-new. Current canon is fingerprint-checked before relinking. Two additive observation tables are included in backups, with rollback scripts.

Phase 3 implemented: optional folder-scoped or collection-wide SHA-256 analysis, browser-local versioned dHash image fingerprints, cached results invalidated by live file metadata, and paginated manual exact-group/similar-pair comparisons. Windows cloud recall flags gate uncached reads unless downloads are explicitly enabled. No automatic file or metadata merging/deletion. Crops and substantially changed generations remain a limitation of the initial visual hash.

Phase 4 implemented: custom grouped vocabulary, stable tag IDs with editable names/groups, single-item and additive/removal bulk labels, structured filtering/search, and explicit legacy-text mapping that retains original text. Optional structured labels remain separate from character links and canonical reference approval. Additive migration and export support preserve older data.

Phase 5 review foundation implemented: optional local approved-reference hash suggestions with provenance, manual multi-character additive acceptance, rejection/reopening, separate human face/body feedback, suppression of repeated rejected evidence, stale-evidence checks, and export/restore. This baseline is not AI recognition. Local learned encoders, local vision-language models, and external APIs are compared in `docs/ASSISTED_SORTING.md`; actual AI model selection, a held-out benchmark, and provider connection remain pending the user's preference. No external upload, paid call, model installation, automatic assignment, or canon mutation is enabled.

Owner policy lock (2026-11-06): full machine auto-canon is authorized under
`docs/AUTO_CANON.md` (per-person crops for multi-character shots; hard abstain
rules; numeric gates unset). This does not enable a writer, model, or upload.

Vision engine lock (2026-11-06): OpenAI `gpt-6.1-sol` for world-v1 tagging and
identity-v1 compare (`docs/VISION_ENGINE.md`). In-repo estimate/trial CLI and
gates landed; bulk library runner resume and live auto-canon writer remain next.

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

2026-10-31: authenticated admin one-click crop saving atomically adds an approved, independently identified reference and reversible attributed revision history. Multiple approved crops per source/character flow into plugin reads and generation inputs without replacing prior references.

## 2026-11-06: MCP living-world upgrade streak

Ship as separate working increments in this order. No auto-canon, no invented biographies, no continuous simulation, no female character creation. Later items (compare widget, locations, multi-character binding, identity benchmark) stay outside this streak.

| Step | Feature | Size | Status |
| --- | --- | --- | --- |
| 5 | `get_reference_coverage` | Small | Implemented: present/missing approved roles from current canon only |
| 6 | `fill_gaps_only` on profile propose | Small | Implemented: refuses non-empty saved fields |
| 7 | `get_image_generation_summary` | Small | Implemented: status counts, estimated/actual cost totals, recent receipts |
| 4 | `submit_generation_feedback` | Small–medium | Implemented: append-only face/body feedback; never canon |
| 1 | `get_scene_pack` | Medium | Implemented: perspective pack with knowledge boundaries |
| 2 | Event + memory proposals | Medium–large | Implemented: `propose_story_event` / `propose_character_memory` (+ apply tools) |
| 3 | Story clock + next-scene candidates | Medium | Implemented: `get_story_clock`, clock propose/apply, `get_next_scene_candidates` |

Migration `025-mcp-living-world` adds generation feedback, character memories and MCP proposal tables. Covered by `tests/mcp-adapter.test.mjs` and `tests/mcp-living-world-streak.test.mjs`. Restart the app/tunnel and refresh MCP tools to discover the new surface.

Deferred after this streak: compare widget, session→memory helper polish, location MCP tools, multi-character scene binding, identity benchmark runner.

## Status 2026-11-12

The current roadmap is `docs/NEXT_GEN_PLAN_2026-11-11.md`. Done since: Phase 0; thumbnails and
compression (1.1, 1.2); memory recall, running summaries, promises (2.1–2.3); beliefs and gossip
(2.4, 2.5); game clock (3.1, real time plus actions); invitations (3.3); play on the phone (4.8);
face identity suggestions and reference checks in the app (toward 5.1). Open: profile storage split
(1.3), lazy i18n (1.6), schedules (3.2), story threads (3.4), timelines (3.6), body identity method,
benchmark lock-in of the auto-canon gates (owner).
