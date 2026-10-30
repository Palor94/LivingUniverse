# Application regression repair — 2026-10-30

The full Windows suite passes: **158 tests, 158 passed, 0 failed, 0 skipped**.
Run with Node.js 24.22.1 from a local checkout outside OneDrive:

```powershell
node --test --test-reporter=tap tests/*.test.mjs
```

Tests create disposable media/catalogues in the Windows user's temporary directory.
No production profiles, canon or original media are test fixtures. Image-provider
tests use controlled fixtures/mocks; this is not a live paid-provider acceptance.

## Reproduced baseline

At `85104d5`, the same command produced 149 tests: 125 passed, 24 failed.
That includes the two passing backup tests. It reproduces the earlier 147-test
application result (123 passed, 24 failed) without its already repaired backup
cleanup-hook failure. No EPERM/rename environment errors occurred in this run.

The organized-storage source `b421315` adds six tests. These changes are preserved.
Its temporary workaround skipped comparison when a value was undefined; this repair
replaces that workaround with explicit validation so omitted fields cannot disable
concurrent-edit protection.

## Product fixes

1. Canon approval requires a valid `expected_revision_id` (null for first approval)
   and an `expected_references` array (empty for first approval). Missing/malformed
   comparisons return HTTP 400 rather than an undefined `.map()`/HTTP 500 or an
   unchecked write. The revision and exact reference snapshot remain checked at
   commit. Optional missing hashes in legacy reference snapshots remain comparable.
2. Reference-only changes keep the appearance revision ID. Retention cleanup also
   receives the pre-update reference list, so overwriting the only revision cannot
   hide removed IDs from cleanup. Pending copies become conflicts; removed evidence
   and feedback are removed. Other characters and original bytes remain untouched.
3. Affected historical reference explanations are replaced with the minimal removal
   reason. Existing revision IDs and approved appearance text remain intact.
4. `mcp_reference_changes` now participates in the existing optional-table logical
   export/restore registry. Older exports without this table still restore. No
   migration or production-data rewrite is performed on deployment. Recovery must
   still follow the existing policy for old pending/approved grants before enabling
   writes; restored data alone is not fresh human approval.

## Test corrections

- The 22 baseline scenarios blocked by old canon requests now retrieve and submit
  the same comparison snapshots as the desktop client. The helper does not retry
  conflicts; dedicated negative tests send raw requests.
- Catalogue and MCP tests assert a stable revision ID for reference-only changes,
  and a new parent-linked revision when approved appearance text actually changes.
- Explicitly retired references no longer protect media through scrubbed historical
  memberships. Current approved references remain protected from removal.
- Suggestions based on an explicitly removed reference disappear along with their
  feedback, as required by the retention exception; they are not kept as stale rows.
- The new organized-storage fixture uses the same comparison contract.

## Additional regression evidence

Three new integration tests cover missing/malformed snapshots without writes;
stale and concurrent reference-only approval (one save, one HTTP 409); changed
appearance history; same-revision removal; proposal invalidation; unchanged other
characters and original bytes; and a logical export/restore round trip with zero
foreign-key violations. Before repair, two of these three tests failed.

The passing full suite also includes ChatGPT stdio, Grok OAuth/HTTP, PKCE, expiry,
audience and replay/refresh checks, private review/CSRF, reference fingerprints,
generation approval boundaries, backup/WAL restore and organized storage. Fixture
transport success does not prove that a particular remote client's live OAuth
session is healthy. Deployment, remote Git state, real-data backup/restore and
live connector checks are recorded separately in the private project report.
