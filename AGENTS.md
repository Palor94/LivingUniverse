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
