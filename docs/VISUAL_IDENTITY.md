# Persistent visual identity: design and feasibility

Status: architectural specification, not implemented functionality. Research checked 2026-10-24. No media has been inspected or submitted to external services.

## 1. Protected canon

An identity lock protects the approved definition within Living Universe. It cannot force an external model to obey that definition. Generated images start unreviewed. Approval means an output is acceptable for its reviewed context, not that it becomes a new identity template.

Canon promotion requires a distinct user action specifying which character, crop, features, and reference roles are approved. New canon creates an immutable revision with author, timestamp, rationale, and parent revision. Conflicting references remain visible for resolution; imports never silently settle conflicts. Clothing, expression, pose, and scene lighting are normally variable context. Age and physique variants require explicit linkage to the intended appearance revision or timeline variant.

## 2. Proposed relational records

All records use stable IDs, schema versions, timestamps, and foreign-key constraints. These are conceptual tables, to be turned into migrations with the first prototype.

| Record | Essential fields and links |
| --- | --- |
| Character | ID, name, aliases, biography draft, current approved appearance revision (nullable) |
| AppearanceRevision | Character ID, parent revision, draft/approved status, structured facial features, eyes, apparent age, build, body proportions, distinctive traits, user wording, approval actor/time |
| MediaAsset | ID, SHA-256, MIME type, dimensions/duration, original/generated origin, import provenance, availability; storage locations separately mapped |
| CharacterDepiction | Asset ID, character ID, optional bounding region/crop, visibility/occlusion, angle, expression, clothing tags; unknown identity allowed before assignment |
| CanonReference | Appearance revision ID, depiction ID, approved feature scope, face/body/detail role, selection notes, approval provenance |
| GenerationRun | Provider/model/version, task type, prompt and exclusions, requested/actual parameters, seed if supported, request ID, status, timestamps, estimated/actual cost and currency, raw sanitized request/response metadata |
| RunCharacter | Run ID, character ID, exact canon revision, reference asset IDs/hashes and crops, reference order/weights, scene region, adapter IDs; immutable input snapshot |
| RunOutput | Run ID, output asset ID, parent output/edit lineage |
| Review | Output depiction ID, reviewer/time, approve/reject/unreviewed decision, rating with defined scale, feature tags, free text, optional image region or video time range; append-only revisions |
| TrainingArtifact | Character and canon revision, base model/version/hash, training dataset manifest, captions/crops, parameters, checkpoint/LoRA location/hash, license, validation results |
| Comparison | Output depiction, reference revision, method/model version, separate face/body/age/detail scores where available, uncertainty, human verdict |

Keep original images immutable. Crops, thumbnails, embeddings, and transcodes are linked derivatives with processing provenance. A hash verifies bytes, not visual correctness. Deleting references should normally retire them while keeping historical manifests valid; permanent deletion must explicitly report affected runs and backups. No record may silently point to a different file after a path change.

Review examples include "eyes are incorrect", "face is too young", and "abdomen is too flat". Store both the user's exact note and optional structured labels. Do not infer measurements from those notes. Unspecified physical traits remain unknown.

## 3. Provider boundary and generation workflow

Adapters report capabilities per model: multiple reference inputs and limits, identity conditioning, region/mask control, pose/depth guidance, LoRA loading/training, seeds, edits, and image-to-video reference support. Unsupported requests must be explained before submission; never silently replace references with a text description.

Workflow: choose characters and appearance revisions; select relevant face and body references within provider limits; bind each character to a scene region when supported; show the actual plan and estimated spend; submit; save the full manifest and outputs; review each character; retain corrections for subsequent attempts. Explicit user authorization is required before initial external uploads or paid runs.

The library may contain dozens of images while a provider accepts only a few. Select for coverage and quality, not maximum count. Avoid a chain where each output replaces the original references and gradually drifts. Approved outputs can supplement source references only through explicit promotion. Saved feedback informs reference selection and later prompts; it does not train a provider automatically. Seeds and saved parameters assist investigation but do not guarantee reproduction after backend changes.

## 4. Realistic generation approaches

| Approach | Likely benefit | Limits and cost drivers |
| --- | --- | --- |
| Text description alone | Useful constraints and portable appearance vocabulary | Weak identity enforcement; repeated paid attempts may dominate cost |
| Multiple reference images / image editing | Practical first candidate; preserves visual evidence without character training | Identity may drift with angle, clothing, lighting, or composition; provider input limits and per-run charges apply |
| IP-Adapter / FaceID conditioning | Explicit image or facial identity signals in compatible pipelines | Face conditioning is insufficient for abdomen/build; stronger conditioning can constrain composition; requires compatible weights, compute, and license checks |
| Character DreamBooth / LoRA | Learns subject-specific features for a compatible base model; can complement references | Dataset preparation, GPU training, validation, storage, inference, and retraining costs; may overfit clothes or backgrounds; body shape and unfamiliar angles still need evaluation |
| Pose/depth guidance and regional editing | Helps placement, posture, and targeted correction | Pose is not identity; edits can introduce boundary artifacts or change other features; additional passes cost time and compute |
| Human review with advisory visual comparisons | Filters failures and makes corrections reusable | Review effort remains; face similarity cannot validate body shape or all eye details; thresholds must be calibrated to this character |

These are engineering expectations, not measured results for Pákozdi. Start with a reference-aware provider and test; consider LoRA only if the observed improvement justifies training and maintenance. No specific provider is selected.

Hugging Face documents image conditioning, FaceID variants, and multi-image/regional techniques in [IP-Adapter](https://huggingface.co/docs/diffusers/using-diffusers/ip_adapter). Its [DreamBooth guide](https://github.com/huggingface/diffusers/blob/main/docs/source/en/training/dreambooth.md) explains subject training and smaller LoRA weights. Compatibility and component licenses must be checked for the chosen pipeline.

## 5. Multiple characters and video

Bind references and identity adapters to named character slots and spatial masks where supported. Maintain separate face/body checks per character, including whether two characters have swapped features. If a provider lacks adequate controls, use staged composition or explain the limitation. A list of reference images alone does not prove separate identity binding.

For video, start from a user-approved image/keyframe. Preserve source frame, character bindings, motion/camera instructions, model settings, and shot lineage. Review start/end frames plus sampled frames and intervals of occlusion, turns, and strong motion. Short shots and regeneration can reduce practical drift, but image-to-video support does not guarantee temporal identity. Runway documents [image-to-video inputs](https://docs.dev.runwayml.com/api/) and [input reference requirements](https://docs.dev.runwayml.com/assets/inputs/); suitability must still be benchmarked.

## 6. Costs and evaluation

Budget by accepted result, not generated result: total generation and correction spend divided by accepted outputs. Track preparation/review time separately. Training adds an upfront dataset/GPU expense and later inference expense. Local generation substitutes hardware, energy, storage, and maintenance for API fees. Forty character adapters also introduce validation and version maintenance work.

As a concrete published billing example, [Runway API pricing](https://docs.dev.runwayml.com/guides/pricing/) lists developer credits at USD 0.01 and WAN3 480p at 5 credits per output second. At that listed rate, a five-second output costs USD 0.25 before tax, extras, or retries; four such attempts cost USD 1.00. This is a billing illustration, not a provider recommendation or a fidelity estimate. Recheck prices and supported durations before any implementation or purchase.

Create a fixed benchmark with approved references and held-out evidence across frontal/profile/three-quarter faces, full-body and seated views, expressions, lighting, wardrobe, two-character interactions, and later movement. Score face structure, eyes, apparent age, body build/proportions, distinctive features, and cross-character mixing independently. User judgment is authoritative. Report acceptance rate, failure categories, sample size, and cost per accepted result; do not advertise an invented accuracy percentage.

The achievable target is a curated workflow producing recognizably consistent approved results with documented failure rates. Unlimited future scenes are an application ambition, not a guarantee that every model output will be faithful.
