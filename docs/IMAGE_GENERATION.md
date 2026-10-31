# Reference-conditioned image APIs and secure media registration

Implemented 28 October 2026 on the existing Node 24 / SQLite app, private ChatGPT
Secure MCP Tunnel, Grok OAuth gateway, mobile listener and verified media imports.
The catalogue stays authoritative. Existing read and text-edit schemas are retained.

## Supported clients and actual limits

| Client | Implemented | Boundary |
| --- | --- | --- |
| ChatGPT MCP | Prepare/check/execute an approved API run; approved-reference previews; verified imports | Native host image-generator and attachment-byte handoff remain unverified |
| Grok chat | Same tools through existing OAuth Streamable HTTP gateway | Consumer attachment/Imagine handles are not downloadable bytes |
| Grok Bot | Same gateway after its separate connector registration and OAuth approval | An ordinary chat connection does not install the Bot connector |
| Phone/tablet | Private review, exact prompt/references, approve/reject, execute, receipt, withdraw | Existing Tailscale identity, exact Origin and CSRF are required |

Generation is **disabled by default**. Installing code provisions no key, sends no
paid request, approves no production record and exposes no new public endpoint.
ChatGPT catalogue connectivity was checked read-only during development. The new
tools require the app and adapter to load this code and clients to refresh tool
discovery. Provider protocols were tested with synthetic responses; paid-provider
acceptance and character fidelity still need a separately authorized live test.

## Local provider setup

Keep the existing production database, MCP writes, mobile, tunnel and Grok OAuth
configuration. In the active **local data directory outside OneDrive**, create
`image-generation.json`:

```json
{
  "providers": {
    "openai": {"enabled": true, "model": "gpt-image-2.5-sunburst"},
    "xai": {"enabled": false, "model": "grok-imagine-image-2.0"},
    "sogni": {"enabled": false, "model": "krea-identity-edit"}
  }
}
```

Supply `OPENAI_API_KEY`, `XAI_API_KEY` or `SOGNI_API_KEY` to the **app process** through a protected
local launch environment. Never put keys in chat, source, OneDrive, browser fields,
tool arguments or public plugin metadata. The tunnel's existing API-key removal
from its adapter subprocess remains; the backend app makes provider requests.

An optional provider `estimated_cost_usd` is an operator estimate after checking
current pricing, **not a spending cap**. Omission displays cost unknown, never
free. Approval authorizes one API image attempt, including applicable reference
input charges. Chat subscriptions do not supply API credentials or billing.

Restart the app and refresh/reconnect clients. Call
`get_image_generation_capabilities`: available means the configured supported model
and local key exist. Credits, provider access and policy acceptance are established
only by an authorized live request. Model IDs are explicitly allowlisted in
`app/image-providers.mjs`; unknown/retired models are not silently substituted.

The first feature startup on a nonempty catalogue saves and integrity-checks an
online SQLite backup under local `backups/before-image-generation-*.sqlite` before
additive migration 018. Backup failure aborts that migration.

## Reference-conditioned generation

1. Retrieve stable character IDs and each character's approved references. Select
   appropriate face/body evidence; covers, ratings and descriptive tags are not
   canonical approval.
2. Call `prepare_image_generation` with a stable retry `request_key`, provider,
   scene prompt, and `characters` entries containing `character_id`, current
   `revision_id`, and explicit `reference_ids`. Two people need two bindings.
   Preparation verifies local originals but sends nothing to a provider.
3. Open `approval_url` through the existing private Tailscale page. Inspect roles,
   hashes, prompt, model and estimated/unknown cost. Check the explicit
   external-upload/cost acknowledgement and choose **Approve this plan**.
   Trusted text-write mode cannot bypass this human action.
4. Choose **Generate one image** or call `execute_image_generation` for that run.
   It returns promptly. Poll `get_image_generation`; do not invent a new request
   key when waiting or after a timeout.
5. Only `succeeded` with media ID, actual byte count and SHA-256 proves registration.
   `generated` means the result was staged and needs registration retry; executing
   that state retries local registration only. `uncertain` may already have been
   billed: reconcile the provider account before explicitly approving a new run.
6. Review every character's face and body with existing per-character media
   reviews. An accepted output never automatically becomes a canonical reference.
   Canon changes remain separate explicit existing user approval actions.

Preparation, approval and submission validate current immutable canon revision IDs
and exact original SHA-256. Changed, hidden, offline, unapproved, oversized,
symbolic-link or unsafe-path references fail closed. Missing imagery is never
silently replaced with text. Only approved appearance and explicit scene text
enter the prompt; private notes, biographies, relationships and events are not
automatically retrieved. Character slots preserve reference ordering but are
descriptive bindings: these adapters do not provide regional identity control or a
fidelity guarantee. Rejection, expiry, changed canon or changed model/estimate
requires another reviewed plan. Pending approval/execution expires after 24 hours.

Limits: 1 output per run, up to 5 character slots; OpenAI accepts up to 16 reference
images and xAI up to 5. Combined selected originals are capped at 20 MiB; each must
be JPEG/PNG, at most 20 MiB / 40 MP. OpenAI requests PNG and one of 1024x1024,
1536x1024, 1024x1536. xAI receives the corresponding aspect ratio, **not a promise
of exact pixel dimensions**; actual decoded dimensions appear in import provenance.
OpenAI/xAI use fixed HTTPS URLs, no redirects and bounded base64 responses. Sogni
uses signed storage URLs through the DNS-pinned public-only transfer helpers
described below. Error bodies and signed URL credentials are never receipts.

## Sogni connection (28 October 2026)

### Generate directly from a character dossier

On the desktop open a character, then **Generálás Sognival**. Describe the scene,
choose one of the three image formats and explicitly select approved references.
The configured model and its total reference limit are shown. Missing credentials,
missing approved image references and excess selections prevent preparation.
Unknown face/body details remain unknown; the UI never approves or chooses a new
canonical reference automatically. An unassigned cover/profile draft is not a
substitute for approved image references.

Choose **Kérés előkészítése**. This verifies the current approved revision and
reference bytes and stores a plan without contacting Sogni. Inspect the scene,
ordered images, model, size, unknown/estimated cost and expandable full outbound
prompt. Check the upload/cost acknowledgement and choose **Jóváhagyom a tervet**;
then use **Egy kép generálása Sognival** as a separate action. Only this last
action submits externally. Approval is attributed as `local-creator` in the same
append-only history. Text-write trusted mode does not approve this plan.

Status updates every three seconds while the selected run is running. Run history
is scoped to this character's last 30 Sogni runs and survives browser reloads.
Closing the tab stops UI polling, not a submitted server-side attempt. Prompt,
format and reference-selection drafts survive navigation within the open page;
they are in-memory drafts, not an offline backup. A lost preparation response
retains the same request key. Stale async responses cannot replace a newly chosen
plan. Uncertain attempts show account reconciliation guidance, never an automatic
second attempt. Generated-but-unregistered results offer local saving retry.

Completed results open through **Kép megnyitása és értékelése**, using the existing
media reviewer with separate face/body feedback and explicit reference promotion.
The new image is linked to the existing stable character ID. No output review or
canon approval is inferred from successful generation.

Desktop routes under `/api/characters/:character_id/generation` are available
only on the already restricted loopback desktop listener. Mutations require its
exact HTTP Origin and dedicated `X-LU-Generation-CSRF` token obtained from the
same-origin context read. The server fixes provider `sogni` and the route's
character; foreign character runs, extra credential/provider fields and mismatched
manifest hashes are rejected. These routes are not in the remote mobile or Grok
gateway allowlists. Existing MCP bearer routes and private review pages retain
their behavior. No API key is returned or entered in this web panel.

### Configure the Sogni account

Selected preset (28 October 2026): Krea 2 Identity Edit v1.2, hosted selector
`krea-identity-edit`, with `loras: ["krea2-mystic-x", "krea2-realism-engine"]`
and `lora_strengths: [1, 0.8]` in the protected local Sogni configuration. The
outbound edit uses positional `loras` and `loraStrengths`; both arrays are stored
in the immutable manifest and shown before approval. The live catalogue names
the second adapter Realism Engine v3 (current file `realism_engine_krea2_v3.1.safetensors`).
These provider-managed IDs are not portable training weights or guaranteed
permanent version pins. Existing plans keep their original settings; changed
presets require a fresh plan and human approval. Key setup retains compatible
saved LoRAs. No content-filter preference is changed by selecting this preset.

On Windows, open **Connect Sogni.cmd** in the project folder. Enter the API key
from https://dashboard.sogni.ai/api-key in the masked local dialog. It finds the
existing catalogue through the local `mcp-config.json`; it never creates a new
database. The key is encrypted with Windows current-user DPAPI as
`sogni-key.dpapi` beside that catalogue, outside OneDrive. Setup merges only the
Sogni provider entry in `image-generation.json`, retaining the other providers
and a uniquely named pre-change configuration copy. Cancel changes nothing.
Restart Living Universe and refresh clients after saving. The backend decrypts
the key into its own process environment; MCP/tunnel processes strip provider
keys. An explicitly supplied `SOGNI_API_KEY` takes priority. Other operating
systems can use that environment variable and the local configuration directly.
No extra package installation is required.

`provider: "sogni"` is accepted by the existing generation tools. All existing
reference-hash/canon checks, private exact-plan approval, cost acknowledgement,
output registration, character links and withdrawal protections apply. Available
means local credentials/configuration are present, not that account access,
credits or model identity fidelity have been tested.

The default setup model is `krea-identity-edit` (at most 2 references). Other
explicitly selectable models are `dark-beast-krea2-identity-edit` (2), `qwen` and
`qwen-lightning` (3), `flux-3-klein` (10), and `gpt-image-2`,
`gpt-image-2.5-sunburst`, `gpt-image-2.5-flare` (16). Limits are total per run,
not per character. Model access, suitability and pricing require a live check;
there is no silent model fallback. Existing three output sizes are requested
with PNG output; record actual decoded output dimensions as authoritative.

Only execution after private approval obtains signed `/v1/image/uploadUrl` PUT
links, uploads the exact ordered originals and obtains matching download links.
It starts one `/v1/creative-agent/workflows` step with `edit_image`, explicit
model/prompt, `sourceImageIndex: -1`, one variation and those media references.
No LLM plans or rewrites the prompt. Billing/token modes are fixed to `auto`:
eligible subscription coverage may apply, otherwise the account may be charged.
Cost is unknown unless the operator has supplied an estimate. The provider's
content filter remains enabled. Setup/preparation sends no media or paid call.

The local run ID supplies the upstream idempotency key. A returned workflow ID
is immediately journaled as `provider_job_created` and included in successful
receipts. Polls are read-only, spaced at three seconds, bounded to ten minutes;
there are no repeated start calls, automatic resume, cost confirmation or reseed
calls. Failed/paused/ambiguous/timed-out work remains `uncertain` for manual
account reconciliation, retaining any saved workflow ID. Sogni may perform its
own documented worker retry; the app does not control that provider behavior.
Process interruption retains the existing never-resubmit behavior. Retrieving
an incomplete remote result after interruption is currently manual.

Signed storage links remain opaque and are never saved to manifests/receipts.
PUTs use HTTPS port 443, reject private/mixed DNS, pin the resolved address, send
only bounded reference bytes and MIME headers, and refuse redirects. Result
downloads use the existing public-only DNS-pinned downloader, a 20 MiB cap and
PNG/JPEG decoding before catalogue registration. Sogni bearer keys never reach
storage hosts. Generated media are copied locally because provider storage is
temporary. Sogni execution uploads selected originals to its distributed compute
service; it does not share the database or automatically train/approve anything.

Official protocols checked: [workflows](https://docs.sogni.ai/api-reference/workflows/),
[signed media](https://docs.sogni.ai/api-reference/media/), and the official
[`edit_image` tool schema](https://unpkg.com/@sogni-ai/sogni-protocol/manifests/openai-tools.json).
Tests use synthetic images and mocked Sogni responses. Live account acceptance
and face/body identity fidelity remain unverified until an authorized live run.

## Secure upload and registration fallback

Existing `begin_media_import`, `import_media_url`, `get_media_import` retain their
behavior. Public HTTPS downloads use the existing SSRF-resistant downloader and
reject private/internal addresses, cookies, credentials, arbitrary request headers
and attachment handles. Review-mode imports use the authenticated private upload
page. If a host cannot supply retrievable bytes/URLs, download its selected result
to your device and choose it on `upload_url`. Verify committed receipts afterwards.

Existing limits remain JPEG/PNG 20 MiB / 40 MP, MP4/MOV 100 MiB, 20 slots and 250 MiB
per import. Byte validation, decoding/container validation, hash verification,
exclusive content-addressed storage and idempotent slots precede catalogue links.
User-supplied provenance stays a supplied claim; server `api_generation` provenance
comes from its actual provider request. No upload approves story or visual canon.

Authorized local bot integrations may use the existing binary
`PUT /api/mcp-imports/{import_id}/items/{slot_key}` with the scoped bearer token,
Content-Type, X-LU-Filename and optional X-LU-SHA256. This loopback route is not
newly exposed on the Grok gateway. Remote bots use MCP URL import or the private
browser fallback; never copy local credentials to a Bot computer.

## Provenance, recovery, export and rollback

Migration 018 adds runs, output links and append-only attempt/approval events. The
immutable manifest stores exact outbound prompt, provider/model, requested size,
ordered slots, selected canon revisions, reference IDs/roles/hashes, capability
limits and estimated cost. Human identity, timestamp and manifest hash bind approval.
Output receipts retain media/import IDs, actual hash/size, sanitized provider request
ID and supported token usage. Actual dollar cost remains unknown until reconciled
with provider billing. No credentials, provider error bodies, signed output URLs
or raw reference images are returned in manifests/tool results.

Provider bytes are staged in private local `generation-results/{run_id}.json`
before registration. Import uses stable keys and exclusive content-addressed
originals. Failed commits can retry registration without another provider call.
A restart changes `running` to `uncertain`, never automatically resubmitting a
paid attempt or starting pending/approved plans. A crash before the staged state
was recorded needs manual reconciliation of the recovery artifact/provider account.
There is one generation at a time in the existing single app process; distributed
workers and automatic retries of ambiguous requests are not implemented.

**Withdraw result** appends history and hides an exclusively owned new result in
recoverable catalogue Removed items. Original bytes and provenance remain. Normal
Removed items can restore it. Reused/shared media are retained while the generation
record is withdrawn. Current canonical references block hiding until explicitly
retired by the user. Withdrawal does not refund API charges or reverse other edits.

Catalogue JSON export/restore includes all new tables and existing import
provenance. Original media need matching separate backups. Pending local recovery
artifacts are not in JSON exports; preserve them privately if needed.

To roll back code: stop the app, save a current export and matching media backup,
revert only this feature, then apply `018-image-generation.down.sql`. It removes
job metadata, retaining media, import receipts and canon. A full pre-feature
database restore would also discard later unrelated edits; prefer additive rollback
when those edits must survive.

## Tests and official interfaces

Run `node --test tests/*.test.mjs`. Tests cover real loopback HTTP/MCP, private
identity/Origin/CSRF, ordered multi-character manifests, changed/unapproved/stale
references, idempotency, polling during a run, ambiguous network outcomes,
registration recovery, canon protection, rollback and export/restore. Provider
HTTP responses are mocked; tests upload no private collection images.

`node tests/image-generation-preview.mjs` creates an expiring synthetic local
browser fixture; `/phone-preview` uses a 390px viewport. Its test proxy only serves
synthetic data and is never production authentication or public hosting.

Documentation checked during implementation:

- [OpenAI image edits JSON inputs and response](https://developers.openai.com/api/reference/resources/images/methods/edit)
- [OpenAI plugin/MCP authentication](https://developers.openai.com/plugins/build/auth)
- [xAI JSON image editing](https://docs.x.ai/developers/model-capabilities/images/editing)
- [xAI multi-image reference editing](https://docs.x.ai/developers/model-capabilities/images/multi-image-editing)
- [xAI base64 edit example](https://docs.x.ai/developers/model-capabilities/images/prompting-guide)
- [Grok custom connectors](https://docs.x.ai/grok/connectors)
- [xAI API Remote MCP](https://docs.x.ai/developers/tools/remote-mcp)

Documented API editing plus MCP connectivity does not establish native consumer
host image-generation handoff. Keep that capability unverified until demonstrated
by a supported client with actual reference ingestion and retrievable result bytes.
