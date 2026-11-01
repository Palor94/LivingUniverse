# Post-labeling Linux source checkpoint — 2026-11-01

The linux-compatibility branch now integrates main through
63b4abbadb0af80010efb266f4b9bb4567f7069f (six commits after the frozen
pre-cloud-migration baseline). The frozen tag is unchanged. This is a development
checkpoint; no production runtime, database, media, task or tunnel was deployed.

## Included current-main behavior

- Saved observation import and per-image/per-figure manual review, including the
  independent 024-world-review schema extension and export/restore support.
- One-step review acceptance, character-creation return flow, per-figure activity
  and physical notes, paired assignment completion, and accepted-only plan search.
- Existing Linux runtime/media-root checks, portable decoder, credential loading,
  path migration, supervisor templates and network-isolated synthetic lab.

The new source provenance manifest records source_revision and upstream_main,
in addition to the original baseline. Packaging requires a clean committed Git
checkout; do not use a baseline SHA as evidence that a newer package is current.

## Verification

Windows x64, Node 24.22.1, synthetic data, stripped provider credentials and the
test runner's external Node network guard: current-main source copy 199/199,
integrated Linux branch 214/214, separate direct-ai branch 279/279.
The seven new world-review tests cover non-canon import, Host/Origin/CSRF,
optimistic locking and idempotency, source-byte changes, deletion tombstones,
accepted-only planning, unsafe import paths and review export restoration.

These are Windows regression results. Linux execution remains pending. Native
dependency installation, Docker build, POSIX permissions, mount/EXDEV behavior,
systemd lifecycle and actual tunnel interoperability still require Linux tests.
The BMP decoder's documented format limits and the unselected encrypted Linux
private-runtime backup backend remain unchanged.

## Data and variant boundaries

Review source paths/JSON are provenance; file access resolves current media IDs
against the configured root. Do not bulk rewrite historical review payloads.
The archived direct-ai variant keeps its independent database and migration
numbering; do not open a current main database with it or merge it automatically.
No production database, original media, job state, credential, private audit
report or Git history belongs in the source-only Linux lab archive.

The next gate is an isolated Linux run with synthetic fixtures and no production
mounts, credentials or model calls. A successful synthetic trial does not authorize
a production migration or replay uncertain provider attempts.
