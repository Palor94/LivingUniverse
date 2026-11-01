# Linux server handoff and migration gates

This is a runbook, not deployment approval. Do not stop Windows writers, copy
production data to a new machine, activate providers/tunnels, or perform cutover
as part of a synthetic lab run. Keep a separately reviewable rollback route.

## Source and topology

Use a clean, identified `linux-compatibility` source archive. Record commit,
archive SHA-256, every source-file hash, dependency lockfile and tool versions.
The private GitHub main remains the Windows source; never replace it blindly
with the Linux checkout. Preserve the frozen `pre-cloud-migration` checkpoint.

The `linux-compatibility-direct-ai` variant is a separate source and runtime,
based on its archived snapshot. Its schema/migration numbers conflict with
main: do not share SQLite files, merge schemas or automatically combine branches.
It is an optional manual analysis development runner, not a required always-on
service. Completed/failed/unknown paid attempts must never be automatically
replayed when a snapshot starts on another host.

| Component | Local listener/transport | Target boundary |
|---|---|---|
| Main desktop/admin catalogue | loopback 4317 | Never publish this port |
| Optional private mobile/review | loopback 4318 | Private Tailscale identity/Serve, separately verified |
| ChatGPT/Codex MCP | stdio through native Secure MCP Tunnel | Outbound transport; fresh scoped tunnel credential |
| Optional Grok OAuth gateway | loopback 4320 | Separately reviewed HTTPS routing, OAuth origin/callback and account |
| Optional direct-ai | independent files/DB | Disabled/manual, no old approvals replayed |

Grok public routing and private mobile routing are different policies. Do not
replace a private identity check with a public proxy. Linux tests of fake
transports/OAuth do not certify real account access or client interoperability.
See [official Secure MCP Tunnel documentation](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
for current client release, outbound connectivity and organization permissions.

## Target requirements

- Ubuntu 24.04 LTS, x86_64, systemd and a native filesystem with working locks,
  case-sensitive names, atomic renames, permissions and reliable mounts. This
  matches the local acceptance platform; another distro/architecture needs its
  own dependency and acceptance run.
- Node 24.22.1 and pnpm 11.25.0, frozen lockfile, bounded portable image backend.
  Install the distribution `age` package for portable private runtime backup.
  Docker is useful for the isolated lab; the main native service does not
  require Docker or a GPU. Local-model capacity has not been benchmarked.
- A planning starting point is 2 vCPU / 4 GiB RAM for evaluation, not a measured
  production capacity guarantee. The synthetic container uses 1 CPU / 2 GiB.
  Measure native memory, image decoding, video delivery and concurrent requests
  before selecting production limits. Preserve derivative/time/payload bounds.
- Size storage from a fresh inventory: OS/dependencies, runtime DB/assets,
  original media, temporary derivatives, verified restore workspace and growth.
  Retain an independent backup outside the server. A OneDrive directory being
  visible is not proof of complete original bytes or cloud synchronization.
- Keep writable SQLite/WAL/SHM on local durable storage, outside sync/FUSE
  mounts. Keep sources read-only to the service user. Use dedicated unprivileged
  users and private 0700 state/config parents with 0600 private files.
- No public 4317/4318/4320 firewall ingress by default. Validate required private
  access/outbound HTTPS on the selected target before enabling optional routes.
  Configure time synchronization, bounded service logs, storage monitoring and
  a separately tested system backup/restore route.

## Work that can be finished without a rented server

1. Build the clean source archive and inspect its manifest; exclude Git history,
   live DBs, media, runtime configuration and secrets from the source package.
2. Run `sh ops/linux/run-lab.sh` in the isolated Linux guest. Providers use test
   doubles, network is disabled, and main/direct-ai get independent databases.
3. Run native `ops/linux/native-lab.sh` only in an explicitly disposable Linux
   lab with `LU_DISPOSABLE_LINUX_LAB=synthetic-only`. It creates/removes only its
   own random `/opt/lu-native-*` files, mounts and service unit. Verify crop/
   restore across real filesystems, case sensitivity, marker/mount loss,
   stop/crash recovery, stable IDs and SQLite backup/restore.
4. Exercise service startup after terminating/restarting that lab guest. Record
   a new service invocation and the same media/DB identity. Guest restart is
   not a physical server power-loss test.
5. Run actual systemd `LoadCredential` and `LoadCredentialEncrypted` with
   synthetic values. The loader must accept root-owned read-only credentials
   delivered by the manager through UID ACLs, while rejecting loose ordinary
   files and preserving provider scopes. Never print credential values.
6. Rehearse portable `age` private-runtime recovery using disposable keys,
   independent new directories, trusted ciphertext checksums, bad identities,
   truncation/tampering, malicious paths and existing-output refusal. Follow
   [LINUX_PRIVATE_RUNTIME.md](LINUX_PRIVATE_RUNTIME.md). This does not encrypt
   the ordinary catalogue/source/assets snapshot.
7. Execute the official native tunnel binary in a network-disabled container
   with no real key/account/profile; check the command/profile interface and
   failure behavior. This cannot certify a live tunnel connection.

## Gates that need the real target or owner decisions

Only after the above lab evidence is recorded, select the target's actual
hostname, media filesystem, private network identity, backup destination and
independent recovery-key storage. Do not generate a production identity until
its recovery custody is agreed. Reprovision account secrets there; Windows
DPAPI ciphertext is not Linux credential material. Review real callbacks,
audiences, origins and provider permissions; keep providers disabled.

Reconcile the private audit's missing/changed originals and uncertain paid
attempt using durable evidence and owner decisions. Do not delete a missing
record, replace a changed image silently, invent a cost receipt, or retry an
unknown request. These may allow a synthetic target trial, but block a claim
of a fully reconciled production migration.

For actual cutover, obtain the later explicit deployment approval and arrange
a short writer-free window. Take a final coordinated main DB, separate analysis
DB/receipts, sidecars, policy, runtime and complete media-byte backup; record the
scope/times and verify a separate restore. Preserve IDs, relationships, canon,
pending review and durable AI outcomes. Take independent source/media hashes
and run offline path conversion using its preview/backup/apply workflow.

Restore into new paths, verify database identity/integrity/FKs/counts/semantics,
root marker and media bytes, and run a target smoke test with providers disabled.
Enable only the approved target services/routes. Prove target boot, mount loss,
crash recovery, credential recovery and backup retention. Switch clients only
after read/write approval boundaries and real account connections are verified.
Keep Windows and its consistent final backup available for the agreed rollback
window. Never allow two divergent production writers to share one catalogue.

Rollback means stopping only the new target writers, preserving their changes
for reconciliation, and returning clients to the last agreed consistent Windows
state. It does not mean overwriting a newer database with an old snapshot.
