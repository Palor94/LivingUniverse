# Organized OneDrive storage

The resource root uses `00_SYSTEM`, `10_CHARACTERS`, `20_SHARED_MEDIA`,
`30_IMPORTS`, `40_EXPORTS`, `90_BACKUPS` and `99_ARCHIVE`. The source Git
project is under `00_SYSTEM/project`. An explicit
`00_SYSTEM/config/storage-layout.json` with `layout_version: 1` enables the
layout; unmarked portable catalogues keep their legacy behavior.

Live SQLite/WAL/SHM, credentials, caches and unfinished uploads stay in Windows
local application storage. `00_SYSTEM/database` documents that location and
points to closed recovery snapshots. The database's absolute location and its
trusted-write identity do not change.

Character creation, moves and owned-folder renames resolve
`10_CHARACTERS/<name>`. Scanner folder keys retain both components. Shared
scenes and explicitly classified location references live under shared media;
committed imports use `20_SHARED_MEDIA/Unassigned`. `30_IMPORTS` is reserved
for manually staged incoming/review material and is not scanned automatically.
System, imports, exports, backups and archive trees are excluded. Ordinary
file types are confirmed with `lstat`: Windows directory enumeration can label
OneDrive cloud reparse entries as links even when they are not symlinks.
Real symlinks/junctions remain refused and all existing boundary checks apply.

The backup utility accepts the exact reserved `90_BACKUPS` destination for an
organized root and defaults there. Its local staging remains outside OneDrive;
the reserved tree is never included recursively as media. Other destinations
inside the resource root remain refused. Originals are covered separately by a
verified byte-backup chain; a catalogue/media manifest alone is not their backup.

The tunnel launcher repairs only this installation's legacy MCP server command
in its own service context, before invoking the native tunnel client. It retains
an exact old profile and leaves keys, tunnel identity, URLs and unrelated fields
unchanged. Existing scheduled-task actions and desktop shortcuts must follow
the relocated source project.

Storage migration preserves media/character IDs, all depiction links, canon,
profile values, relationships, reviews and generation/import history. It updates
only live storage paths and folder-owner mappings and appends move history.
An asset with multiple characters has one destination, with all existing links.
Separate pre-existing records with equal bytes are not silently merged.

The private migration plan, durable intent/completion journal, source backups,
closed database snapshot and verification receipt are required for rollback.
Stop all writers before rollback; restore source/profile/task changes, reverse
the file journal without overwrites, and restore the matching database snapshot.
Never restore an old catalogue over newer user edits. Missing originals remain
recorded and are never replaced by guessed filename or identity matches.
