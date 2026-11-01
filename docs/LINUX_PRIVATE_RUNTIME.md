# Linux private runtime recovery

This is an explicit, offline `age` X25519 file backup. It does not migrate Windows
DPAPI, connect an account, issue a token, start a provider, or activate restored
configuration. The main and direct-ai databases remain independent.

Install the distribution `age` package. This implementation uses `/usr/bin/age`
with native X25519 recipients/identities only; no plugins, SSH identities,
interactive passphrases or post-quantum keys. Keep the recovery identity on a
separate protected recovery device/password-manager attachment, away from the
server and its backup destination. Loss of every identity loses recovery.
Compromise of an identity requires rotation and fresh backups; it does not make
old ciphertext safe. All recipients can decrypt the complete selected payload.

Generate a **synthetic lab key first**, entirely outside Git/media/OneDrive:

```sh
umask 077
mkdir -m 700 /absolute/private-lab
age-keygen -o /absolute/private-lab/recovery-identity
age-keygen -y /absolute/private-lab/recovery-identity > /absolute/private-lab/recipients
```

The operator-owned inventory is a private JSON file with an explicit list; there
is no recursive secret discovery or automatic Windows credential decryption:

```json
{
  "format": 1,
  "files": [
    {"source": "/absolute/private-lab/synthetic-key", "path": "credentials/OPENAI_API_KEY"},
    {"source": "/absolute/private-lab/disabled-config.json", "path": "config/image-generation.json"}
  ]
}
```

Use `config/`, `credentials/`, `policy/` or `network/` logical prefixes. Sources,
inventory and identity must be ordinary, single-link, current-user-owned private
files (0600). Symlink parents and writable unsafe parents are refused. Recipient
files may be 0644, but must be owned by the operator. Output/recovery parent must
be owned by that user and private (0700). Limits: 128 files, 1 MiB/file, 8 MiB total.
Files changing during capture fail. Pause configuration writers for a matching
set; independent file observations are not one global transaction.

```sh
node ops/backup/private-runtime.mjs protect \
  --inventory /absolute/private-lab/inventory.json \
  --recipients /absolute/private-lab/recipients \
  --output /absolute/private-lab/runtime.age
```

Retain the returned ciphertext SHA-256 in a trusted recovery record. Verify it
when recovering a copy on a separate machine/directory. `age` checks encrypted
content integrity; knowing a public recipient is enough to produce a new valid
encrypted file. Neither encryption nor an untrusted adjacent checksum proves
the sender or protects against a malicious replacement of both files.

```sh
node ops/backup/private-runtime.mjs restore \
  --input /absolute/private-lab/runtime.age \
  --identity /absolute/private-lab/recovery-identity \
  --sha256 THE_TRUSTED_CIPHERTEXT_SHA256 \
  --target /absolute/private-lab/NEW-recovery
```

The complete archive is authenticated, bounded and path/hash-validated in memory
before recovered plaintext is written. Existing output files/recovery directories
are never overwritten. Recovered directories/files use 0700/0600. Failed I/O may
leave an incomplete, inactive recovery directory for inspection; never use it as
an automatic service configuration. JavaScript strings/OS memory are not a secure
memory-erasure boundary. Recovery files themselves are plaintext and require
protected storage and explicit removal after review.

Catalogue backup integration on Linux:

```sh
node ops/backup/backup.mjs create --config /absolute/private/mcp-config.json \
  --destination /absolute/private/backups --stage /absolute/private/staging \
  --private-inventory /absolute/private/inventory.json \
  --age-recipients /absolute/private/recipients
```

This stores only `private/runtime.age` for the selected private runtime. The
recovery identity is never copied automatically. Catalogue/source/assets and
metadata in the ordinary snapshot remain **unencrypted** and private; this is
not full snapshot encryption. Standard catalogue `restore` still leaves all
credentials inactive. `--private-runtime omit` remains an explicit data-only
choice. Default Linux backup without configured inventory/recipients fails.
Windows backup continues to use its existing DPAPI mechanism.

Reprovision real account credentials on the chosen target, preserving disabled
provider settings and separate scopes. For systemd, `LoadCredential=` supplies
private runtime files via `CREDENTIALS_DIRECTORY`; host/TPM-bound
`LoadCredentialEncrypted=` is an optional at-rest service mechanism, not a
portable recovery key. Test real credential delivery with synthetic values
before provisioning. Do not put a secret value in unit text, command arguments,
logs, Git, a source archive or a container build context.

References: [age manual](https://github.com/FiloSottile/age/blob/main/doc/age.1),
[systemd credentials](https://systemd.io/CREDENTIALS/).
