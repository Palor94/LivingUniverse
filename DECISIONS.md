# Decisions

## Finish sorting explicitly; select exact locations inline

The user expects sorting to finish when saving the current item. Replace the hidden prerequisite of ticking completion with explicit Finish sorting actions (including Ctrl+Enter). These declare completion even with multiple characters; Save for later explicitly retains/reopens review, and Previous/Next preserve current status. Assignment by itself still never implies completion. The named examples were distinct root copies of byte-identical files already completed in character folders; repair only the two user-identified root IDs after exporting a backup. Do not merge/delete duplicates or infer that all copies share annotations.

Keep structured labels open and allow vocabulary creation within the sorting form, preserving selected characters, notes, and checked labels. The location dropdown records a stable named place or an existing setting tag/location folder; old generic references remain valid. A selected location adds its descriptive structured tag and leaves character sorting. Classification is logical; moving an original into a chosen folder is a separate preview/confirmation using existing verified relocation and journals. Locations and their media links are additive, portable records, and character-folder renames update linked nested location paths. No location/scene label changes canonical physical identity. The pending broad character-folder synchronization remains unapplied.

## Use sampled video frames as presentation covers

Sampled frames open as larger paused previews, and the current playback frame can also be selected. The existing crop editor chooses an explicitly assigned character and saves a bounded JPEG crop as a separate derived cover snapshot. Record the stable source video ID, timestamp, source crop and size/mtime; refuse stale-source captures. These small derived pictures are stored in an additive table in the local database and travel with exports. They are not new media records, do not change sorting completion or depiction links, and never approve canon. The source video stays untouched. A cached cover endpoint displays saved frames even when the source video is offline. Returning to an image crop clears the obsolete current-frame cache. No AI provider, uploaded image, paid API, model, or transcoder is involved. Pending folder synchronization remains unapproved and is not executed by this feature.

## Synchronize physical character folder names

The user explicitly authorized existing character folders to follow current database names and future primary-name edits to rename established folders. Alias edits do not rename folders, and move choices list only current depicted-character names. Name changes run preflight checks before touching files; unknown ownership, invalid Windows names, duplicate character destinations, symlinks/path escapes, stale previews, and filename/catalogue collisions are refused. Existing mismatches use a separate preview/confirmation action with a short-lived snapshot token. Do not run catch-up automatically on startup: automatic approval review rejected that unattended batch design.

Ownership is anchored in persisted folder assignments or a unique exact current-name/alias/retained-label match with existing character depictions. Mixed/unmapped source folders are not guessed from visual appearance. Unoccupied targets use a directory rename; case-only changes use a journalled intermediate folder. Existing targets merge only disjoint files using exclusive copying and byte verification. Catalogue paths, removed-item restore paths, pending scan paths, and owner mappings are updated while stable IDs, canon revisions, cover crops, reviews, notes, completion and structured labels remain unchanged. File move history is appended, never rewritten. A local database export precedes file changes, and the additive folder-change journal records the manifest, failures, and any required review. Application mutations are blocked during synchronization. No originals have been moved during development; existing live mismatches require the reviewed batch to be approved/applied.

## Separate location references from character sorting

The user requested a dedicated location-reference classification. An additive `media_roles` table records explicit location choices independently of character depictions, tags, and completion. Needs sorting, its count, and its sequential queue exclude locations. A separate sidebar collection and bulk/per-item controls make the distinction visible and reversible. Locations can still depict characters; no existing associations or appearance history are removed. Free-text/group names alone never infer the role. The table is included in backups; migration 007 can be reversed by its down script after backing up and reverting the corresponding code.

## Preserve pre-upgrade sorting progress

The user explicitly requested that previously sorted media remain sorted. The earlier rollout failed to carry that status into the new completion table. A recovery manifest now lists the specific 1,139 previously assigned active media IDs from the verified pre-upgrade snapshot. Desktop bootstrap carries those IDs forward once, only when the media remains visible and assigned to an active character and has no explicit completion/review flag. Existing Needs review choices win. New media IDs and future assignments never inherit completion automatically. The live repair uses the existing logical bulk action after a full export; it does not change canon, notes, reviews, depictions, or originals. Backup copies are separate recovery assets, not additional catalogue records.

## Phases 4 and 5: structured scene labels and assisted review

Keep original comma-separated tag text untouched and add a separate grouped vocabulary with stable IDs. Group/label names may be Hungarian or English and can be edited without breaking media links. Bulk addition preserves existing structured labels; removal is explicit. Single-media saves can replace that item's selected structured labels atomically alongside assignments and notes. Legacy migration previews a normalized exact-token match and only adds labels. A reference-role tag is not canonical approval, and character presence stays in the existing depiction links.

The user requested Phase 5 but has not selected a model/provider. Deliver the provider-independent review boundary with an explicitly non-AI local approved-reference hash baseline. Only current canon references with matching approved bytes and current fingerprint metadata are sources. Persist immutable evidence and append-only user feedback; accept adds a depiction without changing other links, completion, fidelity reviews, or canon. Face/body identity scores are unknown, with separate optional human judgments. Rejected identical evidence stays rejected; changed references/files block stale acceptance. Do not claim this trains a model or recognizes characters reliably across scenes. Actual AI integration remains a model/provider decision; compare options in `docs/ASSISTED_SORTING.md` without installing, connecting, uploading, or charging anything.

## Phase 3: optional, local duplicate review

Use streamed SHA-256 for exact bytes in images and videos. Cache by stable media ID and live size/mtime/ctime, independently of the metadata scanner. Browser-local 64-bit horizontal difference hashes provide inexpensive whole-image similarity suggestions for supported pictures; version the canvas recipe separately. Compare near neighbours with a BK tree and cap candidate output at 2,000 pairs. Identical bytes appear as exact groups rather than repeated visual pairs. Similarity never certifies facial identity, body proportions, or canonical fidelity. Small crops may match, but substantial crops, pose changes, and independently generated versions are not reliably detected; dedicated crop-resistant descriptors remain future work.

Analysis starts only on explicit request, in batches of 25, with optional folder scope, progress, and stop/resume through cached work. On Windows, inspect Offline/RecallOnOpen/RecallOnDataAccess attributes in a batched PowerShell metadata call. Skip cloud-backed or unverified files by default; a separate checkbox authorizes reads that may download originals. Comparison previews also load only on explicit selection. No external services, new packages, file changes, automatic record consolidation, or canonical changes. The additive `media_fingerprints` table is included in exports and has a rollback migration. Cache metadata avoids unnecessary content reads but is not tamper-proof integrity certification; reference integrity checks remain separate.

## Phase 2: folder confirmation and conservative reconciliation

Folder assignment is now gated by a short-lived preview snapshot. It includes sample media, existing assignments, explicit completion, target identity, and missing/unavailable observations. Confirmation revalidates the snapshot and adds links atomically. Proposed characters are created only on confirmation. Legacy direct folder-assignment routes are blocked.

Scans compare metadata only and preserve every existing media record. Missing paths in unreadable folders are classified unavailable rather than absent. Candidate relocation requires matching media kind, size, and modification timestamp against a missing record; no uncertain relocation is applied automatically. Unfamiliar candidate paths are staged for manual relink or import-as-new. Relinking retains the old ID, reviews, canon, and tags; current approved-reference fingerprints must match. Additive scan-state/candidate tables and the last report are included in exports. No whole-library hashing, perceptual similarity, provider integration, or Phase 3 functionality is introduced.

## Phase 1: fast manual categorization

Retain Node/SQLite and the existing free-text tags. Bulk assignment inserts missing character links; bulk tag operations update only tag text. Validate each complete request before committing all changes in one transaction. No bulk file, naming, review, or canon side effects.

Use page-scoped selection with an explicit counter and automatic clearing on page/filter changes. Viewer navigation snapshots the filtered ID sequence to avoid skipping files when completion removes them from Needs sorting. Categorization completion is an explicit, reversible user state in an additive table; existing records start needing review. It is separate from image fidelity decisions and canonical approval. Migration up/down scripts and export compatibility preserve the original schema and metadata.

## 2026-10-24: Collection usability improvements

Separate Pictures and Videos, opening Pictures first. Use browser-decoded, visible-only video seek previews at five-second intervals and a sampled-frame strip; unsupported codecs must be disclosed, with no automatic paid or downloaded transcoder. Editable filenames preserve media IDs and extensions. Deletion is recoverable: catalogue tombstones or physical moves to application trash, with a restore UI and explicit protection of current canonical references.

Profile fields save independently on blur. Cover rectangles are presentation metadata, not canonical appearance changes. The primary relationship prompt is towards Palor/Tibor. Movement choices in the UI are limited to depicted characters. Hungarian name suggestions are local creative proposals, accepted individually, retaining the previous label as an alias. Preserve known names, including Pákozdi Péter.

The user's explicit Tibor/Palor merge request authorizes physically moving the Tibor collection into Palor after a backup. Keep old IDs and approved histories archived; do not automatically promote source canon into a new target revision. Unknown truckers can remain tagged scene extras rather than fabricated recurring identities.

## 2026-10-24: Explicit physical media organization

The user authorized moving original media into OneDrive character folders. Provide a per-item Save & move original action with destination preview, no-overwrite copying, byte verification, stable media IDs, and a persistent move journal. Existing assignment-only controls retain their meaning, particularly for shared-character media. OneDrive synchronization remains handled by OneDrive. No original files are moved as part of implementation/testing; tests use temporary fixtures.

Save/load must eventually capture the complete living-world state, not just the character catalogue, with named saves and continuity for Palor. Current exports remain catalogue-only until simulation exists. Physical media layout is external to save snapshots; loading an earlier catalogue does not physically undo moves.

## 2026-10-24: Core requirements

Persistent visual identity has equal architectural standing with narrative identity and memory. First deliver a useful character/reference/review library before expanding into world simulation. Advanced generation is deferred until a provider passes a representative character benchmark.

## 2026-10-24: Canon ownership

The user's explicit approval establishes canon. Output approval, canonical promotion, and appearance revision are separate actions. Every generation pins the exact appearance revision and reference selection used. Existing media remains unclassified until reviewed.

## 2026-10-24: Proposed implementation foundation

The initial Python/SQLite candidate was revised during implementation: use the available Node.js 24 runtime with its built-in SQLite, a local HTTP service, and buildless HTML/CSS/JavaScript. This avoids extra installation while retaining relational data and a responsive browser interface. The server binds only to 127.0.0.1. The live SQLite database is outside OneDrive.

## 2026-10-24: Confirmed first prototype scope

The user has approximately 50 characters, mixed and character-specific folders, and shared-character media. Folder-based character creation and assignments require explicit selection. Profiles include editable biography, personality, aliases, appearance drafts, directed relationships, and private administrator notes. Tibor is the administrator identity; Palor is the same person's in-world identity. Clothing and scene details do not replace underlying appearance.

The first working build prioritizes media organization and profiles; Living World remains a clearly labeled future section. Access is initially laptop-only. Face recognition, name generation, crop tools, and external AI integration are deferred. Export/restore provides a portable catalogue snapshot. Scanning reads metadata only; approved references are fingerprinted at explicit approval, with on-demand integrity verification. Collection-wide content hashing is deferred to avoid reading the entire OneDrive collection on first scan.

Store original media as files, not database blobs. Reference assets using stable IDs and content hashes with replaceable storage locations. A path is a locator, not an identity. Original files remain in place during initial cataloguing.

Keep the live database and runtime outside OneDrive, with a configurable local application-data directory. Use database-consistent snapshots and a media manifest for backups into OneDrive; ordinary file synchronization is not a database backup strategy. Restore verification is required before relying on a backup.

Use versioned, provider-neutral exports for valuable user data. Keep provider request payloads and training artifacts as linked records. LoRA weights and embeddings are compatible only with their recorded model families and encoders; provider independence does not imply portable model weights.

## 2026-10-24: Repository boundary

Initialize Git for source and project documentation only. Default-deny tracking of the existing private media collection. No remote, upload, automatic import, or paid service has been configured.
