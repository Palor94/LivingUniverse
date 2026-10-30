# Living Universe in Grok

Implementation and documentation checked 27 October 2026. This extends the existing catalogue; there is no second production character database.

## What runs where

- Existing catalogue: `%LOCALAPPDATA%\LivingUniverse\desktop-catalogue\universe.sqlite`, as selected by the existing `mcp-config.json`. The gateway opens this same file read-only and sends authorized edits to the existing local application.
- Local app: loopback `127.0.0.1:4317`.
- Private editor, upload page, verified reference previews and connection approval: `https://laptop.taild897f8.ts.net`, through the existing tailnet-only Serve route to loopback 4318. These pages require the configured Tailscale identity. They are not published by this change.
- Grok endpoint: `https://laptop.taild897f8.ts.net:8443/mcp`, forwarded only to the new loopback gateway on 4320. OAuth is required before tool discovery or calls. Public OAuth metadata contains no catalogue information.
- ChatGPT: its existing private Secure MCP Tunnel and stdio adapter remain in place. The original ten tools retain their names, schemas, local authorization policy and authorization boundaries. Selected image reads default to high-quality references; exact originals remain opt-in; see [original-image delivery](ORIGINAL_IMAGES.md). Three import tools are added when the local import service is available.

The laptop must be awake, online and signed into Windows. Internet loss during a phone call/hotspot interruption temporarily interrupts both remote clients. Keeping the catalogue on this laptop does not provide an always-online hosted service.

## Verified provider capabilities and boundaries

Grok's consumer website/app supports custom MCP connectors by a public server URL. The inspected account's dialog asks for a name and URL; it does not provide a bearer-key field. The HTTP adapter therefore supplies OAuth discovery, public-client registration, authorization-code/S256 PKCE, expiring access tokens and rotating refresh tokens. Each registration binds exact callback URLs on an operator-owned hostname allowlist. The installed allowlist is `grok.com` for ordinary chat and the separately user-approved `www.cursor.com` for Grok Bot; do not broaden it based on model-generated URLs. See [Grok connectors](https://docs.x.ai/grok/connectors) and [custom server tunneling](https://docs.x.ai/grok/connectors/custom-mcp-tunneling).

The API is a separate product: its [Remote MCP API](https://docs.x.ai/developers/tools/remote-mcp) accepts HTTP/SSE endpoints with authorization and optional headers. This does not establish that the consumer connector can resolve a chat attachment ID, `file_id`, or an Imagine asset. The consumer documentation describes ordinary uploads for Grok's own analysis but does not document an attachment-to-custom-MCP byte handoff.

The [Imagine API](https://docs.x.ai/developers/model-capabilities/imagine) supports image generation/editing and video workflows. [API stored-file references](https://docs.x.ai/developers/model-capabilities/imagine/files/inputs) and [reference-to-video](https://docs.x.ai/developers/model-capabilities/video/reference-to-video) are documented API capabilities. They are not a promise that native website generation accepts an image returned by a connector, nor that a native result has a connector-readable download URL.

Optional reference-conditioned API generation is now implemented and disabled by default. See [image API setup and private run approval](IMAGE_GENERATION.md). Server-side keys, explicit reference selection and separate API billing are required. This does not establish native Grok-generation or attachment handoff. Consumer subscriptions do not imply API access or billing. Existing profile/dialogue retrieval and secure media-import fallbacks remain available; provider policies still apply.

## Grok Bot: separate connection from ordinary chat

The Grok Bot interface (`/bot/...`) uses its own connector registry. Installing Living Universe in the ordinary Grok-chat connector dialog does not prove that a Bot receives its tools. In the inspected account, the Bot initially searched its cloud computer's folders and did not receive Living Universe tools, despite the ordinary chat listing all 13 tools.

In the Bot chat, ask it to add the existing remote MCP server `https://laptop.taild897f8.ts.net:8443/mcp` as **Living Universe**. Review and approve that connector addition, then use its in-chat **Authorize / Engedélyezés** card. Do not provide a bearer token in chat or copy the catalogue onto the Bot computer. The actual Grok Bot OAuth client identifies itself as **Cursor**, and its observed HTTPS callback is `https://www.cursor.com/agents/mcp/oauth/callback`.

This installation's user explicitly approved adding `www.cursor.com` to the existing `grok.com` callback-host allowlist. Exact registered URI matching, S256 PKCE, audience binding and private human approval remain required. Grok Bot additionally requests an optional HTTP localhost callback in its registration metadata. The server returns only the approved HTTPS callback, as permitted by [RFC 7591 section 3.2.1](https://www.rfc-editor.org/rfc/rfc7591.html#section-3.2.1). Localhost is not registered and cannot receive an authorization code. Unsupported remote hosts and localhost-only registrations remain rejected.

If upgrading an older installation, back up the protected configuration before adding the verified `www.cursor.com` host. Preserve all existing fields and credentials; restart only the separate gateway. New setup defaults include the two verified hosts. Do not broaden this to arbitrary hosts or disable OAuth. The configuration backup for this approved upgrade is in `grok-runtime/backups/gateway-before-bot-callback-20261027.json` beside the existing protected runtime, restricted to the Windows user and SYSTEM.

After authentication, send a fresh Bot message asking for `list_characters` by name and `get_character` with the returned stable ID. In the live Nicolas Bot, these calls returned `2cd0be95-2a3e-4807-8ff5-06350a793b17`, six media associations, empty profile text fields and existing approved canon history. The Bot test made no catalogue writes.

See [Grok Bot computer and apps](https://docs.x.ai/grok-bot/computer-and-apps) and [Connect apps](https://cursor.com/help/grok-bot/connect-apps) for the provider's separate cloud-computer/app model. A cloud Bot continuing to run does not keep a laptop-hosted catalogue online when that laptop is asleep or offline.

## Connect Grok

1. Keep Tailscale connected on the device/browser used for the one-time private approval page. The laptop's app and Grok gateway must be running.
2. Open **https://grok.com/connectors** → **New Connector** → **Custom**. In the inspected Hungarian interface these are **Új csatlakozó → Egyéni**.
3. Name: **Living Universe**. Server URL: **https://laptop.taild897f8.ts.net:8443/mcp**. Select **Add connector / Csatlakozó hozzáadása**.
4. Follow OAuth sign-in. The browser is directed to the private **Connect Grok to Living Universe** page. Review the client, exact return address and access scope; select **Allow this connection**, then **Return to Grok to finish connecting**. This is connection authorization, not per-character save approval.
5. In a new chat, select Living Universe under connectors/sources. Ask it to call `list_characters` with a small limit and show stable IDs. Do not accept a conversational claim as proof of a tool call.
6. If the OAuth popup cannot be clicked, open the displayed private approval URL in a normal tab in the same browser, approve there, then return to the original popup and refresh it. Follow its displayed Return to Grok link in that original popup. This keeps the original browser-bound OAuth request intact. Never share authorization-code URLs or tokens. If the request has expired, restart from the custom connector dialog.
7. If a connector refresh occurs while the app is unavailable, start the existing app and refresh/reconnect. The adapter rechecks the current service and cannot silently turn failed authentication into write access.

The observed live Grok callback is `https://grok.com/connectors-oauth-exchange-code/`. On the subsequent live retry, OAuth completed and Grok displayed all 13 tools as enabled. Grok successfully listed characters, created one labelled adult disposable character, updated only its appearance, retried the same change without duplication, and imported an actual public test PNG with hash-verified bytes. ChatGPT retrieved the same new character ID and one associated image. No Cloudflare tunnel was started: the approved fallback became unnecessary when public Tailscale DNS recovered.

If this account's connector presents a different callback hostname, stop and verify that exact hostname from the provider's real sign-in flow before changing `redirect_hosts`. The gateway refuses a broader or non-HTTPS redirect by design.

## Save a character and selected media

For a new character, Grok first generates the requested **adult fictional** profile in conversation, then uses the existing `propose_character_create` and `apply_approved_change` tools when saving is requested. In trusted mode there is no additional conversational confirmation. Unknown fields remain empty. Existing characters use `get_character` plus `profile_version` and selected-field updates; primary names and administrator notes are not editable through MCP. Directed relationships preserve the exact existing description unless the user asks to change it.

Use the resulting stable character ID with:

1. `begin_media_import`, with a stable `request_key` and only known provenance (`provider`, `model`, `prompt`, `generation_id`). This creates a pending import, not media.
2. If Grok can supply a genuinely downloadable public HTTPS JPEG/PNG/MP4/MOV URL, call `import_media_url` with a stable `slot_key` and optional expected SHA-256. No browser cookies or third-party credentials are sent. URLs requiring a login may fail even if they work in your browser.
3. Otherwise open the returned private `upload_url`. Download the chosen Grok result to your device if necessary, choose it on that page and select **Upload & save selected files**. The browser computes a hash; the backend independently retrieves, decodes/checks and hashes actual bytes before recording media and associations.
4. Call `get_media_import`. Only a **committed** item with an actual byte count, media ID and SHA-256 proves an import. Failed or merely pending items were not imported.

This works with existing characters. Character creation and media import are deliberately recoverable stages: if the portrait fails, the saved character and stable ID remain available. Reuse the same character creation request key, pending import ID and file slot on retries; do not create another character to retry a picture. Already committed files retain their receipts, and another failed slot can be retried independently.

Limits: JPEG/PNG at most **20 MiB and 40 megapixels**; MP4/MOV at most **100 MiB**; at most **20 file slots and 250 MiB per pending import**. An upload page expires after 24 hours. Expired receipts remain readable. WebP/GIF/SVG and arbitrary document types are not imported in this first complete workflow; convert selected still images to JPEG/PNG if necessary. Video validation checks complete container structure and a video track, not every codec/frame; playback support still depends on the browser.

Saved originals are content-addressed under **Imported media** within the existing configured resource root. Existing originals are not moved or overwritten. Repeated bytes from this import workflow reuse one media record and add only the requested character association. This does not merge historical byte-identical copies elsewhere in the existing collection. Removed imported assets are not silently resurrected.

Provenance preserves supplied metadata, actual import time, validation method, byte count and SHA-256. Unknown model/provider/prompt values are omitted. URL queries and fragments are not retained as provenance. Failures and commits append import audit events. A file verified before a database failure remains recoverable at its content-addressed location; retrying reconciles it without overwriting it. No automatic permanent cleanup deletes user files.

## Approved references and native generation

`get_approved_references` returns immutable revision/role/fingerprint metadata. include_image defaults to a selected high-quality reference up to 2048 px / 3 MiB; image_quality:original opts into exact bytes (6 MiB inline, then hash-bound byte chunks). Private verified links now serve the full original with its actual MIME type. Open one while connected to Tailscale, save the original, and attach it in Grok's native generation UI if the connector image is not usable there. See [original-image delivery](ORIGINAL_IMAGES.md).

Importing a portrait or generation adds working media and a character association. It never creates a canon revision, approves a reference, changes an existing cover, or promotes successful output automatically. Canon approval stays in the existing deliberate controls.

## Configuration and startup

No environment variables are required for the installed default paths. Optional overrides:

| Variable | Meaning |
| --- | --- |
| `LU_MCP_CONFIG` | Absolute path to the existing `mcp-config.json`; it still pins the authoritative database and media root. |
| `LU_GROK_CONFIG` | Absolute path to `grok-gateway.json` for the gateway/setup command. For the app's approval bridge, keep the installed file beside the active database. |

There is **no required `XAI_API_KEY`** in this release. Do not paste any secret into chat or add it to command arguments.

Protected configuration: `grok-gateway.json` beside the active database. OAuth state and bounded gateway logs: `grok-runtime` in that same nonsynchronized data folder. Setup restricts configuration/runtime access to the Windows user and SYSTEM. Tokens/codes are hashed in the state file; access tokens are audience-bound, authorization codes are single-use and short-lived, and refresh tokens rotate. Internal connection approval has a separate local control secret, never accepted as an MCP access token or returned in tool results.

Installed Windows tasks:

- **Living Universe catalogue runtime** — guarded startup of the existing database; it refuses to bootstrap or substitute a missing catalogue.
- **Living Universe Private MCP Tunnel** — the existing ChatGPT connection.
- **Living Universe Grok Gateway** — the separate OAuth HTTP gateway, with a retrying supervisor.

These run under the current Windows account with limited privileges, after logon. The existing desktop launcher remains usable. Do not start competing duplicate app/tunnel processes.

For a future setup, from the existing repository with Node 24+:

```powershell
node mcp/configure-grok.mjs --preview
# After explicit activation approval, on the actual Windows desktop environment:
node mcp/configure-grok.mjs --enable
# Restart the existing app, then:
node mcp/http-gateway.mjs
# Or install the guarded app and gateway startup tasks:
.\mcp\install-grok-startup.ps1 -Install
```

Do not replace existing protected configuration to make setup repeat. Inspect and preserve it. The Windows desktop and coding environment may have different local-file views; run setup in the same actual user environment as the installed tasks. No database copying is needed.

Only after testing unauthenticated rejection and obtaining public-exposure approval:

```powershell
tailscale funnel --bg --https=8443 http://127.0.0.1:4320
tailscale funnel status
```

Funnel permission was restricted to this laptop's Tailscale IP, preserving the pre-existing private grants and SSH policy. The expected routes are **443 tailnet-only → 4318** and **8443 Funnel → 4320**. [Tailscale's Funnel documentation](https://tailscale.com/docs/features/tailscale-funnel) notes that public DNS can take up to ten minutes to propagate. Do not expose 4317, proxy arbitrary files/directories, or turn the private 443 route into a Funnel.

## Verification and rollback

Development acceptance: **71 tests passed** in the source snapshot, including the existing repository suite. New coverage includes end-to-end character creation/updates, actual decoded image bytes, video-container checks, duplicate prevention, partial failures, database-commit recovery, private upload identity/Origin/CSRF, review-mode boundaries, DNS pinning, private/metadata IP rejection, redirect revalidation, OAuth PKCE/expiry/audience/replay/refresh, private connection approval and authenticated stateless HTTP tool calls. No provider generation call is needed for these tests.

Before live deployment, an online SQLite backup and protected-table fingerprints were saved at `desktop-catalogue/backups/before-grok-20261027`. An initial post-deployment comparison matched the baseline. A later final comparison found concurrent live changes: 7 added canon revisions, 12 added depictions, 13 added media-note rows, 1 added review and 2 existing media paths/folders changed. Existing characters, directed relationships, cover frames and image edits still matched byte-for-byte; no existing canon row changed or disappeared. Before live Grok acceptance the new import tables were empty. The later controlled Grok test added only its labelled disposable character, one pending import with a committed test PNG and a rejected internal-URL slot; no canon approval. The separately observed live changes were preserved, not rolled back; their actor was not established by the comparison. Source copies were preserved separately in this chat's work folder. Real ChatGPT `list_characters` still returned the existing Gergő ID after deployment.

Live Grok OAuth, tool discovery, character reads/create/update/retry, blocked internal URL and actual PNG import/retry passed. The stored PNG was independently re-read and its hash/size matched the receipt. Chat attachment upload was blocked by the browser automation extension file-access setting, so native attachment handoff, native generation reference consumption and generated result URLs remain unverified. The private upload backend passed fixture tests. Gateway diagnostics record only allowlisted operation/status/error and structural OAuth fields; never tokens, cookies, authorization codes, query values, request payloads or catalogue content. See the acceptance report for exact receipts.

To disconnect only Grok:

1. Remove/disconnect Living Universe in Grok.
2. Run `tailscale funnel --https=8443 off`. Do **not** use a reset command that removes private Serve routes.
3. Stop/disable **Living Universe Grok Gateway**. Keep the app and ChatGPT tunnel tasks.
4. Set the protected gateway config's `enabled` to false if disabling the private approval bridge too; restart the app. Existing catalogue and import receipts remain intact.

Do not restore an older database to roll back a connector/authentication problem. Migration 014 is additive and exported in catalogue backups; its down script removes only import bookkeeping, not media files, associations, characters or canon. Use it only as part of a separately reviewed recovery. Existing restored imports require matching original files, as with the rest of this catalogue.




## General image uploads (2026-10-28)

The same OAuth gateway now exposes resumable image upload tools and multi-character imports. ChatGPT fileParams is a separate optional host capability, not assumed for Grok. See [media upload setup and verification](MEDIA_UPLOADS.md).

### Propose a reference set from Grok

The Grok connector receives the shared `propose_reference_update`, `get_pending_reference_change`, and `apply_approved_reference_change` MCP tools when the local writer is enabled. Retrieve the character and its current `approved_canon.id`, search the assigned media, and retrieve only candidate images needed to evaluate suitability. Propose a complete set of 1–12 active images, each with its intended role and the exact current revision ID (or `null` if the character has no approved revision). The server fingerprints source files and rejects stale or changed selections.

Open the returned private approval URL while signed in through the authorized Tailscale account. The page displays the current and proposed sets; approval there is required even in trusted text mode. The Approve and save button immediately verifies and saves the approved set, displaying its new revision. Grok can verify it through `get_character` and `get_approved_references`; `apply_approved_reference_change` remains available for recovery and safe retries. ChatGPT uses the same tools and shared catalogue. Media import, ratings, and generated images never approve references by themselves.
