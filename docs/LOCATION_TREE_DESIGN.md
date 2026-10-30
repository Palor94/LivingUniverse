# Hierarchical locations: technical design

Prepared 2026-10-30 after the hashtag implementation and full passing regression
suite. **Design only. No location schema migration, catalogue promotion, canvas
approval, place rename or file operation is implemented by this document.**

## Outcome and identity rules

Support `Fenyves / Strand` and `Kőváros / Strand` as different exact places with
different UUIDs. Hungarian local names appear in the interface; English names
and aliases support AI/search. Store identity as UUID, never as a full path,
translated name, filename, group/tag ID or sibling position.

Example (names are illustrative, not additions to the user's canon):

```text
Living Universe                 synthetic UI root
├─ Fenyves                      place UUID A
│  └─ Strand                    place UUID B, parent A
└─ Kőváros                      place UUID C
   └─ Strand                    place UUID D, parent C
```

B and D may share a descriptive `strand / beach` type/tag. Selecting that type
does not select B or D. Reparenting B changes its breadcrumb, not B's identity or
its linked media/events. Hierarchy means containment; travel connections require
a separate future model and cannot be inferred from parent links.

## Current owning sources and dependencies

| Source | Current behavior / change needed later |
| --- | --- |
| `010-specific-locations` | `locations.name_key` is globally UNIQUE. This is the main blocker for duplicate local names. |
| `locations.mjs` | `ensureRecord` and `resolve(tag:...)` match globally by name. Replace global lookup with explicit parent + normalized local name; never return an arbitrary homonym. |
| `015-multiple-locations` | `media_locations` retains one primary; `media_location_links` stores secondary places. Preserve both sets and the exact primary ID. |
| `016-location-profiles` / `location-editor.mjs` | Already stores English name, category, description and cycle-checked parent. Rename currently updates a linked structured tag and rejects global place/tag collisions. Separate place labels from generic descriptive labels. |
| `location-canvas.mjs` | Versioned plans live in local `location-canvas.json`, with their own head, approval and catalogue-version checks. Canvas changes currently do not modify SQL places. Preserve this distinction. |
| `public/location-canvas-model.js` | Synthetic `world:living-universe` root, stable source IDs, collections, types, unplaced/archived nodes, cycle checks and 128-level limit. A collection/type-source is not automatically a real place. |
| `public/locations.js`, `sorting-pickers.js` | Options/bubbles currently show local names, with ID values. Add disambiguating breadcrumbs and separate environment/type filters. Preserve selections through search and inline creation. |
| `public/location-editor.js` | ID-keyed drafts, expected versions and conflict comparison already exist. Add explicit parent-aware creation, subtree preview and breadcrumb context. |
| `mobile-sorting.mjs` | Legacy phone edits use one primary location. Preserve secondary links when the primary is unchanged; require an explicit multi-location client for full replacement. |
| `folder-sync.mjs` | Updates stored location folders after separately authorized physical character-folder changes. A tree edge or place rename must never invoke this machinery. |
| `story-events.mjs`, migration 017 | Current links have FKs to `locations`; immutable revision payloads also contain location UUIDs. Preserve IDs and knowledge filtering; do not rewrite historical payload names or reapprove events. |
| `note-tags.mjs` | Linked exact-place tags are blocked from automatic hashtag matching. Retain this invariant after the location schema changes. |
| Export and `ops/backup` | SQL exports, verified SQLite backups and separately stored canvas revisions must be captured together. Existing logical SQL export does not by itself include canvas JSON. |

The canvas and catalogue can disagree. `location_profiles.parent_id` represents
the saved catalogue parent. An approved canvas is still an approved **plan**,
not evidence that its hierarchy has been promoted into the world. Migration
preview must show both sources and require an explicit choice for each difference.
Do not promote generic setting tags, type-source nodes, collections, archived
drafts or unknown parent interpretations automatically.

## Recommended relational model

Keep `locations` as the canonical exact-place table so existing media/event FKs
and UUIDs remain usable. A parallel canonical place table would require competing
identity/link stores or artificial unique legacy names. Avoid that duplication.

Future version-2 `locations` fields:

| Field | Purpose |
| --- | --- |
| `id TEXT PRIMARY KEY` | Existing ID copied exactly; new places use random UUIDs. |
| `parent_id TEXT NULL REFERENCES locations(id)` | Authoritative containment; null means synthetic world root. |
| `name TEXT NOT NULL`, `name_key TEXT NOT NULL` | Hungarian local display name and NFC + Hungarian case-normalized sibling key. Preserve accents; do not use fuzzy/AI normalization for uniqueness. |
| `english_name TEXT NOT NULL DEFAULT ''` | Optional explicit English equivalent. Unknown stays empty. |
| `category TEXT NOT NULL DEFAULT ''`, `description TEXT NOT NULL DEFAULT ''` | Preserve current profile text without interpretation. |
| `tag_id TEXT NULL REFERENCES structured_tags(id)` | Retain legacy label association for compatibility/provenance. New exact places do not require a new structured tag. |
| `folder TEXT NULL`, `created_at TEXT NOT NULL` | Preserve stored locator and creation time. A world parent is not a directory parent. |
| `version INTEGER NOT NULL CHECK(version>0)` | Optimistic edits and auditable reparenting. |

Use two unique indexes, because SQLite treats NULL values as distinct in a normal
composite UNIQUE index:

```sql
-- Proposed only; not an executable migration in this change.
CREATE UNIQUE INDEX location_root_name
  ON locations(name_key) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX location_sibling_name
  ON locations(parent_id,name_key) WHERE parent_id IS NOT NULL;
CREATE INDEX location_children ON locations(parent_id,id);
```

This permits equal names under different parents and rejects equal normalized
names under one parent, including root-level duplicates. English names and aliases
are search terms, not uniqueness keys. If two siblings really need the same name,
the creator must distinguish their local names in this initial version; do not
silently append numbers or merge them.

Retain `location_profiles` as a frozen legacy snapshot during the first schema
transition; copy its fields into the canonical row. All version-2 runtime readers
and writers use the canonical row, not a second writable parent source. Export
adapters explicitly identify legacy snapshots. Do not run old code against this
schema. A later, separately tested migration can retire the redundant snapshot.

Additional additive records for the future phase:

- `location_aliases(location_id, language, alias, alias_key)`, unique per place and
  normalized alias. Aliases may match several places and return qualified choices.
- `location_types(id, hu_name, en_name)` and `location_type_links(location_id,type_id)`
  if reusable types are approved. Preserve the existing free-text category until
  explicitly mapped. A type is not a place or tree parent.
- `location_changes(id, request_key UNIQUE, request_hash, actor, before_json,
  after_json, affected_ids_json, created_at)`. Reparent/rename history and receipts
  support audit, stale-safe retries and compensating undo.

Do not add a closure table initially. With the existing 5000-node canvas cap and
128-level depth bound, indexed adjacency plus bounded recursive CTEs is adequate.
Measure realistic imported catalogues before adding denormalized paths or closure
rows. Compute breadcrumbs from IDs; cached paths are disposable derived data.

## Creation, editing and subtree operations

Creation requires `parent_id` explicitly, including null for root. Validate the
parent exists and is a concrete assignable place, check the sibling key in a
`BEGIN IMMEDIATE` transaction, insert a UUID, and return its qualified breadcrumb.
An idempotency key binds exact input; identical retries return the original ID.
Same name + different parent creates a different place. Same sibling name returns
409 with the existing candidate's ID; no automatic merge.

Rename/reparent requests include expected place version and expected tree version.
Preview returns the old/new breadcrumbs, descendant count, sibling conflict,
affected media/event counts and the fact that no files will move. A plan digest
binds the moved place, destination, descendant IDs/versions and label changes.
Confirmation revalidates inside one write transaction. Reject:

- self-parenting, descendants as parents, missing or non-place parents;
- any cycle, depth over 128, duplicate sibling key or incomplete/truncated tree;
- changed destination/version, or the same idempotency key with different content.

The subtree retains every ID. Existing media/event memberships remain unchanged.
No path-based mass UPDATE is needed. Invalid imported cycles are reported before
writing; do not silently detach a node or attach it to root. Move order is a
presentation field and must not be part of identity or name uniqueness.

Undo is a new audited operation with current version checks. If a former parent
has disappeared or a sibling name is now occupied, report the conflict instead of
overwriting newer work. Archive/delete policy is outside the first migration;
never remove a place with media/events/children merely to resolve a conflict.

## API and interface plan

Build a shared location repository used by desktop, mobile, story events, canvas
promotion and exports. Centralize normalization, cycle validation, sibling checks,
versioning and breadcrumbs; current independent global-name SQL must not survive.

Proposed APIs (names may be aligned with existing routes during implementation):

| Operation | Response/guard |
| --- | --- |
| `GET /api/location-tree?parent_id=...&cursor=...` | Direct children, qualified names, type, child count and tree version; bounded paging. |
| Search | A list of `{id,name,english_name,breadcrumb,parent_id}` candidates; always include ancestors for ambiguous local names. |
| Create/edit | Explicit parent and expected version; return exact ID, qualified label and receipt. |
| Reparent preview/confirm | Digest-bound subtree review and atomic audited commit. |
| Media assignment/filter | Stable place IDs, explicit primary, explicit exact-place versus subtree filtering. Descendant search is opt-in. |
| Canvas promotion preview/confirm | Exact canvas approval head + catalogue version + per-source-ID mapping. Never part of startup or opening the canvas. |

Update desktop bubbles, dropdowns, mobile lists and parent selectors to show, for
example, `Strand · Fenyves` and `Strand · Kőváros`. Search accepts Hungarian and
English aliases, but assignment uses the chosen UUID. Never auto-select an
unqualified homonym. Distinguish the same local name under different parents in
screen-reader labels and keyboard navigation. Keep current ID-keyed local drafts.

Version/capability negotiation must prevent old create/rename clients from writing
global-name assumptions into the new schema. Existing ID-only reads/assignments
can remain compatible when their semantics are explicit. An unchanged legacy
primary keeps secondary media links, as it does now. Explicit replacement must
name the complete chosen set. Keep the existing authenticated route allowlists,
Origin checks, CSRF and creator/participant knowledge boundaries.

Separate environment-description tags from exact-place options in both APIs and
UI. Preserve old associations and their meaning, but new location names do not
automatically generate or rename generic structured tags. During compatibility,
legacy linked labels remain blocked from automatic hashtags. Description/type
hashtags never pick a world-place UUID, including when a type name equals a place
name. The `tag:` and `folder:` legacy selectors need an explicit conversion review;
folder basenames do not establish identity or parenthood.

## Migration plan — future work only

The current global uniqueness is an inline SQLite table constraint. Dropping a
normal index cannot remove its automatic unique index. Adding only a parent table
would leave duplicate names impossible. A controlled `locations` table rebuild is
therefore required; **do not label that rebuild as an additive-only migration**.
Its supporting journal/alias/type tables can be additive.

1. Develop and test against disposable exported catalogues. Inventory foreign-key
   consumers and all location SQL, including story-event latest-link tables and
   historical JSON payloads. Capture a verified SQLite backup and canvas files.
2. Produce a read-only preflight: all UUIDs/names/parents/tags/folders, cycles,
   missing parents, normalization collisions, shared labels, primary/secondary
   media links, event links and canvas differences. Export a machine-readable
   manifest with counts and hashes. No private media bytes are needed.
3. Require explicit creator review of canvas promotion and uncertain type/place
   interpretations. Do not infer a hierarchy from folder structure, labels or AI.
4. Stop all application writers and use one maintenance connection. SQLite foreign
   key enablement must change **outside** the transaction. Follow the tested table
   rebuild sequence: create a replacement table, copy exact IDs/values, drop the
   old `locations`, rename the replacement to `locations`, then create new indexes.
   Do not rename the old table first: SQLite can rewrite dependent FK targets to
   that temporary name. Rehearse self-parent references and dependent SQL on the
   exact supported SQLite build.
5. Before committing, compare every preserved ID and relevant field/link against
   the manifest and run `PRAGMA foreign_key_check` and `integrity_check`. Roll back
   on any mismatch. Re-enable and verify foreign-key enforcement after commit.
   Mark the schema version explicitly; current startup's `user_version=1` is not a
   sufficient migration registry and must not overwrite the new version marker.
6. Start only schema-compatible application code, initially read-only. Verify
   counts, qualified search and old/new export restore. Enable writes only after
   these checks pass. Test two same-named children under different parents before
   accepting production use.
7. Keep the pre-migration snapshot and frozen legacy profile records. Promoting a
   canvas is a separate reviewed transaction after schema migration, not a side
   effect of copying current catalogue parents.

Rollback cannot pretend that two accepted `Strand` records fit the old global
UNIQUE constraint. The safe immediate fallback is read-only access using
schema-compatible code while preserving all new records. A pre-migration restore
is suitable only when no later writes would be discarded. Once new duplicate
names or hierarchy edits exist, downgrade must export all changes and require an
explicit reconciliation plan; never rename, merge or drop places automatically.
No automatic destructive down script should be provided.

## Acceptance matrix and delivery sequence

Automated tests for the future phase must cover:

- Equal Hungarian names under different parents; NFC/case sibling collisions;
  root NULL uniqueness; equal English aliases returning multiple qualified choices.
- Self/descendant/cycle/depth rejection, stale reparenting, atomic failure and
  idempotent retries; unrelated branch changes handled without silent overwrite.
- Stable IDs and exact preservation of primary/secondary media memberships,
  sorting flags, notes, canon, event UUIDs/revision payloads, labels and file bytes.
- Exact-place versus subtree filtering, primary-only legacy saves, qualified
  desktop/mobile pickers, keyboard/screen-reader context and recoverable drafts.
- Canvas/catalogue disagreement, type/collection/unplaced nodes, truncated trees,
  changed approval heads, explicit promotion mapping and duplicate source IDs.
- Verified backup, simulated failures before/after table swap, self/FK integrity,
  old/new restore, schema compatibility refusal and a non-destructive downgrade
  refusal after accepting new homonyms.

Recommended next increment: implement only the shared **read-only** location
inventory/preflight and qualified breadcrumb reader against disposable exports.
Use its evidence to finalize the version-2 rebuild and canvas-promotion mapping.
Then implement/test the migration separately, followed by parent-aware writes and
finally explicit canvas promotion. No production migration is authorized merely
by accepting this design document.
