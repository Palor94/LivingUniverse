# Backup consolidation validation – 2026-10-30

This change consolidates the existing working source and backup/recovery tooling. It is a source checkpoint, not an application deployment or a claim that all existing application tests pass.

- New backup tests: **2 passed, 0 failed**, including an online WAL snapshot, isolated restore, preserved media bytes/stable IDs/sidecars/local recovery originals, no overwrite of an existing target, rejected manifest traversal and rejected tampering.
- Real private snapshot: all listed files verified by size and SHA-256 after copying into the OneDrive directory. SQLite integrity_check: ok; foreign_key_check: zero violations. A separate real-data restore was created without starting services. Hashes of every restored table matched the snapshot.
- Encrypted runtime configuration: Windows DPAPI CurrentUser capture and decryption into a new inspection directory succeeded. Three existing Windows task definitions were captured; none was activated or modified. Decrypted inspection files were removed after verification.
- Existing application tests: **123 passed, 24 failed** across 147 tests. These results exclude the two added backup tests. Several failures originate in the copied application's saveCanon path when expectedReferences is undefined and `.map()` is called. Other failures have not been individually diagnosed. Application behavior was preserved; no unrelated canon-policy change was made as part of consolidation.
- A live read-only ChatGPT Living Universe character-list call succeeded after backup creation.
- Cloud synchronization, an independent off-site media copy, replacement-machine credential recovery, Grok client reauthorization and a full machine restart were not verified. Credentials are bound to the current Windows account/profile; see RECOVERY.md.

Detailed private snapshot IDs, paths, database counts and media observations are in the OneDrive backup MANIFEST.json and media/manifest.json. They are not source-control artifacts.

## Application repair follow-up — 2026-10-30

The application failures above were reproduced and repaired in the subsequent debugging work. The current full Windows suite passes 158/158 tests, including the six organized-storage and three new canon-approval regressions. See [application regression evidence](TEST_VALIDATION.md) for product fixes, obsolete expectations and transport limits. The earlier numbers remain historical consolidation evidence.
