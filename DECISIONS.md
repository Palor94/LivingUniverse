# Decisions

## 2026-10-31: AI may use proposed observations as explained search hints

The user explicitly allows machine-generated labels to guide candidate retrieval
before manual acceptance. Keep proposal review state, uncertainty and provenance
visible; do not convert search use into accepted tags, identity, exact places or
canon. The candidate-retrieval wrapper defaults to proposals allowed; strict
accepted-only queries remain available and legacy selector defaults unchanged.

Use existing character IDs and image-level associations, without face recognition.
Named per-figure action-role requests need separately reviewed bindings. Verify
portrait/scene retrieval on saved data, honest no-match for unanalyzed plans and
nonexistent actors, and unchanged approval state. No paid analysis resumes from
this agreement; the user requested only the retrieval trial and budget refresh.


## 2026-10-31: Unrealized illustrated generation plans are a distinct asset purpose

The user kept the run paused and explicitly assigned the generation-ideas
folder (now under 20_SHARED_MEDIA/Unassigned after their move) to unrealized plans/action schemas. Keep this creator-supplied usage intent
separate from visible model observations and story history. Use generation_plan /
planned / planning_only with conditional action, pose, composition and scene-idea
labels. Do not infer a per-image drawing/comic subtype without inspecting it.
Generation planning may retrieve these assets; scene illustration and character
introduction selectors exclude them even after generic review. They never prove
an event occurred or a depicted figure has a known character identity.

The folder contains 111 uncatalogued JPG candidates outside the approved snapshot.
Prepare metadata-only pending inclusion, without imports, copies or API calls.
Keep the prior approval immutable and block silent old-snapshot execution while
the required supplement is pending. Resume and expanded-scope preparation remain
future user-directed work. Full synthetic regression 267/267 passes.



## 2026-10-31: Pause and one-way retention of private library-analysis copies

At the user's request, keep the paid worker paused and follow catalogue removals
into this run's private image copies and visual observations. Only live active-ID
membership determines removal; file offline/missing state does not. Read the owner
query-only; never modify originals, canon, assignments or other trial/backup copies.

Use run-local tombstones, source-hash/path checks, an idempotent local purge and
read-only HTTP review with a three-second retention watcher. Remove copy bytes,
raw visual results, proposals, cache and world/search projections; preserve the
immutable approved plan and sanitized usage receipts. Restoration in the owning
library does not recreate a run copy or authorize paid resubmission. Reconcile
again before future batches/transfers, and discard late results for retired IDs.
A separate explicit user request is required to resume the paused paid worker.
The updated review mode loads no API credential and starts no model calls.



## 2026-10-31: World-oriented library observations and resumable private processing

The user selected Sol medium for the full image catalogue and requested a richer,
efficient tagging method before processing. Keep a single compact structured
world-v1 result, adding camera enums, per-figure face/body/pose coverage, visible
scene requirements and content class to scene-v1. Keep activity-specific roles,
non-exclusive setting hypotheses, anonymous figures and narration-only neutral
references. No identity recognition, inferred preferences or automatic canon.

Reuse the existing queue, preview approval, result persistence, cache and review.
A settlement hook exposes committed item status for durable local progress and a
rebuildable bilingual/faceted index; it does not accept labels. World selection
excludes unreviewed assets by default and keeps narration-only references out of
scene illustration. Image-level known character links do not map p1/p2 identities.

Pin the full source snapshot, provider/settings, prompt and schema. Copy immutable
sources into a private AppData run catalogue, read live data query-only, and keep
keys, images, names, IDs and raw observations outside Git. Per-image usage ledger,
no paid retries, conservative next-call cost guard, first-batch schema gate and
three-failure stop protect unattended processing. Resume only untouched transfers;
unknown outcomes require reconciliation. Temporary system sleep inhibition is
released when the worker finishes. No production deployment or live migration.

See docs/WORLD_MEDIA_TAGGING.md for semantics, retrieval and operational limits.


## 2026-10-31: Opt-in scene observations reuse the queue and preserve uncertainty

Keep scene-v1 separate from default wire mode and preserve structured hypotheses
in the shared result JSON. Never convert compatible scene uses into confirmed
place IDs or action-specific roles into character identity/preferences. All
simulation-use proposals remain unapproved. Neutral reference results require
narration-only introduction; actual simulation enforcement remains future work.

Use identical high-detail images and low reasoning for the bounded Terra/Sol
comparison. Record sanitized token usage even for invalid/refused responses;
keep calculated cost distinct from invoices. A private exact-preview approval
is separate from key setup and image selection. Preparation has no credential
or external transport; execution is single-start and stops on unknown usage or
outcome. No production configuration or paid image call is implied. See
docs/CLOUD_SCENE_PREVIEW.md for limitations and 253/253 synthetic verification.

## 2026-10-31: Scene compatibility and activity-specific participant roles

The user refined the planned private comparison: distinguish observed room
function from multiple possible scene settings, record visible position and
activity-specific performer/receiver roles, and reserve neutral face/body
references for character introduction/narration. This is a test specification,
not deployed behavior. See docs/SCENE_TAGGING_PILOT.md. Do not equate hypothetical
scene compatibility with confirmed world locations, infer identity from faces,
or turn a scene role into a permanent character preference. Private candidate
selection remains outside Git; no cloud submission or live writes were made.

## 2026-10-31: Prioritize environment, activity and generation-reference coverage

At explicit user direction, default to background/action/angle/framing/reference_use
instead of clothing detail. Activities must be visible verb phrases; reference
use describes useful coverage and limitations, never identity/canon approval.
Preserve optional legacy goals, stable vocabulary IDs, additive review and undo.
Use prompt media-analysis-3 and a ten-item wire bound for five requested goals;
do not relax strict validation to make a weak model appear successful.

The separate private pilot reads selected live records query-only and writes
only a fresh local test catalogue/results outside OneDrive. Keep images, names,
IDs, hashes and raw outputs out of Git and external model requests. Selection
metadata must distinguish whole-word full-nudity labels from shirtless labels;
these labels do not prove actual image content. The focused model repeat had
only one schema-valid response out of three and semantic errors remain; no
automatic acceptance, retry, alternate download or cloud fallback. See
docs/ANALYSIS_TAG_FOCUS.md for evidence and remaining limitations.

## 2026-10-30: Authorized real Ollama smoke trial and stricter ungrounded outputs

The user separately approved downloading a portable Ollama runtime and the small
Qwen3-VL 2B model for local synthetic-image trials. Keep the runtime, weights,
profile and disposable catalogues outside synchronized storage; no production
enablement or startup registration. The verified loopback process runs CPU-only
with cloud disabled and is stopped when the trial ends.

Real inference exposed an invented world-place ID that existing validation
rejected. Do not relax validation to accept model inventions. Ground the schema
in the Ollama prompt, pin media-analysis-2, bound concise fields and require
null tag IDs and an empty exact-place list while no approved place context is
provided. The shared normalized contract and mock place-review path remain.
Three corrected synthetic responses validate technically, but bilingual/scene
errors remain; do not call this recognition accuracy. Full regression 230/230.
See docs/REAL_OLLAMA_TRIAL.md for actual timings, limits and preserved evidence.

## 2026-10-30: Explicit local/cloud analysis adapters on the existing review queue

Keep mock as the default. Add separately configured Ollama vision and OpenAI
Responses adapters without a second processing system. Split checked image reads,
HTTP transport, provider wire mappings, strict output schema, matching and human
review. Pin model revision/digest, prompt/schema hashes and preprocessing in jobs,
previews and cache. Loopback Ollama verifies its local model digest before image
submission; never pull a model or silently fall back to cloud. Operator-confirmed
offline runtime configuration remains a separate operational requirement.

Cloud preparation sends nothing. Require exact source/derivative/request hashes,
provider/model/purpose/data disclosure and explicit upload plus cost acknowledgement.
Persist that approval in the existing job JSON; no new SQL migration. Interrupted
cloud attempts are terminal failed/PROVIDER_OUTCOME_UNKNOWN, including restore;
resume processes untouched items only. Never automatically retry a paid attempt.
Preserve notes, canon, assignments, sorting and place identity through existing
additive proposal approval and undo. No vocabulary/profile context enters prompts.

The 190-test baseline and 229-test final suite pass on disposable synthetic data.
Ollama uses a synthetic loopback HTTP server; OpenAI uses local fixture fetch only.
This proves transport/control flow, not recognition accuracy or real model support.
No live database, model installation/inference, external media upload, paid call,
main merge or deployment. See docs/DIRECT_AI_ANALYSIS.md.

## 2026-10-30: Hierarchical Locations and independent image backgrounds

Implement the next phase on a separate development branch. Location identity is
the existing UUID; names are unique among siblings, including the root namespace,
and may repeat under different parents. Migration 022 rebuilds the location table
with a canonical parent column, verified backup and atomic integrity checks.
Retain profile metadata in the existing table, with synchronized compatibility
parent fields. Preserve all media/event IDs and links, text, canon and file bytes.

The new user requirement supersedes the earlier coupling of exact-place selection
and location-reference classification. Background links never change media_roles,
completion or character assignments. An explicit role checkbox controls the
separate reference collection; switching it off keeps background links. Existing
role choices are preserved during migration. Generic tags do not select places.

Locations now opens the editable, expandable catalogue tree. Keep the existing
canvas as a separate plan, with no automatic promotion. Parent changes have a
visible preview, cycle/depth/sibling guards, optimistic versions, audit history
and compensating undo. New tree places need no structured vocabulary tag.
Reject schema downgrade rather than dropping homonyms or retained edit history.

The previous 161-test baseline and the final 174-test suite pass on disposable
databases. Desktop browser checks use synthetic data. No live migration, original
media operation, deployment or paid AI call occurred. See
docs/LOCATION_HIERARCHY.md. Phase three remains a design in
docs/AI_MEDIA_ANALYSIS_PLAN.md, beginning with a mock analysis/review pipeline.

## 2026-10-30: Bilingual Media Notes hashtags

Extract explicit Media Notes hashtags on desktop/mobile saves using deterministic
NFC/case/separator normalization, curated or explicit Hungarian/English names and
aliases, and existing stable tag IDs. New vocabulary uses UUIDs. Preserve original
notes, legacy tag text, existing labels, sorting choices, profiles and canon.
Do not infer translations, identities or places. Unknown/ambiguous tokens remain
proposals; tags linked to exact locations are excluded from automatic matching.
Keep descriptive environment tags separate from exact place assignments.

Use additive migration 021 with a verified local pre-migration SQLite backup,
atomic writes, portable export/restore, digest-bound dry-run backfills and per-run
rollback that respects later manual adoption. No startup backfill, paid AI,
private-media upload, live migration or production rollout is part of this work.
See docs/MEDIA_NOTE_TAGS.md. All 161 automated tests pass on disposable fixtures.

Validation also corrected omitted optional canon expectations and reference-only
revision reuse to follow AGENTS.md: explicit approvals append revisions; removed
memberships use the documented retention exception and minimal explanations.
Appearance-only UI history remains distinct from full persisted revision history.

The next hierarchical-location phase is design only. Duplicate local names need
parent-scoped uniqueness and qualified selection; the existing inline global
constraint will require a separately reviewed table rebuild. No Locations
migration or canvas-to-catalogue promotion is implemented. See
docs/LOCATION_TREE_DESIGN.md.

## 2026-10-29: Original-image delivery to connected assistants

The user requested actual image bytes instead of thumbnails. Shared read tools now return unchanged original bytes with format, dimensions and hash; canon-bound reads still verify the immutable fingerprint. Preserve the 20 MiB/40 MP source limits. The documented 10 MiB Secure MCP Tunnel envelope requires 6 MiB inline plus hash-bound read chunks for larger images. Private Tailscale image downloads serve originals; no public file endpoint, new credentials, canon/profile changes or paid calls. Reuse image content in the versioned widget without duplicating base64 in metadata. Do not imply native generator handoff from MCP transport success. See docs/ORIGINAL_IMAGES.md.

## 2026-10-28: Immediately reveal generated character media

Successful registration already links the output to all manifest characters.
After an actively watched generation succeeds, open the existing character media
tab, clear display filters and show generated outputs newest-first. Use identical
ordering for the viewer queue. Reopening past history does not redirect on its
own; completed runs provide an explicit gallery button. Keep appearance reviews,
sorting completion and canon independent. Paused Sogni workflows receive a
specific review-required error instead of suggesting that an image was saved.

## 2026-10-28: Explicit Krea identity LoRA preset

The user selected Krea 2 Identity Edit v1.2 with Mystic X at 1 and Realism Engine
v3 at 0.8. Verified the live Sogni catalogue IDs `krea2-mystic-x` and
`krea2-realism-engine` and compatibility with `krea2_identity_edit_v1_2`; the
hosted edit selector is `krea-identity-edit`. Preserve order and exact numeric
strengths in protected local configuration, immutable manifests and outbound
`loras`/`loraStrengths`. Display the preset before approval. Configuration changes
invalidate prior pending/approved plans for execution, never alter their history.
Invalid or incompatible LoRA settings disable the provider rather than dropping
adapters. API-key setup preserves compatible saved LoRAs. No reference upload,
generation, canon change or content-filter change is part of this configuration.

## 2026-10-28: Desktop Sogni character workshop

Add a Generálás Sognival dossier tab with explicit approved-reference selection,
scene/format input, exact-plan preview, separate human approval and execution,
status/history and opening registered results in the existing media reviewer.
Reuse the existing generation service, immutable manifests, canon/hash checks and
recoverable registration. Desktop writes require the existing exact loopback
origin plus a dedicated server-held CSRF token; no provider keys enter the page.
The new routes are character-scoped, Sogni-only and absent from mobile/MCP/gateway
route allowlists. Local approval is attributed as local-creator. Preparation
never sends externally; uncertain runs never automatically resubmit. No schema
change, canonical promotion or production generation is part of this UI work.

## 2026-10-28: Sogni reference-edit provider

Add Sogni to the existing generation tools and catalogue registration, with
model-specific reference limits and one explicit durable `edit_image` workflow.
Keep exact canon/hash and private upload/cost approval unchanged. Preserve the
upstream workflow ID immediately, never automatically restart uncertain work,
and retrieve bounded outputs through the public-only DNS-pinned downloader.
Signed PUTs pin public DNS and never forward account credentials to storage.
Windows setup stores a DPAPI-encrypted key beside the existing local database,
outside OneDrive, and preserves other provider configuration. Setup sends no
private media and starts no paid run. Live access/fidelity require a separate
authorized test. See docs/IMAGE_GENERATION.md.

## 2026-10-28: Reference-conditioned image API runs

Extend the existing authenticated service, tunnel and Grok OAuth dispatcher instead
of creating another catalogue. Keep provider keys and recovery artifacts local,
outside OneDrive/Git. Exact current canon revisions and original fingerprints bind
each character slot; preparation sends nothing externally. Private human approval
of the exact prompt/references and separate API cost is required even in trusted
text mode. Generation output remains unreviewed media. Existing explicit canon
approval is unchanged. Preserve immutable manifests, receipts and recoverable
withdrawal; never automatically resubmit an uncertain paid request. Native host
image generation/attachment handoff remains unverified. Mock provider tests do not
prove paid provider access or identity fidelity. See docs/IMAGE_GENERATION.md.

## 2026-10-27: Shared character event archive

Events are durable shared catalogue records, linked to dossiers through participants,
not copied into biographies or duplicated per character. Preserve chronology
uncertainty, provenance, consequences, roles, knowledge, timeline and all revisions.
Source identities survive corrections and prevent repeated imports. Draft saving
never approves story or visual canon. Explicit local creator decisions use an
expected version and record a reason; edits of approved events require reapproval.
No Gyula/Sanyi or Márk/Nicolas merge or Fantasy Den transcript import is executed.

Use the existing Node/SQLite, desktop dossier, export and MCP conventions. Verify
an online backup before the first event migration, keep runtime state outside
OneDrive, and validate imported snapshots transactionally. AI read tools default
to approved public knowledge, with explicit participant knowledge projections;
private/draft retrieval additionally requires existing local admin permission.
No new remote writes, approval bypass, credentials or mobile routes are enabled.
See docs/STORY_EVENTS.md for limits and recovery instructions.

## Opt-in trusted MCP text writes

The user no longer wants repeated database-write approval. An operator-owned local
`approval_mode: trusted` permits future authenticated text/profile and directed
relationship proposals to be applied without a separate review-page decision.
Default/omitted mode remains `review`; the mode is not a model-supplied argument.
Snapshot the mode in each immutable proposal so old pending review requests and
rejected requests cannot be silently unlocked. Keep all existing field limits,
stale-record checks, atomic receipts, protected administrator notes and canonical
history. Audit trusted configuration separately from actual human approval. A
request to discuss information does not by itself request saving. No new public
endpoint, SQL access, media operation, deletion or automatic canon approval is
authorized. The user can restore review mode by local configuration, without any
database recovery or rollback of newer edits.

## Recoverable bulk removal in Needs sorting

The user requested a top-toolbar removal action for selected inbox items. Snapshot
only the current page's selected IDs, then show filenames, count and an explicit
choice between catalogue-only removal and moving originals to application trash.
Reuse the existing per-item remove endpoint and its reference protections; never
permanently erase, expand to other pages or transfer metadata between files. Run
sequentially, report failures and warnings by filename, and stop between items if
the user cancels or closes the dialog. Removed items retain their existing IDs,
associations and history and use the existing restore flow.

## Private mobile text editor

The user subsequently authorized a small mobile image-sorting prototype on this same private listener. It adds ID-bound bounded previews and logical per-image assignments, tags, existing locations and explicit completion, using the existing catalogue helpers. Saves compare a content version atomically, retain browser drafts on failure, and allow safe identical retries. No physical file operations, canon changes, new public exposure, or database migration are introduced. See docs/MOBILE_ACCESS.md.

After external OneDrive moves/deletions, the phone can explicitly invoke the existing metadata scanner through a narrow authenticated/CSRF-protected route without supplying paths. Missing/unavailable scan observations are excluded from mobile image lists by default, with a reversible visibility checkbox. Records, IDs and sorting decisions remain intact; possible moved-file candidates still need desktop confirmation. Scanning does not force OneDrive synchronization, download image contents or infer identity from folder names.

The user then approved phone batch confirmation for unique filename + size + modification-time matches. A short-lived preview token fixes the exact one-to-one batch; ambiguous/competing matches remain separate. Shared relink validation preserves current canonical fingerprints, rejects symlinks and reappearing old paths, and revalidates files/catalogue before one atomic transaction. A verified online SQLite backup precedes commit, with local mutations blocked while preparing. Retries do not duplicate journal entries. This changes stored locations only; it neither moves originals nor changes identities, associations or completion. See docs/MOBILE_ACCESS.md.

The user also authorized mobile creation of characters and location tags. Character creation is name-only, uses the existing UUID identity and empty defaults, checks normalized name collisions, and preserves later edits on retries. Location labels reuse the existing location/setting-tag operation without filesystem creation. Both are narrow authenticated/CSRF-protected writes; sorting drafts survive inline creation, and new selections are assigned to an image only when its sorting form is saved. Canon and existing primary-name/folder management are unaffected.

The user subsequently requested a OneDrive directory alongside mobile character creation. Use the existing folder manager's Windows-name, boundary, symlink and ownership checks; create or reuse a same-named ordinary directory without touching its contents. Record the new character and folder-owner link atomically after successful directory validation. On database failure, remove only the operation's own empty new directory; leave existing folders/files alone. Retained creation UUIDs make retries safe. No existing-character folder backfill or media reassignment is implied, and location tags remain logical labels.

Approved scope: Tailscale Serve HTTPS to a separate loopback listener in the same Node process and SQLite connection; the full desktop listener stays private to localhost. Exact configured Tailscale login and HTTPS origin, bounded JSON, CSRF tokens, cross-site rejection and an explicit route allowlist guard remote reads/writes. Only profile text and directed relationships are editable; names, canonical approvals, media operations, exports and restores remain desktop-only. Configuration and the active database stay outside OneDrive. No Funnel or paid service is enabled. The user separately approved replacing the default allow-all tailnet grant with their account accessing this laptop on TCP 443, leaving existing unrelated policy settings intact.

Mobile browser drafts preserve original values and unsaved text; atomic compare-before-write catches stale edits and requires explicit conflict resolution. Updated desktop profile/relationship requests also provide expected values. No schema migration or duplicate database is introduced. Browser storage is recoverable draft storage with normal eviction/clearing limits, not an authoritative offline database. Setup requires an existing catalogue and never restores or replaces it. See docs/MOBILE_ACCESS.md for enablement, limitations and rollback.

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

## Compact desktop sorting with token pickers

The user requested a drawing-based sorting-dialog update: independent vertical character/location lists, quick-search bubbles, Palor always last among character bubbles, a standalone Save beside Save & move, no shortcut-help paragraph, and a discreet scan state under the file controls. Unique unselected matches are selected after a short typing pause; empty searches never select anything and removable bubbles preserve stable IDs. Save explicitly completes categorization and stays in the current viewer; existing Finish/Next, duplicate-return, creation, notes, tags and physical-move confirmations keep their behavior.

Multiple location bubbles are explicit assignments, not inferred from tags. Additive migration 015 stores secondary links in media_location_links while preserving the original media_locations primary row. Exports include secondary links; imports clear/restore them in foreign-key order. Existing single-location clients keep secondary links when retaining the same primary and replace the location set when explicitly changing it. The primary location remains the physical destination for location Save & move. No original files or canon are modified by the new pickers. Export a backup before rollback; 015 down drops secondary links only and preserves primary locations.

## Unified location profiles and label renaming

The user requested a Helyszínek editor on desktop and mobile. It synchronizes an explicitly saved location name with its linked structured label while preserving IDs and all primary/secondary media associations. Optional English search name, free-text type, description and a cycle-checked parent location are stored in additive migration 016; unknowns stay empty. Existing standalone setting tags are editable without changing their tag IDs and receive a location row only on an actual edit. Conflicting names/shared labels are refused rather than merged. Optimistic versions, explicit Save and browser drafts protect concurrent edits. Existing folders, originals, canon and narrative data are untouched. See docs/LOCATION_EDITOR.md for operation, export and rollback.

## Recoverable cleanup of missing catalogue paths

The user requested bulk removal in Scan report / missing files. The Missing paths view has page-scoped checkboxes, select/clear controls and an explicit preview/confirm action. Current category counts exclude records already in Removed items. Selected records must still be marked missing, absent within a currently readable ordinary resource/parent directory, unrelated to pending move candidates, and outside current approved canon. Unknown/unavailable parents, symlinks and reappearing files are retained. Missing paths are not treated as proof of permanent OneDrive deletion.

Confirmation creates a verified online SQLite backup, revalidates each item, and reuses the normal catalogue-only removal helper. Records go to media_hidden with physical=0, keeping IDs, associations, reviews, tags and history recoverable through the existing Removed items / Restore action. No filesystem deletion, record erasure, or mobile destructive endpoint is added. Failures/changed records are reported individually; replaying the same preview token returns the original result. No real records are removed merely by opening the report or deploying the feature.

## 2026-10-28: Shared native and resumable image uploads

Extend the existing verified import service with immutable multiple-character targets, ChatGPT native fileParams and bounded resumable MCP chunks. All transports retain current authentication and trusted saving policy. Record working reference candidates separately; no automatic canon, profile changes, overwrites or new public routes. Validate actual image bytes and associations before reporting success. Store temporary chunks and thumbnails outside OneDrive. See docs/MEDIA_UPLOADS.md.

## 2026-10-29: Shared ghost-profile template and explicit field review

Implement a versioned, extensible common template independently of character records. Unknowns remain empty/null. Preserve legacy texts, directed relationships and visual canon. Store typed values, source, interpretation, fact/impression/hypothesis and creator/public visibility. Proposal generation never approves data, even with trusted MCP writes. Explicit local field selection creates an attributed revision with immutable prior snapshots. Use existing exported settings storage without a new database migration. See docs/GHOST_PROFILE.md for scope, tests and subsequent simulation phases.

## 2026-10-29: Selected high-quality reference delivery with explicit originals

The user clarified that usable generator references and speed matter more than transferring every original. List responses remain metadata-only. Explicit selected image reads default to a 2048 px / 3 MiB high-quality reference; fitting JPEG/PNG originals pass through unchanged. Exact full files remain an image_quality:original option with hash-bound chunks above the inline budget. Approved source hashes are verified before derivation, derived and source hashes are distinct, originals/canon/auth remain unchanged. Native client-to-generator file handoff is not inferred from MCP visual access. See docs/ORIGINAL_IMAGES.md.

## 2026-10-29: Minimize retained reference-selection data

At the user's explicit request, reference removal now scrubs removed image membership from historical canon reference lists, clears affected free-text explanations, strips related MCP reference-proposal payload/receipt copies and invalidates pending approval. Local matching evidence using removed references is deleted. Revision IDs and approved appearance remain; completed generation manifests retain actual execution inputs. New reference-only revisions store a minimal reason rather than model-authored source narratives. This is a deliberate exception to immutable reference membership, applied only when the user saves the character's approved selection; no startup-wide rewrite is performed. Existing backups remain independently restorable and may contain old information.

## 2026-10-29: One-off cleanup of existing reference history

The user explicitly requested applying reference retention to all existing profiles. The local maintenance script app/clean-reference-history.mjs makes a verified SQLite backup and cleans a single transaction. It preserves complete current canon rows (including current reasons), appearance data, characters, media, relationships and generation manifests by hash. It removes obsolete reference memberships and reference-only historical commentary; appearance-changing rationale remains unless attached to removed reference data. The initial broader variant that would clear all reasons was rejected by automatic approval review and was not executed. The narrowed operation completed on 54 profiles: 64 historical reference lists cleaned, 141 obsolete explanations cleared and one completed historical reference proposal explanation cleared. Private backup/report remain outside Git. No startup-wide rewrite or public maintenance endpoint is enabled.

## 2026-10-29: Ghost import compatibility and private creator review

Accept type as a transport alias of kind, reject contradictory aliases, normalize unknown text null to empty, and report validation errors per named field. Never infer provenance or approval. Ghost proposals return the existing private-origin /ghost-profile/<character_id> review URL. Reuse creator login, Origin and CSRF protection for file intake and explicit field review; record the authenticated actor. No model-call approval or newly public creator endpoint is introduced. Native embedded Grok UI is unverified.

## 2026-10-29: Question-by-question ghost-profile review

Use a native modal dialog with one proposed field at a time, editable answers, accept/skip/back, resumable tab-local drafts and a final explicit summary save. Interim choices never write the approved profile. Optional intimate-anatomy prompts append only user-entered details to the existing anatomy field; unknown measurements remain unknown. Existing profile/canon boundaries and version checks remain unchanged.

## 2026-10-29: Template character and integrated regular profiles (user correction)

Supersede the per-character Ghost profile tab. Present one non-playable template character with stable system:ghost-profile identity in the creator collection. Keep it outside playable/story participants and media assignment. Its versioned fields define all regular character profiles. Place downloads, JSON intake, review and accepted structured values directly on desktop/mobile regular profiles. Preserve existing accepted structured values and legacy prose without migration or automatic overwrites. Adding a field creates an empty input for all existing/new characters; no field content is inferred. Provide a label/group/type editor on the template character.

## 2026-10-29: Legacy-first layout and full narrative profile proposals

At user request keep the original profile and relationships above the template-derived profile section on desktop and mobile. Full-generation exports explicitly request narrative background, personality, sexuality, speech and appearance in addition to internal traits/scales. Include current legacy/approved context and directed relationships without private administrator notes. Prioritize these narrative sections in the review wizard; optional follow-up answers append to their approved profile texts only at final user approval. New fictional details must remain labelled hypotheses with truthful provenance.

## 2026-10-29: Separate optional sexual-preference fields

At explicit user request add four neutral, optional text fields for preferences concerning penis, anal area, tongue and hand use. Shared schema propagation leaves existing values, canon and knowledge boundaries unchanged. Include the fields in generation-package metadata and field-review questions. Live rollout uses an explicit template revision and verified backup; no preferences are inferred or automatically populated.

## 2026-10-30: Derived profile overview for every template area

Render a creator-side overview above the existing profile and detailed shared fields. Cover every template group, custom groups and directed relationships; summarize only accepted structured values or explicitly labelled legacy source text. Preserve hypothesis/impression/private distinctions and show unknown areas without inference. Pending proposals and admin notes are excluded. Recompute after explicit approval; no external generation cost or canonical data mutation.

## 2026-10-30: Shared anatomy and body-hair generation guidance

At explicit user request attach editable guidance to the shared anatomy and appearance_detail text fields; retain stable field IDs and all accepted values. Full profile-generation packages include the A–D anatomy/body-hair checklist and the current template guidance. Guidance distinguishes explicitly supplied information from creative adult-fiction proposals; it does not infer intimate measurements from build, ancestry or unseen photographs, and does not assert every depicted person is fictional. New proposed details remain hypothesis/creator. Keep the existing JSON values format and separate approval. No automatic profile population or reference/canon changes.


## 2026-10-30: Explicit import-capacity recovery

Provide bounded import listing and idempotent cancellation on the shared authenticated
MCP service and private editor. Cancellation ends the session, releases reservation,
and removes only temporary chunks; committed media, links and receipts survive.
Reuse the existing exported event journal as a persistent tombstone, without a
schema migration. Preserve trusted/review authorization, serialize against active
byte processing and surface retryable cleanup failures. Never infer that an old
session should be cancelled without a user request.


## 2026-10-30: Shared profile-template editing through MCP

Expose character-independent bounded template reads and authenticated targeted
edits through the existing ChatGPT stdio and Grok OAuth transports. Reuse the
creator template validator/persistence; preserve omitted properties, existing
IDs/types/scales/source mappings and every character value. Explicit trusted
template edits need no extra conversational confirmation; review mode continues
through the private creator editor. Version checks, atomic idempotency receipts,
attributed before/after history and existing export/restore apply. Character
proposals remain a separate human-reviewed workflow and old proposals become
stale after template changes. No automatic live-template content change occurs
merely by deploying this capability.

## 2026-10-30: Mock-first media analysis with explicit proposal review

Implement phase-three infrastructure independently of any paid/cloud provider.
Only the local deterministic mock is enabled; it makes no recognition claim.
Keep immutable raw results, vocabulary/place matches, review decisions and added
link ownership separate. Respect explicitly selected goals and existing stable
HU/EN/alias IDs. Exact places require qualified human selection; unfamiliar
labels/places stay proposals until separate vocabulary/location editing.

Persist bounded jobs, pause/resume/cancel, source/provider-version cache and
safe restart behavior. Additive migration 023 backs up populated databases;
export/restore validates analysis consistency and pauses unfinished work.
Acceptance is additive, idempotent, preview-bound and reversible without
removing pre-existing or manually adopted links. Background assignment must
not alter character sorting roles/completion, notes or canon. Desktop-only
writes require Origin + dedicated CSRF; no new mobile or MCP write surface.
See docs/MEDIA_ANALYSIS.md and docs/AI_PROVIDER_COMPARISON.md. Real-provider
integration, private external uploads and spending need a separate explicit
choice and reviewed data/cost preview; no deployment is implied.
