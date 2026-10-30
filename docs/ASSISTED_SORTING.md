# Reference-assisted sorting and AI options

## Available now

The optional local baseline uses Phase 3's cached SHA-256 and versioned whole-image dHash fingerprints. It compares pictures only against the **current explicitly approved canonical references** for active characters. Ordinary assignments, accepted outputs, folder names, and accepted suggestions never become reference sources. Reference bytes must match the approved fingerprint, and the cached file signature must still match the filesystem. No originals are read by suggestion preparation itself.

This is **not AI face recognition**. It can help assign identical reference copies and very similar compositions; it will miss many genuinely identical characters in different scenes and can suggest unrelated characters with similar overall patterns. It has no calibrated identity probability. Facial identity and body proportions are reported as **not evaluated**, even when a face/body-labelled reference is available. Videos are not analyzed by this baseline.

Each saved candidate records the character ID, exact canon revision, method version, target signature/hash, and reference evidence with roles, hashes, and distances. Up to five candidate characters can be shown per picture, with no claim that this identifies every person. User acceptance adds one character link without replacing others. It never approves output fidelity, completes categorization, changes appearance, or promotes a reference. A changed target, reference, hidden record, or canonical revision blocks stale acceptance. Historical candidates and feedback are retained.

Feedback is append-only and stores accept/reject/reopen, notes, and separate human face/body checks. Repeated preparation with the same evidence keeps rejected candidates out of the pending queue; accepted links are skipped. Reopening is explicit and does not remove earlier assignments. Changed evidence can produce a new candidate. This is feedback-guided review, **not model training** or proof of improved recognition accuracy.

## AI approaches evaluated for a later connection

These are engineering tradeoffs, not measured accuracy on this collection. No model or runtime has been downloaded, installed, or contacted. No images or private notes have been uploaded.

| Approach | Reliability and supported work | Cost and privacy | Maintenance |
| --- | --- | --- | --- |
| Current SHA-256/dHash baseline | Useful for identical copies and close whole-image variants. Weak across wardrobe, pose, crops, and generated-face drift; no semantic clothing tags or identity judgment. | No provider charges or model download; uses existing local caches. | Small, versioned algorithm; very low dependency burden. |
| Local visual feature encoder, such as DINOv2 | Learned image features can support nearest-reference retrieval. Whether they distinguish these fictional people independently of clothing/background is unmeasured; use separate face/body regions and reject uncertain results. | Downloaded weights, local compute/storage and potentially a GPU; no per-call provider fee when run locally. | Runtime, encoder/preprocessing versions, cache invalidation, licenses, and hardware compatibility. |
| Local vision-language model through an offline runtime | Can propose descriptions and structured clothing/pose/setting labels. Comparing established identities still needs reference evidence and a benchmark; descriptive fluency is not identity accuracy. | Local weights/compute; check that the chosen model runs locally rather than through cloud forwarding. | Larger installations, codec/image limits, schema validation, prompt versions, and slow laptop inference. |
| External vision API | Can accept images with text for analysis. Multi-reference identity matching, small facial details, and body proportions must be tested rather than assumed. | External upload, provider retention/policies, and usage charges; price must be checked before connecting. | API keys outside Git, changing models/limits, failure handling, and approved upload/cost controls. |

Primary capability sources: [DINOv2 feature extraction](https://huggingface.co/docs/transformers/model_doc/dinov2), [Ollama image inputs](https://docs.ollama.com/capabilities/vision), and [xAI image understanding](https://docs.x.ai/developers/model-capabilities/images/understanding). These document input/model capabilities, not dependable identification of this collection's characters. A face embedding alone cannot certify a character's body proportions.

## Before enabling actual AI analysis

Choose a model/provider and runtime with the user, then benchmark a deliberately small, manually labelled held-out set containing different scenes, lookalikes, unknown people, crops, and multiple characters. Use approved references only; keep test images out of that reference set. Measure false character suggestions, missed characters, abstentions, accepted/rejected counts, face consistency, body consistency, latency, and total cost. Do not turn similarity or a model's self-reported confidence into an invented identity percentage.

An adapter should supply its method/model/preprocessing version, exact reference revision and hashes, evidence, uncertainty, and separate face/body results (nullable when unsupported) to the existing review boundary. Validate structured labels against the local vocabulary. Do not send biographies, private administrator notes, relationship secrets, or unrelated images. There must be an explicit preview of uploads and estimated cost before an external call. No provider, payment, automatic assignment, or training is enabled by this release.
