# Narration and durable world facts

Verified 2026-11-23. Implementation: `app/world-fact-gate.mjs`.

Narration may stage up to six typed proposals from its persisted source. Staging never applies an event, memory, relationship change or visual canon revision. The Creator can review proposals under World engine → Rejtett események. A proposal supports a subjective memory, an NPC-directed relationship delta of at most one, or a private world event. Unknown/out-of-scope participants and unsupported types abstain. Palor's feelings are never inferred through a relationship delta.

Approval checks the source version and SHA-256 fingerprint again, validates the participant scope and character policy, and atomically creates a creator-attributed event plus its effects and commit receipt. Changed or rewound sources cannot be approved. A proposal can be rejected even when its source is stale. Duplicate approval is refused. No proposal changes appearance, references or visual canon.

Simulation effects and closed conversation summaries use the same source-bound commit function. Simulation reads the accepted/applied persisted event; conversation effects read the closed conversation's stored summary. Plans are validated before writes, and a receipt prevents applying the same source twice. Conversation memories remain subjective summaries; this structural gate does not certify every model sentence as objective truth. Other existing state systems, such as inner state and social experiences, retain their own attributed mechanisms.

Rewind retires later receipts/proposals and restores earlier proposals decided after the target time to pending. Undo restores the exact decision state. Later decisions prevent an unsafe undo. Export/restore includes proposals and commit receipts. Startup verifies a local SQLite backup before first creating the gate tables on an existing database; live runtime state and these backups remain outside OneDrive.

The owner's Claude-written story behavior is preserved. This gate does not replace the written choices or alter the current story-mode setting.

Validation: complete Windows suite 593/593 passing; the six gate tests additionally rerun after adding a real export/restore round-trip into an empty isolated catalogue (receipt/proposal equality, SQLite integrity and foreign keys, repeated approval refusal). Browser smoke with synthetic data at 1366 and 375 px verifies approval/rejection, source-hash submission, stale approval suppression and text escaping. No live provider call, private media upload, model install or live synthetic character was used.
