# Living Universe MCP source backup

Captured 2026-10-30-081022 Europe/Budapest (2026-10-30T07:10:22.222Z).

This is a source-code backup only. It contains no character catalogue, media, credentials, local configuration or Git history. It is not a complete data/disaster-recovery backup. Every captured source file is listed with its exact byte count and SHA-256 in SOURCE_BACKUP_MANIFEST.json. Uncommitted and source files ignored by the old Git rules are included.

Keep database, media and credentials in separate private backups. Never replace a current database or media collection to restore source code. No service was stopped and no live catalogue was changed while taking this backup.

## Restore

This is a component backup, not an independent catalogue. mcp/ imports shared app/ modules, so restore the matching full source snapshot first: https://github.com/Palor94/LivingUniverse/tree/backup/living-universe-source-2026-10-30-081022. Then verify this manifest and restore mcp/ and its integration documentation over that matching version.

The existing private configuration, authentication credentials, database and media storage are required separately. Follow docs/MCP_INTEGRATION.md and docs/GROK_INTEGRATION.md. Do not create an empty replacement database or bypass authentication.

Matching complete backup commit: https://github.com/Palor94/LivingUniverse/commit/1a69dd12aee0eec9e975d6d70f1646fe462dda15

To verify this copy: `node VERIFY_SOURCE_BACKUP.mjs` (no database or network access).
