# Living Universe source backup

Captured 2026-10-30-081022 Europe/Budapest (2026-10-30T07:10:22.222Z).

This is a source-code backup only. It contains no character catalogue, media, credentials, local configuration or Git history. It is not a complete data/disaster-recovery backup. Every captured source file is listed with its exact byte count and SHA-256 in SOURCE_BACKUP_MANIFEST.json. Uncommitted and source files ignored by the old Git rules are included.

Keep database, media and credentials in separate private backups. Never replace a current database or media collection to restore source code. No service was stopped and no live catalogue was changed while taking this backup.

## Restore

1. Download this exact branch or clone it into a NEW, empty directory.
2. Verify every file against SOURCE_BACKUP_MANIFEST.json before use.
3. Use Node.js 24 or newer. Source tests run with node --test tests/*.test.mjs; Windows is required for the configured image decoder. This backup operation did not rerun or repair application tests.
4. Review README.md and the docs/ integration guides. Supply the original private runtime configuration, existing database and media root separately. Do not point an empty restoration at live data until configuration has been checked.
5. The installation-specific Start Living Universe.cmd/bootstrap expects a separately held recovery database; it is intentionally absent here. Restoring source code alone does not restore character data.

The matching MCP-only backup is branch backup/mcp-source-2026-10-30-081022. Main was not used as an upload target.

To verify this copy: `node VERIFY_SOURCE_BACKUP.mjs` (no database or network access).
