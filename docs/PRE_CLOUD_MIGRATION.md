# Pre-cloud migration source checkpoint – 2026-10-31

This is a source synchronization and recovery checkpoint. No server migration, architecture change, provider activation or service restart was performed. The active image-labeling run must finish independently; none of its workers were stopped.

## Source inventory

The main branch contains the currently deployed desktop application's local source, including previously uncommitted modules. The pre-cloud-migration tag identifies this main checkpoint. Existing branches and history are preserved.

| Source unit | Retrieval | Meaning |
|---|---|---|
| Desktop application | [main](https://github.com/Palor94/LivingUniverse/tree/main); frozen checkpoint: [pre-cloud-migration](https://github.com/Palor94/LivingUniverse/tree/pre-cloud-migration) | Node backend, desktop/mobile UI, character/policy/race/name/complete-rename/crop approvals, relations, locations, events, media search/sorting/removal, references, generation integrations and MCP code |
| direct-ai | [pre-cloud/direct-ai-20261031](https://github.com/Palor94/LivingUniverse/tree/18a04672c8e20f8295a7a37efecf1d7c196d2d33) — 18a04672c8e20f8295a7a37efecf1d7c196d2d33 | Independent source snapshot; 308 files. Original local commit cca1d458672785004d9e7a00e97e749e6a7ac793. |
| plugin-development | [pre-cloud/plugin-development-20261031](https://github.com/Palor94/LivingUniverse/tree/52c574e8436f585de22e19a5ff3a7eb327e23be4) — 52c574e8436f585de22e19a5ff3a7eb327e23be4 | Independent source snapshot; 275 files. Original local commit 77903ad3eb1333ac1bce407c70fc4dfb172f9188. |
| rename-integration | [pre-cloud/rename-integration-20261031](https://github.com/Palor94/LivingUniverse/tree/0cf1fbddeb7cac7a26c0724eae8da2f9aa265627) — 0cf1fbddeb7cac7a26c0724eae8da2f9aa265627 | Independent source snapshot; 267 files. Original local commit c8071ef90a333693151701b32d1a9e19102d1280. |

The development copies are intentionally separate source snapshots. They were not merged into the desktop runtime: their variants contain different backend/UI histories and automatic merging would be an application change. The direct-ai snapshot contains the running library-labeling runner, its provider adapters, review/retrieval/indexing code, prompts, tests and documentation. Read its SOURCE_SNAPSHOT.md and docs/DIRECT_AI_ANALYSIS.md. Restore these variants as separate code checkouts and supply their private runtime state separately.

Other already-existing repository feature branches (hierarchical locations, media analysis review, bilingual tags, permanent removal) remain unchanged. They are development branches, not proof those features are all deployed in main.

## Reconstruction materials

- package.json declares Node.js >=24 and uses built-in Node modules, including node:sqlite. No npm dependency installation or lockfile is currently required; no undeclared external JavaScript imports were found in the audited source imports.
- app/, app/public/, mcp/, tests/, docs/, Windows .cmd/.ps1 launchers and .agents/skills/rename-character are included. The runtime policy and latest explicit crop/rename approval boundaries are preserved.
- app/migrations/ contains the up/down SQL files through migration 023. Base schema creation and additive module installation remain in application code. Existing data must follow those runtime mechanisms; do not blindly run every down migration or overwrite the schema.
- docs/schema/current-schema.sql is a schema-only export generated from a fresh, synthetic empty catalogue (50 tables / 58 schema objects). It contains no production rows or production database bytes. It is reference documentation; runtime migration code is authoritative.
- .env.example and config-templates/ provide blank path/auth/provider/policy/layout examples. JSON examples are not loaded automatically. No actual token, owner login, blocked identity list, OAuth state or DPAPI file is included. The application does not load .env files automatically either; configure the documented environment or private JSON files explicitly.
- Backup source collection now includes these templates and the .agents source guidance. Encrypted private configuration backup also covers the existing owner policy, organized-storage marker and optional existing analysis credential. This changes backup completeness only, not application behavior.

## Validation

| Isolated source copy | Automated tests | Result |
|---|---:|---|
| desktop | 192 | 192 passed; 0 failed; 0 skipped |
| direct-ai | 271 | 271 passed; 0 failed; 0 skipped |
| plugin-development | 214 | 214 passed; 0 failed; 0 skipped |
| rename-integration | 181 | 181 passed; 0 failed; 0 skipped |

Total: 858 tests passed. Each copy used disposable data directories, isolated LOCALAPPDATA/USERPROFILE, removed inherited provider credentials and test concurrency 2. Manual private/pilot/full-library runners were not invoked. The changed backup source-selection tests were separately rerun successfully; the final main suite is rerun before upload. No claim of Linux validation is made.

The source audit included tracked, modified, new and ignored files in the active project and three development copies. Forty needed desktop source files had not yet been tracked. One ignored local deployment-receipt JSON in the rename integration copy was inspected; it is generated installation metadata, not a runtime/source dependency, and was kept out. Static relative imports resolved within each source copy. Pattern/assignment checks found no real provider/API/private keys in the current selected source; URL/password strings in negative security tests are synthetic fixtures. This is a scoped source audit, not a guarantee about every possible secret format.

## Deliberately outside Git

Live or copied SQLite databases/WAL/SHM, catalogue JSON exports, original images/videos, user/profile data, generated media, private analysis observations/approvals/plans, logs, runtime caches and upload chunks, API credentials, OAuth state, MCP/tunnel credentials, DPAPI files, archive/bundle files and owner-specific configuration stay in private backups. A Git tag does not contain these resources.

Historical audit found old private catalogue exports, including embedded JPEG cover data, reachable from existing repository history/branches. They were not added to this checkpoint; no history was rewritten. A separate owner-approved history/privacy cleanup would need coordination with all clones and any credential revocation actually indicated by further findings. No real API-token/private-key pattern was found in the audited existing remote-reachable text blobs.

## Data/media checkpoint and active labeling

The private OneDrive backup root is the organized media root's reserved 90_BACKUPS directory. LATEST.json points to the last complete verified normal snapshot. Additional pre-cloud-checkpoints preserve online SQLite copies of both the main catalogue and the active analysis catalogue with their timestamps/checksums. Each database is independently transaction-consistent; the pair and sidecar files are not one global transaction.

An online SQLite backup includes committed WAL transactions without stopping the writer. It does not certify completion of an in-flight paid model request or make a complete job checkpoint from independently changing files. Do not replay an analysis attempt automatically after restoring a snapshot with an uncertain provider outcome. Reconcile durable receipts and approval/budget state first.

The original media remain separate from Git and catalogue exports. An existing local byte-backup chain was located and audited; private reports record its current hash-check result and historical coverage. The current-media tree was not reindexed, moved, modified or downloaded en masse. New media since an older archive may need a final independent byte backup. OneDrive local presence and a successful local copy do not establish cloud synchronization completion.

A final coordinated migration backup should be taken after the current labeling run finishes and its pending requests/cost receipts are reconciled. At actual cutover, arrange a short writer-free window for the final matching catalogue, analysis state, media and configuration set. No such stop/cutover occurs in this task.

## Known Linux migration work – intentionally not performed

1. Image conversion/reference-crop paths currently rely on Windows PowerShell/System.Drawing; mcp/images.mjs explicitly rejects non-Windows decoding. Provide and validate a Linux-compatible decoder in a later development task.
2. DPAPI-protected credentials and the encrypted Windows configuration backup are tied to the original Windows profile. Reprovision credentials/authorization on the new server; do not assume copying ciphertext will work.
3. .cmd launchers, Windows Scheduled Tasks and tunnel-client executables are Windows-specific. Select native Linux supervision/network/client installation later, preserving authentication boundaries.
4. Re-establish the organized media root and its relative folder layout, the matching restored database, owner policy and private MCP/Grok/mobile configuration. Linux access to the OneDrive media is not configured or tested here.
5. The source variants are archived separately; decide their eventual integration/deployment topology in a dedicated migration task. The present checkpoint does not silently merge variants or deploy their workers.
6. The desktop launcher expects a separately stored recovery database on first use. It is deliberately absent from source control. Source alone restores code, not catalogue data.

Start with RECOVERY.md, config-templates/README.md, docs/STORAGE_LAYOUT.md and the selected variant's integration documentation. Validate on an isolated restored copy before any production cutover.
