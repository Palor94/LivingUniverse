# Media Notes: bilingual hashtag extraction

Implemented on the development branch, 2026-10-30. No live catalogue migration,
backfill, production deployment, paid request or private-media upload was run.

## Investigation and dependencies

The implementation follows AGENTS.md, PROJECT_VISION.md, DECISIONS.md,
DEVELOPMENT_PLAN.md and VISUAL_IDENTITY.md. The existing Node 24 / built-in SQLite
stack needs no new package or provider.

| Existing component | Integration and conflict handling |
| --- | --- |
| `taxonomy.mjs`, migration 005 | Keep every existing group/tag ID, base name and media link. Add localized labels and aliases alongside them. |
| `media_notes` | Extract only explicit hashtags in `notes`. Do not reinterpret plain prose, comma-separated legacy `tags`, profile/admin notes or reviews. Never rewrite the note. |
| Desktop media PUT | Extract inside its existing atomic assignment/note save. Validation failure rolls back the whole save. |
| Mobile sorting | Use the same matcher and save transaction. Include derived tag IDs when comparing an identical retry; retain authentication, Origin, CSRF and optimistic versions. |
| Legacy mapping/bulk tagging | Preserve explicit choices. A manual additive mapping adopts an extracted link so later extraction rollback cannot remove it. |
| Locations 010/015/016 | A tag already linked to an exact location is ineligible for automatic matching. No hashtag selects a location, creates a place, changes the location-reference role or moves a file. An explicitly chosen location adopts its descriptive link. |
| Export/restore | Include all six new tables in dependency order. Reject partial/malformed new-table snapshots atomically; older snapshots remain supported. |
| MCP read catalogue | Add Hungarian display and English equivalent metadata; extend existing escaped search. Do not add remote taxonomy writes or image retrieval. |
| Canon | Descriptive labels do not approve identity, alter profiles or modify references. |

The full test run also exposed existing canon/reference inconsistencies. A
separate prerequisite commit fixes omitted optional canon expectations, appends
reference-only canon revisions instead of reusing a revision ID, and replaces
removed-reference explanations with the existing minimal retention marker. Tests
now distinguish appearance-only UI history from complete SQL revision history
and follow the documented retirement exception. These changes execute only on
the existing explicitly authorized canon operations; no startup cleanup is added.

## Usage

In **Media notes & corrections**, write `#mosolygó #teljes_alak` or
`#smiling #full_body`. **Hashtagek előnézete** previews the unsaved text without
writing it. Saving adds uniquely matched descriptive labels. The form reflects
saved labels without replacing the note or review draft.

In **Tag groups & vocabulary**, edit the Hungarian display name, English AI
equivalent and optional aliases. Alias lines use `hu: vidám`, `en: happy` or
`und: token`. Both localized names are required when saving localization.
Creating/editing a base tag together with its bilingual metadata is atomic.
Unknown translations stay unknown; arbitrary existing vocabulary is not sent to
an AI translator. Keep old spellings in aliases when changing localized names.

The built-in descriptive vocabulary has curated Hungarian/English equivalents.
Existing user names remain intact, including renamed built-ins. A tag without a
curated/user-entered translation falls back to its original name. New tags use
UUIDs. Legacy starter IDs are retained for compatibility, even where their old
text contains English words. Names and translations never generate replacement
IDs.

**Jegyzetcímkék: száraz próba és visszavonás…** provides:

1. Pending unknown, ambiguous and location-linked tokens, each tied to its media ID.
2. A current-gallery-page ID shortcut or an explicit list of up to 1000 active IDs.
3. A read-only preview before applying an existing-note backfill.
4. Recent extraction runs with an explicit rollback review.

Resolve an unknown token by explicitly creating a bilingual descriptive tag or
adding its spelling as an alias of an existing tag. Then preview the affected
media again. A vocabulary edit alone does not backfill old notes. For an exact
place, use the location selector. No unknown token automatically creates a
vocabulary entry or changes world canon.

## Matching contract

- Unicode letters, numbers and combining accents are supported; hashtags are
  bounded to 100 characters. Overlong tokens are ignored, never truncated into
  another valid label.
- NFC plus Hungarian case folding normalizes spelling. Spaces, underscores and
  hyphens are equivalent word separators. Thus `#full_body` and `#full-body`
  resolve to `full body`.
- Accents remain significant: `mosolygo` is not automatically `mosolygó`. Add an
  explicit accentless alias if wanted. There is no fuzzy matching, translation
  guess, stemming or substring assignment.
- Hashes embedded in words, email/URL fragments, escaped hashes and doubled `##`
  prefixes are excluded. A hashtag starts at the beginning or after whitespace
  or the supported opening/list punctuation. Plain words are not tags.
- Matching uses original label, localized names, explicit aliases and a stable ID
  when that ID can be expressed as a hashtag. Multiple spellings for one ID add
  one link. The `(media_id,tag_id)` primary key prevents duplicate links.
- Name/alias collisions are refused within a vocabulary group. Pre-existing or
  cross-group collisions are retained and become ambiguous proposals; matching
  never chooses the first result or merges tags.
- A candidate linked to `locations.tag_id` is blocked. A descriptive candidate
  colliding with a linked-place candidate is also ambiguous. Standalone setting
  labels may describe a background but never create an exact place assignment.
- Saving is additive. Removing a hashtag does not remove previously assigned
  labels; remove labels explicitly or roll back their extraction run. A retained
  hashtag can re-add a manually unchecked label on the next note save.

## API and review consistency

All new write endpoints remain on the existing private desktop listener, with its
Host/Origin/cross-site checks. Mobile only gains extraction within its existing
authenticated sorting save; no new mobile/MCP write route is enabled.

| Endpoint | Contract |
| --- | --- |
| `GET /api/taxonomy` | Original name, Hungarian display, English equivalent, aliases, IDs, usage and a tag version. |
| `POST /api/taxonomy/tags` | Existing tag fields; optional `language` contains `expected_version` (null for creation), `hu_name`, `en_name`, `aliases`. Save all atomically. |
| `POST /api/taxonomy/language` | Edit metadata using `tag_id`, `expected_version`, the two names and a complete alias list. Stale versions return 409. |
| `POST /api/taxonomy/notes/preview` | `media_ids`; optional `notes` for one draft. Returns matches, existing links, current proposals and `preview_hash`. No writes. |
| `POST /api/taxonomy/notes/apply` | Same `media_ids` and exact `preview_hash`, recomputed from saved notes inside a transaction. Draft text is never saved by this route. |
| `GET /api/taxonomy/notes/review` | Up to 1000 active-media proposals and 100 latest runs. |
| `POST /api/taxonomy/notes/rollback` | Explicit `run_id`; return removed links, restored proposal changes, conflicts and replay status. |

The preview hash binds the exact IDs, note hashes, candidate decisions, existing
assignments, current proposals and complete relevant vocabulary/location
interpretation. Equal counts do not make a stale preview valid. Repeated
extraction is a no-op when nothing changes. Replaying an already-applied preview
may return 409 because its existing links changed; re-preview safely. Individual
mobile save retries remain idempotent. Unknown proposals are unique per media
and normalized token and reconcile with current hashtags on the next extraction.

## Migration, backup and rollback

Migration **021-note-hashtags.up.sql** creates only:

- `tag_localizations`, `tag_aliases`;
- `note_tag_runs`, `note_tag_links`;
- `note_tag_proposals`, `note_tag_proposal_changes`.

The application verifies an online SQLite backup before first adding this schema
to an existing structured-tag database. It stores the snapshot in the configured
local data directory's `backups/before-note-hashtags-<uuid>.sqlite`, outside
OneDrive. Schema creation and curated seed insertion are transactional and
repeatable. Existing notes are never backfilled at startup. Tests use temporary
SQLite files or `:memory:` only.

Run rollback removes only links still owned by that run. Existing manual links,
later manual adoption, explicit replacement, legacy mapping and exact-location
choices are retained. A cascading composite foreign key invalidates ownership
when a link is explicitly removed/replaced. Proposal snapshots are restored only
when they still equal the run's recorded result; later edits count as conflicts.
Rollback does not change the note, profile, canon, completion, original file,
location role or place assignment. Repeating a rollback is safe. Saving retained
hashtags again can create a new extraction after rollback.

For application/schema rollback, first use run rollback where desired and export
a snapshot. Stop the development application, restore the prior application
code, and run **021-note-hashtags.down.sql** against the intended disposable or
separately approved catalogue. It drops the six new tables only. It deliberately
retains all `media_tags`, including accepted extracted labels, and every original
table. Once journals are dropped, per-run rollback needs the exported snapshot.
Never replace an active catalogue with an older snapshot merely to undo tags.

## Validation and limits

The final full suite passed **161/161** tests, including 12 new tests covering
Unicode parsing, dry-run immutability, bilingual matching, duplicate/ambiguity
handling, location isolation, atomic vocabulary edits, manual adoption, stale
previews, rollback/export/restore, MCP reads/search, mobile retries/access,
malformed/older backups, verified pre-migration backup and SQL rollback.

No browser visual-layout inspection or native iOS check was performed. UI module
delivery and draft-preview behavior have automated coverage. Review list caps
are explicit; larger backfills should be reviewed in batches. Proposals are
resolved through explicit vocabulary editing and re-preview rather than automatic
tag creation. Generic environment tags and legacy exact-place labels remain
historically coupled in existing records; extraction creates no new coupling.
The next structural location phase is designed separately in
[LOCATION_TREE_DESIGN.md](LOCATION_TREE_DESIGN.md).
