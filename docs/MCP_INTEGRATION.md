# Private Living Universe MCP

## Optional human-approved editing

The shared read adapter now delivers selected high-quality references and optional original image bytes; see [original image limits and delivery](ORIGINAL_IMAGES.md). See
[MCP_WRITES.md](MCP_WRITES.md) for the optional authenticated proposal/review/apply
extension, activation, supported fields, tests, rollback and device limitations.
The reader's SQLite connection stays read-only; writes are performed by the
existing application only after independent human approval.

## Local adapter

Run Node.js 24+ with `node mcp/server.mjs`. The adapter is an independent, newline-delimited JSON-RPC MCP stdio server. In its default read-only mode it opens no network listener, never calls the application HTTP API and does not import/start the application server. The optional guarded write client calls only the authenticated local change service described above. Port 4317, its Host/Origin checks and the mobile/Tailscale editor remain unchanged.

Without optional write configuration it exposes ten read-only tools: `list_characters`, `get_character`, `get_ghost_profile`, `search_media`, `get_media`, `get_media_image_chunk`, `get_approved_references`, `search_events`, `get_character_timeline`, `get_event`. Event access defaults to approved public knowledge; see [event retrieval and knowledge boundaries](STORY_EVENTS.md). Each declares read-only, non-destructive, idempotent, closed-world annotations. There are no mutation, SQL, arbitrary URL/path, backup, filesystem browsing or original-video-download tools. The adapter has no model/API dependency or package installation step.

Use `node mcp/configure.mjs --database "<existing local SQLite file>" --media-root "<existing configured resource directory>"` once. Configuration defaults to `%LOCALAPPDATA%\LivingUniverse\mcp-config.json`; an explicit `--config` can select another local configuration. Configuration refuses to overwrite an existing file or create a database. The requested default database location is `%LOCALAPPDATA%\LivingUniverse\universe.sqlite`; **this installation was explicitly configured to the running app’s `%LOCALAPPDATA%\LivingUniverse\desktop-catalogue\universe.sqlite` instead**, after the user confirmed the discrepancy. Never copy, merge, initialize, restore or silently fall back between those databases. Keep configuration, credentials and live SQLite/WAL/SHM outside OneDrive and Git.

Example configuration shape (placeholders only):

```json
{
  "database": "<absolute existing database path>",
  "mediaRoot": "<absolute existing media root>",
  "allowAdminNotes": false
}
```

SQLite uses `readOnly:true`, extension loading disabled and connection-level `query_only=ON`. No migrations, checkpoint, schema writes, metadata writes, hash-cache writes or file moves run. Stable IDs, multi-character depictions, media notes, grouped tags, directed relationships and immutable canon revisions are read from their existing records. Merged characters are excluded from list results, and hidden/erased media are excluded from ordinary lookup. Administrator notes are omitted by default; both local `allowAdminNotes:true` and an explicit `include_admin_notes:true` request are required. Canon revisions are selected by the application's rowid order, not by guessing from timestamps. Review approval, tags and cached video covers never promote a media item to canonical reference.

## Bounds and media safety

- Catalogue IDs must be UUIDs. SQL values are parameterized; unknown arguments and tools are rejected.
- List/search limits are 50 items, reference/history pages at most 20. Input frames are at most 32 KiB, metadata at most 256 KiB, complete responses at most 9 MiB (6 MiB original-image bytes inline; larger images use hash-bound read chunks). Large metadata returns a recoverable paging/smaller-result error rather than an unbounded response. Review note excerpts are explicitly marked when truncated.
- Tool output contains no configured filesystem locations, original directories, backup records or raw filesystem errors. Media display names contain the basename only. Absolute paths embedded in user-authored text are redacted conservatively.
- Media is resolved solely from an existing active catalogue ID. Absolute paths, traversal, alternate Windows data streams, reserved application/backup directories and dot directories are rejected. Every component is checked for symlinks/junctions; realpath containment, open-file identity and before/after state are checked. IDs and approved revisions are revalidated; changes produce recoverable errors.
- Windows cloud recall flags are checked before original content reads. Online-only/unknown availability is refused without requesting hydration. Missing files and transient OneDrive changes produce recoverable errors. Retry only after making that specific original available on the laptop; no collection-wide download is performed.
- Image sources remain capped at 20 MiB and 40 million pixels. The existing bounded Windows decoder validates pixels; its thumbnail is discarded for original-image output. get_media and get_approved_references default to a selected high-quality reference up to 2048 px / 3 MiB (JPEG quality 85–90 when derived; fitting JPEG/PNG originals unchanged). image_quality:original returns byte-identical originals up to 6 MiB inline, including PNG/JPEG/GIF/BMP MIME, dimensions and SHA-256. Larger originals use get_media_image_chunk or an identity-protected private original download. No silent thumbnail substitution. See [original images](ORIGINAL_IMAGES.md).
- Approved-image requests must identify one reference in the selected character's approved revision. Original bytes must match that immutable reference's SHA-256 before any reference is derived or original image bytes are returned. Missing legacy fingerprints and changed references refuse verified image output; canon is never repaired or approved automatically.
- Videos return catalogue metadata and the available `character_cover_frames` selections. An optional still requires the depicted character ID and matching source-version metadata; it is explicitly identified as presentation, not canon. No transcoder, video download or arbitrary frame extraction is available. A previously saved still can be read from SQLite without downloading an offline source video.

Run `node --test tests/mcp-adapter.test.mjs` locally. This creates disposable fixture data, verifies read-only SQL enforcement, tools/schema, paths and junctions, missing/offline sources, canon roles/revision order/fingerprints, metadata, image bounds, video stills and JSON-RPC framing. Windows is required for the production thumbnail converter; no application catalogue is used by that test. Runtime results and image pixels are not logged. Tunnel keys inherited by the adapter are removed from its environment before it handles any requests.

## Secure MCP Tunnel setup

Follow the current official [Secure MCP Tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) and the linked current `openai/tunnel-client` onboarding/CLI help. This integration uses an outbound-only private tunnel. **Do not use Tailscale Funnel, ngrok, public HTTPS hosting, or expose port 4317.** Tailscale Serve for the separate mobile editor is unrelated to this stdio integration.

1. Sign into [Platform tunnel settings](https://platform.openai.com/settings/organization/tunnels) using the intended OpenAI account. Check existing suitable tunnels before creating one. The account must have **Tunnels Read + Manage** to create/manage and **Tunnels Read + Use** to run/select it. These are organization-level permissions, separate from ChatGPT plugin creation. A Plus subscription alone is not proof of Platform permissions.
2. Associate the private tunnel with the intended personal Platform organization and target ChatGPT workspace/account. Do not attach unrelated organizations/workspaces or reuse the browser/computer-use tunnel.
3. Obtain a restricted runtime key with only the necessary Tunnels Read + Use permissions. Enter it directly in a local secure prompt; never paste it in chat, command arguments, screenshots, Git, `.env` files in this repository, or plaintext profiles. Creation/manage credentials must not be used as the runtime key.
4. Download the supported current client for the laptop from Platform or the [official latest release](https://github.com/openai/tunnel-client/releases/latest), into a local nonsynchronized runtime directory. Inspect `tunnel-client help quickstart` and the installed CLI help. Confirm Windows support and checksum/signature information for the chosen release; do not assume a Linux binary runs on Windows. Keep client profiles/logs/admin UI local; use its documented local configuration directory, not the OneDrive project checkout.
5. Configure a **new named stdio profile** pointing to this Node adapter. Replace the placeholders below using the exact syntax confirmed by the installed CLI:

```powershell
$mcpCommand = '"C:/<absolute node.exe>" "C:/<absolute repository>/mcp/server.mjs"'
$profiles = Join-Path $env:LOCALAPPDATA 'LivingUniverse\mcp-runtime\profiles'
& '<local tunnel-client executable>' init --sample sample_mcp_stdio_local --profile living-universe --profile-dir $profiles --tunnel-id '<private tunnel_id>' --mcp-command $mcpCommand --health-listen-addr 127.0.0.1:0 --control-plane-api-key-ref env:CONTROL_PLANE_API_KEY
```

Use forward slashes inside the quoted Windows command paths: the installed client's command parser treats backslashes as escapes. The tested Windows release is v0.0.18; installation verified the release asset's SHA-256 digest before extraction. Initialization uses only an environment secret reference and does not need a literal key.

Start the credential UI with `mcp/Start Tunnel.cmd` or `node mcp/start-tunnel.mjs`. **Do not invoke the `.ps1` file directly or paste a key into a console.** The Node launcher starts a noninteractive Windows helper with a clean native module search path and a dedicated WPF PasswordBox. It does not change execution policy, use Bypass, or leave an interactive shell after failure. The visible input must be the **Living Universe - Private tunnel key** password window with Connect/Cancel buttons. Console input is suppressed. The helper source is read by Node and executed as application commands, so a Restricted file-execution policy does not prevent startup; a synthetic self-test explicitly verifies that case.

After local preflight succeeds, the credential is saved as a Windows user/machine-bound encrypted SecureString under `%LOCALAPPDATA%\LivingUniverse`, outside OneDrive. The helper then runs the tunnel client with the explicit local profile directory. It redacts key-like strings from client output and reports only a safe stage/type on startup errors. The local doctor check is not proof of live authenticated polling: readiness and a real ChatGPT tool call must still be verified. Use `node mcp/start-tunnel.mjs --new-key` to replace a revoked/expired cached credential. If a key was exposed in a terminal or screenshot, revoke it first; do not reuse it. Treat the local credential directory as private. Keep raw HTTP logging disabled and do not include content payloads in support exports.

```powershell
node '<repository>/mcp/start-tunnel.mjs'
```

6. Confirm doctor succeeds and the client reports readiness/active polling. Its admin UI, health and metrics must remain loopback-only. Keep the client and laptop running during discovery and subsequent calls. No paid model/API call is required for the local adapter test; actual Platform/account charges or eligibility must be checked in the account UI rather than assumed.

## ChatGPT connection and acceptance test

Use [ChatGPT Plugins](https://chatgpt.com/plugins) on the web: plus/Add → **Add custom MCP server** → name **Living Universe (read-only)** → Connection **Tunnel** → select the verified tunnel or enter its ID. The underlying stdio server has no separate OAuth service; **No authentication** applies only to that local server connection. Tunnel organization/workspace permissions and the restricted runtime key protect the transport; this is not an unauthenticated network endpoint. Review the warning and create the private plugin, then install it for your own account. No public submission or marketplace publication is needed. See [official custom MCP instructions](https://developers.openai.com/api/docs/guides/custom-mcp-server).

Verified on 2026-10-26: the personal account supports custom MCP plugins and the dedicated tunnel is authenticated and ready. The private Living Universe plugin is installed and connected. At the user's request, ChatGPT's account-wide model-improvement setting was switched off and verified after reload before connecting. ChatGPT Chat and Work successfully called `list_characters` and retrieved approved-reference metadata, including a successful original fingerprint verification. An initial recoverable `MEDIA_CHANGED` result succeeded when the same approved source was retried; no check or canon record was changed. A real approved reference was also read locally as a verified 54,632-byte thumbnail. Visible image delivery remains a separate acceptance checkpoint; successful metadata or conversational claims of display do not prove it. An unrelated existing tunnel is not authority to access this catalogue.

In a new ChatGPT conversation, select this plugin and test:

1. `Use Living Universe (read-only). Call list_characters with limit 5. Do not use browsing or GitHub.` Confirm results come from the local catalogue.
2. `Get the approved references for <returned character ID>, then retrieve one listed media_id with include_image true.` Confirm a real image content block is returned and the approved revision/role and verified-original indication are present. A metadata-only success is insufficient.
3. In the ChatGPT iOS app, sign into the same account, select the available plugin and repeat both calls. Current [Plugins documentation](https://learn.chatgpt.com/docs/plugins) supports account-available plugins on web and mobile; Desktop-only plugins do not qualify. This remote tunnel-backed plugin is designed without desktop-only hooks/UI, but its specific iOS availability and image rendering still require an on-device test.

**Web visual acceptance verified on 2026-10-26.** ChatGPT called the approved-reference tool and visibly displayed Pákozdi's verified face-reference thumbnail, role and canon revision in an inline component. The first component startup timed out; its Retry button subsequently loaded the actual image. This is a visual browser check, not a conversational claim of display. Specific iOS availability and rendering still require an on-device test.

### Reference-image display

The five read-only tools are unchanged. `get_approved_references` now links a small MCP Apps preview using the [official UI resource contract](https://developers.openai.com/plugins/build/chatgpt-ui). It returns the existing standard image block for compatible model clients and a bounded copy in widget-only `_meta` for visible display. Pixels are never inserted into metadata text, published at a URL or saved in a new file. The preview labels the reference role and approved revision; it does not approve or modify canon.

`resources/list` advertises one static HTML presentation resource. `resources/read` accepts only its exact current URI and two fixed compatibility aliases retained for cached conversation descriptors. There are no URI templates, filesystem reads, media downloads, tool calls or network requests in the component. Its resource CSP has empty external network/asset allowlists; text uses `textContent`, and image input accepts only a bounded inline JPEG. The previous database, ID, symlink, OneDrive, fingerprint and image-size checks remain in force. Tests cover resource allowlisting, separate text/image output, malicious messages/URLs and clearing stale previews on errors.

After installing this update, restart `mcp/Start Tunnel.cmd`, refresh tools in the Living Universe plugin's settings, and use a new chat. Ask `@Living Universe Show one approved face reference for Pákozdi.` If ChatGPT's component loader temporarily fails, use the component's Retry button; no catalogue changes or new approvals are needed. Older metadata-only messages do not retroactively gain a preview.

## Disable/revoke

Stop the named tunnel-client process, disconnect/uninstall the private ChatGPT plugin and revoke the restricted runtime key or tunnel permission. Delete any saved encrypted key if no longer needed. Remove only this adapter's local configuration/profile if desired. No data rollback, SQLite restore or migration is necessary; the existing application and catalogue remain authoritative and unchanged.

## Startup recovery (2026-10-26)
See [MCP_RECOVERY.md](MCP_RECOVERY.md) for the verified private tunnel startup task and recovery procedure. Port 4318 is the separate mobile editor, not the ChatGPT MCP endpoint. No Funnel is needed.


## Cross-client extension (2026-10-27)
The separate Grok HTTP/OAuth gateway is documented in [GROK_INTEGRATION.md](GROK_INTEGRATION.md). It does not replace this ChatGPT stdio tunnel. Three verified-media import tools are added when the authenticated local service is available; the original ten retain their authorization policy.

## Reference-conditioned image APIs (2026-10-28)
Four additional tools are discovered when the authenticated backend supports them:
`get_image_generation_capabilities`, `prepare_image_generation`,
`get_image_generation`, `execute_image_generation`. Provider enablement is checked
separately from tool availability. Existing read/write schemas and the tunnel remain
unchanged. Exact private human approval is required for external references/cost,
including trusted text mode. See [setup and recovery](IMAGE_GENERATION.md).


## Select approved reference images from ChatGPT or Grok

The shared MCP writer exposes `propose_reference_update`, `get_pending_reference_change`, and `apply_approved_reference_change` to both ChatGPT and the authenticated Grok gateway. First retrieve the character, its current approved revision, and candidate media. Choose 1–12 active images already assigned to that character, then propose a complete set with a role (`face`, `body`, `detail`, or `general`) and the exact current revision ID. The server records SHA-256 fingerprints and refuses stale, changed, unavailable, unassigned, or non-image media.

Every proposal opens a private review page on the authorized Tailscale identity, including when trusted text writes are enabled. Compare the existing and proposed images there and approve or reject the exact set. The private page’s Approve and save button records human approval, verifies the images again, and immediately writes one immutable canon revision. The page displays the saved revision. `apply_approved_reference_change` remains an idempotent recovery operation for previously approved proposals; the normal `get_approved_references` tool verifies the saved set. Retries do not add duplicate revisions. Proposals expire after 24 hours and do not change canon until the private page records approval.
