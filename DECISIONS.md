# Decisions

## 2026-11-11: Owner-declared fictional AI collection origin

The owner explicitly states that the collection media were AI-generated from fictional
descriptions and authorizes applying that declaration to all existing and future media
inside the configured Living Universe media root. This supersedes the 2026-11-10 C2PA,
camera-marker and record-keyword origin gates. Legacy origin data is not authoritative.

`app/character-origin.mjs` checks active catalogue membership, actual containment and
ordinary file paths (no symlinks/junctions), without reading media bytes. It reports
`owner_declaration`, `fictional_ai_generated`, `independently_verified:false` and policy
version `2026-11-11.owner-declaration.1`. The old provenance cache is left intact as
history but is not consulted or written. Missing/restored/moved files are rechecked.
Reliable technical authentication will be designed separately later.

This origin policy is not reference approval or a blanket usage grant. Approved image
references retain their exact character assignment, reference ID, crop and source hash;
existing canon approval/integrity, adult-content/consent, real-person protection, provider
restrictions/refusals and upload/cost approvals remain separate. Historical approved videos
remain stored, but still-image generation receives image references only. No existing
profile, canon, media bytes or database origin rows are rewritten by this deployment.

## 2026-11-07: Video tagging samples one frame every 4 seconds

The owner chose video observation sampling at **1 frame every 4 seconds**
(sufficient for ~15–30 s clips and the same rule for longer ones). Tag those
stills with the same world-v1 / private-VLM path as pictures. Prefer including
the final frame when it is not already on the 4 s grid. Do not decode or upload
every frame. Video samples may support scene/action/participant proposals;
auto-canon from video remains abstain-by-default until a later explicit unlock
(motion blur and cuts are weaker identity evidence than stills). See
`docs/VISION_ENGINE.md`.

## 2026-11-07: Generation-plan drawings stay out of categorize queues

The owner does not want drawn pictures / illustrations that are mostly ideas and
future plans to be character-categorized. Media under
`20_SHARED_MEDIA/Unassigned/Generation plans, ideas` remain `planning_only`:
excluded from Needs sorting (desktop + mobile), vision trial tagging by default,
sorting suggestions, and auto-canon. They stay visible in the library and as
`generation_plan` in world-review. Other drawings should be moved into that
folder to inherit the same rule. See `app/media-purpose.mjs`,
`docs/VISION_ENGINE.md`.

## 2026-11-06: Vision engine = OpenAI gpt-6.1-sol (tag + identity)

For reliable machine tagging, sorting assistance and gated auto-canon, use
**OpenAI `gpt-6.1-sol`** via the Responses API (`OPENAI_API_KEY` in the app
process only). Tagging reuses the existing **world-v1** prompt/schema
(`app/world-v1-contract.json`, high detail, medium reasoning)—the same contract
already partially run against this library. Identity uses a second Sol pass
(`identity-v1`) that compares person regions to **approved** face/body reference
crops only. Grok/xAI remains available for chat/MCP/generation, not as the
catalogue tagger. Cost is accepted as secondary to reliability; operators must
`--estimate` and ack upload/cost before paid trials. Auto-canon writes stay
gated (`writer_enabled` + locked numeric gates + human face/body bootstrap).
See `docs/VISION_ENGINE.md`, `app/vision-engine.mjs`, `app/vision-identity.mjs`,
`app/auto-canon-gates.mjs`, `app/run-vision-tag.mjs`.

## 2026-11-06: Full machine auto-canon (policy lock)

The owner authorized **full automatic visual-canon promotion** by a machine
under explicit gates. This overrides earlier “human-only canon” and
“no automatic canon approval” defaults for the scoped workflow in
`docs/AUTO_CANON.md`. Sorting completion, ordinary depiction links, structured
tags, ratings, imports, generation registration, cover crops, and story events
remain separate and still do not imply canon by themselves.

**Multi-character rule:** a whole shared frame is never one character’s canon.
Detect person regions; match each region to an existing character or mark
unknown; auto-canon only from a character-bound crop with an explicit face
and/or body role. Crowded, overlapping, lookalike, unknown, gender-unknown, or
unclean crops must abstain into a human queue. Do not invent characters from
background people. Owner character policy (no female / no gender inference /
no automatic supporting characters) still applies.

**Abstain before numbers exist:** hard qualitative abstain rules in
`docs/AUTO_CANON.md` are in force immediately. Numeric similarity or confidence
gates stay **unset** until a held-out benchmark and an explicit owner lock-in of
those numbers. Do not invent identity percentages. Face and body are evaluated
separately; face-only evidence cannot auto-approve a body reference.

**Not enabled yet:** this decision authorizes the policy and future
implementation shape only. No model install, provider connection, paid call,
upload of the collection, automatic assignment, or live canon-writing job is
turned on by this document alone. Machine-written revisions must be immutable,
attributed (`machine` + method/model/version), rate-limited, audited, and
reversible through a new revision or the existing undo path. See
`docs/AUTO_CANON.md`.

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

Profile fields save independently on blur. Cover rectangles are presentation metadata, not canonical appearance changes. The primary relationship prompt is towards Palor, a fictional 32-year-old character and the playable protagonist whom whoever uses the program plays as. The player is not Palor. Tibor is the admin and app owner, not a character, and is unrelated to Palor. Movement choices in the UI are limited to depicted characters. Hungarian name suggestions are local creative proposals, accepted individually, retaining the previous label as an alias. Preserve known names, including Pákozdi Péter.

Tibor the admin and Palor the fictional character are separate, unrelated identities and must not be merged, aliased, or treated as one person. A past folder named Tibor must not be treated as the admin's in-world identity; the app no longer offers or performs that identity merge. Keep character IDs and approved histories distinct; do not automatically promote one character's canon into another. Palor's deceased in-world father, also named Tibor, is a separate fictional character and is not the admin. Unknown truckers can remain tagged scene extras rather than fabricated recurring identities.

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

The user has approximately 50 characters, mixed and character-specific folders, and shared-character media. Folder-based character creation and assignments require explicit selection. Profiles include editable biography, personality, aliases, appearance drafts, directed relationships, and private administrator notes. Tibor is the administrator and app owner, not a character. Palor is a fictional, 32-year-old character, unrelated to the administrator, and the playable protagonist whom whoever uses the program plays as. The player is not Palor, and Palor is not the administrator. Palor's deceased in-world father, also named Tibor, is a separate fictional character and is not the admin. Clothing and scene details do not replace underlying appearance.

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


## 2026-10-30: Explicit organized OneDrive layout

An opt-in storage-layout.json separates runtime source, character folders, shared media, staging, exports, backups and archive. Keep the live database and credentials outside OneDrive. IDs, depiction links, canon and immutable historical manifests survive journalled path migration. Scanner skips system/import/export/backup/archive trees. Imports commit once into shared Unassigned; character creation/rename/moves resolve nested folders. Consistent snapshots are staged locally and may publish only into the exact reserved 90_BACKUPS destination, which is excluded from media scans.

## 2026-10-31: Owner prohibition on female character creation

The owner prohibits creating, generating or accepting female characters and profiles, including supporting characters invented from another profile. The shared gender guidance and downloaded generation instructions carry this rule. The operator-owned local character-policy.json enables server enforcement for desktop/mobile/MCP creation, structured proposals and acceptance, image-plan preparation and execution; unknown gender requires clarification. New profile biographies carry an explicit gender declaration. Connection-local SQLite triggers protect insert/update/restore and reconciliation paths. Deleted identity hashes prevent accidental recreation without retaining their profile text. Existing image plans require a new plan under the active policy. Text and declared gender are checked; external provider image contents are not classified by a visual model. Existing human review and non-canon output status remain required.

## 2026-10-31: Explicit character-specific reference crops

Store normalized oriented regions per media/character/role without copying or replacing originals. Draft saves never affect existing approved references. Canon approvals and generation manifests snapshot coordinates alongside the source fingerprint; omitted regions preserve prior approvals. Compare coordinates as well as revision/source hashes because reference-only changes retain the appearance revision ID. Use approved regions for reference display, plugin delivery and provider inputs, with whole-source fallback only when no region is approved or original bytes are explicitly requested. Keep private human review, source integrity checks, export/restore and completed manifests intact. See docs/CHARACTER_REFERENCE_CROPS.md.


## 2026-10-31: Complete rename includes primary name and OneDrive folder

The owner explicitly requested one full rename instead of separate prose, name
and folder steps. Trusted MCP rename executes that explicitly requested operation
with stable IDs, verified backup, exact-plan conflicts, durable filesystem
compensation and audit. Preview-only remains explicit; review policy and ambiguous
identity selection remain supported. This supersedes the earlier development-only
separate folder workflow and mandatory private-page restriction for trusted rename.
Preserve existing source/profiles/canon and the local character policy.

## 2026-10-31: Owner-authorized one-click crop approval

The owner explicitly changed Save selection to approve the selected crop immediately, only through the authenticated administrator interface. Use the existing Tailscale creator identity and exact Origin/CSRF checks; no unauthenticated approval fallback or MCP trusted-mode bypass. Append an independently identified reference without replacing prior images/crops. Commit depiction assignment, crop, new canon revision and attributed approval history together; retries are idempotent and undo appends a compensating revision. This supersedes the earlier draft-only Save selection workflow and reference-only no-history rule for these new explicit crop approvals. Preserve old references at deployment. See docs/CHARACTER_REFERENCE_CROPS.md.

## 2026-11-09: Play mode — live AI characters and automatic memories with rewind

Owner decisions for Play mode (see docs/PLAY_MODE.md):

- **Characters are played live by an AI.** Provider: xAI Grok first; a local
  model may replace it later. The chat provider is a swappable adapter (like
  image providers). Paid calls stay off until locally configured; show cost
  information and keep a daily cap. Prompts receive only the participant-level
  scene pack (no administrator notes, drafts or creator-only events). Adults only;
  the local character policy still applies.
- **Play memories save automatically** — no per-memory approval. This applies
  only to memories, relationship levels, story-clock and positions produced by
  Play mode sessions. It does not change visual canon, approved appearance or
  profiles, which keep their existing approval rules.
- **Rewind:** every conversation ends in a save point. Rewinding restores the
  world (play memories, relationship levels, clock, positions) to a chosen save
  point by appending compensating revisions; nothing is hard-deleted, so a
  rewind can itself be undone.

## 2026-11-09: Autonomous world engine, relationship levels, pacing

- **World runs without the player.** Borrow Google Concordia's *pattern* (a game
  master that resolves what happens + character agents built from components:
  goals, routine, memory, relationships, observations) but implement it inside
  this Node app so it shares memories, revisions and rewind. Do not add
  Concordia/Python as a dependency.
- **Level of detail:** full live dialogue only where Palor is; off-screen
  characters get one or two short summary turns per in-world day; meetings
  between characters are summarised exchanges. When the app was closed, the
  world catches up with one summary per character per missed day (no 24/7 PC).
- **Only characters with a filled Szellemprofil act on their own** (goals,
  routine, motivations). Others appear only where the creator places them;
  never invent goals, routines or new characters. Groups stay crowds.
- **Off by default.** The world simulation is switched on explicitly by the
  owner, uses the Grok adapter with a daily cost cap (target budget under
  $60–100/month; expected far less with a Fast model), and its events are
  automatic play memories covered by rewind.
- **Clock 1:1 with real time**, but with *dramatic compression*: life
  developments (relationships, conflicts, goals) move faster than in real life.
  A game-master pacing rhythm alternates quiet days and eventful days, with
  events coming from characters' own goals and conflicts colliding rather than
  random disasters. No push notifications or reward loops; on return the player
  gets a short "Mi történt, amíg távol voltál" digest.
- **Relationship levels:** closeness levels per pair (not only towards Palor).
  Starting levels are proposed by the AI from existing relationship notes and
  confirmed once by the owner as a list; afterwards play changes them
  automatically (rewindable).
- **Content language for character data is Hungarian** (profiles,
  relationship notes, dialogue). The 14 English relationship notes were
  translated on 2026-11-09 (backup + journal in desktop-catalogue/backups,
  `before-relationship-hu-*`). Code stays English.

## 2026-11-09: World engine — owner answers

- **Palor while the player is away:** frozen at home. Characters may send him
  messages, which wait for the player.
- **Game master freedom:** anything may happen except killing characters.
  Serious events (conflicts, breakups, crime, etc.) are *proposed*, not final:
  on return the player sees a summary and can accept or refuse each proposed
  serious happening. Everyday off-screen events apply automatically (rewindable).
- **Daily cost cap:** 1.5 USD.
- **Locations:** characters' residences, workplaces and routine places are
  linked to existing map locations (proposed from profile/routine, confirmed and
  editable by the owner). Missing places stay unlinked; never invented.
- **Starting relationship levels:** AI-proposed from the relationship notes;
  the owner accepts them.
- **xAI API key:** the owner will provide one; it is entered through a local
  settings field, stored outside OneDrive and Git, never pasted into chat.

- **Profile suggestions (owner, 2026-11-09):** the engine uses all Szellemprofil values — facts, hypotheses, [Javaslat] and Grok suggestions — as working truth for play. Play never promotes them to facts or approves them.


## 2026-11-09: World engine v1 built

- Code: `app/world-engine.mjs`, `app/world-ai.mjs`, migration 027, screen
  `app/public/world-engine.js` (the "Élő világ" menu item), key setup
  `Connect Grok.cmd` → `xai-key.dpapi` (DPAPI, desktop-catalogue folder).
- **Knowledge boundary:** each character's own Szellemprofil (visibility
  `creator`) is used only in that character's own agent prompt and in the game
  master prompt; it never goes into another character's prompt. Character
  admin notes are never used. Explicit fields (anatomy, appearance_detail,
  intimacy, sexual_*) are excluded from daily prompts.
- Model: `grok-4-1-fast-non-reasoning` (USD 0.20 / 0.05 cached / 0.50 per M).
  Uncertain billed calls are not retried; the run stops.
- Place links: free keyword/own-name suggestions (source `suggested`), editable.
- Not yet built: rewind/save points, live dialogue in scenes, intimate-scene
  routing, Play map/place/scene screens.

## 2026-11-09: World engine tuning and Play mode v1

- World clock: four day parts (reggel 6, délután 12, este 18, éjszaka 22),
  run when due; missed days catch up as one compressed round each. Strangers
  may only appear together as a declared first meeting (both become
  "ismerős"). One serious proposal per day at most.
- Play mode v1 (`app/play-mode.mjs`, `app/public/play.js`, migration 028, menu
  "Játék"): map from the approved location tree; positions from today's events,
  else routine by day part; place view with a location-reference photo; live
  Grok conversation (in person only where the character is, or by phone).
  "Beszélgetés vége" is the save point: memory for both, the character's level
  towards Palor moves at most one step, and a world event is recorded.
- Knowledge boundary in conversations: the character gets his own profile,
  his own note about Palor, his memories and today's events; Palor's notes
  about him and explicit fields are never sent.
- Quick-tag location tab: Kollázs / Referenciakép tags (group "Kép típusa")
  remove a picture from the location queue and count as sorted.
- Not yet: comic speech bubbles on scene photos, rewind, intimate scenes.

## 2026-11-09: Location backgrounds from the Grok app (no API credits)

Owner request: background images for locations (also real places like
Városliget, Káloz) are generated natively in the Grok app (subscription), not
through the paid API. New MCP tools `list_locations` and
`import_location_background` (trusted mode) let Grok save a generated image by
its public HTTPS URL; the app downloads it with the existing safe downloader,
verifies JPEG/PNG bytes, stores it under `Helyszín hátterek/<location>` without
overwriting, tags it with the location and "Helyszín háttér", and marks it as a
location reference so Play mode shows it. Desktop fallback: "Háttérkép
feltöltése" on the Play place screen. Tool guidance: research real places and
describe them, no identifiable real people, no copying others' photos, no
ethnic or social stereotypes. Canon is never changed.

## 2026-11-09: Play mode layout and character figures

- Play mode is full screen (studio sidebar/top bar hidden; ⛶ and Kilépés).
  Three levels: world map (towns with counts) → town view (place cards) →
  place scene. Only people exactly at a place appear in its scene; at night a
  character without a linked home is not placed anywhere.
- Character figures ("Szereplő-alakok"): visual-novel figures saved by the
  owner into `…/Szereplő-alakok/<character name>/alap.png` (+ optional
  expressions, file name = expression). Made in the Grok app from approved
  references on a plain green background (MCP tool `list_character_figures`
  gives the guide). The browser removes the plain background; files are never
  changed. The catalogue scan skips this folder. Figures are display assets,
  never canon or approved references. In talks the AI may pick one of the saved
  expressions as mood. Characters without figures show their cover photo card.

## 2026-11-09: Rewind, journal and relationships in Play mode

- Rewind built (`app/world-rewind.mjs`): save points are finished conversations
  and world rounds. Rewinding marks later events/messages/conversations as
  rewound (`rewound_at`), gives later play memories a "rewound" revision, sets
  relationship levels back through new revisions and steps the world clock
  back (later day parts are lived again). The latest rewind can be undone while
  nothing new happened since. Nothing is deleted.
- Play top bar: 📖 Napló (story by day, serious decisions, save points with
  "Visszatekerés ide"), ♥ Kapcsolatok (both directions' levels, last talk,
  phone message), ✉ messages (opening marks them read). Keys: M, N, K, Esc.

## 2026-11-10: Play mode cycles 4–14 (owner request)

- Location tree module (`app/location-tree.mjs`): short names in the game
  (parent names repeated in a child's name are dropped: "Sanyi háza - nagyszoba"
  → "Nagyszoba"; lone possessives keep their owner: "Domi autója"), full paths
  for AI prompts ("Káloz › Cigánytelep › Sanyi háza"). Town view groups areas
  whose places have rooms (Cigánytelep → Sanyi háza → room chips).
- NPCs speak first when Palor walks up (opener), know what they are doing now,
  their last talk with Palor, a closeness-based speaking style and a time-of-day
  mood. World prompts get the season, place paths and "already done today".
- Photo scenes order everyday pictures first (intimate ones marked, later);
  people photos used as place backdrops/cards are blurred.
- Shared photos (Palor + character): shown on Kapcsolatok; Palor can show one in
  a conversation and the character reacts to its description.
- Consistent figure prompts (`app/figure-prompts.mjs`) from approved appearance
  only, green screen, one outfit for all expressions; on the Élő világ
  readiness panel and in the MCP tool.
- Phone-style messages (contacts + thread), transitions, typewriter dialogue,
  narrow-screen layout, focus/ARIA labels. Readiness panel on Élő világ.

## 2026-11-10: Ten improvement cycles (owner request) and the intimacy protocol

- Intimacy protocol: owner switch (off by default) + relationship stage
  (none / flirt ≥ barát / intimate ≥ bizalmas or a recent intimate moment) gates
  pictures, videos and intimate scenes. Explicit profile fields only in an
  in-person intimate scene; consent rules in the prompt; the character may
  refuse. Unanalysed/unmarked media and all videos count as intimate. Details in
  `docs/IMAGE_PROTOCOL.md`.
- Shared scene pictures (`app/scene-images.mjs`): folder, upload, owner content
  marks, Palor+character scene prompts, insert log. Background prompts per place
  (day/evening/night). MCP `get_scene_prompts`.
- NPC life: mood of the day, gossip, days since last talk, whose place it is,
  memories about Palor first, wrap-up of long talks, auto-save on leaving, one
  message per day, invitations/appointments.
- Engine: repeat filter, tempo, holidays/weekend, proposal expiry (7 days),
  whole-round budget check, run log, cost history.
- Rewind also cancels appointments; backups include the new play tables.

## 2026-11-10: NSFW from the start, generated Szellemprofils, place network (owner request)

- Owner: "The game is explicit, nsfw oriented from the start". The adult switch is
  now **on by default**; stages: none only for open hostility (-2), flirt for
  strangers/tense (-1..0), intimate from acquaintance (≥ 1). Prompts write sex
  scenes openly; the remaining rules are adults and the character's own will.
  The off-screen game master and agents may plan sexual events (`intimate:true`).
  This supersedes the stricter thresholds of the entry above.
- Szellemprofils for 29 characters were derived by Claude from their existing
  profile text and relationship notes (owner: "generate full profiles … based on
  the data you can already find"), uploaded through the app's proposal/accept
  API as working truth (`kind: hypothesis`). Existing texts were copied
  verbatim; unknown values stay unknown ("(A forrás nem rögzíti.)" fields were
  left empty). The four explicit sexual-preference fields are left for the owner
  (Grok). Backup: `before-ghost-profiles-2026-11-10.sqlite`; journals
  `ghost-profiles-journal-*.json` in the catalogue folder. Nine biographies got
  the policy's own „Nem: férfi.” first line because words like "szőrzet nő" or
  "women's ward" tripped the gender heuristic. Skipped: Max Hale, TopFiu (their
  text never states gender) and characters without profile text.
- Place network (`app/place-network.mjs`): place kinds from names, town = the
  highest place under the grouping layers, same-name public places in
  different towns are branches of a chain (own staff each), a character's car or
  van follows its owner, rough trip times, chance meetings and street happenings
  between buildings/towns (never between rooms).
- Palor's things (`play_items`): a vehicle stays where it was parked until he
  drives it (it parks at the destination's building); items can be put down and
  picked up again.

## 2026-11-10: Grok picture pipeline over MCP, and the origin rule

- Owner asked for a continuously upgraded Grok MCP that uploads/downloads pictures
  generated from the characters, "so Grok won't stop the process due to being
  overly cautious", stating all characters are fictional. Built: needs, briefs,
  jobs (single and batch), placing imported pictures into the Play folders,
  visual packs, an owner panel. See `docs/IMAGE_PROTOCOL.md` §3b.
- Not built, by Claude's decision: anything that rewords or reframes prompts to
  get past an image generator's refusals (refusals are recorded and skipped), and
  reference-photo or intimate image generation for characters whose records show a
  real person (Palor's classmates, colleagues, relatives, village; people seen on
  the metro/IKEA/TikTok; dated names; real celebrity names). The records contradict
  "all fictional" for these, and sexual images of real people without consent are
  harmful. `app/character-origin.mjs` applies the rule from each character's own
  record; it is not an owner setting.

## 2026-11-10: Rename reaches the game; Palor judged by his record; no GitHub

- Owner: a character rename must change all references, folder names, log records
  and file names. The complete rename now also edits world events (title, summary,
  memories, level reasons), memories and memory revisions, messages, conversation
  lines and summaries, level-revision reasons, place notes, Palor's items and picture
  jobs; moves Szereplő-alakok/<name>, Közös jelenetek/<name> and the background
  folders of places renamed with him; renames file names that carry the name; and
  writes a new location-tree revision (app/rename-play-extras.mjs). Catalogue paths,
  figure records and the move journal follow. Undo reverses all of it.
  Kept unchanged on purpose: the rename's own undo journal, the file-move journal
  (old paths), immutable canon revisions and older story-event revisions.
- Game text only uses catalogue names, so a unique name in game tables counts as his;
  a place counts as his when the living world links it to him (world_places).
- Owner: Palor is invented, not the owner. The "own figure" exception for reference
  photos is removed; Palor is judged by his own record like everyone else.
- The MCP tells Grok that no GitHub or other online repository exists (Grok was
  routing tasks to its GitHub connector). No file-editing tools are added to the MCP:
  it is reachable through the Tailscale Funnel.

## 2026-11-11: Rename rewrites everything (owner request)

- Owner: "az égvilágon minden íródjon felül. A Kánon is, a referencia is, minden passzoljon."
  Replaces the "kept unchanged" list of the entry above. The final rename (app/rename-finalize.mjs)
  already rewrote canon revisions, older event revisions and the move journal in place; the
  owner chose in-place canon rewriting over a new canon revision (explicit exception to canon
  immutability, renames only; the verified pre-rename backup is the way back).
- New: every file and subfolder name carrying the old name follows, inside his own folder, in
  the shared library and in removed items (restore targets follow). Catalogue paths, figure
  records, place folders, scan candidates and the move journal follow the real move. File
  bytes, media IDs and links stay; a taken destination is skipped and reported, never
  overwritten. Path columns are only changed together with the file, never as bare text.
- An approved story event stays approved after a rename (only the name changed).
- Other characters' names/aliases containing the old name ("Kis Bence" when renaming
  "Bence") are left untouched; unambiguous mentions change everywhere, history included
  (previously the whole history rewrite was skipped in that case).

## 2026-11-10: Reference pictures judged by their files, not the character

- Owner: "You only need to care about the chosen reference photos and videos."
  Replaces the record-based origin gate. A reference picture may be sent to an image
  generator only when its file carries C2PA credentials of an image generated from
  text (trainedAlgorithmicMedia, no ingredient image). Camera photos, edits of an input
  image and unproven files are never sent. A character with at least one such
  reference gets the full pipeline; intimate picture prompts also for characters
  recorded as invented (text-only). Scan of the live catalogue: 35 of 163 approved
  references proven generated, 6 camera photos, 122 without proof; 15 characters
  unlocked (each sends only his proven files).

- Same day, owner: "Delete any flagging". The record-based real-person labels
  (school/work/family ties, TikTok/metro/IKEA words, dated names) are removed from
  app/character-origin.mjs and from the Grok tools. A character is only "invented"
  (his record says so) or "not stated"; real place names play no part. The file
  check never wrote anything into image files or the database.

## 2026-11-10: Development of the three weakest areas

- Places: more kinds recognised from names (new kind "public": police, school,
  library…); Play search matches full names, linked characters and who is there.
- Tree tidy-up: "Rendrakási javaslatok" in the location tree editor suggests a parent
  from name prefixes (places not yet in the tree ticked, moves of placed ones not),
  lists same-named siblings; it changes only the unsaved plan — saving and approving
  stay with the owner.
- World engine tiers: characters close to Palor (level ≥ 1 either way, a meeting today,
  a talk in the last 3 days) act every day part; others every other day part; lively
  tempo wakes everyone. The per-day estimate counts distant characters at half.
- Pictures: "Igazolt képek keresése" lists each cast member's pictures that carry C2PA
  text-to-image credentials but are not approved references (Grok tool
  list_reference_candidates); approval stays in the reference editor. "Grok-feladat
  másolása" copies a ready batch instruction for the Grok chat.

## 2026-11-10: Erased media leave no catalogue record (owner request)

- "Végleges törlés" in Removed items now also removes the catalogue record, links, tags and analyses (the permanent-delete clean-up), once the file is gone. A catalogue-only removal whose original still exists keeps its record, so a rescan does not import it again. Approved canon references are never purged.
- One-off clean-up: the 1,112 records of earlier erasures were removed (backup `before-purge-erased-2026-11-10.sqlite` in the catalogue folder). 19 items remain in Removed items, restorable.

## 2026-11-10: Media director (owner request)

- `app/media-director.mjs` decides which of the creator's own pictures/videos appear in which Play panel (journal, scene, phone, portrait, memory). Score: cast (exactly these people; panel decides strictness), place (tag here, else same town), content level vs mood (owner label > AI analysis > unknown counts as intimate but ranks below confirmed levels), panel shape (size from file headers, cached), creator feedback, already shown, description overlap with the moment. Reasons are returned with every pick.
- Ceiling = lowest of mood, panel and the adult switch. Portraits are always everyday pictures. Intimate media start blurred in the journal, phone and shared-memory panels.
- Journal: each story event gets one stable picture with all of its people in it (none rather than a misleading one); ↻ another, 👍 fits, 👎 never again for this panel and cast. NPC–NPC intimate events get intimate media of exactly those two when the adult switch is on.
- Élő világ has a "Médiarendező próba" test bench, including the creator's own content-level label (`play_content`).
- Nothing is uploaded or generated; only local bookkeeping tables (`play_media_feedback`, `play_media_shown`, `play_media_sizes`, `play_event_media`).

## 2026-11-10: Next-gen media director, local media signals, video analysis plan (owner request)

- The director now feeds every Play panel: scene photos (`photos()`), shared photos (memory panel) and pictures characters send by phone (phone panel; the reply's `photo` field asks for everyday/flirt/intimate, capped by the intimacy stage; stored in `play_line_media`). The old ad-hoc pickers were removed; the old scene picker's "AI level before owner label" order is fixed.
- New scoring: wanted level (mood) vs allowed level (stage) are separate; intimate scenes escalate (nudity early, explicit later, by line count); camera framing per panel; time of day from descriptions; continuity (next picture from the same shoot: same folder within 45 min or close file numbers; a near-duplicate of the previous one is avoided); feedback counts weakly in other panels; "already shown" fades with time; one picture per near-duplicate group; a confidence label per pick.
- Stand-in figures: a character without a drawn figure stands in the scene as his best everyday picture (portrait panel), cropped to his confirmed region or approved body crop, edges faded. Presentation only; nothing is written to files or canon.
- Local signals (`app/media-signals.mjs`, `app/public/media-signals.js`): the creator's browser computes a 64-bit dHash per picture (near-duplicate groups per cast, ≤6 bits) and saves video stills at the locked plan (1 / 4 s + last frame, at most 12, spread over long videos) as JPEG cache files in the data folder (outside OneDrive). EXIF capture time is read server-side. Free; nothing leaves the computer. Started from Kezdőlap › Helyi médiaelemzés.
- Video analysis stays a separate paid step: `app/run-video-analysis.mjs` (`--estimate` default; `--trial` needs `--ack-upload --ack-cost --ack-adult --max-usd`; no retry after a failed or uncertain call). Each still is tagged with world-v1 on gpt-6.1-sol (vision lock unchanged); level and description go into `media_video_frames`. A video's level = its most intimate analysed still; its loop starts at the still that fits the moment. Plans: `lock` (all saved stills) or `minimal` (first + last + most different, about one per 6 s). Measured on the 390 videos (durations read locally, 2026-11-10): lock 1,924 stills ≈ $39, minimal 1,279 ≈ $26, at ≈ $0.0205 per still (average real usage of the 1,376 tagged pictures). Not run.
- Owner decision (same day): videos longer than 35 s are skipped — the browser records only their length, no stills are saved and the paid runner never sends them (`MAX_VIDEO_SECONDS`). That is 6 of the 390 videos; they stay "unknown = explicit" for the director. Estimates drop to roughly $38 (lock) / $25 (minimal); exact figures appear on Kezdőlap after the local pass.
- The Content-Security-Policy keeps `style-src 'self'` (no inline style attributes); dynamic sizes are set through the CSSOM, as elsewhere in the app.

## 2026-11-10: Safety nets, review screens, group scenes, five audit cycles (owner request)

- Code checkpoints (`ops/code-checkpoint.mjs create|list|diff|restore`): Git is not installed, so each development batch copies the source (never media, databases or keys) to `%LOCALAPPDATA%\LivingUniverse\code-checkpoints`. Restore only into a new folder. Checkpoints made: before-cycles, suggestions-done, cycle-1…4.
- Automatic catalogue snapshots (`app/auto-snapshots.mjs`): daily while the app runs, SQLite online backup + integrity_check into `<data>/auto-snapshots`, newest 7 kept; only its own `auto-*.sqlite` files are rotated. The deliberate `Backup Living Universe.cmd` stays the real backup.
- "Tartalom és hasonlók" (`app/media-review.mjs`, `app/public/media-review.js`): (1) keyboard content labelling of media with unknown level (1/2/3, S skip, Backspace undo), stored as the creator's label; (2) near-duplicate groups with a suggested keeper (canon reference, else largest); the others go to Removed items. Note: catalogue removal deletes a picture's AI analysis (existing trigger), which the confirmation says. "Not duplicates" is remembered (`media_signal_distinct`). The 661 existing duplicate-finder hashes are reused.
- Élő világ readiness: photo-figure status per character, one-click copy of all missing figure prompts, per-place background prompts.
- Group scenes in Play: Palor with 2–4 people at one place; one AI call per turn returns 1–3 short replies (names matched to participants only, unknown speakers dropped). Never intimate, no explicit profile fields, same knowledge boundary as 1:1. Save point writes a memory for each participant and Palor; no level changes.
- Audit fixes (5 cycles, 30+ check types): wrong-typed ids gave 500s in 7 endpoints (talk, group talk, content label, media feedback, relationships, visual duplicates, suggestion feedback); JSON export lacked character memories and their history, generation feedback and duplicate decisions; permanent delete left Play/media rows behind (now cleaned, tested); missing indexes (depictions.character_id, play_media_shown.cast_key); near-duplicate grouping blocked the server (bucketed numeric compare, debounced: 2,000 pictures in ~160 ms); journal re-ranked 40 events per load (now cached, ~3 ms warm); stand-in cache now clears on content labels; provenance checks are stored (`media_provenance`) instead of re-reading files after every restart; skipped videos no longer download in full; keyboard Enter/Space opens map towns; accessible names for icon buttons and Play inputs; Hungarian texts for Play/world/media server messages; content queue end state; checkpoint ids cannot escape their folder.
- Cycle 6: pages also send Referrer-Policy no-referrer, a Permissions-Policy (no camera/microphone/location/payment) and COOP same-origin; a group scene whose people have left now closes with its save point instead of refusing every line; rewind save points name everyone in a group scene; 25 more Hungarian server messages; new tests for the video-analysis CLI (estimate makes no call, paid mode refuses without every acknowledgement or key) and the readiness, relationships, director-pick and journal-picture routes. Remaining English texts are machine error codes for MCP/API callers.

## 2026-11-10 — Grok picture sessions: instructions over MCP, link hand-back, self-closing jobs

- New read-only MCP tool `get_generation_instructions` serves the owner's playbook (`app/generation-playbook.mjs`); `docs/GROK_GENERATION_PROMPT.md` holds the one-line starter and a pasteable copy (a test keeps them identical).
- `finish_generation_job` and `place_play_asset` accept a public HTTPS `url` instead of `media_id` (shared SSRF-safe downloader, decoded JPEG/PNG, 20 MiB; cheap checks before any download). Backgrounds no longer need a character-bound media import.
- Open jobs whose picture arrived by folder or desktop upload are closed as done when needs/jobs are read.
- Unverified: whether Grok app result links are downloadable without login; the folder route is the expected fallback.

## 2026-11-10 — Képműhely (image workshop): five image-handling changes

- New desktop view **Képműhely** (`app/image-workshop.mjs`, `app/public/image-workshop.js`), five tabs:
  1. *Új képek*: every active item with its steps (local signals, open near-duplicate, who is on it or "nobody", content level, optional AI tags), the next step with a one-click/keyboard fix (← →, 1/2/3, N, Enter).
  2. *Képgyártás*: Play picture needs with full briefs, prompt copy, Grok starter message, opening a job with an owner note; refused/failed items can be offered again.
  3. *Ellenőrzés*: placed/generated pictures beside approved references, free checks (size, orientation, near-duplicate), face and body verdicts kept separately (`workshop_checks`). Reject/regenerate requires a note; a rejected figure stops counting (`sprite_rejections`, file kept), a rejected catalogue picture goes to recoverable Removed items; notes return as `owner_feedback` in later briefs and `owner_note` on reopened jobs.
  4. *Javaslatok*: content level and character links carried across near-duplicates and clear folder runs (owner applies each; additive only; dismissable). Paid-tagging priority list (fewest usable pictures first) with measured per-image cost; writes `tagging-priority.json` and prints the CLI commands; `run-vision-tag.mjs --ids-file` follows that order. Nothing is sent from the app.
  5. *Készültség*: per cast member checks and the next fix; an auto-canon benchmark set (held out from approved references, bootstrap rule) can be saved; no paid run, gates stay unset.
- Not built: paid-API batch approval (per-image private approval stays). Grok is the free route.

## 2026-11-10 — Paid vision runs, OpenAI identity refusal, local face/body method

- Owner authorized (chat): AI tagging of the untagged pictures, video analysis (minimal plan) and the auto-canon benchmark; OPENAI_API_KEY is a user environment variable (value never read into chat or files).
- Tagging: `run-vision-tag.mjs --ids-file` + new `app/import-vision-tag.mjs` (preview → apply with integrity-checked backup, world-review import service). 75/76 tagged; 1 refused by the provider (HTTP 400), not retried.
- Scene-check fixes (`analysis-scene.mjs`): a person's box reaching past the frame is clipped; one participant may hold two different roles in one activity. Rejections now name the failed rule (`detail`). 13 billed answers had been discarded by the old check before the fix.
- Identity-v1 on gpt-6.1-sol: the strict schema needed every property required (HTTP 400 before). Then OpenAI declined all 40 benchmark pictures ("can't identify or match a person"). Not worked around. The cloud method cannot serve auto-canon.
- Local method installed with owner approval (outside OneDrive/Git: `%LOCALAPPDATA%\LivingUniverse\vision-local`): onnxruntime-node 1.22.0 + sharp 0.34.3; InsightFace buffalo_l det_10g + w600k_r50 (non-commercial licence), DINOv2-small ONNX. The gender/age and landmark models from the package were deleted (owner policy: never infer gender). `app/local-identity.mjs`, free benchmark `app/run-local-identity-benchmark.mjs`.
- Local benchmark (40 pictures, 21 s): face threshold 0.30–0.35 → 82% hits, 0/38 false alarms (small sample; upper bound of the true false-alarm rate is still several percent). Body via DINOv2 is not reliable without person boxes (0.6 → 46% hits, 12% false alarms). Thresholds stay unset; the writer stays off until the owner locks them; switching the identity method from gpt-6.1-sol to the local method is the owner's call.

## 2026-11-10 — Characters are male by default (owner)

- Owner: guessing gender is no longer forbidden, but every character is male by default. `character-policy.mjs`: only a female gender is refused; an unknown or missing gender counts as male (no clarification step; `unknown_gender_default:'male'`). New characters (desktop, mobile, folder sync) get "Nem: férfi." unless another non-female value is given; the mobile form defaults to Férfi. AGENTS.md policy line amended. Female characters stay refused everywhere (triggers, prompts, generation).

## 2026-11-10 — Best-suited model per job (owner)

- The gpt-6.1-sol exclusivity is lifted: each vision job uses the model best suited to it (quality, cost, privacy, provider permission), chosen with a benchmark and recorded here; provenance keeps model/method/version. Current: tagging and video levels on gpt-6.1-sol; character identity (face) on the local InsightFace method; body comparison interim DINOv2. Approval rules for installs, private-media uploads to a new provider and paid calls are unchanged. AGENTS.md and docs/VISION_ENGINE.md updated.

## 2026-11-10 — New figures replace the previous one (owner)

- Owner: "let the program override previous saves". A placed character figure is written as `<expression>.png` and replaces the earlier file(s) of that expression (any extension and `alap-2`-style versions). The old files are first copied to `<data>\backups\figures\<character>\<timestamp>\` (outside OneDrive, byte-checked), then removed; the new file is written beside them and swapped in, so a failure never leaves a half file. Identical bytes change nothing. An earlier Képműhely verdict on that figure is cleared so the new one is checked. Backgrounds and shared scenes still never overwrite (several per place/character by design). One-off before this: Attila's and Domi's `alap-2.png` became `alap.png`, old ones backed up in `backups\figures-20261110-212045`.

## 2026-11-10 — Place tidy-up: every dash part is a level (owner)

- `cleanupSuggestions` (location-canvas-model.js): "Káloz - Szomszéd ház - Nappali" goes under Káloz › Szomszéd ház. The anchor is the longest prefix that is a place's full name; each further part is matched to a child by its own name or the full prefix; a missing level is proposed as a new canvas place, made once and shared by all rooms needing it (`applyTidy`). Unclear cases (two same-named children) are skipped, and a place the owner already placed somewhere inside the anchor is not moved into invented levels. Only the unsaved plan changes; saving/approval stays manual.

## 2026-11-10 — Figure sources leave "Rendezésre vár"

- Grok figure uploads land in `20_SHARED_MEDIA\Unassigned` as catalogue items and are copied into Szereplő-alakok; the originals (play_asset_sources) appeared in Rendezésre vár. They now stay in the catalogue but are left out of the inbox count/list and the unassigned/pending/multiple sorting filters (server.mjs `notPlayAssetSQL`). Live: 14 such uploads.

## 2026-11-10 — Grok may use every approved reference for everyday pictures (owner)

- Owner asked that the Grok MCP can use all approved reference pictures. Done for figures, expressions and everyday (non-intimate) scenes: `character-origin.everydayReferences` lists every approved reference (photographs included); briefs, `get_character_visual_pack` and figure prompts use it; tool descriptions and the playbook (2026-11-10.3) explain it; `everyday_references_allowed` is reported next to `reference_photos_allowed`.
- Kept on purpose: nude or sexual pictures use only references proven generated from text (C2PA, no input image), and intimate prompts still need a proven reference or an "invented" record. A real photograph must not become the face of an intimate generated picture of a possibly real person.
- Also: `refreshMediaReviewControls` ignores a viewer that was already closed or replaced (likely source of "Cannot read properties of null (reading 'querySelector')" reported on Bálint's reference selection; not reproduced on a database copy).

## 2026-11-11 — Video analysis finished

- Minimal plan on gpt-6.1-sol: 356 videos (1,134 stills) analysed; video level = highest still: 94 everyday, 46 nudity, 216 sexual activity. Reported spend ≈ $25.9 (plus an unknown small amount for 2 provider HTTP 520 attempts and one request cut off when switching to 4 parallel requests). Not analysed: 2 videos after HTTP 520 (not retried), 5 undecodable, 6 longer than 35 s. `run-video-analysis.mjs` gained `--concurrency` (1–6) and `--skip`, and resumes an interrupted video with its missing stills only.

## 2026-11-11 — Play: scenes that follow the conversation (cycle 7)

- In-person replies now return a scene beat (talk, flirt, kiss; undress, sex, after only inside an intimate scene; only talk when the stage is closed), a spark (-1/0/+1: how Palor's line landed) and three suggested next lines for Palor. Stored in `play_line_meta`; same single AI call, no extra cost.
- Automatic scene picture: the director picks a picture/video for the moment when the beat changes, at the start, or after three replies on one picture; never one already shown in that conversation; the beat is both the wanted level and the ceiling (a flirt or kiss never shows nudity). Stored in `play_line_scene` with video start time and speaker boxes; the client crossfades it in (setting "Jelenetkép automatikusan…", default on); shown scenes count as seen.
- Videos: their analysed stills' descriptions now act as the video's description for story matching, and the start still is chosen by level and by how well its description fits the conversation.
- Chemistry: the sum of sparks is shown during the talk (♥ ±n, floating heart/crack per reply) and handed to the end-of-conversation summary for the level change.
- Album: per character, the scene pictures/videos seen together (intimate ones blurred until tapped) and the still locked ones counted by level (`/api/play/album/:id`, Kapcsolatok › Album).
- Group scenes do not get beats/scenes yet.

## 2026-11-11 — Cycle 8: intimate scene pacing, group scenes, connectors

- Intimate scenes: pace controls (Lassabban / Folytassuk / Álljunk meg) send a stage direction; "stop" turns the conversation back to normal mode and the character is told to respect it; pace outside an intimate scene is refused. The current beat is shown next to the name (♥ flört, 💋 csók, 👕 vetkőzés, 🔥 együtt, ☁ utána).
- Group scenes: suggested replies, beat (talk/flirt only – still never intimate) and an automatic everyday scene picture of the company (first speaker in focus).
- Phone chats show the suggested replies. The manual photo browser follows the current beat (wanted level and ceiling).
- Startup tasks and the ChatGPT tunnel profile pointed to the old project folder (`OneDrive\Kríziskezelő Központ\Új mappa\…\00_SYSTEM\project`); after the 05:00 reboot nothing restarted, so Grok could not renew its token. The tunnel profile's MCP command now points to `mcp/server.mjs` with system Node (backup beside it). Changing the scheduled tasks was blocked for the agent; the owner changes them. The tunnel's stored OpenAI key is rejected (401) and must be renewed by the owner (`node mcp/start-tunnel.mjs --new-key`). ChatGPT prompt: `docs/CHATGPT_PROMPT.md`.

## 2026-11-11 — Cycle 9: reliability and dates

- System status (`app/system-status.mjs`, home screen): reads the three "Living Universe" scheduled tasks (program, working folder, launcher script, other code copy), probes the Grok gateway on loopback and checks the ChatGPT tunnel process; shows a warning with the exact Task Scheduler fix only when something is wrong. Read-only; cached for a minute. Reports key presence only, never values.
- OAuth refresh rotation keeps the used refresh token valid for 10 more minutes (lost response after sleep/network drop no longer strands Grok); revoking a grant still removes the whole family. Test updated.
- Dates: an accepted invitation is recorded in `play_dates`. When Palor arrives at that time and place the character knows it is their date and the summary says so; a date Palor missed is brought up once in the next talk (both are mentioned when both apply). Chance meetings on the road are not dates.
- JSON backup now includes the owner's Képműhely verdicts, "nobody on it" flags, dismissed suggestions, rejected figures, conversation beats/scenes and dates; permanent delete also clears the "nobody on it" flag.

## 2026-11-11 — Cycle 10: optimisation and logic fixes

- Speed (DB copy, warm): `/api/duplicates/groups` 351→143 ms (file checks 32 at a time instead of one by one), `/api/locations` 192→81 ms (one grouped count; same numbers), `/api/world-review` 181→131 ms (linked characters only for the page shown).
- A conversation in which Palor never spoke (he walked up and left) closes without a paid AI summary, memory or level change (1:1 and group).
- Relationship pacing: at most one step closer per character per world day; a step back is always possible; the end note says when a step was held back. Stops "grinding" with many short chats.
- With the automatic scene picture switched off, no scene is picked and nothing is counted as seen or unlocked in the album.
- Owner (2026-11-11, later the same day): the daily cap is three steps closer per character per world day, not one (MAX_DAILY_RISES=3).

## 2026-11-11 — Real Grok probe (owner-approved, on a database copy)

- Domi at the gym, `grok-4-1-fast-non-reasoning`, ~12 calls: beats, suggested replies (natural Hungarian, three tones), sparks, the automatic scene picture, pace controls (closer → intimate, continue → flirt step by step, stop → normal) and the summary all worked. Latency varied from 2 to 38 s; one reply hit the 60 s timeout.
- Fixed: Grok failures (timeout, refusal, key) now return a clear 504/502 message instead of a generic 500 "media not changed" error; a conversation that was intimate and then stopped is still saved as intimate (`play_conversation_flags`), so the 14-day intimacy rule and the journal see it.

## 2026-11-11 — Simpler media layout (owner-approved)

- Rule: a picture or video that shows one character (alone or with Palor) lives in `10_CHARACTERS\<character>\`; files already inside that folder, including subfolders such as `Generated`, stay. Two or more characters (Palor not counted) go to `20_SHARED_MEDIA\Scenes\<A + B>\`. Place-only pictures, game assets (figures, backgrounds, scene images), `Generation plans, ideas` and files with nobody recognised stay where they were.
- 916 files qualify (dry run: no clashes). They move from the home task "Képek a helyükre" (`app/media-placement.mjs`, 300 per click) by exclusive copy, sha256 check, catalogue update, then source removal; every move is in `file_moves`. Media IDs, depictions, canon and history are unchanged; nothing is overwritten (a taken name is skipped). Character folders without an owner row get one in `sorted_folders`. Emptied old subfolders under Scenes/Locations/Unassigned are removed.
- Historical `world_review_sources.source_path` values keep the path at review time (provenance, not a live link).

## 2026-11-11 — Cycle 11 (docs/CYCLE_11_PLAN.md)

- Streamed replies: `/api/play/talk` with `stream:true` answers newline-delimited JSON ({reply so far} lines, then {done:view} or {error}); checks that fail before Grok is asked stay ordinary JSON errors. The Grok provider streams with `stream_options.include_usage`; a stream cut before `[DONE]` counts as uncertain and is not retried. Only the `reply` field is shown while it arrives (`partialJsonString`). Real Grok on a DB copy: first words after 0.6–0.9 s (whole reply 1.7–2.6 s); before, nothing showed for 2–38 s.
- `play-mode.mjs` split without behaviour change: `app/play/rules.mjs` (prompt wording, beats, levels), `app/play/scenes.mjs` (scene pictures, photos, album, phone pictures), `app/play/records.mjs` (phone threads, journal, relationships).
- Media placement: the rule above as a home task with preview and one click (`/api/media/placement`, `/api/media/placement/apply`).
- Translation guard: a test requires a Hungarian text for every on-screen English server error; built messages use `serverPatterns`. Machine-only (MCP/mobile) messages stay English.
- The leftover old project copy moved from `00_SYSTEM\project` to `99_ARCHIVE\Old project copy 2026-11-11` (nothing deleted); `00_SYSTEM\config\runtime-locations.json` now names the current folder. Start scripts already locate the project themselves; the status panel already reports tasks pointing to missing folders.

## 2026-11-11 — Owner-authorized startup and MCP repair

- The current project root uses the existing repository history via a `.git`
  pointer to `%LOCALAPPDATA%\LivingUniverse\source-git`. The archived source and
  its original Git metadata remain intact. Existing source edits remain
  uncommitted; no new remote or publication is part of this repair.
- All three existing Windows logon tasks now use the current root and system
  Node. `mcp/repair-startup.ps1` backs up definitions, preserves principals,
  triggers/settings and verifies action changes; its journal is local. The
  existing-catalogue launcher also starts the same watchers, snapshot timer
  and scheduler as the regular launcher, respecting the saved engine switch.
- System status checks recent successful tunnel polling. A ready process with
  HTTP 401/403 is reported as an authentication failure. No provider error
  text or credential value enters the status API. The launcher writes its
  loopback health URL outside OneDrive.
- Replacement tunnel keys are tested against the existing tunnel's metadata
  before saving the Windows-encrypted credential. A denied key leaves the
  previous saved credential unchanged. Key entry stays in the password window.
- Source checkpoint, task/configuration backups and an integrity-checked online
  SQLite backup were made before the repair. Character IDs, media, canon,
  provider selection and paid-run permissions are outside this change.
- The owner subsequently reported deleting the previous account and creating
  a replacement, and explicitly requested a new tunnel. A new Living Universe
  tunnel was created in the signed-in replacement Personal organization and
  linked to its available ChatGPT workspace. The local profile now uses that
  tunnel; old/new IDs and the original profile are kept in the private local
  migration journal, never in source. Runtime credentials still require only
  Read + Use and are entered through the password window.
- The replacement credential was accepted; the tunnel is running under its
  repaired logon task with successful cloud polling and zero observed failures.
  The replacement account's ChatGPT plugin was connected through this tunnel;
  remote initialization and discovery returned all 67 tools. A local read call
  succeeded. No paid model run or remote catalogue mutation was used for repair.

## 2026-11-11 — Shirtless figure set

- Figures in `Szereplő-alakok\<név>\` are the dressed set; the same file names in a `felmeztelen` subfolder are the shirtless set (`character_sprites.outfit`). The dressed set alone decides the mood list Grok may choose from; the play screen shows the shirtless figure only in an intimate scene or after an undress/sex/after beat, falling back to the dressed figure when that expression has no shirtless version. Figures stay presentation assets (never canon).
- Shirtless figures over MCP (same day): figure jobs, briefs and place_play_asset take `outfit` (`dressed` default / `shirtless`); shirtless saves into `felmeztelen`, never replaces a dressed file, has its own job key and backups, and `list_generation_needs` offers it once the dressed base exists. Content stays `non_intimate` (trousers on, non-sexual), so everyday references apply. ChatGPT prompt: `docs/CHATGPT_FIGURES_PROMPT.md`.

## 2026-11-11 — Process control

- `Living Universe vezérlő.cmd` (`ops/lu-control.ps1`): shows the program and gateway health, the three scheduled tasks and the project's own processes by role (flags anything running twice); restart stops the tasks and only this project's node/tunnel-client processes, then starts the scheduled tasks again and waits for both ports. Other apps' node processes (Codex/ChatGPT) are never touched; the tasks themselves are not modified.
- `Start Living Universe.cmd` and both `Start Grok Gateway.cmd` files now refuse to start a second copy when the port already answers (the earlier EADDRINUSE windows).
- ChatGPT file upload (same day): `finish_generation_job` and `place_play_asset` declare a top-level `image` file parameter (`_meta["openai/fileParams"]`, Apps SDK shape {download_url,file_id,mime_type?,file_name?}); the app fetches download_url through the SSRF-safe downloader (public HTTPS, 20 MiB, JPEG/PNG verified), so ChatGPT saves its own pictures without the owner. Only one of image/url/media_id per call.

## 2026-11-11: Figure sources are the owner's character-folder pictures

- Owner explicitly restricted this figure work to `10_CHARACTERS/<character>` pictures. In the organized catalogue, figure briefs and visual packs now select a bounded, stable set only from that character's own folder. Generation access includes ordinary non-canon folder pictures and never approves or modifies canon. Approved character crops within that folder retain their reference/revision IDs; references outside it, generated Play-source uploads, missing/linked files and ambiguous multi-character pictures without an approved crop are excluded.
- Missing usable folder pictures are an explicit blocker, never a text-only prompt that invents a man. Needs lists report blocked characters separately. Briefs say which retrieval tool to use: `get_media` for ordinary folder images, `get_approved_references` for approved crops. Existing scene and intimate-reference rules stay scoped to those features.
- Képműhely now carries `outfit` through brief/open/regenerate so a shirtless retry remains in its own row. Job lists expose the outfit. The wrong reference-free András smile generated during this chat was rejected through the existing reversible workshop review; originals and canon were retained.
- Owner ran "Képek a helyükre" on 2026-11-11: 916 moves complete in `file_moves`, nothing left to place.

## 2026-11-11 — Location tree save after catalogue changes

- Saving the Locations tree was refused ("A terv vagy a katalógus közben megváltozott…") whenever anything in the location catalogue had changed since the page loaded, even with nobody else editing the tree. The page now re-reads the plan on that refusal: if the saved plan is still the one the draft started from and only the catalogue moved on, it carries the draft over to the fresh catalogue and saves once more. If the plan itself changed elsewhere, the owner still chooses (unchanged). The server check is unchanged.
- Duplicates in the tree tidy-up (same day): each "Lehetséges ismétlődések" row has an "Összevonás" button. The kept place is the one still in the catalogue, then the one with more sub-places; the others' sub-places move under it and the others are archived (IDs and history kept, nothing deleted). Rows say when a duplicate's catalogue entry was already deleted. Cause of "Budapest - Kávézó ×2": an archived leftover of a deleted catalogue place became live again in a browser draft.

## 2026-11-11 — Ötletláda (idea box) in the Képműhely

- The creator's planning folder (`20_SHARED_MEDIA\Unassigned\Generation plans, ideas`) is the Ötletláda: `Képregény-kivágások` (comic crops), `Ihletek` (inspiration), anything else there = earlier plans. Pictures move in and out by the journaled mover (exclusive copy, sha256, catalogue update; never overwrites, a taken name gets " (2)"); IDs, links and history stay. Each idea may carry an owner note (`idea_box_notes`) saying what to make from it.
- Ideas are planning material only (media-purpose rule): no story event, no identity evidence, and they leave the Képműhely sorting inbox. Generators read them through the read-only MCP tool `list_idea_box` and may take only composition, pose, framing, mood, setting or story beat — never a face or body.
- Owner amendment (same day): the ideas are randomly generated comic panels and rough drawings, not real people, so generators may take everything from them, including the face and body build of the drawn figures (rendered as adult men). Limit kept: an existing character's look still comes only from his approved references, and no new character is created from an idea. Ideas remain outside canon and are not identity evidence.

## 2026-11-11 — Phase 0 fixes (docs/NEXT_GEN_PLAN_2026-11-11.md)

- Ending a conversation is locked like talking (by conversation and character) and closes only a still-open conversation inside the save transaction: a double click or retry no longer pays for two summaries or writes two events, memory sets and level steps. A reply that arrives after the conversation was closed elsewhere is refused instead of adding lines.
- A conversation on an earlier world day is closed as "left unfinished" only after 3 hours without a line (and never while he is answering); a talk running past midnight stays open. The play screen's once-a-minute check uses `/api/play/unread` instead of the whole overview.
- One open conversation per character and channel: a new start continues the open one (an opener only shows it).
- AI cost: a timed-out or cut call (possibly billed) adds its worst-case estimate to today's usage, so repeated timeouts cannot pass the cap; it is also kept as `world:uncertain-usd:<day>` and shown on the Élő világ page. Still never retried.
- Replies get 600 output tokens (was 400). If an answer is still cut (`finish_reason: length`), the reply that arrived is kept and the other fields default, instead of discarding a paid answer. The stream reader also handles a last event without a closing newline.
- Unexpected server errors are written to `<data>\logs\errors.log` (route without query, message, stack; rotated past 1 MB) and the last 24 hours are listed in the system-status box. Both launchers close cleanly on Ctrl+C/stop (timers, running generation, database) and log unhandled rejections instead of ending.
- Without `LIVING_UNIVERSE_DATA`, the app uses `desktop-catalogue` whenever it exists (before: the old empty catalogue in the parent folder). That old file is untouched; archiving it waits for the owner.
- Smaller: dropping an item when Palor has no place is a clear 409; an empty media file is served instead of dropping the connection; `%` and `_` in library search are literal.
- `ops/perf-baseline.mjs` measures endpoints on a copy of the live catalogue → `docs/PERF_BASELINE.md`. Slowest: play journal 107 ms warm (546 ms cold), media review list 127 ms, library first page 50 ms; static files 924 KB raw (290 KB gzip), served uncompressed.
- Tests: `tests/phase0-fixes.test.mjs` (8 new); one play-mode assertion updated for the one-open-conversation rule. 264 of 264 pass.

## 2026-11-12 — Developer and debugging tools (cycle 1)

- Rendszerállapot screen and `/api/dev/*`. It builds on `error-log.mjs` and `system-status.mjs` and adds:
  - code freshness (which server files changed since the process started);
  - database size and an optional `quick_check`;
  - free disk space;
  - media root reachability;
  - the mobile listener and Tailscale state (state and own name only);
  - an in-memory log of the last 300 API requests (method, path, status, duration only).
- "Mindent újraindít" runs the existing `ops/lu-control.ps1 restart` through WMI `Win32_Process.Create`. The process is created outside the catalogue task's job object, so stopping the task cannot end it.
  - It is enabled only through `installProcessGuards`, which is the real service on Windows.
  - It requires `confirm:true` and is refused while work is running. At most one restart per minute.
- `ops/sandbox.mjs` (`npm run sandbox`):
  - runs on a live-DB copy made with the SQLite backup API;
  - uses a mock AI and copies no keys or configs;
  - uses the real media in read-only mode by default: only database-only writes pass; `--empty-media` allows all actions.
- `ops/test.mjs`: name filters and `--changed` (git, or file mtimes when git is unavailable). `ops/doctor.mjs`: CLI for the doctor.
- `.ignore` keeps search tools out of the media and archive folders.
- `tests/client-smoke.test.mjs`: client files parse, every imported module is served, every literal text key exists.

## 2026-11-12 — World audit: simulation fixes and Phase 2–3 steps

Code checkpoint `world-audit-2026-11-12-before`. Synthetic data and the mock provider only; no paid call, no live world round (the engine stays off).

- **Night belongs to its day.** Before the 06:00 morning hour it is still the previous world day (`worldDayAt`). Play clock, weekday and workday, invitations ("reggel" at 01:00 is the coming morning) and the engine's due plan use it, so a PC woken after midnight still lives last night's part instead of skipping it. Cost days stay calendar days; the stale-conversation rule keeps its calendar check.
- **Off is a pause.** Switching the engine back on continues from the current day part: the missed days are not replayed (before: up to 7 whole-day rounds at once, with their cost). `settings.paused_at` / `resumed` record the skipped span and show on the Élő világ page. Catch-up rounds for past days (engine on, PC off) still run but send no phone messages or invitations.
- **Game-master level changes are validated.** A level moves only for a participant of the event, towards another participant or someone he already knows; zero steps are dropped. Before, any two people could get a level from any event, which also made strangers count as acquainted.
- **Agents see the people they met in the world** (level without a written note) with that level, not only as names.
- **Memory recall (plan 2.1).** Talks and agent turns get the 12 memories that matter now from the last 300: recency (fading), the people present (+3), the place (+2), shared words (+1 each, up to 3); the newest three are always in. Local, no embedding, no extra call.
- **Promises and plans (plan 2.3, migration `030-world-threads`).** The summary call that already runs lists explicit promises/plans (who, text, due day ≤ 60 days) and marks listed open ones kept or dropped. Open ones enter later talk and agent prompts; one lapses a day after its due day and is brought up once. Shown in the relationship detail. Rewind undoes new ones and reopens resolved ones.
- **Running summary of long talks (plan 2.2).** From 14 lines the reply call refreshes a short `memo` every few turns (same call, a few extra output tokens); once lines leave the 20-line window the memo stands in for them.
- **Characters take the initiative (plan 3.3, first part).** A character at level ≥ 2 towards Palor may invite him to one of his own places for a coming day part (one waiting invitation each, only in rounds of the current day). Palor answers on the phone (Elfogadom / Nem érek rá); accepting makes it a date (he is there, a missed date is noticed). Either answer becomes his memory. Link table `play_invitations` (positional inserts into `play_appointments` stay valid).
- **Prompt order for the provider cache (O6).** Place, time, day part and pacing moved from the system messages to the end of the user messages; cached prompt tokens are recorded per day (`world_usage.cached_tokens`) and shown as a percentage in the cost history.
- **Rewind is complete.** Also undone: dates met or noted as missed after the save point, promises (see above); a talk that began before the save point but was saved after it is reopened. Undo restores all of it.
- **Older backups restore again.** A column missing from a backup now takes its default; before, `play_conversations.mode` (NOT NULL) made such a restore fail.
- **Lighter presence check.** Starting a talk or a group scene checks positions only instead of building the whole place view (figures, stand-in pictures).
- Smaller: a Grok call that never connected (offline, DNS, refused) is a plain failure, not a "possibly billed" one counted against the cap; relationship detail shows day-part names instead of IDs; an unset "Palor érzése" no longer displays as "ellenséges".
- Tests: `tests/world-audit.test.mjs` (8 new); one world-engine assertion moved to the user message (pacing). Full suite before the other session's tooling change: 281 of 282 (a missing translation, fixed); world/play tests 39 of 39 after. `tests/dev-tools.test.mjs` (added the same night by another session) hangs and was excluded from the last full run.

## 2026-11-12 — Developer tools, cycle 2: AI trace, slow statements, browser errors

- Every world-engine AI call goes through `createAiTrace().wrap(provider)`. Each call records provider, model, duration, time to first text, tokens, finish reason and error code.
  - Prompts and answers are never recorded.
  - Entries are kept in memory (100) and in `logs/ai-calls.log` (512 KB, rotated).
- `all/one/run` are timed. Statements of 150 ms or more are kept as SQL text only, never with the bound values.
- Browser `error` and `unhandledrejection` events are sent to `POST /api/dev/client-error`.
  - They are written to errors.log with source "client".
  - At most 30 in 10 minutes. API errors with a status are not sent.
- The deep doctor lists the 15 largest tables. `npm run perf` runs the existing performance baseline.
- The `tests/dev-tools.test.mjs` hang noted in the world-audit entry was a cleanup-order bug (EBUSY on Windows). It was fixed in cycle 1, and the file now passes in the full suite.

## 2026-11-12 — Developer tools, cycle 3: responsiveness, database diff, coverage, report

- The doctor gains a "lag" check. A 20 ms timer measures how late it fires; the doctor reports p50/p99/max since the previous check and then starts over. It warns at p99 ≥ 500 ms or max ≥ 2 s.
  - `perf_hooks.monitorEventLoopDelay` was tried first. It reported 34 ms for a 300 ms freeze on Node 26, so it is not used.
- `ops/db-diff.mjs` (`npm run dbdiff`): snapshot / diff / list. Per table it reports added, removed and changed rows (by primary key or rowid), the changed column names and sample keys.
  - Cell values are never printed.
  - Snapshots are taken with the online backup API into `%LOCALAPPDATA%\LivingUniverse\db-snapshots`; the live database is opened read-only.
- `npm run coverage`: Node's built-in coverage over `app/**` and `mcp/**`; it combines with the test name filters.
- `npm run doctor -- --report` writes one Markdown file with everything to `%LOCALAPPDATA%\LivingUniverse\diagnostics`: checks, tables, errors with stacks, slow and failed requests, AI calls, slow statements and the restart log.

## 2026-11-12 — Developer tools: review fixes

- A failed restart launch no longer blocks the next try for a minute.
- The "queries" check counts only slow statements from the last hour (startup ones no longer warn for days).
- Code freshness reads every `app/` subfolder except `public`, so a new server folder is not missed.
- Sandbox: deleting the copy retries (Windows releases the SQLite file late, which left copies behind); SIGHUP (closed window) also stops it cleanly; `removeCopy` refuses any folder not inside `sandbox`.
- Doctor CLI: `--report` on an older running program says to restart instead of "does not answer"; an HTTP error is reported as such; `--filter` is URL-encoded.
- Test runner: `ops/` changes run `ops-tools.test.mjs`; the no-git fallback also scans `ops/` and skips missing folders; an invalid `--since` is an error.
- Live findings with the new tools (2026-11-12): a one-off 21 s event-loop freeze could not be traced afterwards, so the lag check now keeps the start time of the worst freeze (`max_at`) and the doctor reports how long each of its steps took (`steps_ms`). Automatic snapshots left `-wal`/`-shm`/`.partial-*` side files after every run: the copy is now switched to a rollback journal before its integrity check, empty side files are removed, and old empty leftovers are tidied (a non-empty `-wal` is kept). Tailscale's own state no longer overwrites the check's state. PowerShell's UTF-16 restart log is decoded correctly.
- db-diff: rows are compared on shared columns only (an added column no longer marks every row changed); removed columns are reported; an unknown snapshot name gets a clear message.

## 2026-11-12 — "Új képek" intake: file names say who is in a picture

- One drop folder, `20_SHARED_MEDIA/Új képek/`. The file name (parts separated by " - ") or the sub-folder name lists existing characters joined by "+"; optional parts are a place from the location tree and a content level (`hetkoznapi` / `meztelen` / `szex`). Accents and case do not matter; names that contain " - " ("Dávid - ikea mellizmos srác") match in full or by their short form when that form is unique.
- The home task "Új képek beolvasása" previews what was read; one owner click links the people (depictions), the place tag and the content level, then moves the file by the 2026-11-11 placement rule with the journaled mover (one character → his folder, more → `Scenes/A + B`, Palor not counted). A taken name gets " (2)"; nothing is overwritten.
- Unknown, ambiguous or missing names are reported and the file stays in the folder; no character is created and nothing is guessed. Canon, approvals and figures are untouched. Each intake is logged in `new_image_intake`.
- Guide and scene list: `docs/UJ_KEPEK_UTMUTATO.md`.

## 2026-11-12 — User-experience batch: previews, compression, play on the phone, beliefs and gossip, calmer talk screen

Owner asked to work through the five user-experience items in order (NEXT_GEN_PLAN 1.1, 1.2, 4.8, 2.4–2.5, 4.1 part).

- Previews (1.1): `GET /thumb/<id>?w=320|640|1600` (`app/thumbnails.mjs`). A JPEG is made once per width with long-lived PowerShell/System.Drawing workers (no install) and kept in `<dataDir>\thumbs` (outside OneDrive); the key holds the original's size and modification time. The original is only read. Videos, originals under 96 KB and pictures the decoder cannot read are redirected to `/media/<id>`; a failed picture is not retried until restart. Grids, covers, play cards, scenes and portraits use previews; viewers, crop tools, duplicate checks and image signals keep the original.
- Compression (1.2): interface files are compressed (brotli/gzip) once per version and sent with a content ETag; a repeat visit gets 304. Prompt order for provider caching was already done in the 2026-11-12 world audit.
- Play on the phone (4.8): the mobile listener serves `/play` (same play screen) and forwards only play routes, previews/originals and world-engine decisions/levels to the desktop app (`isPlayRoute`). Same Tailscale identity, Host and Origin rules; every change needs the mobile session's CSRF token. Background/sprite/scene uploads and scans stay on the desktop (hidden on the phone). Phone layout: the talk box uses the full width and the scene tools scroll sideways.
- Beliefs and gossip (2.4, 2.5; migration 031, additive, `app/world-social.mjs`): news reaches anyone outside an event only when two people meet in a world round (one thing per direction, at most 4 per round, never intimate scenes, never to Palor); the listener gets an ordinary memory "X mesélte: …". Characters with at least 8 new memories condense them in one capped call into up to 3 subjective beliefs about known people, each resting on numbered memories; beliefs enter only that character's own talk prompt and are listed for the owner on Élő világ. A failed or timed-out reflection is not retried for the same memories. Play gossip about the same day now comes only from people at level 3 or more. Rewind and its undo cover both tables. The world engine stays off; nothing ran live.
- Talk screen (4.1, part): scene prompt, own scene picture and content marks sit behind one "⋯ Eszközök" button; the default row is photo, history, end and leave.

## 2026-11-12 — Face identity at work, game clock, the remaining audit items

- Face identity (owner: the most important area). The benchmarked local face method (`docs/VISION_ENGINE.md`) now runs in the app: `app/identity-suggest.mjs` with a child process (`identity-worker.mjs`), cache table `identity_faces` (migration 032, additive). New view **Arcazonosság**: who may be in a picture (top score ≥ 0.35 and ≥ 0.05 ahead of the next character, from the 2026-11-10 benchmark), pictures whose single face does not match the linked character but matches another, and a check of every character's approved face references (outliers, crops without exactly one face, very similar references across characters, coverage). "Igen" only links the character through the existing bulk-assign route; "Nem" is stored in `identity_feedback` and only hides that suggestion (not training data). Face only; body is not measured. Canon is never written and the auto-canon gates stay unset. First live scan (pictures without people + reference pictures): 123 pictures, 179 faces, 0 errors, 50 s.
- Game clock (owner decision D1, 2026-11-12): game time is real time plus what Palor's actions add (`app/game-clock.mjs`): a trip takes its travel minutes, each spoken line 4 minutes, "Várok" jumps to the next day part and "Alszom" to 07:00. Real time keeps running, so the world lives while nobody plays. All world and play modules read this clock; the AI cost cap keeps counting real days. Waiting asks the world engine to catch up; the engine itself stays switched off until the owner turns it on.
- Hidden attribute removed from 221 source and document files (owner-approved); the content was not touched.
- Tests for the permanent delete flow (CSRF, stale version, canon protection, success, retry after a failed unlink), the MCP reference widget's input checks and the reviewed-media retrieval validation.
- Speed: the journal remembers "no fitting picture" like a pick (warm view about 200 ms → a few ms); the media review list keeps a parsed summary per review version instead of parsing all ~1,400 reviews on every request.
- The deep doctor check runs on a worker thread with its own read-only connection, so it no longer freezes the program for 1.5 s.

## 2026-11-12 — World engine: only while the owner plays

- Owner: the world engine stays off until development is finished, except for probe runs and while he plays. New setting `while_playing` (Élő világ › "Csak amíg játszom"): with the engine off, any use of the play screen (desktop or phone) counts as playing for 20 minutes after the last request; meanwhile the world is checked every 5 minutes. A new session skips the break like switching the engine on (no catch-up of missed days). The daily cap (1.5 USD per real day) is unchanged. Switched on in the live app the same day; `enabled` stays false.

## 2026-11-12 — Face gate benchmark; suggestion threshold 0.50

- Measured on the live catalogue, read-only (numbers in `docs/VISION_ENGINE.md`). Faces of characters without a face reference were taken for a known character in 26 % of cases at the old suggestion threshold 0.35; known characters were never confused with each other in the linked set. The suggestion threshold is raised to 0.50 (lead 0.05): about 8 % of suggestions may still be wrong, which the owner's Yes/No review catches.
- Recommendation for the auto-canon gate (not locked; the owner decides): face top score ≥ 0.65 and lead ≥ 0.10 (≈ 0.4 % wrong among accepted, about 57 % of linked pictures), plus at least two agreeing face references for the character, a face of at least 80 px with detector score ≥ 0.8, and no body promotion until a body method is measured. Before locking: fix the flagged references (Namjoon, Pákozdi, Dezső–Pákozdi, Ren–Kazuto) and re-run the benchmark.

- Owner (2026-11-12): accepts the recommended auto-canon face gate (top score ≥ 0.65, lead ≥ 0.10, at least two agreeing face references, face ≥ 80 px with detector score ≥ 0.8, no body promotion). It is locked into local configuration only after the flagged references are fixed and the benchmark is re-run with the same or better result. The writer stays disabled and unbuilt until then; enabling it remains a separate owner step.
- ChatGPT saves scene pictures itself (2026-11-12): `place_play_asset` has a `picture` target with `character_ids` (1–8, Palor included when he is in it). The picture is written into `Új képek` as `Palor + Norbi - <place> - hetkoznapi - <date>-<n>.png` (Palor first, everyday by default, never overwritten); the owner's "Új képek beolvasása" click links and moves it. Non-everyday content needs the collection-origin gate for every character. A Palor + one character picture read in by the intake also counts as a shared scene (`play_inserts`, source "Új képek"). Prompt: `docs/CHATGPT_SCENES_PROMPT.md`.
- Intimate figures (2026-11-12): a third figure row, outfit `intimate`, in the `intim` subfolder: the same man waist-up with bare upper body, nothing below the waist in the frame, expressions `alap`, `mosoly`, `flortol` only. The play screen shows it for the `sex` and `after` beats (shirtless for `undress`/intimate mode, dressed otherwise) and fades it out below the waist with a CSS mask, so nothing explicit is drawn. Offered as a need only after the shirtless `alap` exists and only for characters who may reach intimacy; never canon. Shirtless figures are saved into an existing hand-made `félmeztelen` folder instead of creating a second one.

## 2026-11-12 — Figure sources out of every sorting list

- Uploaded sources of generated figures (`play_asset_sources`) were already out of "Rendezésre vár" and the Képműhely inbox, but still showed in the quick-tag location list, the content-level queue, mobile sorting, identity suggestions and the home "no character" count. All of these now skip them (`playAssetFilter`/`notPlayAssetSQL` in media-purpose.mjs); Ötletláda pictures are skipped in the quick-tag lists and the home count too. Files, IDs and links are unchanged.

## 2026-11-13 — Play: where Palor is, road and town stories, town plans, talk pictures (owner)

- Position follows the screen. A town's own node is its street: opening a town's view moves Palor onto that street (2 minutes from a building), the world map keeps him on the street of his last town, and choosing another town is a trip along the road (real road time; a short road animation). On opening the game the screen shows where he really is (a remembered view of another town is not).
- Pop-up stories (`app/play-stories.mjs`, `play-story.js`): branching A–D text stories, 8–45 blocks, at least two endings, no loops, every block reachable. Settings `road`, `kaloz`, `szekesfehervar`, `budapest`; content `everyday`/`flirt`/`sexual` (only everyday with the adult switch off); optional day parts and car/foot. A road trip may bring a road story, a walk from a home-town street into a place a town story (half as often); frequency is a Play setting (off/rare/normal/often, default normal); the least-played story comes first. Stories are loaded by the owner (Play › Settings, checked before saving, no silent overwrite) from `docs/GROK_STORIES_PROMPT.md`. Every story must be adults-only and men-only: a refused word is named, nothing is rewritten; the character policy is also applied. Story strangers are text only (no characters, profiles, canon or memories); only the run (path, ending) is kept.
- Town plan (`play-town-map.js`): a town is a drawn street map with pictogram pins placed by place kind; a building with rooms opens a list. The owner can drag the pins and save (presentation only, `play:town-layout:<id>`), and may put a picture under them: `20_SHARED_MEDIA/Játék térképek/<town>.png|jpg|webp` (skipped by the catalogue scan). Cards remain as "Kártyanézet".
- Talk pictures: a scene picture or the photo list in a talk shows only the people of the talk (and Palor), never someone else who happens to be in the room, and a picture tagged with another place is left out (this place, the place around it and untagged pictures stay).

## 2026-11-13 — Town maps only for settlements (owner)

- `list_town_places` offered every top-level place as a town, so ChatGPT drew "maps" for houses, a van and nature spots. Now only settlements with a known map position (`isSettlement`: Budapest, Székesfehérvár, Káloz, Gárdony, Sárbogárd, Balaton, M7, Pécs) are towns; the rest are `standalone_places` (eye-level pictures instead), and `save_town_map` refuses them.
- The 9 pictures saved that way (and 2 earlier versions) were moved, not deleted, to `20_SHARED_MEDIA/Játék térképek/Félretett` (log: `desktop-catalogue/logs/town-maps-set-aside-2026-11-13.json`). A kept earlier map is now named with the real local time, not the game clock.

## 2026-11-13 — Inside houses: point-and-click doors (owner)

- Houses are not drawn from above. In a room the ways out (rooms inside, next rooms of the building, back to the building, out to the street) are door markers placed where the door is drawn on the room's picture (x, y as fractions of the picture, mapped through its cover crop), or arrows at the edge in their direction (saved, else back/street lower right and the rest right, left, ahead in turn). Hidden during a talk; the "Merre mész?" list and keys 1–9 stay. Presentation only, `play:room-exits:<place>`.
- The owner drags markers in "Ajtók elhelyezése" (Eszközök); ChatGPT can place them with `get_room_exits` / `save_room_exits` when it makes eye-level room pictures (`docs/CHATGPT_ROOM_DOORS_PROMPT.md`). The town map prompt now draws houses only from the outside. `list_town_places` also gives room ids and location ids.
- Connector schemas must be plain and strict: free-form objects made ChatGPT reject the connector ("Bad Request"); `save_play_stories` takes `stories_json` (text) and `save_town_layout` a list of {place_id, x, y}.

## 2026-11-13 — Background processes: world rounds, Tailscale, restart, picture saves (owner)

- Found live: a world round sent 39 Grok calls at once and its game-master answer was cut at 1800 tokens, so the round saved no events; only 128 prompt tokens per call came from the provider cache; calls took ~18 s on grok-4.20; Tailscale had stopped (twice that day); the program ran old code.
- World rounds: character turns run at most 5 at a time (`mapLimit`; after a failure no new call starts); the game-master budget is 3000 tokens, and a cut answer keeps its complete events (`salvageEvents`); the character prompt now starts with the same rules for everyone and names the character at the end, so a round shares a cacheable prefix.
- Model per job: background rounds (characters, game master, reflection) use `world_model` (default the fast 4.1 model, prices follow it); Play talks keep `model`. Both are chosen on the Élő világ page.
- Round progress (`world:round-status`): step, characters done, a cut answer and the error are shown on the Élő világ page. As before, a round that did not finish is not marked done and is due again at the next check.
- System status also reports a stopped Tailscale and old running code; the home screen offers "Újraindítás most" (the guarded restart, with confirmation), and Play shows a notice when Tailscale is down.
- Picture saves over the connector return `timings` (download/save/total) and log saves slower than 3 s.

## 2026-11-13 — Play review: 46 improvements (owner: "all of them, in order")

- Stability: a typed line survives redraws and failed sends (it returns to the box, with a lasting "Újra" notice when Grok is down); waiting reloads the place; rewinding asks first; an open face-to-face talk continues after a page reload; a talk that could not be saved stays as a notice with "Újra"; Esc only closes the top window.
- Places: kind-coloured placeholder for missing backdrops and a "Hiányzó hátterek" list (the picture-generation needs use the same backdrop rule, `app/play/backdrops.mjs`); travel times on exits, town pins and towns (`/api/play/eta`); the clock shows hours and minutes; car/foot as a two-state switch; sleeping away from a bed asks first; waiting 15 min / 1 hour / next day part; pin tooltips list who is inside; keys 1–9 for exits, G for the group talk, 1–3 for suggested replies; search on the town view; "X veled tart" stays on the town view; map tools behind "Eszközök".
- Talk: one "Elköszönök" button with a summary card (level change, what he will remember, milestone); "Közelebb lépek" is shown disabled with its reason; the scene picture can be small (figures stay visible); "X válaszol…"; in a group the last speaker steps forward; a talk left open while browsing other screens is a small "Vissza a beszélgetéshez" pill instead of a second chat window.
- Journal folds by day (ten days at a time) and lists the pop-up stories; proposed events are only pointed to (Élő világ). Relationships: filter, shared photos load when visible, invitations pick town then place. Phone: unread contacts marked, "Üzenetek", the menu badge pulses on a new message.
- Look: one line-icon set (`play-icons.js`), one panel style, one screen transition, a loading outline, names visible on arrival. Speed: menu screens reuse the loaded world, exit backdrops are preloaded, cut-out figures are kept in the browser's Cache storage (keyed by figure version).
- A five-step guided tour on the first visit (reopen from the menu); a small AI meter against the daily cap with a notice at 90 %.

## 2026-11-13 — Play polish: backdrops, exits, top bar, town maps by ChatGPT (owner)

- A place backdrop must show the place: pictures linked to a character, shared scenes and other Play assets, and analysed pictures with people in anything but a wide shot are no longer used (live: 114 places lost a character/scene picture as backdrop; 31 keep one). They stay in the catalogue.
- Scenes: figures shrink together to fit beside the arrival panel; "Merre mész?" exits in the arrival panel (rooms inside, next rooms, back to the building, out to the town street); authoring tools behind "⋯ Eszközök"; the place details show only on hovering/tapping the title; a travel indicator; even text sizes.
- Top bar: "📍 Itt vagy", Várok and Alszom stay; journal, relationships, messages, settings, full screen and exit are in "☰ Menü"; the back button is gone (the exits replace it).
- Town maps: redrawn procedural plan (curving streets, houses, fields, parks, the Danube). Connector tools `list_town_places`, `save_town_map` (into Játék térképek, an earlier picture kept under a dated name) and `save_town_layout` (pin positions as fractions of the picture); the plan follows the picture's own proportions. Prompt: `docs/CHATGPT_TOWN_MAP_PROMPT.md`.

## 2026-11-13 — Grok saves the pop-up stories itself (owner)

- New connector tools `list_play_stories` (read-only) and `save_play_stories` (trusted mode, 1–10 stories per call). Every story goes through the same check as a pasted batch; invalid ones are returned with their errors and not saved; an existing id is never overwritten unless replace is true. The prompt (`docs/GROK_STORIES_PROMPT.md`) asks Grok to write and save all 38 in one run.

## 2026-11-13 — Scene prompt follows the conversation (owner)

- "Jelenet-prompt" during a talk now adds, without any AI call: the moment from the latest beat (talking, flirting, kissing, undressing, sex, afterwards), the light of the conversation's day part, the running summary of the talk and its last 8 lines (Hungarian, marked as context, never to be written into the image). Only Palor's and the character's own words go in. A beat beyond what the relationship stage and the reference rules allow is not used, and then neither the lines nor the summary are included.

## 2026-11-13 — TopFiu: escort/Romeo wording removed from canon (owner)

- Owner explicitly chose an in-place rewrite (an exception to canon immutability for this one text, like the rename exception): TopFiu's only canon revision (`837377a6…`) reason "TopFiu Romeo escort profilhoz feltöltött …" → "TopFiu profilhoz feltöltött …". Appearance, references, revision ID and date unchanged. Verified backup `desktop-catalogue\backups\before-topfiu-canon-reason-2026-11-13.sqlite`, journal beside it.
- The two reference pictures' notes lost the same "Romeo escort profilhoz –" prefix through the normal media edit. Provenance records (MCP change log, import provenance, reference-change payload) keep the original wording.

## 2026-11-13 — Grok text model is selectable

- Owner: the replies are "very un-Hungarian". The play/world text model was hard-coded to `grok-4-1-fast-non-reasoning` (cheapest; a legacy id, not on xAI's current list but still served). The world settings now choose among `TEXT_MODELS` (world-ai.mjs: 4.1 Fast, 4.20 non-reasoning, 4.3, 4.7) with xAI's own prices from `/v1/language-models` (2026-11-13); the prices follow the model so the daily cap stays true. One provider per model, built on first use; the switch applies from the next reply. Default unchanged until the owner picks.

## 2026-11-13 — Debugging package (owner: all 30 proposals, in order)

Goal: the faults found by hand on 2026-11-13 (connector "Bad Request" from a schema, CSP-dropped inline style, arrows in the wrong place, a cut-off world round, stopped Tailscale, the program running old code) are caught automatically. Everything here is local, read-only unless stated, and keeps metadata only (never prompts, answers, typed text or tool arguments).

- A) Automatic checks (tests): `connector-schemas` (strict lint of every connector tool; the two free-form objects ChatGPT already accepts are listed as known), `client-static` (no inline style/handler, every looked-up #id is created, every client module is on the desktop and phone allowlists, dynamic text keys exist), `api-robustness` (every one of ~180 API routes answers wrong input with a handled error and a Hungarian message; found 7 untranslated messages, now translated).
- C) Data audit (`app/data-audit.mjs`, Rendszerállapot › Adatellenőrzés): orphan records, tree/catalogue drift, contradictions. Safe repairs only with confirm:true in one transaction; canon, profiles, the location tree and media files are never changed there (findings only). First live run (read-only): 8 face embeddings of deleted pictures, 2 places with pictures not on the tree.
- D) Request ids in every answer, the request log, errors.log and 500 answers; a browser trail (`debug-trail.js`, sessionStorage only: clicks by label, views, API calls, errors) whose last 20 steps go with every browser error; AI statistics per day and model (cut-off answers, cache share, p95).
- F9 debug panel in Play (state incl. the server-side position, running requests, last answers with ids, errors, steps, layout self-check, copy, bug report).
- E) Job ledger (`app/job-ledger.mjs`): busy stretches and world rounds as jobs, stuck detection (a "running" round with nothing running can be marked interrupted, nothing else), Tailscale/gateway/tunnel sampled every 5 min with outages, cost alert (twice the usual day or round, above a minimum). New doctor checks: jobs, cost, outage.
- F) Connector: call log (`mcp/call-log.mjs`, logs/mcp-calls.log), the program version in every answer (`_meta`), an unknown tool answers "refresh the connector and open a new chat", a known but switched-off tool answers TOOL_UNAVAILABLE; Rendszerállapot › Csatlakozó shows tools, lint, clients (last tool-list refresh, old code) and the last 50 calls.
- G) "Hiba jelentése": a bundle folder (report.json + optional SQLite online-backup snapshot + OLVASS-EL.txt) in %LOCALAPPDATA%\LivingUniverse\diagnostics; replay with `npm run sandbox -- --from-report <name>` or the Hibajelentések tab (separate sandbox process, ports 4330–4339, real service only); `--seed N` makes encounters and stories repeatable; weekly report (tab, `npm run doctor -- --weekly`); `npm test -- --risk` lists affected screens and tests.
- B) Click-through in the sandbox (1024×768, 1366×768, 375×812): map → town → place → talk → line → goodbye → exits → journal → relationships → phone → F9. Found and fixed: on a phone the lasting notice covered the top bar's Térkép/town buttons (now placed under the bar's real bottom edge); the debug context showed the last opened place instead of Palor's position; the toast close button was a 20 px target on phones. The phone listener itself (mobile server) was not exercised; its allowlist is covered by the static test. `tests/play-error-states`: Grok down, empty answer, daily budget used up, missing picture.

## 2026-11-13 — Data audit findings handled (owner: "csináld mindet egymás után")

- 12 local face rows (`identity_faces`, 8 pictures no longer in the catalogue) deleted after a verified online backup: `desktop-catalogue\backups\before-orphan-faces-2026-11-13T12-22-56-343Z.sqlite` (quick_check ok). Derived data only; no media, canon or feedback touched.
- "András háza - Nappali" (1 picture) was the only catalogue place with pictures missing from the tree: added under "András háza" as a new approved canvas revision (`6cdce7cb…`) through the canvas's own save, with a reason; earlier revisions kept.
- "Beach" (31 pictures) is not a fault: the owner marked it as a type ("Balaton - Strand" type source). The audit now skips type sources (`locationTree.typeSources`). After both steps the live audit reports 0 findings.
- The phone listener test now follows every import of the phone page through the phone server (all modules and styles load, including the new debug ones).

## 2026-11-13 — Beach media belong to Balaton - Strand (owner)

- Owner: "Minden Beach taggel megjelölt média a Balaton - Strandhoz tartozzon." This replaces the earlier owner decision that Beach was only a general beach type.
- The catalogue place "Beach" (its tag was already named "Balaton - Strand") was renamed "Balaton - Strand" through the location editor; the 22 active media that had the tag but no place were assigned to it through the app's own assign (place, location role, tag). It now holds 52 active media (+1 in Removed items).
- Tree: a new approved revision (`af2406c4…`) makes that catalogue place the concrete "Balaton - Strand" under Balaton; "Kilátó" and "Kocsma" moved under it; the empty draft node with the same name is archived (kept), and its Balaton town-map pin moved to the place. The "Strand" type remains (Gárdonyi nudi place uses it).
- Backups: `backups\before-beach-to-strand-2026-11-13T12-58-31-170Z.sqlite` (quick_check ok) and `backups\location-canvas-before-beach-to-strand-…json`.
- Not changed: 2 tagged pictures whose place is "Gárdonyi nudi" (a picture has one primary place); waiting for the owner.
- Follow-up (owner): the 2 pictures belong to Gárdonyi nudi. They keep that place and its tag; the "Balaton - Strand" (former Beach) tag was removed from them, so every picture with that tag is at Balaton - Strand. Backup `backups\before-gardony-untag-2026-11-13T13-30-55-289Z.sqlite` (quick_check ok).

## 2026-11-13 — "The tunnel is not running" after every start (owner report)

- Cause: the three log-on tasks start together (catalogue 14:33:37, tunnel 14:33:38–39). The home screen checked a second after the program started, when the tunnel process did not exist yet; the answer was cached for a minute. A minute later the tunnel was connected (ok:true).
- Fix: the real program gives the gateway and the tunnel 3 minutes after its own start (`startGraceMs`). Not ready yet → `starting`, not a problem; such a result is cached only 10 s and the home screen looks again after 20 s. A refused login is never "starting". The job ledger does not record "starting" as an outage. Tests and copies have no grace (startGraceMs 0).
- Checked at the same time (copy of the live catalogue, mock AI): road stories work. A trip Székesfehérvár → Káloz brought "Vonaton az éjszakában", played to its ending, saved and listed in the journal; 40 trips with real randomness gave 10 stories (normal rate 30%), no server error. In the live program no story has run yet: since loading them Palor has not travelled between towns.

## 2026-11-13 — Pictures of the story strangers beside the story text (owner)

- Owner: a smaller picture beside the pop-up story text, showing the random stranger(s) face and body: one when Palor meets them, and a shirtless (or shirtless, trousers unbuttoned) one when the mood heats up; it must not fill the screen.
- Files only, per story block: `20_SHARED_MEDIA/Játék sztorik/<story id>/<block>.png` (meeting) and `<block>-forro.png` (heated; flirt/sexual stories only). Not catalogue media (the scan skips the folder); an earlier file of the same block and kind is kept as "(régi …)". Strangers stay one-off story figures: no characters, canon or profiles are created or changed.
- A run carries `story.pictures`; the pop-up shows a block's picture from that block on until a later block has its own (desktop: beside the text, about 12–15% of the screen; phone: above the text, at most 30% of the height). The heated picture is given and served only with the adult switch on (404 otherwise).
- Connector: `list_story_picture_needs` (stories with all blocks, what they already have) and `save_story_picture` (image, public url or media_id; adult men only, female/minor words in the prompt refused; trusted mode). Prompt for Grok: `docs/GROK_STORY_PICTURES_PROMPT.md`; with the Grok app the owner usually saves the files by hand under the names Grok gives.
- Checked in the empty-media sandbox with plain one-colour test pictures (no real media opened): 1366×768 side by side, 375×812 above the text (a 6 px overlap fixed).
- Follow-up: Grok said list_story_picture_needs does not exist after the restart and a re-authentication. The call log showed why: Grok's last tools/list was before the change (75 tools); re-authenticating does not make Grok list the tools again, and the call never reached the program. So `list_play_stories` (no arguments, already known to Grok) now also returns `picture_work`: the next 3 stories still needing pictures with all blocks, a cursor moving on with every call and wrapping around. The prompt uses it when the new tool is missing; manual saving needs no new tool. For the new tools the connector must be removed and added again in Grok.
- Follow-up (owner: pictures are made with Grok): Grok cannot hand its own picture to the connector (no file parameter, login-bound picture address; its upload attempt today sent no chunks), so the owner saves by hand. To make that easy, flat names in the one folder work too: `20_SHARED_MEDIA/Játék sztorik/<story id> - <block>.png` and `… - <block>-forro.png` (a file in the story's own subfolder wins). The prompt in `docs/GROK_STORY_PICTURES_PROMPT.md` now uses list_play_stories and the flat names.

## 2026-11-13 — Refused world events no longer appear under "Amíg távol voltál" (owner report)

- The owner saw "Palor titka kiderül" (Bálint sees Dezső's and Palor's messages on Barni's phone, Bálint → Barni +2) and asked how Barni could know. It never happened: the game master proposed it on 2026-11-09 (grok-4-1-fast, a "serious" event, so it waited for approval) and it was refused 5 minutes later. No level change, memory or knowledge was written (checked: world_level_revisions, character_memories, world_knowledge empty for it); Barni has no knowledge rows and only a "met Palor on a train" relationship.
- Cause of the confusion: the Élő világ "Amíg távol voltál" list showed every unseen event that was not a proposal, refused ones included, with their proposed level changes. Now it lists only applied and accepted events. The Play journal already left refused events out.

## 2026-11-13 — Play maps fit the window; clear way back to the map (owner)

- Owner: the town map was too small and there was no visible way back to the map; the world map was too big (could not see all of it). Both should be enjoyable in full screen.
- Both views now have one compact bar (town: "Térkép" back button with the map icon, town name, search, who-is-where and tools as drop-downs; world: search, recent places and other places as drop-downs, tools). The map below takes the rest of the window: as large as fits, never larger, keeping its proportions (`fitMaps`, re-run on resize and full-screen change). The phone keeps the sideways-panning world map.
- Measured in the sandbox (DOM only): 1920×1080 town 1394×929 (was about 896×597), world 1267×929, both fully visible; 1366×768 town 926×617, world 841×617; the back button opens the world map.

## 2026-11-13 — Talk: "Cannot set properties of null (setting 'onclick')" fixed (owner report)

- From the second line of a face-to-face talk the buttons show "Elköszönök" (#play-end) instead of "Mégse" (#play-close), but bindTalkControls set #play-close's handler unconditionally: it threw, so the send form and quick replies were left without handlers. Now guarded. Checked in the sandbox: opener, two lines, then with "Elköszönök" shown a third line is sent, no error.
- The sandbox walkthrough missed it because the Play screen catches such errors and only shows a red message. Every red message is now also an error step of the debug trail (client.js and play-mobile.js toast), so F9, bug reports and later walkthroughs see it.
- Follow-up (owner: "vizsgáld át a programot ilyen tekintetben is"): `tests/helpers/null-guards.mjs` tokenizes every browser script and marks an id as "drawn only sometimes" when its markup sits in a ${…} part, a ?: branch or an && operand; any lookup of such an id must be guarded. It found 28 more spots (talk form and quick replies, phone form and choices, car switch, group-talk key, story "replace" box, town-map save, figure prompt box, benchmark output, the phone talk's close button); all guarded (helpers setClass and submitWith in play.js). Class-selector lookups were reviewed by hand: all target always-drawn markup except the town-map pop-up's .tm-wrap, now guarded. The rule is a permanent test (client-static, with a self-check that it catches the original bug). Sandbox click-through with red messages captured: 24 studio views and all 11 Rendszerállapot tabs, Play map/list/town/cards/6 places/exits/tools, a talk with opener, 4 lines, quick reply, history, photo, goodbye; journal, relationships, phone send and choice, settings, F9: no error. (A wait during an open phone talk is refused with "Előbb fejezd be a beszélgetést." by design.)

## 2026-11-13 — Places for the living cast (owner: "Save all")

- The 38 living characters' profile text (residence, occupation, weekly routine, habits) was matched by hand to existing places only, each link with the profile sentence it came from; nothing invented. The owner approved all; 47 links were saved through the world engine's own route (POST /api/world-engine/places, owner-approved, note "Profil alapján javasolva, a tulajdonos jóváhagyta").
- Result: characters with no place at all 11 → 1 (Marek Hudák: Komárom, no fitting place); without a home 29 → 17; without work 30 → 16. Still missing (need new places, not invented): the brigade's container lodging at the Balaton, several homes (Barni, Boateng, Dezső, Solti Márk, Szabó Zoli, TopFiu, the truck drivers' towns) and workplaces (wheel factory, Fehérvár building site, Mezőföld-Trans office).
- Reported, not changed: Bastian's profile says Szeged but his flat is in Budapest; Levi works in Pécs but has the Fehérvár hospital as work; Ábel (student) has the hospital as work; András (Budapest) has the Fehérvár supermarket as a routine place.
- Follow-up (owner): the brigade's lodging is the Fehérvár Munkásszálló. Bohdan Kovalenko, Emmanuel Okonkwo-Eze, Horváth István, Kardos Jancsi and Kerem Aydın got Munkásszálló and Munkásszálló - háló as home (10 links, same route; the bedroom is what the game picks at night). Living characters without a home: 17 → 12. Profiles were not edited.
- Follow-up corrections (owner): Ábel studies and does not work: his three hospital work links were removed (he keeps home, Budapest - Egyetem and Edzőterem as routine, so on weekdays he is at the university). András's usual places are exactly the metro and the Budapest pub: Supermarket (Fehérvár) and Budapest - bolt removed, Budapest - Kocsma added. Bastian is only from Szeged and lives in Budapest: his Szellemprofil "residence" was updated through a proposal accepted at once ("Szegedi származású; Budapesten él (Bastian lakása, erkéllyel)", kind fact, source the owner); his place links were already right. His occupation and routine fields still describe a Szeged bike shop, the Partfürdő and the Tisza; left unchanged, waiting for the owner.
- Profiles brought in line (owner: "módosítsd a profiljukat is"), proposal + accept through the app, sources noted: Bastian's occupation and weekly routine lost only their Szeged place names (Kárász utca, Partfürdő, Tisza, Fehér-tó); nothing Budapest-specific was invented in their place. András's weekly routine gained "Szokásos helyei a metró és a budapesti kocsma." Ábel's profile mentions no work at all (checked), so it was left as it is.
- Brigade commute (owner): every weekday morning Sanyi (Lakatos Sándor) and Márkó drive the white van from Káloz to Fehérvár, pick up the others at the Munkásszálló and go together to the current building site (e.g. the Balaton). Saved in the weekly routine of all seven (proposal + accept, source the owner); the five crew members' residence and evening routine now say the Fehérvár Munkásszálló instead of "konténer / szállás". Márkó got the white van as an "other" place like Sanyi. The schedule rule itself is unchanged (weekday morning = work place); the commute reaches the world through the profile text the AI reads. Kerem's "Este cigi a parton" was left as it is.
- Dezső (owner, marked WIP): lives in Érd. His Szellemprofil residence is now "Érden lakik (munkaváltozat, WIP), a feleségével és a gyerekével közös lakásban." (kind fact, source the owner with WIP). There is no Érd place in the tree, so he still has no home place in the world; nothing was created.

## 2026-11-14 — Grok may read creator-only profile values (owner)

- Grok reported that only Kelemen Vince, Zsombor and Barni had approved Szellemprofil fields and that 60 characters waited for approval. Checked: no proposal was pending and all 60 profiles have approved fields; 1890 of 1911 approved values are creator-only, and the Grok gateway showed only the 21 public ones (exactly those three characters).
- Owner: "Let Grok read them". The gateway no longer hard-codes allowAdminNotes:false: it follows "allow_admin_notes": true in the local grok-gateway.json (set; a backup copy of the file was kept next to it). Grok still has to ask with include_admin_notes:true; private values never enter character prompts automatically (unchanged). Takes effect after the gateway restarts.

## 2026-11-14 — Szereplőgyár: a new character from one form (owner)

- Owner: tired of the many separate steps; wants to write a new character somewhere, attach a few pictures, and have Grok write the whole profile (sexual details included) and ChatGPT make an avatar series and a gallery, without API credits, checked by the program instead of Claude. Desktop and tablet only (no phone UI).
- `app/character-orders.mjs` + Szereplőgyár page (`character-factory.js`, menu under Karakterek): name, description, 1–12 pictures, wanted steps. The character is created with his folder (male by default; female/under-18 words refused regardless of the policy file); the pictures go into the folder and are linked to him (source pictures for figures, never canon).
- Profile (Grok): `list_character_orders` (new tool) → existing `propose_ghost_profile`; for an order character the proposal is accepted at once (owner authorization, actor "szereplogyar-auto") and checked: every template field except birth date and provenance must hold real text; gaps go back in the answer.
- Avatars (ChatGPT): existing figure jobs, 7 expressions × dressed/shirtless; each placed figure is checked with the local face analyser (shared InsightFace worker) against the source pictures; mismatches are listed for redoing. Gallery: `save_order_picture` (new tool, file parameter) checks the face before saving; a match goes into "<folder>/Galéria" with its content level, a mismatch is not kept; refusals are recorded. FACE_PASS 0.45 is provisional and separate from the auto-canon gates; without the local models the check reports "not checked".
- Status on the Szereplőgyár page and a line on the profile. Standing prompts: docs/SZEREPLOGYAR.md (also copyable on the page). Sandbox-checked (plain test pictures): form, create, cards, profile line at 1366×768 and 768×1024, no error. Found and fixed while checking: a wiring slip turned {$,$$} into {$,$} (String.replace "$$"); the duplicated-$ test now covers every script.
- Needs a restart, a ChatGPT connector refresh and re-adding the Grok connector (two new tools).
- Owner (same day): gallery pictures follow the 2026-11-12 "Új képek" naming rule instead of `galeria-<n>`: "<name> - <place> - <label> - hetkoznapi|meztelen|szex - <date>-<n>.<ext>", as the connector's target picture does. `save_order_picture` takes optional `location_id` (location tree) and `label` (≤ 40 letters/digits, not a character name or content word). Figures keep expression names. No existing file is renamed.
- Owner (same day): the attached source pictures follow the same rule, "<name> - forrás - <content word> - <date>-<n>.<ext>", in his own folder; the owner picks their content on the form (default everyday), which also sets their play content level. Orders now record their source pictures in `character_order_sources` (additive table); orders made before keep finding theirs by the old `forras-<n>` name.
- Owner (same day): the content mark (hétköznapi / félmeztelen / intim → non_intimate / nudity / sexual_activity, file words hetkoznapi / meztelen / szex) is chosen per attached picture and per gallery scene. The gallery is two ticked sets from the Új képek scene list (`GALLERY_SCENES`): base set alone (7) and shared set with Palor (5); `save_order_picture` takes `scene`, content and label come from the scene; shared pictures link Palor too and are named "Palor + <name> - …". ChatGPT is told to work out who he is from the description, profile and picture notes and to adapt each scene, replacing an idea that does not fit him with another of the same purpose (a humanoid monster takes no selfie); the program itself does not interpret the text. Shared sets need Palor in the world. The free count (`gallery_count`) remains for older orders and API callers.
- Owner (same day): the Szereplőgyár texts say "adult males" instead of "adult men" (Grok prompt, order instructions, save_order_picture, figure prompt), and say that a non-human or fantasy male is drawn and described as what he is, never turned into a human (the 2026-11-14 "hím" rule). The male/adult checks themselves are unchanged. Then (owner: "switch them all") every other prompt and prompt document too: scene and figure prompts, generation playbook, idea box, story and story-picture tools, and the ChatGPT/Grok prompt docs; the general picture rules add that a non-human or fantasy male is shown as what he is, never turned into a human.
- Owner (same day): Grok said it would "continue with the avatars", because `list_character_orders` gave every assistant all three parts and both prompts said "work through every open order". The tool now takes `for: "grok" | "chatgpt"`: Grok gets only orders with an unfinished profile and only the profile instructions (plus an explicit "avatars and gallery are ChatGPT's"); ChatGPT gets only avatars and gallery with `profile_state` (it waits while the profile is not done). Both copyable prompts pass their `for` and say whose part is whose. Without `for` the full list comes with a who-does-what note. Instruction-level only: the tools cannot tell which assistant calls them.
- Review fix (same day): the Szereplőgyár gallery skipped the collection-origin gate that every other placement path applies. Now a non-everyday picture is saved only when `intimateAllowed` holds for him (and for Palor in a shared scene); such an open scene shows as "blocked", is never made, and does not hold the order open. Older count orders get the same check on save.
- The avatar series now includes the intimate row (alap, mosoly, flortol; 17 figures in all). Its prompt now states that no clothing is visible (no waistband, belt or trousers); the frame ends just below the navel and the game fades it there.

## 2026-11-16 — Szereplőgyár life moments for existing characters (owner)

- New order kinds on the same tools (no connector refresh): `life` (owner picks characters or "everyone"; sets: 5 daily scenes from weekly_routine/habits/occupation/residence, 3–5 Palor scenes, 6 shirtless scenes on a couch, a hike, in bed, working out, in the yard, doing physical work) and `palor_event` (automatic: one picture per new approved story event that both he and Palor take part in; checked whenever the order list is read; events present at the first start are marked as seen, not ordered).
- A relationship with Palor counts only when recorded: a `relationships` note or an approved shared story event. Without one there are no Palor scenes and the shirtless set is all solo; nothing is invented. With one, the Palor scenes follow the recorded notes and events, and three shirtless scenes are shared.
- Scene definitions are stored per order (`def`), so ChatGPT gets purpose, idea and content per scene; files follow the Új képek rule (`Palor + <name> - kanapén - meztelen - …`). Face check uses his approved canon references (none → unchecked). A character without his own folder gets one through `createCharacterWithFolder` on the first save. One open life order per character. Grok's `for:"grok"` view leaves these out.
- Owner (same day): the collection-origin gate (`intimateAllowed`, added in the 2026-11-14 review fix) is removed from the Szereplőgyár entirely (new-character gallery, life moments, Palor events): the owner checks origins himself, and the content level he picks per picture or scene is what is made. No "blocked" scenes. The gate stays in the other placement paths (place_play_asset scenes and pictures, scene suggestions).

## 2026-11-14 — "Hím" and male anatomy count as male (owner)

- Owner: whatever the wording, a being that is male (hím) with a penis and testicles meets the program's rules. `genderClass` now treats "hím", "hímnemű" and gender text mentioning penis/testicles (Hungarian or English) as non-female, and in a gender value these markers win over female words ("hím, nőies vonásokkal" passes). The opening-sentence check of a life story keeps the old order, so mentioning a man there does not clear a woman. The browser profile editor applies the same rule (it used to refuse "hím"); "Hím" is an option on the character-creation forms (desktop, phone list) and accepted by the phone server. Policy message and AGENTS.md updated. Female characters stay refused.

## 2026-11-14 — Travel modes, entry rooms, passages, Káloz countryside, map/background orders (owner)

- Play area: the world map has no bar above it (search behind a 🔍 button; list view, recent places, category cards, explanation removed). Map 1500×880; desktop shows it whole, ≤1100 px fills the width and scrolls. "Képek beolvasása" (reads Helyszín hátterek, Szereplő-alakok and shared scene folders) and "Hiányzó hátterek" moved to Alkotói stúdió › Helyszínek. In a place, the "Merre mész?" list is gone: ways out are door markers/arrows on the picture only (keys 1–9 still work); the tools panel lies above the arrival box; no box behind a figure on hover.
- Between towns a window asks: bicycle (16 km/h), car (80 km/h) or a direct train. Lines after MÁV's real network (web search 2026-11-14): 30a Budapest–Gárdony–Székesfehérvár–Balaton; 40 Budapest–Sárbogárd–Pécs (the only train to Pécs); 45 Székesfehérvár–Sárbogárd. Káloz has no station. Happenings and stories follow the mode: train/station stories (transport `train` or train words) only on a train, bicycle easy to stop (more happenings), car hard to stop (fewer). Story `transport` accepts bike and train.
- Place tree (new approved revision by `ops/restructure-places-2026-11-14.mjs`, backups + journal in data\backups): Káloz határa › Tó › Tópart and › Erdei parkoló › Erdő › Mountain › Kiránduló hely; Max/Laci háza → Budapest; Közlekedés és mozgó helyszínek → "Közlekedési eszközök" (not a map category); new "Átjárók" with the shared stairwell; emptied categories and the unidentified hospital archived; 18 new place tags (living rooms / common rooms, Budapest - Kórház › Radiológia). Ács Bálint's work links moved from the Székesfehérvár hospital to Budapest radiology (owner statement).
- Entry rooms: a home is entered in its Nappali (Nagyszoba counts), hostel/dormitory in Közösségi tér, the lake at Tópart; other rooms lead back to it. Passages (town street "Utca"/"street", stairwells) are walked through with a short picture moment, never pins or exits; their pictures belong to the whole town. Káloz határa is a region with its own map; countryside legs make the mountain a long hike.
- ChatGPT orders (`list_play_orders`, also announced by `list_character_orders` for ChatGPT): map, background (Háttérgyár: every way out visible, then doors saved) and door orders, computed from what is missing; close by themselves. Káloz, Káloz határa and Budapest are marked for redrawing (`play:map-redo`, cleared by save_town_map). Prompt: docs/CHATGPT_RENDELESEK.md.

## 2026-11-14 — Grok shares the background work (owner)

- Owner: Grok also makes place backgrounds, to share the work. `list_play_orders` takes `for: "grok" | "chatgpt"`: Grok gets the backgrounds and doors of the Káloz area (Káloz határa too), Székesfehérvár, Sárbogárd, Gárdony and Pécs; ChatGPT all maps and the other places (Budapest, M7, Balaton, travel places). On the live data this is 76 backgrounds + 9 door orders for Grok, 9 maps + 52 backgrounds + 19 door orders for ChatGPT. Grok cannot hand pictures to the connector, so each background order carries `save_folder` (the watched "Helyszín hátterek\<location>" folder); the owner saves the picture there, the scan reads it, and the place turns into a door order Grok finishes with `save_room_exits`. `list_character_orders` tells each assistant about its own play orders. Gemini has no connector: it can only be used by hand (copy the prompt, save the picture). Prompts: docs/CHATGPT_RENDELESEK.md.

## 2026-11-14 — Cars as vehicles, trip pictures, roadside stops (owner)

- Plan items B3, B5, B6 (docs/JATEK_TERV_2026-11-14.md). Car places ("Sanyi autója", "… furgonja") are vehicles, not rooms: no door marker or arrow (client and server `neighbours`), no town pin, no search hit. They stay in the tree with their pictures and events.
- Ride: when the owner of a car place (`vehicleOwner`) is at Palor's place, or at the place he just left for the street, the travel window between towns offers "<name> autójával" (car, same minutes). The server checks `ride_with` (409, translated, otherwise); the driver comes along as an accepted appointment at the destination for this day part (not to a town street without a location: there he drops Palor off). Palor's own car stays parked. `trip.ride_with` says who drove. Inside Káloz everyone walks, so no ride there.
- Trip pictures (`trip.scenes`): train → "Vasútállomás", then "Vonat"; a friend's car → that car place; car → "Benzinkút" only when the road happening was a fuel stop; bike → none. Time-of-day shot first (same rule as a place backdrop). Shown one after another after the road animation, the happening with the last one.
- Roadside stop: a car trip between towns without a story offers "Megállsz?" with chance 0.25 (not while stories are switched off). Stopping calls `POST /api/play/roadside` with the trip's token, which forces a car road story (`stories.pick({force:true})`; no story fitting → "nobody was there anymore"); once per trip (second call 409).
- Also fixed: the road animation's map variable hid the train line name in its caption.

## 2026-11-14 — Play speed: trip delta, entry-room index, positions cache (C1–C3)

- C1: `POST /api/play/travel` also returns `state` {node_id, clock, previous_id, recent, people:[{id,location_id}], items, unread_messages, open_conversation}. The client merges it and renders with `reuse` (no `/api/play` after a step). Full reload stays for the first open, wait/sleep, rewind, talk end, item changes, a missing delta or a changed cast. Nodes' `follows` (a character's car) is not in the delta; the client does not read it.
- C2: `originIndex(nodes)` (place-network) builds parent → entry room in one pass, memoised per loaded tree array; `originChild`/`arrivalOf` take it as an optional last argument with identical answers.
- C3: `positions()` is cached under (world day, day part, `total_changes()`, `PRAGMA data_version`, autonomous cast ids). Any write on the connection (including UPDATEs such as rewind or answering an invitation) or by another connection recomputes; another day part never reuses it. Measured before/after: docs/PERF_BASELINE.md.

## 2026-11-14 — Background packages (one ZIP with place folders)

- Owner request: generated backgrounds arrive as ONE ZIP with a folder system and file names; the program puts every picture in its place. `POST /api/backgrounds/zip` takes the raw ZIP (Content-Type application/zip, name in `X-LU-Filename`, at most 300 MB). Studio: Alkotói stúdió › Helyszínek › "Háttércsomag (ZIP) betöltése".
- `app/background-zip.mjs`: minimal ZIP reader (stored + deflate, central directory, CRC checked, UTF-8 flag, Info-ZIP Unicode path, CP437 fallback). ZIP64, encrypted entries, other methods, absolute paths and `..` are refused; `__MACOSX` and dot files ignored. Nothing is extracted by entry path.
- Place matching (`placeIndex`/`matchPlace`) uses the picture's immediate folder: exact catalogue folder name first, then accent/case/dash-insensitive equality with the catalogue name, the tree short name or the tree path joined by " - " (with or without the town). No match or several: no guess; the picture is copied to `30_IMPORTS/Háttércsomagok/<date time> - <zip name>/<original path>` (root `Háttércsomagok` when the root is not organized) and listed as unmatched with up to 3 near candidates.
- Placing: matched PNG/JPEG (decoded with `validateMedia`) is written into the place's watched folder with `wx` (" (2)", " (3)"… on a clash; identical bytes in that folder = duplicate) and registered directly as a location background (same record as the folder scan, note "Forrás: háttércsomag"). WebP is set aside and reported as refused (backgrounds are PNG/JPEG only). A JSON journal per import goes to `<data>/backups/background-zip-*.json` (every entry with target/unmatched/refused and sha256).
- Orders: every background order has `zip_path` "<catalogue name folder>/<slug>-nappal.png" next to `save_folder`; `how.background` and `how.background_grok` say to deliver one ZIP with exactly these paths if the assistant can, otherwise per picture as before. No claim that Grok can make ZIPs.
- The folder scan also reports `misnamed_folders` (folders under Helyszín hátterek that only tolerantly match a place); they are shown, never moved.

## 2026-11-14 — Doors placed on the new Grok backgrounds (owner)

- Owner asked Claude to mark the doors on the Grok-made backgrounds. 87 places whose current backdrop is one of today's Grok pictures were looked at one by one; every way out got a position on the drawn door, stairs, gate, doorway or path, or an edge direction where the picture shows none. Saved through `POST /api/play/room-exits/<place>` (merge; presentation only). The earlier exit settings were backed up first (`backups\room-exits-before-doors-*.json`). `list_play_orders` takes `offset` for long lists. AI cost check: the recorded cost was correct (world calls are priced at the cheap world model); the prompt-cache rework was skipped as not worth it at about 1 USD a week.

## 2026-11-15 — More of the Szellemprofil in the game (owner: "work in order")

- `app/profile-prompt.mjs` now builds the profile text for every game prompt (moved out of world-engine.mjs). The 2026-11-09 boundary is unchanged: a character's own `creator` values go only into his own prompts and the game master's.
- Meta field `origin` (technical provenance) never enters a prompt, intimate scenes included.
- Known scales (Big Five, motivation, communication, mood, memory) are sent with a short behaviour phrase at the ends (≤30 % / ≥70 % of the scale); middle values and owner-added scales stay plain numbers. Null stays unknown, 0 is a value.
- Per use: `talk` (1:1 with Palor) gets every non-explicit field, as before; `agent` (world-engine intention) leaves out relationship-specific speech, attraction, sexuality text and the memory fields; `group` (several people in one prompt) keeps identity, look, personality, speech and the communication scales, clipped to 300 characters a field.
- A text field never filled falls back to its older profile text (`source`: biography, personality, appearance, speech_style, sexuality), as the profile overview already does; an accepted empty value is not refilled.
- Mechanics: memory recall uses "Érzelmi emlékek tartóssága" (recency fade 4–12 memories instead of 8) and "Sérelmek megőrzése" (memories of hurts get up to +4). Unknown values keep the earlier behaviour. The game master also sees each character's fears next to goals and conflicts.
- Not changed: the three-rises-a-day cap (owner decision 2026-11-11) does not follow mood reactivity; weekly routine waits for plan item 3.2 (schedules).

## 2026-11-15 — Characters without goals or routine can be met in Play (owner)

- `meetable()` (world-engine internals): the acting cast plus every active character with a Szellemprofil record or older profile text (biography, personality, speech style; the default "Nem: férfi." line alone does not count). Palor and groups are excluded. Cached until any database write.
- Play (presence, talk, group scenes, phone `can_talk`, relationships, readiness, figures/sprites, image workshop, scene assets) uses `meetable()`. World rounds still use only characters with goals or a routine: the others get no agent turn and no cost, they stand at their linked places by time of day (same position rule as before).
- "Javaslat a profilokból" (Élő világ › places) now also covers meetable characters. On 2026-11-15, 21 characters became meetable (all with a Szellemprofil but no routine); none had a linked place yet, so they appear only once places are linked. The 13 characters with no profile at all stay out.

## 2026-11-15 — Plan: profiled characters into the world (owner decisions D1–D3)

- Plan: docs/PROFIL_TERV_2026-11-15.md (22 characters with a Szellemprofil but no routine).
- D1: where the existing text is silent, Claude may draft goals, routine, speech, habits, fears and conflicts as `hypothesis` proposals for the owner's review. This lifts the 2026-11-09 "never invent goals, routines" rule for these reviewed drafts only; nothing is accepted automatically.
- D2: places named in profiles but missing from the tree are listed for the owner, not created.
- D3: relationship proposals may come from the profile texts and from shared homes/workplaces (neighbours, coworkers); all are proposals for review.
- Steps 1–2 done (2026-11-15): backup `backups/universe-before-profile-fill-2026-11-15T09-06-16-688Z.sqlite` (integrity ok) and code checkpoint `before-profile-fill`. `ops/profile-fill-2026-11-15.mjs` posted one proposal per character through the app's proposal API (validation and character policy passed for all 22): speech, goals, weekly_routine, habits, fears, conflicts for 21 characters, plus residence (Gábor, Jessi, Kristóf, Ricsi) and occupation (Ghor-Ka, Zzap); Zsombor only weekly_routine. `kind: hypothesis`, visibility `creator`, every text marked "[Új javaslat]". Routines name only places that exist in the tree; missing ones are written as "(a fában nincs …)". Already filled fields were skipped (Gyuszi's residence). Nothing accepted; drafts and journal are in `backups/profile-fill-*-2026-11-15T09-09-53-950Z.json`.
- Step 3 done (2026-11-15, after the owner accepted all 22 proposals; backup `universe-before-profile-fill-2026-11-15T09-47-00-540Z.sqlite`): the keyword suggester ("Javaslat a profilokból") was run once and added 81 links that were too broad (other-city hospital rooms, a gym for the orc Ghor-Ka, 25 characters outside the plan). `ops/profile-places-2026-11-15.mjs` removed exactly that run (the app stamps world_places with its game clock, 2026-11-17T09:55:06) and linked the 22 to the tree places named in their accepted routines: 85 new links (source `suggested`, note "Profil-rutin alapján", editable); Zsombor's two already existed. Journal `backups/profile-places-journal-2026-11-15T09-48-36-122Z.json`. Missing homes and places are listed in docs/PROFIL_TERV_2026-11-15.md; nothing was created in the tree.
- Owner (2026-11-15): "Jessi Jonas-sal él, legyen neki külön szobája Jonas házában. Gyuszinak csinálj egy házat Kálozon, add fel a rendelést a chatgpt-nek a helyszínek háttereit és nyilait illetően." `ops/homes-jessi-gyuszi-2026-11-15.mjs` (backups of tree and database first): new approved tree revision with "Jonas háza - Jessi szobája" (under Jonas háza), "Gyuszi háza" (under Káloz) and its entry room "Gyuszi háza - Nappali", each with a catalogue location; home links Jessi → Jonas háza (the night rule picks the room with his name) and Gyuszi → Gyuszi háza (source creator). Their profiles' residence (kind fact, the owner's words as source) and routine were updated through the proposal + decision API (version 6 each).
- Order split override: `play:order-worker` {tree place id: "chatgpt"|"grok"} wins over the town split in play orders. The three new places are ChatGPT's (backgrounds with every way out drawn, then doors/arrows). The Káloz map gets the new house pin through the usual ChatGPT map order. Takes effect after the program restarts.
- Owner (2026-11-15): "Raul egy budapesti szállodában lakik az utazása alatt, ahogy Hyunjin is. De amúgy nem kell mindenkinek megjelennie éjszaka. Palor nem ismeri őket annyira, hogy tudja, hol laknak." Raul's residence (kind fact) and routine now say a Budapest hotel (version 4); no hotel place was created. Hyunjin has no Szellemprofil, so nothing was written for him (a profile is not created from a remark); the fact is kept in docs/PROFIL_TERV_2026-11-15.md for when he gets one. Characters without a home place stay off the map at night by design; missing homes are not to be filled automatically.
- Renames (owner, 2026-11-15): the two unnamed figures got names (the goblin from the goblin pool in app/character-names.mjs, Zzap being taken), and names that match real people or a film character were replaced with other fictional names from the same culture. The owner chose those names by chance association. Complete renames through the app (`ops/rename-batch-2026-11-15.mjs`, each backed up and journaled by the app): Metro kopasz srác → Szilárd, Goblin harcos → Grix, Hyunjin → Doyoon, Jinu → Gunwoo, Mingi → Hajun, Namjoon → Wonjae, Seo Kang Joon → Moon Ihan, Soobin → Jiwan. IDs, media and links kept; folders moved under 10_CHARACTERS; the two catalogue locations named "Hyunjin" were renamed with him (explicitly confirmed). Read-only check: no old name in names, texts, locations or media paths. Earlier entries in this file keep the old names as history. The connection dropped once during Moon Ihan; the app finished it (verified).
- Second batch (owner, 2026-11-15 "Igen, írd meg"): the 13 characters that had no profile (Csanád, Dávid, Grix, Doyoon, Gunwoo, Matyi, Szilárd, Hajun, Máté, Wonjae, Moon Ihan, Jiwan, Tóni) got one proposal each through the same script and API (backup `universe-before-profile-fill-2026-11-15T10-42-31-377Z.sqlite`, journal `profile-fill-journal-2026-11-15T10-45-18-290Z.json`): gender, identity, occupation, residence, personality, speech, orientation, attraction, presented self, goals, weekly routine, habits, fears, conflicts (Szilárd also a short look: bald, from his former name). Known facts are marked [Kánon] (IKEA with their partners for Dávid and Máté, written without inventing the partner; Moon Ihan the actor filming in Palor's city; Doyoon's hotel; Tóni's flat; Grix the goblin warrior); everything else is [Új javaslat] for review (D1). No appearance was invented (no pictures were viewed); scales and the explicit fields are left empty. Nothing accepted. Grix's race was corrected from human to goblin through the character edit route (other fields sent back unchanged).
- Owner corrections to the second batch (2026-11-15): Doyoon is a businessman on a business trip from abroad to the Budapest trucking company, speaks no Hungarian; his marketing assistant speaks some broken Hungarian but prefers English; Wonjae is a K-pop star (his pictures were made on a stadium stage); the other Korean characters are students or settling guest workers; each knows Hungarian as his life story allows. Language rule for these characters: only the words the character says are in his language (English, or broken Hungarian); description and narration stay Hungarian. The assistant found in the catalogue is Valentin (Spanish marketer who came with his boss on business; no other character fits). Claude's six superseded pending drafts were rejected and replaced (journal `profile-fill-journal-2026-11-15T11-00-53-057Z.json`): Doyoon (Korean logistics director, hotel, "Budapest - Kamionos cég", English only), Wonjae (fictional boy-band singer on tour, Budapest stadium, two memorised Hungarian lines), Gunwoo (exchange student, a few words), Hajun (guest worker at a Korean-owned plant near Székesfehérvár, Munkásszálló, broken but working Hungarian), Jiwan (medical student in Pécs, English programme, fluent with an accent), Moon Ihan (actor kept from his relationship note, English only). Valentin's accepted profile got a pending proposal (identity, occupation, speech, routine: Doyoon's assistant). Csanád and Matyi unchanged. Nothing accepted.
- Owner (2026-11-15): Jiwan studies in Budapest, not Pécs ("Pécs még elég kiforratlan helyszín"); his pending draft was replaced (medical student at "Budapest - Egyetem", practice at "Budapest - Kórház", dormitory). A rough Pécs roadmap for any AI is being written in a separate pinned session (docs/PECS_TERV.md).
- Lesson: the keyword suggester's rules (any "edz" → gym, "kórház" → every hospital room, "székesfehérvár" → every "Székesfehérvár - …" place) are too coarse for a bulk run; prefer routine-based links.
- Found while drafting: Zsombor's residence says a small university town's rented flat, while the tree has "Budapest - Kollégium - Zsombor szobája"; his routine uses the tree. The owner decides which is right.

## 2026-11-15: Conversation log, shared past and conversation MCP tools

- Owner: "szeretném, ha gazdagabb legyenek ezek a mezők, és minden résztvevő profilján megjelenjen az infó", and later "csinálhatsz is új MCP eszközt, ha az hosszú távon kifizetődőbb. az adatvédelemmel ne foglalkozz, azt elintézem én".
- Single source: a play conversation (`play_conversations` + `play_lines`, summary in `summary_json`) stays the only record of a talk. `app/talk-history.mjs` is one read model over talks and world-engine events, used by the profile's events tab and the MCP catalogue. Nothing is copied into story events automatically.
- Save-point summary (same call, no new paid call; solo 650 → 1200 tokens, group 600 → 800): adds `shared_history` (≤ 6 sentences, the character's running shared past with Palor, grown from the previous version; an empty answer keeps the old one), `tags` (≤ 5, lower case), `importance` 1–5, `learned` and `mood` (both sides), and mentioned people/places. Mentions resolve only to existing records by name; an ambiguous or unknown name abstains; nothing is created.
- Reply prompt: "KÖZÖS MÚLTATOK PALORRAL" (the newest shared history) and "KORÁBBI BESZÉLGETÉSEITEK" (up to 3 talks before the last one, group scenes too). The shared history lives in the talk's own summary, so a rewound talk takes its version back.
- Profile events tab: "Beszélgetések és világesemények" lists talks for every participant (Palor sees all), talks where the character was only mentioned (marked, not part of his knowledge), and world-engine events; lines load on opening. "Felvétel történeteseménynek" opens the event editor prefilled; saving makes a proposal; source `Living Universe játék` / `play-conversation:<id>` prevents a second copy and links back.
- MCP: new read-only tools `list_conversations` and `get_conversation` (18 read-only tools; the connector needs one refresh). `perspective_character_id` keeps what that character took part in.
## 2026-11-15 — Budapest hotel with the guests' suites; weekly schedules in Play (owner)

- Owner: "Kérlek generálj egy Budapesti szállodát minden olyan Karakter lakosztályával akit érint ez a szálloda. Add le a chatgpt-nek a szükséges rendeléseket. Tedd ezeket a karaktereket láthatóvá a heti illetve napirendjük szerint."
- Guests (profile says they live in a Budapest hotel while travelling): Raul, Doyoon, Wonjae. Valentin keeps his own flat ("Valentin lakása", accepted routine).
- `ops/budapest-hotel-2026-11-15.mjs` (tree + database backed up, journal `backups/hotel-journal-2026-11-15T14-50-52-940Z.txt`): new approved tree revision 93c7a16c: "Budapest - Hotel" under Budapest with "Recepció" (entry room), "Étterem" and one suite per guest ("<név> lakosztály" with Nappali = entry, Hálószoba, Fürdőszoba). Doyoon's two older catalogue rooms were reused, not duplicated. Home links (source creator): each guest's suite living room and bedroom.
- "Recepció" is now an entry-room name (place-network ORIGIN).
- Plan 3.2, first step: `world:schedule:<character id>` = {entries:[{days 0–6 (0 = Sunday), slot, location_id, months?}]}. Play positions use it after accepted appointments and world events, before the old linked-place rule; first match wins. Schedules for the three guests drafted by Claude from their routines (Doyoon's routine is still a pending draft; Wonjae's concert days are a guess: Fri/Sat evenings), editable; summer weekends Raul goes to Balaton - Strand. Profiles were not changed; their "(a fában nincs)" hotel notes are now outdated.
- ChatGPT orders: Budapest is ChatGPT's town, so the hotel's backgrounds and doors and the Budapest map pin open as play orders by themselves (list_play_orders {for:"chatgpt"}). Code changes take effect after the program restarts. Sandbox check (Tuesday afternoon game time): Doyoon at Kamionos cég, Raul at Városliget, Wonjae at Stadion - Backstage. 387 tests pass.
- Owner (2026-11-15): "az élő világban az alak-promptot írd át a chatgpt részére. Chatgpt csinálja az alakpromtokat". Élő világ "📋 Alak-prompt" now shows a pasteable ChatGPT order (figure-prompts `chatgptFigureOrder`): the character's missing figures per row (dressed, shirtless, intimate = alap/mosoly/flortol), each made through start_generation_job {target:"figure"} → native generation → finish_generation_job with the picture attached; refusals recorded, never reworded; six pictures per answer, then "tovább". The Grok-style manual prompt stays folded under "Kézi prompt". "Minden hiányzó alak" copies one ChatGPT order for every character that is ready and lists the blocked ones (no usable references). `/api/sprites/missing` and the MCP figure overview gain a `chatgpt_order` field (output only, no new tool or parameter).

## 2026-11-16 — V3: one home task card per queue; honest progress

- The home page combines the old summary tiles and task buttons. Each queue shows its remaining count once, with its description, progress and action together. Empty location/inbox queues show 100% and a disabled Kész action; pending queues never say 100%.
- Progress uses the unrounded completed/total ratio through CSSOM, capped visually at the track width minus 4 px while anything remains. Queues without a known total show no invented completion percentage. Hungarian labels remain in i18n.js; no catalogue/canon or media changes.
- T0: ops/ui-shots.mjs / npm run shots uses the existing playwright-core runtime and installed Edge, on the 4327 sandbox only. No installation, upload or paid call. --home-only captures the two V3 views. Full capture writes 14 images (the seven specified views at both sizes; the task's stated 12 is inconsistent with that list) outside OneDrive. It blocks mutating API calls except the existing sandbox-only quick-tag sync; Play maps are rendered from read-only data without travel or time actions. The report measures the incomplete bars' >=4 px gap.
- Validation: client checks passed (12 tests); home-progress regression tests passed (3; 32/6400 remaining, empty queues/catalogue, inconsistent totals). npm test -- --changed passed 389 tests from the 132 pre-existing test files; the new regression file passed separately. Before/after home screenshots at 1366x800 and 375x812; full T0 run passed.

## 2026-11-16 — T0: verified sandbox and read-only screenshot run

- The screenshot runner now requires the sandbox-only /api/dev/sandbox-status marker before using an existing 4327 listener; an occupied unverified port is refused. The real service does not expose this marker.
- Browser requests are restricted to GET/HEAD on the sandbox origin. The automatic home quick-tag sync receives a synthetic completed:0 response without reaching the server. Other writes and outside requests are blocked. No package was installed: the existing playwright-core runtime launches installed Edge.
- Owned sandbox children receive an IPC shutdown message, allowing database closure and sandbox-copy cleanup on Windows. A screenshot run never stops a sandbox it did not start. Startup failures/timeouts are explicit. Profile rendering and the home render finish before captures and read-only Play map rendering, preventing asynchronous render races.
- Cold-start npm run shots succeeded: all seven requested views at both sizes (14 PNGs; the written acceptance count of 12 conflicts with the seven-view list). The owned catalogue copy was removed after completion. Tests cover request boundaries and the sandbox marker.
- Final validation: npm test -- --changed passed all 394 tests. A second cold-start capture produced 14 PNGs and report.json; both profile-bottom captures reached scrollY=3000. Visible images have a bounded 10-second decode wait, and finite animations finish before capture; failed/timeout images are reported. Seven Káloz portrait image waits per size timed out in the verified run; the town background loaded and was visually checked. The owned sandbox directory was removed. Locations captures explicitly reset scroll to zero.

## 2026-11-16 — Mérőeszközök package complete: B7 task counters and W9 text-key lint

- B7: F9 now offers three fixed task types (first sentence, background setup, other), Start/Finish/Cancel, live click count and elapsed wall time. The existing debug trail owns the measurement independently of its 60-step ring, in sessionStorage; navigation/reload and closing the panel keep the active task. Debug-panel clicks are excluded. Finishing sends only UUID, preset task, desktop/phone, count and milliseconds; cancelled tasks are not sent. Failed saves remain locally retryable with the same ID.
- Local diagnostics: POST /api/dev/ux-measurements validates the exact bounded numeric payload, stamps server time and deduplicates IDs across rotated logs (1 MiB plus one rotated file in the external data directory). No schema/canon/profile/media change. The phone proxy permits only this POST, with its existing Tailscale identity, exact origin and CSRF guards; no weekly/admin reads were exposed. Weekly JSON, the Rendszerállapot weekly tab and doctor Markdown aggregate count and average clicks/time by task and surface over the last seven days.
- W9: client-lint scans all public JS modules plus HTML translation attributes, both literal quote styles and template interpolations; runtime key prefixes ending with a dot are exempt from missing-key failures and mark matching dictionary entries as used. Comments and regex/string contents do not count as calls. The actual Hungarian dictionary is evaluated for keys in an isolated VM; missing keys fail, unrecognized uses are warnings only (103 at this check, including dynamic conditional keys). No keys were deleted. Synthetic typos are detected after every existing client module's syntax.
- Verification: npm test -- --changed: 398/398 passed (134 files). Focused checks passed again after the final lint self-check and authenticated phone-write test. Edge sandbox walkthrough: real F9 Start, one navigation click, reload, Finish, deliberately failed first save, same-ID retry, and weekly summary with one run/one click. No AI or travel action was invoked. T0 --debug before: ui-shots/2026-11-16T16-34-00-378Z; after: ui-shots/2026-11-16T16-39-47-139Z (16 images each, including F9 at 1366x800 and 375x812); owned sandbox copies cleaned up. Documentation and package status updated; no work begun on package 2.

## 2026-11-16 — V1: destination scroll and return to character list

- client.js navigate() waits for the destination render, then scrolls instantly to the top. Plain render/profile-tab updates do not reset scrolling. A navigation sequence prevents an obsolete completion from scrolling a newer screen.
- Leaving Characters for a profile or the shared template captures the current list offset and search query. The explicit back-to-Characters action restores both; sidebar navigation starts at the top with an empty search. A profile reached from elsewhere cannot reuse an unrelated list position. The route/hash/history behavior stays as before (A1 remains separate).
- T0 gained --navigation / --verify-navigation: actual list -> profile -> back, then scrolled profile -> Locations, with no forced destination scroll. Before: profile 1800, returned list 3000, Locations 209 desktop / 1032 mobile. After at both 1366x800 and 375x812: profile 0, returned list 1800, Locations 0. Artifacts outside OneDrive: ui-shots/2026-11-16T16-48-50-129Z and ui-shots/2026-11-16T16-49-24-252Z (10 PNGs each plus report). No AI, travel, live-database or media writes.
- Added four synthetic navigation tests: filtered return versus sidebar navigation; unrelated destinations and template return; awaiting layout; obsolete/failed render. The focused client run passed 17 tests. Usage and plan status updated; V2 has not been started.
- Final validation: npm test -- --changed passed all 402 tests across 135 test files. The strict T0 navigation verification passed at both viewport sizes; owned sandbox copies were cleaned up.

## 2026-11-16 — V2: permanent delete belongs to the current media selection

- The global topbar button was injected by permanent-media-delete.js controls(), rather than index.html. Removed that injection. The gallery button remains in the existing library/profile-media bulk toolbar, starts hidden and appears only for selected images, with the Hungarian label “N kép végleges törlése”. Clearing selection hides/disables it immediately; duplicate IDs and videos do not inflate the image count.
- Gallery control is hidden while the single-image viewer owns the delete target; closing the viewer restores the original gallery selection and count. The separate viewer button, capability/protection checks, deletion requests, journal/trash behavior and actual confirmation behavior are unchanged. Existing code has no extra confirmation dialog for this permanent-delete action; V2 does not add or remove one. New/edited presentation labels live in i18n.js.
- T0 --selection / --verify-selection captures home, empty gallery, two selected images and cleared selection at both sizes, without pressing delete or sending writes. Before: ui-shots/2026-11-16T16-53-56-826Z; after: ui-shots/2026-11-16T16-54-34-754Z (8 PNGs each plus report, outside OneDrive). Strict browser checks passed: homeDelete=0, emptyDelete=0, exact two-image label, clearedDelete=0 at both sizes. Both layouts visually checked.
- Four synthetic UI/selection tests cover initial hiding, image count/deduplication, clear, protected/unavailable capabilities, stale answers, viewer transitions and supported list scopes. Existing backend delete test still passes with CSRF, version, canon and file-preservation checks. Focused run: 24 passed. npm test -- --changed: all 406 passed (136 files). No live-data/media/canon writes, installation or paid calls. Documentation and plan status updated; V13 not started.

## 2026-11-16 — V13: descriptive Play top-bar controls

- Every top-bar button and summary now has an escaped Hungarian title and aria-label, including map/town/current-place navigation, car/foot selection, wait choices, sleep and all menu actions. Waiting already used a duration menu; its summary now explains that choice rather than incorrectly claiming an immediate next-slot jump. The 15/60-minute and next-slot actions explicitly say that time passes; no action, confirmation, keyboard shortcut or paid-call path changed.
- Unread badges explain the count in title/aria-label. Menu and Messages names include the count; the existing read-only poll updates both badges and names together and removes stale badges at zero. The AI indicator is visibly named AI-keret, with spent/cap in USD and consumed percentage on the meter's title, accessible name and value text. Its warning and budget behavior is unchanged.
- Short icon labels now remain visible above 1280 px (previous cutoff 1399); the existing one-line desktop bar and scrollable phone controls stay in place. AI label does not wrap on a phone. The shared topHelp translation wrapper is included in W9 key scanning, with a typo regression test.
- Added three synthetic tests: all travel/navigation variants have descriptive names; AI meter/cap bounds and currency; unread updates including zero. Focused client/mobile tests passed; npm test -- --changed passed 409/409 across 137 files. T0 --verify-topbar validates every button/summary/meter plus wide-screen text. Before: ui-shots/2026-11-16T17-12-13-008Z (18 controls lacked explicit title/aria-label pairs; 1366 px labels hidden). Final after: ui-shots/2026-11-16T17-16-39-462Z (14 PNGs and report, both sizes, outside OneDrive). No AI, wait, sleep, travel or media writes were invoked. Usage and plan status updated; A9 not started.

## 2026-11-16 — A9: reopen Play at Palor's current location

- Only map/town preferences are read and written in lu-play-view; legacy journal/relationships/messages/settings values are ignored. Opening menu pages no longer overwrites the last spatial preference. Place displays continue to persist as map, as before.
- Each first render after leave() resets the in-memory menu mode to the spatial preference, clears the old scene and resolves the current server node. An actual room opens through the existing read-only place endpoint; a stale remembered town is corrected to the actual town. Unknown nodes fall back to the world map; a failed room read cannot show the previous scene or an unrelated town. In-session menu rerenders remain on the menu; conversation restoration and actual position/travel rules are unchanged.
- Four synthetic tests cover legacy/corrupt/blocked storage, all menu modes, persistence, same-instance reopening, current rooms/towns, unknown nodes and failed room reads. Focused client/mobile/topbar/resume run: 27 tests passed. npm test -- --changed: 413/413 passed across 138 files.
- T0 --resume / --verify-resume reproduces old settings storage, exits/reopens the same UI instance from Settings and reloads the page. Before all three entries showed settings at both sizes (ui-shots/2026-11-16T17-20-21-059Z). Final after all three were spatial (ui-shots/2026-11-16T17-22-52-674Z), with strict real-room ID checks when applicable. Eight PNGs plus report per run, outside OneDrive. No settings saved, time advanced, AI/travel invoked, media/canon/live database changed. Owned sandbox copies cleaned up. Plan status and dev-tool usage updated; A10 not started.

## 2026-11-16 — A10: sleep as an explicit wait-menu choice

- Moved the existing morning action from the top-level bar into the initially closed Várok menu, labelled Alszom reggelig. Its existing action binding, clock jump, world processing, conversation handling and away-from-bed confirmation are unchanged. The wait-menu accessible description now includes sleep. This implements A10's menu option; no new undo timer or second confirmation flow.
- Phone verification exposed the old menu clipping inside the horizontally scrolling top actions. The wait dropdown is now positioned below the top bar (its existing backdrop-filter provides the containing block), outside that clipping area, with >=44 px menu buttons on phones. Desktop anchoring remains unchanged. The sleep button's actual on-screen hit target is checked, not just DOM visibility.
- T0 --sleep-menu / --verify-sleep-menu captures closed/open/closed-again at both sizes, counts time-step requests and never presses sleep. Before: ui-shots/2026-11-16T17-41-24-694Z. Final after: ui-shots/2026-11-16T17-43-56-914Z (8 PNGs each plus report, outside OneDrive). Strict checks passed: no visible sleep action while closed, one reachable menu action while open, phone height >=44 px, and zero /api/play/wait requests.
- Added two synthetic regressions: sleep appears once inside the closed menu with all wait options retained; the unchanged action calls until:morning at home, while away it still confirms and cancellation sends no request. Focused client/mobile/topbar run: 25 passed. npm test -- --changed: 415/415 passed across 138 files. No live data, media, canon, paid calls or actual game-time steps were changed during verification. Documentation and plan status updated; A12 not started.

## 2026-11-16 — A12: explicitly select the group conversation participants

- The arrival action and its existing G shortcut now open a native modal checkbox chooser. It lists existing present people, checks the first four by default, requires 2–4 selections, shows the live count and starts only on Beszélgetés indítása. Cancel/X/Esc return without a request; focus returns to the caller. Labels are escaped, Hungarian text lives in i18n.js and rows have 44 px touch targets. The modal owns keyboard input so background Play shortcuts do not fire.
- startGroup passes the selected stable character_ids to /api/play/group-talk. The server validates array shape, distinct 2–4 IDs, current presence and meetable cast before the model call. Palor/unknown/absent IDs are refused; an existing conversation cannot swap participants through this field. Omitting the field preserves the old default-first-four API behavior. Continuation, consent/stage rules, profiles, memory and canon remain unchanged. A rejected opener restores the arrival UI without retrying.
- Synthetic tests cover chooser defaults/count validation/cancel, exact opener IDs, failed-start recovery, model-call-free invalid selection rejection, selecting the fifth man out of five and retaining the chosen participants in subsequent turns. Full npm test -- --changed: 417/417 passed (139 files); client, group and mobile checks passed.
- T0 --group-picker / --verify-group-picker uses five synthetic male UI fixtures via read-response interception; no characters or places are created. Before: ui-shots/2026-11-16T17-49-41-422Z (arrival only; no picker). After: ui-shots/2026-11-16T17-52-06-336Z (8 PNGs plus report). Both sizes passed: four defaults, fifth selectable, five disables Start, four selected after replacement, Esc closes, zero group-talk requests. No paid calls, time/travel, live database, media or canon changes. Documentation/plan status updated; A17 not started. Restart the program and refresh the browser together to load the new server contract and UI.

## 2026-11-16 — A17: readable request errors and deliberate status checks

- New shared public/api-json.js wraps fetch plus JSON decoding for client.js api(), location-canvas request() and character-generation write(). Network failures, HTML/truncated/empty responses and invalid JSON payloads become Hungarian messages without leaking raw response bytes. Valid server JSON errors retain translation, status, code and request ID. Transport failures use status 0 and keep the actual HTTP code separately as httpStatus, so unreadable HTTP 409 responses cannot enter existing business-conflict write-retry branches.
- Main errors and initial screen loads offer Újra – állapot betöltése. It rerenders the current screen rather than replaying the triggering operation. Locations can check the saved plan without changing the local draft, including errors inside its modal. Generation checks the known run/context only; it never resends execute/approval/preparation through the new retry control. Its prompt/reference draft and stable preparation request key remain intact. An ambiguous write explicitly warns that it may already have completed. No automatic retry was added; the existing read-only generation polling now exposes the same manual recovery. The helper is on the desktop static allowlist; existing mobile routes were not broadened.
- Error toast layout wraps cleanly on a phone, with a 44 px status-check button. All new wording is in i18n.js. T0 --request-errors / --verify-request-errors injects HTML 502 and a refused connection in browser reads, restores the connection and verifies both recovery buttons. Before: ui-shots/2026-11-16T18-00-16-481Z (raw errors, no retry). After: ui-shots/2026-11-16T18-04-31-194Z (8 PNGs and report, both sizes), passed; no live server shutdown or forwarded writes.
- Tests: malformed/null/scalar JSON, connection failure, uncertain writes/one attempt only, metadata and CSRF/body preservation, retry click locking, generation status-only recovery and retained drafts. Focused client/location/generation/helper run: 32 passed. npm test -- --changed: 422/422 passed (140 files); final transport-status guard was followed by the 32 focused checks passing again. No live catalogue, media, canon, upload or paid call changed. Documentation and plan status updated; A25 not started. Program restart is required to serve the new helper, followed by browser refresh.

## 2026-11-16: A25 travel hints; quick fixes package complete

- World-map towns, town pins and scene doors show an immediate, keyboard-accessible custom hint with the existing destination/ETA and known people. Late ETA title updates also refresh an open hint. No unknown presence or travel time is invented.
- A 430 ms touch hold opens the same hint and consumes its ensuing click, preventing accidental travel. Short taps retain their action; movement, scroll and pointer cancellation cancel the hold. Escape, blur, resize and leaving Play dismiss it. Existing aria-describedby values survive dismissal.
- T0 before: ui-shots/2026-11-16T21-04-47-799Z (14 PNG); after: 2026-11-16T21-08-36-096Z (18 PNG), both outside OneDrive. Desktop and phone-size hover/hold checks passed with zero travel requests. The read-only town screenshot now uses the actual town ID as its display position, as required by A9.
- Verification: 14 focused lint/topbar/resume/group-picker tests and two synthetic pointer/scroll/hint tests passed. Visually checked the 375x812 touch screenshot. No live writes, installs or paid calls.
- The owner requested all remaining packages sequentially; this supersedes the plan's one-package-per-session guideline. Package 3 follows next.

## 2026-11-16: A5/B8/A6 persistent place scene and decoded transitions

- Play now updates its top bar and scene parts while retaining the scene root, background layers, unchanged figures and doors. Door tools, item/time refresh and background uploads no longer rebuild the whole scene. Figure entry animation is limited to entering a different place; same-place refreshes settle the stage.
- New play-scene.js keeps two image layers. The old decoded background stays visible until the incoming image decodes, then a 400 ms opacity crossfade switches them. Missing/failed images use the place placeholder; stale asynchronous completions cannot overwrite a newer render. Reduced motion removes the transition. The desktop and restricted phone listeners serve the shared module.
- openPlace no longer replaces the previous scene with a skeleton. Passage pictures wait for decode before their display timer starts; pending pictures leave the previous screen visible and remain skippable. Image decoding is bounded to 15 seconds and failures do not leave broken-image icons.
- T0 uses synthetic read-only scenes, including phone:true at 375x812. Before: 2026-11-16T21-11-47-564Z (10 PNG). Verified after: 2026-11-16T21-16-56-273Z (12 PNG), outside OneDrive. Both sizes preserve the root during tools/refresh and hold the previous image/title during an explicitly delayed decode before showing the new room. Visually inspected the phone result.
- npm test -- --changed: 426/426 tests passed across 142 files. Focused image-readiness/passage tests cover delayed decoding, invalid images, timeout and skip. No live data or provider calls.

## 2026-11-16: B9/A23 worker cutouts, warm neighbors and B10 day-part transitions

- Sprite flood-fill and trimming now run in a dedicated same-origin OffscreenCanvas worker, with the existing border/green-screen method factored into a pure pixel module. Concurrent consumers share a job; figures are decoded as a batch before being assigned together. Worker failure/timeout falls back to the original asset without doing heavy pixel work on the main thread.
- Derived transparent WebP is kept in the browser's versioned Cache Storage, outside OneDrive (128 entries; 64 in-memory promises). No original, profile or canon is edited. Sprite URLs include their existing version. This is the Worker alternative in B9, so no server media cache/converter or package installation was added. Desktop and restricted phone asset lists include both worker files.
- Up to six neighboring exits warm backgrounds and their present characters' figures using read-only place requests, coalesced for 30 seconds. Town layouts are coalesced for 60 seconds and explicitly invalidated after successful layout saves/resets. Failed reads never become cached successes; caches are bounded.
- Day-part colors now interpolate on the retained scene overlay, and background filter changes transition smoothly. Waiting no longer dims a place scene. Passage images start their Ken Burns movement and display time after decode; reduced motion disables movement/transitions. Entry-only dialogue animation is cleared after arrival.
- Synthetic before images: 2026-11-16T21-20-24-455Z (12 PNG); verified after: 2026-11-16T21-24-57-651Z (14 PNG), outside OneDrive. Two Worker-WebP figures and persistent day/night scenes passed at both sizes; no travel/time/AI request. Pixel tests preserve white clothing, green pockets and transparent assets; cache/worker tests cover coalescing, invalidation and failure.
- npm test -- --changed: 430/430 tests across 143 files passed. No live writes, installs or provider calls.

## 2026-11-16: A3/B11, A4, A2/B3 and B14 dialogue package

- In-person/group inputs are growing textareas (up to five lines); Enter sends, Shift+Enter inserts a newline, IME composition is respected, and Up recalls the previous Palor line only into an empty draft. Drafts and selections survive redraw; drafts also survive minimization. Suggestions fill the editor by default; double-click sends once. A validated quick_send setting explicitly restores single-click sending.
- Escape minimizes the current one-to-one or group talk into the existing return pill, preserving its identity/cast, with no end/save/model request. It clears photo display. The return pill reserves space above itself for the arrival box on phones. Modal cards, zoom, story and chooser overlays retain keyboard ownership. Goodbye remains the explicit ending action.
- Figures and arrival names now open a native, focus-managed person card before any opener. Only its Megszólítom button starts a new in-person talk; existing talks are resumed, and another talk cannot silently replace one. Message opens the phone thread without sending; Album retains the existing visibility gates.
- New GET /api/play/known-character/:id projects shared talks/plans and relationship levels only. Private character memories, friends, creator fields and level-change reasons are omitted. Participant notes never become character prompts. B14 shows the last shared conversation, open promise and upcoming appointment without an AI call, including when resuming a stored talk.
- T0 synthetic before: 2026-11-16T21-29-53-557Z (8 PNG); verified after: 2026-11-16T21-39-07-461Z (12 PNG). Both sizes preserve drafts, edit suggestions, minimize/restore and show the card with zero action/AI requests. Actual play-mobile.html/play-mobile.js also passed the read-only sandbox check: 2026-11-16T21-39-15-688Z (6 PNG). Visually inspected the phone card and actual mobile page.
- npm test -- --changed: 434/434 tests across 144 files passed. Synthetic tests cover keyboard/IME, suggestion settings, group Escape state, reminder escaping, participant privacy and no extra model call. No live writes or paid calls.

## 2026-11-16: A7/B6 remembered travel, V11/V12 readable maps

- Between-town travel remembers the exact selected mode, own vehicle or ride in local browser storage. It asks again for an unavailable choice, a newly available train/ride, explicit forced selection, or the validated always-ask setting. Local car/walk controls now explain their scope.
- Reused choices have a 1.2-second preflight with Másképp megyek / Mégse, before any travel write. Changing opens the chooser; cancelling, Escape or hiding the tab does not move time or Palor. An in-flight guard prevents parallel trips, and internal automatic-selection metadata is never sent. Once a request is sent, it is never replayed to change mode.
- World-map crowds are placed above labels with collision checks and at most three faces plus a remainder badge. A final noninteractive label layer keeps names/subtitles visually above the artwork. Labels are clamped inside the map, including the Pécs sign.
- Town labels move independently of saved pin positions, use leader lines when needed and retain full names in accessible hints. Presence and room-count badges each have a title and accessible explanation, plus a visible legend. Map sizing uses its actual top edge and fits both axes; 1366x800 town view has document height 800 with no vertical scrolling.
- T0 before: 2026-11-16T21-42-33-813Z (14 PNG). Verified after: 2026-11-16T21-51-33-094Z (18 PNG); actual mobile page: 2026-11-16T21-52-05-532Z (6 PNG), all outside OneDrive. Both sizes have zero avatar/label or town-label collisions, no clipped world labels and no unexplained badges. Chooser cancellation and preflight change are tested without travelling.
- npm test -- --changed: 437/437 tests across 145 files passed, including unavailable/new options, exact ride/vehicle preference, preflight-before-write and unchanged saved map coordinates. No live writes or paid calls.

## 2026-11-16: V5 reference decoding and V4 readable home errors

- Diagnosis on a sandbox copy reproduced all three currently affected references. Their approved crop coordinates reach the image edge: JavaScript validates their sums as 1, while Windows PowerShell decimal conversion can sum slightly above 1 and throw Invalid crop. The PS decoder now permits only floating-point tolerance (1e-12 after double conversion); strict JavaScript crop validation, approved coordinates, original bytes, reference IDs and canon remain unchanged. Synthetic tests reproduce these boundary values.
- File thumbnails and in-memory MCP/reference images now share windows-image-decoder.mjs and its persistent NDJSON PowerShell worker. It preserves EXIF normalization, bounded image/output dimensions and byte limits. The old thumbnail.ps1 entry point retains the numerical fix for an already running server until restart. Workers suppress progress CLIXML and retain the actual bounded error cause (up to 500 characters) for diagnostics.
- Concurrent identical reference requests coalesce. Failed source-bytes/crop/output-size combinations are negative-cached for ten minutes with bounded cache size; changed bytes or crop can be tried immediately. Real corrupt-image and injected-failure tests verify the cause and that repeated requests start no new job/process within the cache interval.
- A failed approved preview becomes a keyboard-accessible Nem tölthető be – megnyitás button using the existing media opener. Home errors group repeated events by resource and character, show human text/counts, and link directly to the Approved identity tab. Raw routes, UUIDs and diagnostic text remain in the System status errors view, not the home card.
- T0 reference before: 2026-11-16T21-54-43-306Z (6 PNG). Forced-failure after: 2026-11-16T22-01-44-563Z (6 PNG). Real affected references after: 2026-11-16T22-09-49-086Z (6 PNG), all decoded successfully with no placeholders. Home before: 2026-11-16T22-02-41-798Z (2 PNG); verified grouped card/target after: 2026-11-16T22-09-12-471Z (6 PNG). Artifacts remain outside OneDrive; private catalogue IDs are supplied via CLI or discovered at runtime, not embedded in the script.
- npm test -- --changed: 442/442 tests across 147 files passed. Focused reference/crop/original-byte tests, real Windows pool tests and canonical-tab link checks also passed. No live database writes, original-media edits, installs, uploads or paid calls.

## 2026-11-17: V9/A14/B1 profile reading, A15 atomic autosave, V6/B2 readiness

- Profiles start in a reading view with one expanded group, sticky group navigation below the top bar, six-line expandable long text and literal proposal-marker counts. Fact, impression, hypothesis, legacy and canonical appearance remain distinct, with source and creator/public visibility. Empty/hypothesis filters and an explicit editing switch preserve existing content.
- The serialized autosave retains assertion kind, interpretation and visibility. A single transactional manual endpoint validates structured/template versions and legacy values, mirrors legacy columns and appends attributed history atomically. A failed mirror rolls back all changes. Canon is untouched. Uncertain writes retain the browser draft and block automatic retries until read-only reconciliation; conflicts require an explicit choice.
- Desktop and authenticated mobile review share this save path; mobile origin, identity and CSRF protection cover the new route. Readiness is fetched in one batch and shows profile completion, dressed figures, weekly routine, a home on the placed map and acquaintance with Palor. Card captions shorten aliases/occupation with full text available as a hint; filters and sorting reuse existing cards.
- Synthetic T0 before: 2026-11-16T22-15-16-419Z (8 PNG); verified after: 2026-11-17T06-04-00-218Z (14 PNG). Both viewport sizes cover reading/editing, sticky groups, long-text expansion, filters, completion and a browser-only mocked autosave. No real action requests are allowed. Images and reports are under LOCALAPPDATA, outside OneDrive.
- npm test -- --changed: 446/446 across 149 files passed; focused tests additionally verified mobile save authorization and sexuality/speech legacy mirroring, restart and backup compatibility. No installs, paid calls, live database/media changes or canonical writes.

## 2026-11-17: A1 routes and A24/B24 direct Play startup

- Studio views and each profile tab now have stable hash routes. Navigation pushes history, restores browser Back/Forward and reload state, and flushes pending edits before leaving. Profile cards are real links for bookmarks/new tabs; the rename page returns to its stable-ID profile. The old #locations entry remains compatible.
- Home starts with a read-only resume card showing the current place and game-clock slot. An optional browser-local preference opens Play on an otherwise empty entry URL; explicit routes always win. Start Living Universe Play.cmd starts or reuses the existing app, waits for readiness, then opens #/play without a game action.
- Separate desktop and authenticated-phone manifests launch the actual Play entry, with local 192/512 icons and standalone display. A network-only service worker stores no private page/API/media responses. Phone installation assets retain Tailscale authentication; no desktop studio route was exposed.
- T0 before: 2026-11-17T06-04-46-693Z (10 PNG). Verified routes/resume after: 2026-11-17T06-10-35-602Z (8 PNG). Actual mobile page: 2026-11-17T06-09-49-923Z (6 PNG). Reload of a canonical tab, Back/Forward, startup preference, explicit Home override, manifest and icons passed at both sizes with writes blocked.
- npm test -- --changed: 448/448 across 150 files passed, including malformed routes, storage denial, retained list scroll/search and phone installation asset authorization. The Windows launcher was prepared and syntax-checked, not run against the live app; installation of the browser icon remains an owner action. No live writes, paid calls or dependencies.

## 2026-11-17: A11 shared dialogs and B25 cancellable commands/notification queue

- Replaced browser-native prompts/confirmations in Play and the studio (including factory, profile review, media review, system tools and the restricted phone editor) with a shared themed native-dialog component. Labels and values use text nodes, focus remains in the modal and returns to the trigger, Escape/cancel/page exit return no value. Guest description and an optional, unchecked paid-portrait choice are one form; cancel never creates a guest.
- Desktop and phone toasts retain independent cards instead of replacing previous messages. Errors remain until dismissed; successful messages expire separately; status-only recovery retains its read-only behavior. Notifications remain actionable over an existing dialog.
- Sleeping, accepting all profile proposals and putting down an item have a five-second undo window BEFORE any operation is sent. Undo, dismissal, Escape, hiding/leaving the page or navigation cancels the deferral. Duplicate sleep actions are guarded. Once submitted, the existing operation is not replayed or compensated automatically.
- T0 before: 2026-11-17T06-12-31-500Z (12 PNG). Shared-form and notification/undo after: 2026-11-17T06-17-20-373Z (6 PNG); actual phone page: 2026-11-17T06-19-00-853Z (6 PNG). Both sizes verified cancel/focus return, text escaping, unchecked portrait default, three simultaneous notices, undo and timer expiry without action requests. Visually checked the phone form and notice stack.
- npm test -- --changed: 449/449 across 150 files passed. Sleep tests cover away confirmation, zero requests on undo and duplicate-click serialization. No installs, live writes, paid calls or canon changes. W5 searchable selection/draft work remains in the planned studio package.

## 2026-11-17: A20/B20/A21 generation workflow; B17 capacity estimate and ceiling

- The Sogni panel selects available approved face/body references (or still-valid last choices) and preserves the composition draft. Preparation remains local. A separate, explicitly acknowledged upload step asks Sogni for a non-generating estimate with confirm_cost:false and a zero capacity ceiling. Only a bounded HTTP 400 with a positive documented estimate is accepted; an unexpected execution response or unknown response shape fails without retry.
- The estimate produces a new attributed manifest hash. Approval must bind that new exact plan. Capacity ceilings travel unchanged to the single paid workflow start; over-cap or expired estimates cannot be approved/executed. Provider responses do not justify a capacity-to-Spark/USD conversion: monetary values remain explicitly unknown. B17 monetary-schema validation remains pending a live account trial; no price is invented or hardcoded. Reference/canon changes and provider settings still invalidate the plan.
- One exact-plan approval can approve and start one image; the existing per-run upload/cost acknowledgement stays mandatory. Completion shows the result in place, with explicit Gallery/Open/Again/Variation/Withdraw controls; Again/Variation only compose a fresh proposal and never auto-submit it. Canon is not promoted. A durable-run observer shows active work and announces new results across studio screens using GETs only. Ordinary talk/wait/travel/settings and profile text edits can continue; file-operation guards remain.
- T0 real-panel before: 2026-11-17T06-26-34-041Z (4 PNG). Verified synthetic pending/running/result/background notification after: 2026-11-17T06-41-49-737Z (10 PNG). Both sizes verify preselection, disabled unacknowledged approval, active-work chip, no forced navigation and reuse of the prompt; every action/AI write is blocked by T0.
- npm test -- --changed: 455/455 across 151 files passed. Additional focused cases cover estimate-upload acknowledgement and CSRF, stale hashes, cap/expiry, safe parallel play, one start, retained results and no automatic retry. Provider behavior was checked against https://docs.sogni.ai/api-reference/workflows/ and https://docs.sogni.ai/api-reference/direct-generation/; all executable tests use synthetic providers.
- Owner reported a Sogni account/API-key problem during implementation. No live Sogni calls, credential changes or account repairs were attempted. Live monetary-schema and key validation wait until the account is restored; remaining implementation proceeds with mocks.

## 2026-11-17: B18/A22 backgrounds and B22 guest portrait provider choice

- A separately configured Sogni text-to-image provider can prepare a location background from the existing backgroundPrompt, for day/evening/night and two to four variations. It is disabled unless an explicitly allowlisted text model and key are configured; the reference-edit model is never silently substituted. Models were checked against https://docs.sogni.ai/api-reference/direct-generation/; their quality and real account availability are not certified by mock tests.
- Exact text, count and capacity ceilings are reviewed before estimate/upload acknowledgement and per-run cost approval. Work runs durably in the background; interrupted/uncertain attempts never resubmit. Temporary decoded PNG/JPEG results remain outside OneDrive until the owner chooses one. Selection uses the existing background saver with time-of-day filenames, preserved prior media and stable catalogue IDs. The new records and attributed history are portable application_settings entries; unselected runtime files are not claimed to be backup originals.
- Guest portraits can explicitly use OpenAI (existing behavior) or a separately approved Sogni text-only plan. A Sogni failure never falls back to OpenAI. This path creates no character/canon and sends no character reference picture. A selected new portrait disables an incompatible older shirtless presentation while retaining its file. No automatic shirtless edit is added to the Sogni path.
- Background and shared-scene uploads now send the original File as bounded binary PNG/JPEG with real XHR byte progress and a separate validation/saving state. Legacy JSON uploads remain compatible. Lost upload responses are not retried. Existing decoders, duplicate detection, path containment and non-overwrite rules still apply.
- T0 before: 2026-11-17T06-45-32-602Z (12 PNG). Verified synthetic background composer/variants, guest composer and 37% upload progress: 2026-11-17T07-39-35-033Z (10 PNG). Actual mobile page: 2026-11-17T07-41-41-709Z (6 PNG). Both sizes use GET fixtures and no AI/approval/upload/selection actions. Visually checked the desktop variant selector and phone portrait form.
- npm test -- --changed: 459/459 across 153 files passed. Focused tests cover original binary bytes, invalid files, deduplication, separate model configuration, zero reference uploads, estimate/approval/hash/cap gates, local variation previews, one selected background, existing guest identity, no new characters/canon and no silent OpenAI fallback. Owner's Sogni account/key problem remains a live-validation limitation; no live call or configuration change was attempted.

## 2026-11-17: Owner-approved scoped generation sessions

The owner explicitly approved the exact scoped-session exception in docs/SESSION_APPROVAL_JAVASLAT_2026-11-17.md and its insertion into AGENTS.md. The authenticated admin can approve a fixed list of exact image jobs with named references, provider/model/settings, expiry, image/capacity/USD ceilings and explicit upload acknowledgement. A changed scope requires a fresh grant. Reservations are atomic before dispatch; unknown prices and uncertain outcomes never lead to automatic resubmission. Existing per-run approval and canon gates remain. This policy approval alone enables no live session, paid call or private-media upload. The initial implementation is verified with synthetic providers; live Sogni validation waits for the owner's account recovery.

## 2026-11-17: A19/V10/B4 location hub and B5 quick navigation

- Locations has Tree/Map/Backgrounds/Doors tabs with stable routes. It combines the existing layout canvas, actual town pin and room-exit editors, daypart background inventory, binary upload and explicit Sogni plans. Metadata editing opens the existing stable-ID editor; details show recorded home/work links and actual eligible background media. Untimed images remain labelled unknown rather than inventing a daypart. Old location-tool entries lead to the hub.
- The canvas fits all visible rectangles on entry/resize, groups source labels by their real top ancestor and makes the inspector collapsible. Save/Review/Undo remain primary; secondary tools are in More. A stale local/server draft requires a choice before editing; the local candidate has a session recovery copy. Loading a version creates no server write. The root identity remains immutable.
- Studio embeds the existing Play presentation editor with scoped reads and only town-layout/room-exit writes. It cannot travel, wait, talk, invoke AI or upload files through that adapter, and does not overwrite Play's remembered view. In Play, map/door tools lead to the studio. A hub button labelled Travel here in Play is an explicit travel action using the existing mode chooser, never a hidden preview.
- Recent/favourite chips and Ctrl+K search cover real places, current known person locations and screens. Unknown locations cannot be chosen. Favourites are browser-local; entering/cancelling/searching the palette sends no action. Escape closes a populated search without minimizing the underlying talk. All chosen trips reuse the existing travel flow.
- T0 before: 2026-11-17T07-49-40-560Z (10 PNG). Verified hub after: 2026-11-17T12-01-13-476Z (14 PNG); quick navigation after: 2026-11-17T12-18-48-727Z (8 PNG). Both sizes cover fit, required version choice, all hub tabs, palette/favourite state and zero travel/talk/wait requests. Visually inspected laptop map and door editors.
- npm test -- --changed: 463/463 across 155 files passed. Tests cover wide-tree fit, source grouping, studio request guard, accent-insensitive search without invented locations, valid favourites, routes, atomic saves and unchanged canon/media protections. No live changes or paid calls.


2026-11-17: Sogni variations, scoped sessions and Play picture orders

Reference runs support one to four separately registered outputs with stable media IDs, exact manifests, per-output feedback, portable receipts and local-only recovery after a partial registration failure. Withdraw and permanent deletion account for every variant; approved references remain protected. A scoped grant freezes existing jobs and reserves their verified estimate atomically before dispatch. Unknown USD prices block session approval, uncertain outcomes keep reservations, and revocation blocks further dispatch. No live Sogni call, private upload or live grant was made.

Conversation snapshots reuse the participant-scoped scene prompt, approved Palor/partner bindings and existing scene placement after explicit variant selection. Figure orders reuse needs/brief/jobs/place and the local InsightFace method; ambiguous faces abstain and body fidelity remains unknown. A finite figure worker requires a separately approved session and never resumes or retries a paid request automatically. Background proposals still use the separately approved text-image path; a mixed figure/background session worker remains pending the verified monetary-estimate contract.

2026-11-17: Shorter studio pages and shared name selection

Living World opens on Today, with readiness and social reads deferred to their tabs. Days, character place blocks and message lists start collapsed; deficit controls open the owning character/editor. Image Workshop shows date/file size rather than hash filenames, groups offline files without requesting previews, offers explicit OneDrive hydration and opt-out free local analysis, and loads further pages on scroll. Signal queues consult cloud attributes before opening originals. Quick Tag opens on the first nonempty task group and adds searchable, recent-value pickers. Character Factory uses searchable checkboxes and local name/description drafts. Shared Hungarian collation puts explicitly flagged group records last.

Validation: 468 tests passed across 158 files before the final small UI checks; focused generation/identity/import tests passed afterward. T0 before: 2026-11-17T12-43-15-490Z; after: 2026-11-17T13-00-12-778Z, 18 images, both sizes, lazy-tab reads, no browser errors and draft reload checked. Today stays within two viewports. Sogni variation before/after: 12-27-27-447Z / 12-44-10-886Z. Artifacts remain under LOCALAPPDATA/LivingUniverse.


2026-11-17: Minimal shared development checklist

The owner requested a small hierarchical task list, prioritised within the remaining weekly budget. One versioned document in existing application_settings stores stable task IDs, parent/order, text, short notes, completion and active/previous unfinished tasks. Existing backup/restore includes the document. Branch checkboxes aggregate descendants and toggle the whole branch. Cycles and excessive depth/size are rejected. Same-origin CSRF protects the desktop UI; the existing bearer-authenticated MCP service exposes read/create/update/move/delete/active operations to every connected assistant. Stale versions are rejected and request keys prevent duplicate writes. No agents, schedulers, dependencies, character data changes or live service calls were introduced for this feature.

Validation: the shared-data integration test covers authentication, subtree completion, partial parents, reordering, cycle rejection, interruptions, replay/stale conflicts, both MCP transports, restart and export/restore. The full changed suite passed 472 tests across 161 files; a subsequent UI-only scope-name fix is covered by the T0 browser run. Earlier UX work stays paused: package 16 has implementation and focused tests but still needs its remaining validation/documentation; package 17 and the mixed Sogni background/figure session executor remain open. No production restart, paid Sogni request or upload was performed.

Final task-checklist verification (2026-11-17): 17/17 focused tests passed after the final browser fix and exact database-only sandbox allowlist addition. T0 before: LOCALAPPDATA/LivingUniverse/ui-shots/2026-11-17T19-48-43-653Z (2 images); after: 2026-11-17T19-57-18-111Z (8 images). Both 1366x800 and 375x812 passed partial-parent checkbox, active/previous task, collapsed-branch persistence, note editing and reload checks. The synthetic task writes affected only the sandbox database copy, which was removed on exit. Full-suite log: LOCALAPPDATA/LivingUniverse/diagnostics/dev-tasks-20261117-tests.txt (472/472).


2026-11-21: E1 – character distinctness measurement (living characters, owner priority)

Owner priority 2026-11-21: complex, different, living characters come first (docs/ELO_KARAKTEREK_TERV_2026-11-21.md, task branch "Élő, összetett, eltérő karakterek"). E1 adds an offline, deterministic measurement: app/character-distinctness.mjs (innerCoverage = which filled inner-life fields of a person reach his prompt; characterOnly + distinctness = how different the person-specific parts of prompts or replies are, names ignored) and tests/character-distinctness.test.mjs with five synthetic men deliberately unlike each other. No model call, no install, no live data. A live run against a real provider (reply distinctness) is a separate owner-approved step.

Baseline (mock provider, same opening line "Szia! Mi újság veled mostanában?"): 1:1 talk prompt inner-life coverage 100% for all five; person-specific 1:1 material distinctness 0.83. Group scene: coverage only 38–56% per person – goals, conflicts, fears and the dominant motive (attachment / recognition / autonomy / security) are left out by profile-prompt.mjs OMIT.group. This is the E11 target.

Test environment note: on the Linux test VM (Node 22) 52 tests fail before these changes, all image/import/generation/startup tests that depend on Windows or native image tools; none touch conversation or world-engine code. The list is kept with the session and is the comparison baseline; npm test on Windows (Node 24) remains the reference run.


2026-11-21: E11 – inner life stays in group scenes

Group scenes used profile-prompt.mjs OMIT.group, which left out goals, conflicts, fears, coping and all five motives (E1 baseline 38–56 % inner-life coverage). New castProfileTexts(): everyone in the company gets one shared detail level, the richest that fits the scene budget (1800 characters per person, at most 7200). Levels drop background first (habits, coping, relationship speech → biography, occupation, emotional traits, short appearance, minor scales → conflicts and remaining communication scales → personality, and middle-value scales); speech, goals, fears and the five motives are never dropped. Attraction/sexuality only in an intimate group scene, as before; explicit fields only when explicit. Pattern after Covel plugins/character-blueprint/lib/roleplay-notes.js DETAIL_LEVELS (MIT, Covel Contributors), rewritten. 1:1 talk and the world agent are unchanged.

Result: group inner-life coverage 100 % for all synthetic people (tests/character-distinctness.test.mjs); play/world/profile tests: no new failures against the 2026-11-21 baseline. Rollback: revert the commit (no data or schema change).


2026-11-21: E10 character card and E13 secrets

New Szellemprofil group "Szerepkártya" (ghost-profile.mjs cardFields): Hang egy mondatban (play_voice), Viselkedési szabályok (play_rules, up to 3), Ellentmondás / kivétel (play_contradiction), Két jellemző mondata (play_lines) and Titkok (secrets). Each has guidance: derive only from what the profile already says; secrets only from the owner, never invented. They go through the existing proposal/approval flow like any field; nothing is filled automatically. A saved template from before the card gets the five fields appended once at startup as a normal versioned template change (actor code:E10-character-card, history kept, existing fields and values untouched); the live template (v7, 48 fields) becomes v8 with 53 fields on the next restart.

Prompts (profile-prompt.mjs): the card comes first under "SZEREPKÁRTYA (így játszd…)", before the long profile. Secrets are sent only with secrets:true – his own 1:1 talk, the group scene (marked: only he knows, the others do not) and his own world-agent turn – with the rule to let them shape behaviour without saying or hinting at them until the story reveals them; never by default (the System/narrator answer, Palor's profile in other prompts). In group scenes voice, rules and the contradiction are always kept; the typical lines are the first thing dropped. Pattern after Covel plugins/character-blueprint (MIT) and AI Town data/characters.ts (MIT); rewritten.

Validation: tests/character-distinctness.test.mjs (card order, secret boundaries, group levels, one-time versioned template migration); 64 play/world/profile/template test files: no new failures against the 2026-11-21 baseline. Rollback: revert the commit; the appended template fields can be left (unused) or removed through the template history.


2026-11-21: E2 – inner state carried between conversations

Before: "HANGULATOD MA" came from a word test over the day's event titles (same rule for everyone, reset daily); the mood written at a save point was only shown in the history. New app/inner-state.mjs with migration 033-inner-state (additive table character_inner_states, down script included): the existing 1:1 save-point summary call (no extra request) also returns "inner" – mood, strength 0–3, why, up to three concerns in his own life, and what he wants from Palor – from his point of view, given his previous state so concerns carry over. The newest live row is his current state. His mood fades with world days by his profile (half-life 2 days, longer for low emotional stability / high mood reactivity, 0.75–5 days); concerns and the wish towards Palor stay up to 21 days or until replaced. His own 1:1 prompt gets HANGULATOD / AMI MOST FOGLALKOZTAT / AMIT PALORTÓL SZERETNÉL (he may bring them up or avoid them, by his nature); the day's events stay as "A MAI NAPOD" background; with no state yet the old line is unchanged. Group scenes show each person's state in the third person. Rewind marks rows rewound and undo restores them (world-rewind payload.inner).

Patterns: Generative Agents scratch "currently" / revise_identity (Apache-2.0), AI Town perspective summaries (MIT), Covel memory blocks vs facts (MIT); rewritten.
Not yet: group-scene save points do not write inner states; no nightly update (both later). Validation: tests/inner-state.test.mjs; 65 related test files: no new failures against the baseline. Rollback: revert the commit; the table may stay (unused) or be dropped with 033-inner-state.down.sql.


2026-11-21: E3 – motive-based appraisal (the same event hits people differently)

New app/appraisal.mjs, deterministic and offline, from the Szellemprofil scales only (unknown scales say nothing): appraisalLines() gives up to three motive lines, strongest first (attachment, recognition, autonomy, security, reward; high ≥7 or low ≤3 of 10), and one line on how it shows (emotional stability, expressiveness, directness, bluntness, sarcasm, agreeableness). appraiseEvent() gives a person-specific reading of a missed date or a broken promise (rejection / insult / shaken trust / relief / does not mind). His 1:1 prompt gets "ÍGY HAT RÁD, AMI TÖRTÉNIK" (adjust your reaction, do not say it); the missed-date and lapsed-promise notes get his reading; group blocks get it in the third person. No model call, no data change. The poignancy idea of Generative Agents (Apache-2.0) made person-specific; the chain is this project's own.

Validation: five synthetic profiles read the same missed date five ways; appraisal blocks differ (mean distinctness > 0.5); related tests: no new failures against the baseline. Rollback: revert the commit.


2026-11-21: E4 – his own aim in a conversation; he may want to leave

New app/agenda.mjs (deterministic): before each 1:1 talk the character gets one aim from his real situation, in this order – a promise Palor broke (lapsed thread), what he wants from Palor (E2 inner state), his strongest current concern, his conscious goal. In the first six lines he brings it up himself, his own way (directly or by hints, by his nature); later only if it has not come up. Group blocks show each person's aim in the third person. The reply JSON gains "leaving": a short reason when he wants to end the talk himself (busy, hurt, fed up), said in his reply too; the talk response returns it as "leaving" (not stored; a UI marker is a later step). After AI Town "goals for the conversation" (MIT) and Generative Agents conversation planning/ending prompts (Apache-2.0), rewritten.
Validation: tests/inner-state.test.mjs (aim from his wish, leaving returned), tests/character-distinctness.test.mjs (aim from each one's own goal).


2026-11-21: E5 – permission to disagree

New app/stance.mjs (deterministic): every character's own 1:1 prompt says he need not agree with Palor or be nice – he answers by his own opinion, mood and interest and may refuse, dodge or change the subject. From the profile and state: low agreeableness → contradicts and argues; high → yields but keeps his limits and does not pretend; high bluntness → says it straight; hurt (E2 mood negative, still strong) with grievances ≥3 → not won back by one kind line, may stay cool for days until real amends; otherwise a strong negative mood → a bad day, curt or impatient; filled secrets → defends them, may dodge or lie about them; relationship level ≤ −1 → suspicious. Group blocks get a short third-person version. Owner rules (consent, closeness stages, adults only, no forced romance) are unchanged; this only removes the default eagerness to please.
Validation: tests/character-distinctness.test.mjs (E5 cases; every 1:1 prompt carries the permission); related tests: no new failures against the baseline after E4 and E5.


2026-11-21: E6 – where they stand, why the relationship changed, fact rules

The 1:1 save point's inner state also returns palor_view: one or two sentences on where things stand with Palor, as he sees it (e.g. angry because…, waiting for an apology). It is stored in character_inner_states.palor_view (additive column, added by a guarded ALTER for a table created before it) and shown in his next prompt as "AHOGY TE LÁTOD, HOL TARTOTOK PALORRAL". His prompt also lists the reasons of his last three relationship-level changes towards Palor ("MIÉRT VÁLTOZOTT LEGUTÓBB A VISZONYOTOK", closer/further, newest first; rewind revisions excluded), from world_level_revisions which already stored them. The 1:1 summary prompt gets fact rules after Covel plugins/world-ir (MIT): a request, promise, attempt, question, assumption or quoted report is not an event; every sentence belongs to its speaker; Palor's decisions, feelings and consent are never invented.
Validation: tests/inner-state.test.mjs (view and reasons in the next prompt, fact rules in the summary prompt, column migration); related tests: no new failures against the baseline.


2026-11-21: E12 – opinions about people and topics from conversations

The 1:1 save point also returns up to two "opinions": what formed or hardened in him during the talk about someone mentioned (not Palor, not himself) or about a recurring topic, one sentence from his side, possibly biased. world-social addOpinions() stores them in world_beliefs (model 'play-opinion'; a person is matched by full or unique first name, otherwise it is a topic with about_id NULL; event id kept). They appear in his next prompts through the existing "A VÉLEMÉNYED" list; topic opinions are kept apart by name. Opinions do not count as a reflection (lastBeliefAt ignores them), so reflection timing is unchanged; rewind/undo already covers world_beliefs. Opinions about Palor are dropped here (his view of Palor is palor_view, E6). After Generative Agents convo_to_thoughts / keyword_to_thoughts (Apache-2.0).
Validation: tests/inner-state.test.mjs; related tests: no new failures against the baseline.


2026-11-21: E7 – memory recall weighs importance, rare words and reinforcement

New additive side table memory_salience (migration 034; character_memories itself is untouched because three places insert into it positionally): importance 1–5, recall_count, last_recalled_day. The 1:1 save point's existing importance (1–5) is stored with both the character's and Palor's memory of the talk. recallMemories(): the "words of the moment" part is now Okapi BM25 over the same five-letter Hungarian prefixes (app/world-text-rank.mjs, rewritten from Covel rankTexts, MIT), scaled to 0–3 like the earlier count, so a rare shared word (a name, "adósság") outweighs an everyday one; importance adds (importance − 3) × 0.75 (unknown = 3 = no change); a memory that keeps coming back gains up to +1 (recall_count × 0.2), counted at most once per world day for older memories (not the three newest, which are always in). Recency, person, place and grudge terms are unchanged, so all earlier recall tests hold. Weights follow the Generative Agents order (relevance > importance > recency, Apache-2.0) and AI Town memory.ts (MIT) on this engine's scale.
Validation: tests/memory-recall.test.mjs (turning point recalled, trivial not; reinforcement once per day; rare word beats many common); world-audit recall tests pass; related tests: no new failures. Not done: a 200-memory benchmark with a before/after number (later, with E1). Rollback: revert; 034-memory-salience.down.sql drops the side table.
