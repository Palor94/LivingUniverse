# Blank configuration templates

These files are examples, not active configuration. Replace every path, origin and login locally, then save under the matching private filename outside Git. Blank tokens intentionally disable authentication-dependent features. Do not use empty authentication values on a running endpoint or enable a provider without its normal approval/configuration flow. The /srv paths illustrate future placement; Linux migration and Windows-specific dependency replacement have not been performed.

- mcp-config: absolute existing database/media paths and private write-config path.
- mcp-writes: requires matching databaseIdentity, authenticated private origin/login and a newly provisioned secret.
- mobile-access and grok-gateway: disabled until private identity/network setup is verified; OAuth state is separate private data.
- image-generation: no enabled providers; keys belong in the service environment/private credential store.
- character-policy: preserve the current owner policy. Existing private blocked identities must be restored separately; they are not in this example.
- storage-layout: copy as mediaRoot/00_SYSTEM/config/storage-layout.json only for an organized media layout. Preserve the mediaRoot-relative directory tree.

The application does not load .env automatically. Its documented JSON loaders and environment variables are authoritative. Restoring source alone does not restore catalogues, policy state, credentials or OneDrive media. Consult ../docs/PRE_CLOUD_MIGRATION.md and ../RECOVERY.md.
