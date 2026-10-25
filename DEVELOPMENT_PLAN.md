# Development plan

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

Implement capability discovery, explicit reference selection, cost preview, and a complete generation manifest. Evaluate Pákozdi on fixed held-out scenes spanning views, expressions, clothing, and body visibility. User review determines whether the provider is useful. Record rejected attempts and cost per accepted result.

## 3. Improve consistency based on evidence

Compare reference conditioning, regional edits, and supported character LoRA training against the same benchmark. Preserve dataset versions and separate held-out references. Add advisory visual comparisons without automatic canon promotion.

## 4. Multiple characters and video

Add per-character spatial bindings, confusion checks, approved scene keyframes, and timestamped video feedback. Benchmark identity under motion, occlusion, and camera changes before presenting the feature as reliable.

## 5. Broader living world

Extend relationships, conversations, memory, knowledge boundaries, locations, and timelines around the same stable character IDs. Visual identity remains part of every relevant milestone.
