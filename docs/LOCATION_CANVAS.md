# Locations: one expanding world canvas

Open **Locations** in the main navigation, or `http://127.0.0.1:4317/#locations`.
This replaces the former Coming later page inside the existing application.

The protected **Living Universe** root anchors one connected hierarchy. Expand or
collapse branches, pan the background, zoom with the wheel or +/- controls, return
to the root, fit the visible tree, or use full screen. Two-finger pinch and touch
panning use the same camera. Native buttons provide alternatives to gestures.

- **+** on a node creates a child in the location design.
- Drag a node's name to move its visible branch on the canvas. This changes the
  layout, not containment. Automatic arrangement clears manual positions.
- Drag the bottom circle of a parent onto a child's card to change containment.
  Alternatively click the parent's bottom circle, then the child's name, or use
  **Új szülő…** in the selected node's inspector. Cycles and root reparenting fail.
- Search finds catalogue labels and newly planned places. Selecting an existing
  placed label focuses its branch; dragging a label onto a card reparents it.
- Types are separate palette items. Selecting or dragging a type creates a named
  child with that type; it never copies photos or character presence.
- Archive requires confirmation and refuses parents with active children. Source
  IDs survive. Archived design nodes can be restored through the palette.

## Draft and review boundaries

New places, names, types, grouping and containment are **location design data**.
They do not yet create/rename the catalogue's media-sorting records. Existing
nodes refer to stable `locations.id`/virtual tag IDs, keeping media, event and
character links untouched. A containment line never establishes a physical
travel route. No character permission, position, AI knowledge or visual canon is
automatically derived from this canvas.

**Piszkozat mentése** writes a version to the application's private local data
directory. **Terv áttekintése** provides a separate explicit, reasoned approval
of the design. An approved design is not an applied SQL migration or a visual
identity canon change. Catalogue promotion and runtime world movement remain
separate work requiring an exact change preview and approval.

Versions keep complete snapshots, parent IDs, hashes, server-side creator
attribution, reasons and timestamps. Restoring a historical version creates a new
unsaved draft; it never erases later revisions. Expected head/catalogue versions
prevent overwriting another session. Idempotent request keys make identical
retries safe. Conflicts retain browser drafts and require an explicit choice.

Browser storage is a recoverable convenience, not the authoritative saved plan.
**Terv letöltése** includes the current draft and complete stored version archive.
**Terv betöltése…** imports only a new draft; uploaded approval/history claims
never replace server history. It also accepts the earlier standalone
`lu-location-layout-user-draft-v1` proposal exports, preserving prior design work.
The existing **Export catalogue** covers SQLite catalogue data; use the dedicated
plan download as well when backing up a canvas.

## Storage and installation

No schema migration or automatic catalogue writes are introduced. GET/startup
does not create a plan file. The first deliberate save creates
`<active data directory>/location-canvas.json`, outside OneDrive. Each save takes
an exclusive operation lock, validates the complete tree, writes and syncs a new
temporary file, and atomically replaces the previous file. A previous-file copy
is retained alongside it. Corrupt or unsupported saved plans fail closed.

The optional private `location-canvas-suggestions.json` contains an unapproved
starting proposal. It belongs beside the database, never in Git. It is reconciled
by stable IDs with the fresh catalogue; unknown/missing parents are surfaced for
review. Without that private file the existing catalogue hierarchy is displayed
under the same world root. Neither read path approves an initial plan.

New HTTP controls are desktop creator routes under `/api/location-canvas`.
Writes require the existing exact loopback Origin and a dedicated server-held
CSRF token. The routes and files are not added to the mobile/MCP/gateway
allowlists, and no new listener, tunnel, public access or credentials are created.
Touch support is available when this desktop page is opened on a supported touch
browser; the restricted mobile editor has not gained a new Locations page.

Up to 5000 design nodes, 300 types and 128 hierarchy levels are validated.
Version history is retained up to 300 saves; reaching the limit refuses further
writes rather than pruning history. A truncated legacy catalogue response is
refused, so incomplete data never silently becomes a complete world tree.

Rollback: revert the UI/service code, retaining the private plan and exports.
No SQL down migration or media/file recovery is necessary. Do not restore an old
SQLite catalogue to undo a layout change.

## Verification

Focused automated checks cover root/identity constraints, cycles, separate types,
layout/collapse, anchored zoom, branch movement, private proposal reconciliation,
CSRF, stale saves, request replay/conflicts, immutable design history, restart
persistence, unchanged SQL records/schema/canon and existing asset allowlists.
Existing location editor/reference and Sogni UI checks also pass. Browser checks
exercise the actual Locations navigation, new child, save/reload, zoom, title
dragging and bottom-port connection dragging in an isolated catalogue. Physical
iPad/iPhone Safari and VoiceOver behavior still needs device testing.
