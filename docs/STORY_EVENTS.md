# Character events and history

Open **Characters → a dossier → Events & history**. The other dossier tabs remain
Profile & relationships, Pictures & videos, and Approved identity. Events are
stored once in the existing local catalogue outside OneDrive; participant links
make the same event appear in every relevant dossier. No profile is parsed or
rewritten, no relationship is inferred, and no character is merged.

## Record, import, review

1. **Record event** creates a sourced draft. Choose existing participants, their
   roles and whether each knows the event. Mentioned people can be linked without
   claiming their presence or knowledge. Choose existing locations or leave them
   unknown. Add places through the existing Locations editor first.
2. Record title, short summary, full account, consequences/unresolved threads,
   timeline/continuity and tags. Chronology can be exact, approximate, a range,
   relative, or unknown. Dates use YYYY-MM-DD; fictional calendars and uncertainty
   go in the chronology label. Before/after links use event UUIDs and cannot form
   cycles. Date filters use interval overlap and exclude undated entries. The
   display places dated events first and labels undated/relative entries; it does
   not invent a total order from relative constraints.
3. Sources keep application/system, original event ID, link, message/session
   locator, excerpt, optional source-file SHA-256 and original import timestamp.
   Source text is untrusted narrative data. The checksum is recorded evidence,
   not a claim the app has fetched or verified an external file.
4. **Link existing event** searches the common archive: edit its participants to
   include another character. Do not create a second copy in that dossier.
5. **Import event JSON** reads one structured event into the same editor for
   review. It saves as a proposal only after Save. It neither reads Grok sessions
   automatically nor maps Gyula to Sanyi or Márk to Nicolas. Every source's
   `(system, external_id)` identity is reserved to the same event across edits.
   Use an event/message identifier, not a conversation-wide ID shared by many
   different events. Reusing a create request key safely returns the original
   receipt; different content with the same key is refused.
6. Open an event to inspect all details, participants, related events and source
   evidence. **Review & canon decision** is a separate explicit creator action
   with a reason and expected revision. States are draft, proposed, approved,
   rejected and archived. Approval establishes story canon only, independently
   of approved visual identity. Editing an approved event creates a proposal and
   temporarily removes it from normal AI retrieval until reapproved. Editing
   other states creates a draft. Archive/rejection never deletes history.
7. Browser drafts persist locally. Stale saves retain the draft and show an
   error; discard/reload explicitly before editing the newest stored version.
   Browser storage is a convenience, not a backup. Historical revisions can be
   copied into the editor and saved as a new draft; prior approvals are retained.

## Storage and migration

Additive migration **017-story-events** introduces `story_events`, immutable
application revision snapshots in `story_event_revisions`, indexed current
`story_event_participants` and `story_event_locations`, and persistent external
source identities in `story_event_source_keys`. IDs are UUIDs. Complete snapshots
preserve historical participants, roles, knowledge flags, sources and locations.
Characters referenced even by historical event revisions cannot be deleted
through the empty-character action. No event delete endpoint is provided.

At the first upgraded startup of an existing catalogue, an online SQLite backup
is made **before any startup schema changes**, verified with integrity and
foreign-key checks, and stored at
`<active data directory>/backups/before-story-events-<UUID>.sqlite`. Backup failure
prevents startup/migration. Migration itself is transactional. Fresh catalogues
have no prior state to back up. Subsequent starts preserve events and do not
repeat the migration backup.

The existing schema-version-1 portable JSON export includes all five new tables.
Older exports without event tables remain accepted. Restore still requires an
empty catalogue; event history, source ownership and current links are validated
inside the restore transaction. Failed validation rolls back the entire restore.
No original media is contained in a catalogue export.

Rollback: export and verify a complete backup; stop the app and relevant readers;
revert the feature code; apply `017-story-events.down.sql`. It removes only event
tables. Keep the backup because a down migration discards event data. Restore a
pre-migration SQLite backup only when deliberately discarding *all* subsequent
catalogue edits; use a separate data directory to inspect it first.

## Retrieval and knowledge boundaries

Desktop creator endpoints (existing same-origin loopback protections):

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/characters/:id/timeline` | Dossier involvement filter |
| GET | `/api/events` | Search/filter/page common events |
| POST | `/api/events` | `{request_key,event,status: draft or proposed}` |
| GET / PUT | `/api/events/:id` | Read / `{expected_version,event,reason}` |
| POST | `/api/events/:id/decision` | `{expected_version,status,reason}` |
| GET | `/api/events/:id/history` | Revision metadata |
| GET | `/api/events/:id/revisions/:version` | Exact historical payload for creator |

Filters: `character_id`, `location_id`, `search`, `source`, `timeline`, `tag`,
`status`, `chronology`, `from`, `to`, `limit` (1–50), `offset` (0–100000). Search
matches title, summary and details; source matches source system. Tag and timeline
filters use exact values. SQLite LIKE follows the catalogue's existing case
behavior. Ordering is stable for unchanged records; pagination is offset-based.
For a knowledge-filtered desktop list, set `creator=false` and optionally
`perspective_character_id`. Desktop detail/history routes are creator views and
must not be used to construct participant prompts.

Read-only MCP tools are **search_events**, **get_character_timeline**, and
**get_event**. The existing authenticated gateway discovers them from the same
tool list; no new public endpoint, credentials or write permission is introduced.
Existing connector sessions may need reconnection to refresh tool discovery.

Default MCP access is approved public events only. `perspective_character_id`
also permits approved `participants` events where that exact character is
explicitly marked as knowing. `character_id` is an involvement filter, not an
authorization or knowledge claim. Admin events remain excluded. `creator:true`
can include drafts/private records only when the existing local
`allowAdminNotes` permission is enabled; it is refused otherwise. This setting
is not enabled by the feature. A client that can freely choose a participant ID
can request any participant's projection: the caller must bind the perspective
to its active role; this is not separate authentication for fictional identities.

Filtering precedes search, counts, pagination and details. Related-event and
before/after IDs outside the selected knowledge scope are removed. Revision
history is creator-only and unavailable through MCP. Each read uses one SQLite
snapshot so a concurrent edit cannot mix access checks with newer private links.
AI receives sources as data, never system instructions. Import/approval never
automatically changes a character's biography, relationships, memories or visual
canon. This is an objective event archive, not a subjective-memory simulator.

## Portable event input example

Replace participant and location IDs with catalogue UUIDs; omit unknown links.
The importer accepts this object directly or wrapped as `{ "event": ... }`.

```json
{
  "title": "A sourced event title",
  "summary": "What the source actually establishes.",
  "details": "The account, including explicit uncertainties.",
  "consequences": "Known consequences or unresolved threads.",
  "participants": [{"character_id": "EXISTING-CHARACTER-UUID", "role": "participant", "knows": false}],
  "location_ids": [],
  "chronology": {"kind": "unknown", "label": "Order not yet established"},
  "sources": [{"system": "Fantasy Den", "external_id": "session:event-id", "locator": "message range", "excerpt": "Original evidence"}],
  "timeline": "main",
  "visibility": "admin",
  "tags": [],
  "related_event_ids": []
}
```

Limits: title 200 characters, summary 3000, details/consequences 30000 each,
100 participants, 30 locations/sources/tags, 50 related events, 10000 characters
per source excerpt, 160 KiB per normalized payload. Long conversations should be
split into distinct sourced events and reference a durable document/session
locator; the app does not archive full external conversation files itself.

## Verification and current limits

Integration tests cover shared dossiers, immutable history, source-key deduplication
across corrections, optimistic conflicts, malformed dates, cyclic chronology,
preservation of profiles/relationships/canon, export/restore, migration backups,
rollback and MCP knowledge filtering. Existing application tests cover media
preservation and the previous workflows. Automated browser visual verification
was unavailable in this run because the browser controller stopped after failing
to identify the current URL confidently. The new tab is desktop-only; the
restricted mobile allowlist does not expose events yet. Bulk transcript ingestion,
automatic identity mapping, AI event-write tools and continuous simulation remain
outside this implementation. Gyula/Sanyi and Márk/Nicolas are unchanged.
