# Living Universe: instructions for coding agents

Persistent visual character identity is a core architectural requirement, alongside persistent psychology, memory, and world state. Read PROJECT_VISION.md, DECISIONS.md, DEVELOPMENT_PLAN.md, and docs/VISUAL_IDENTITY.md before implementation.

- Preserve each character's stable ID independently of provider, model, name, and timeline.
- Canonical appearance and references require explicit user approval. Generated outputs, ratings, model suggestions, imports, and story events never automatically change canon.
- Approval of an output is distinct from promotion to a canonical reference. Canon revisions are immutable, attributed, and reversible through a new revision.
- Do not invent biographies or appearance details. Unknown values remain unknown. Existing folder names do not prove character identities or approval status.
- Evaluate facial identity and body proportions separately. A face-only similarity score cannot certify character fidelity.
- Keep references, feedback, generation manifests, and training provenance portable. Model-specific adapters and embeddings are derived assets, not the canonical identity.
- Respect Participant versus Creator/Admin knowledge boundaries. Admin data must not automatically enter character prompts.
- Preserve existing media unless the user explicitly chooses the application's Move original action. The user authorized physical organization within this OneDrive resource folder. Moves must verify destination boundaries, refuse overwrites, preserve stable media IDs and character links, and retain a move journal. Never upload, train on, or automatically approve the collection.
- Keep secrets, private character records, media, training weights, and live databases out of Git. Do not publish or configure a remote without authorization.
- Keep live databases, dependencies, caches, and temporary runtime state outside OneDrive. Use deliberate, restorable backups into synchronized storage.
- The user additionally authorized editable original filenames, recoverable catalogue/file deletion, and merging the Tibor/Palor collections. Refuse overwrites and path escapes; retain IDs, histories, and a recoverable trash flow. Profile autosave must never approve canon. Cover crops only change presentation. Do not infer that all unnamed background people are one recurring character.
- Build incrementally. No paid generation, training, or continuous simulation by default. Never promise perfect identity preservation or guaranteed reproducibility.

- User retention exception (2026-10-29): removing an approved reference also removes that image from historical reference lists, clears affected reference explanations/proposal copies and invalidates pending approvals. Preserve revision IDs and approved appearance text, other characters, media originals and completed generation manifests. Reference-only changes use minimal reasons; do not invent source-origin claims. Existing offline backups are separate snapshots.

- User deletion exception (2026-10-31): the desktop Törlés button explicitly requests permanent erasure of one selected image, its original/derived local files and all media assignments without another confirmation dialog. Block approved canonical references; refuse unsafe paths; report partial filesystem/database failures accurately. No startup erasure, bulk permanent deletion, MCP deletion privilege or production-data test is authorized by this development request.

- User bulk-deletion update (2026-10-31): the user additionally authorized deleting several explicitly selected images in one action, without confirmation, and requested no tests for this update. Preserve canonical-reference protection and truthful per-file failure reporting; never expand selection to unselected or off-page media. This supersedes the earlier single-image-only UI limit, not the backend safeguards.
