# MCP character and relationship editing

The original five tools and approved-reference preview remain available. The
SQLite reader stays read-only. An optional, locally authenticated client asks
the existing application to store proposals and apply changes under its locally
configured authorization policy in the same authoritative catalogue. There is no second live database,
new public listener, external API, model provider or periodic backup job.

## Trusted mode: no repeated review for text edits

The user requested disabling per-change approval for future profile and directed
relationship writes. Set `approval_mode` to `trusted` in the existing local
`mcp-writes.json`, then restart the application and tunnel and refresh ChatGPT's
tool metadata. Omission or `review` retains the original review workflow below.
Unknown policy values disable writes. ChatGPT's separate per-plugin permission
setting can also ask for confirmation; it is not changed globally by this mode.

In trusted mode, a request to save/create/update can proceed through propose →
apply → read-back without another question or a Tailscale approval click.
Discussion alone is not a request to save. Authentication, field allowlists,
version conflicts, expiry, transactions and replay protection remain enforced.
No deletion, files, names, administrator notes or canon approvals are added.

Each new immutable proposal records its authorization mode. Enabling trusted mode
does not unlock old review-mode pending proposals, rejected changes or conflicts.
Switching back to `review` requires human review for any still-pending trusted
proposal. Applied receipts explicitly distinguish `trusted_local_configuration`
from `human_review`; trusted writes never fabricate a human approval or actor.
The optional private link still permits reviewing or rejecting a pending change.

The mode can be reversed by setting `approval_mode` to `review` and restarting;
never restore an old database just to change the authorization policy.

## Review-mode workflow (default)

1. Ask ChatGPT to retrieve the character with `get_character`.
2. ChatGPT proposes a creation, selected profile fields, or one directed
   relationship. It shows the currently saved and proposed text.
3. Open the returned **private approval link** from ChatGPT. The existing
   Tailscale HTTPS editor authenticates your account. Review the complete text
   and select **Approve this exact change** or **Reject**.
4. Return to ChatGPT and ask it to apply the approved change. The server checks
   the stored human decision and the current record again, then commits once.
5. ChatGPT retrieves the updated character to verify the result.

Typing “approved” in chat alone does not grant permission. Native ChatGPT
write confirmations are additional client safeguards, not server-verifiable
approval. OpenAI explicitly states that [tool annotations do not replace
server authorization and confirmation](https://developers.openai.com/plugins/build/mcp-server).
The single review page is a fallback using the existing authenticated editor,
not a new approval dashboard or mobile application.

The final approval step opens a private browser page; it is **not wholly inside
the chat composer**. iPhone/iPad need Tailscale connected to the same account and
access to the laptop's existing HTTPS address. Return to ChatGPT afterward.
Specific device/client behavior still requires an on-device test. The laptop,
desktop application and tunnel must remain running.

## Tools and permitted information

| Tool | Effect |
| --- | --- |
| `propose_character_create` | Stores a proposal; reserves a UUID but creates no character yet |
| `propose_character_update` | Stores only selected fields and their original values |
| `propose_relationship_update` | Stores one source-to-target description; never a reciprocal edit |
| `get_pending_change` | Reads a proposal, its comparison, status and approval link |
| `apply_approved_change` | Applies under the recorded authorization policy once; respects the returned `approval_required` |

New-character fields: name, aliases, biography, personality, working appearance,
sexuality, speech style/dialogue examples. Unspecified fields retain database
defaults (empty), without invented information. Updates exclude primary-name
changes and private administrator notes. Canon approval, reference fingerprints,
media, deletion, folder moves, SQL and database replacement are unavailable.

Each new intent needs an 8–128 character `request_key`; retry the same intent
with the same key. Reusing that key with different content is refused. Use the
`profile_version` returned by `get_character` as `expected_version`. For a
relationship supply its exact `expected_description`, or null if that direction
does not exist. An empty description is not a deletion shortcut.

Names are limited to 200 characters, aliases to 1,000, descriptive profile fields
to 30,000 each, directed descriptions to 10,000, and the complete original/new
proposal to 200 KB. Oversized text is refused explicitly, never silently truncated.
Unicode and multiline text are retained. Split unusually large changes into
separately reviewed proposals.

## Authorization and integrity

- The adapter never opens SQLite for writing or imports the running app.
  It uses a fixed loopback service endpoint with a scoped local bearer secret.
  No tool argument can choose a URL, credential, SQL or approval flag.
- `mcp-writes.json` lives beside the authoritative database, outside OneDrive/Git.
  On Windows setup restricts this file to the current user and SYSTEM. It is
  distinct from the encrypted OpenAI tunnel key and is never logged or returned.
- The service retains the existing 4317 Host/Origin/cross-site checks and adds
  constant-time bearer validation for its narrow route. The token permits
  proposal/status/apply operations, **not approval**.
- Approval is only available on the existing mobile listener after the exact
  Tailscale identity, HTTPS Origin and CSRF checks. It binds the exact immutable
  proposal digest to that authenticated user. `_meta`, annotations and chat text
  are never evidence of consent. This trusts the existing local Tailscale Serve
  proxy boundary, as the mobile editor already does; it does not defend against
  a hostile process running as the Windows owner who can read/write the database.
- A whole-profile content hash detects changed profile fields (including private
  notes, without disclosing them). Relationships compare the selected direction's
  exact old description. Approval does not bypass the second check at commit.
- Profile changes and the applied receipt use one SQLite transaction. Replays
  return that receipt instead of changing records again. Proposals expire after
  24 hours; rejected, expired or stale proposals cannot be applied.
- The additive `mcp_changes` table retains comparisons and decisions, outside
  model history. It is included in existing logical exports/restores. It is not
  a full revision-history dashboard. Recovery must not reuse pending/approved
  grants from an older snapshot; expire those grants during a separately
  approved recovery before re-enabling writes.
- Bad or unavailable write configuration disables write tools while retaining
  the original read tools. No public endpoint or new Tailscale grant is created.

## Activation

First create and verify the one-time code/configuration/SQLite online-backup
checkpoint. Keep it outside Git/OneDrive. Setup checks its manifest, database
digest and SQLite integrity, and verifies it matches the active catalogue:

```powershell
node mcp/enable-writes.mjs --config '<absolute local mcp-config.json>' --checkpoint '<verified checkpoint directory>' --check-only
node mcp/enable-writes.mjs --config '<absolute local mcp-config.json>' --checkpoint '<verified checkpoint directory>'
```

Setup preserves the previous local MCP config and never changes character data.
It requires the existing restricted Tailscale mobile editor and refuses to replace
an existing write configuration. Keep configuration/secret files local.

1. Restart the desktop application with its existing `LIVING_UNIVERSE_DATA`.
2. Start `mcp/Start Tunnel.cmd`. Its encrypted runtime key flow is unchanged.
3. In ChatGPT: **Plugins → Living Universe → Manage → Refresh tools**.
4. Start a new chat and select **@Living Universe**. Expect the original five
   reads plus the five tools above.
5. Make a real proposal chosen by the user, review it through the private link,
   approve it personally, apply it through ChatGPT, and retrieve the result.

Do not call deployment complete just because local tests pass or ten tool
definitions are listed. Confirm a user-authorized real edit through ChatGPT.
Do not create experimental characters in the authoritative catalogue.

## Rollback

For a deployment/authentication problem use the checkpoint's verified
`Start preserved read-only tunnel.cmd`, then refresh the ChatGPT connection.
It uses preserved read-only code/configuration and the **current** authoritative
database. Do not restore an older database to fix code or authentication.

Alternatively set the local `mcp-writes.json` `enabled` to false and restart the
app/tunnel; the original five tools remain. Keep proposal/audit rows for recovery.
Migration 012's down SQL removes only the proposal table and never undoes applied
profile edits; use it only with a separately reviewed backup/rollback procedure.
Database recovery always requires separate approval and preservation of newer work.

## Validation and deployment checkpoint

Files added or changed for this upgrade: `.gitignore`,
`app/character-edit.mjs`, `app/mcp-changes.mjs`,
`app/migrations/012-mcp-changes.up.sql`, `app/migrations/012-mcp-changes.down.sql`,
`app/server.mjs`, `app/mobile.mjs`, `app/enhancements.mjs`,
`app/public/mcp-change.html`, `app/public/mcp-change.js`,
`mcp/catalogue.mjs`, `mcp/server.mjs`, `mcp/writes.mjs`,
`mcp/enable-writes.mjs`, `mcp/run-tunnel.ps1`,
`tests/mcp-writes.test.mjs`, `tests/mcp-launcher.test.mjs`,
`docs/MCP_INTEGRATION.md` and this document. Earlier uncommitted work was retained.

All 57 tests pass, including real HTTP fixture tests for authenticated approval,
rejection, wrong identity/Origin/CSRF/token, extra approval flags, expiration,
stale profiles, exact selected fields, Unicode/multiline creation, sexuality and
speech, directed relationships, persistence, replay/idempotency and canon safety.
The read-only adapter and image-preview security tests still pass. The launcher
also refuses a second client before reading credentials: competing clients can
split the initialization handshake. A Windows mutex handles simultaneous starts;
an existing-process check also recognizes the preserved pre-mutex launcher.

Local production activation is authenticated, all five reads pass against the
existing catalogue, and approved-reference JPEG retrieval still works. ChatGPT
metadata refresh exposes four write actions and six read actions, including all
original five reads. iPhone/iPad approval is not yet device-verified.

On 26 October 2026, a real user-selected biography proposal completed the whole
workflow through ChatGPT: retrieve, propose, personally approve on the private
HTTPS page, apply, and retrieve again. The saved biography exactly matches the
approved proposal and preserves the original text verbatim. Independent read-only
fingerprints confirm other profile fields, approved canon/reference tables and
character/media counts stayed unchanged. No experimental character was created.
ChatGPT initially failed to render a response despite storing the proposal;
`get_pending_change` recovered it without a duplicate proposal.

The user subsequently enabled trusted text writes on 26 October 2026. The local
authenticated service and restarted tunnel report `trusted`; ChatGPT's existing
per-plugin permission is already Allow all actions. Trusted creation, selected
field updates and directed relationships pass isolated tests without human review,
including refusal of old review proposals, rejected/stale changes and admin fields.
No live character edit was performed to test this policy change.
