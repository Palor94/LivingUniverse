# Machine auto-canon policy

Status: **owner-authorized policy lock (2026-11-06)**. Not an enabled runtime.
No model, provider, upload path, or live canon-writing job is turned on by this
document alone. See also `DECISIONS.md` (2026-11-06) and `AGENTS.md`.

## Intent

The owner wants **full automatic visual-canon promotion**: a machine may append
immutable appearance/reference revisions without a human Approve click when the
gates below all pass. Human paths remain valid in parallel (admin
`Kijelölés mentése`, Approved identity UI, MCP propose → private Approve).

Auto-canon is **not** automatic sorting completion, tagging, rating, import,
generation registration, or cover-crop presentation. Those stay separate.

## Unit of approval

| Unit | May become canon? |
| --- | --- |
| Whole media asset with one clear person | Only via a **character-bound crop** (face and/or body role), never by treating “the file” as the reference without a role |
| Whole media asset with multiple people | **Never** as a single character’s canon |
| Per-person region / crop matched to one existing character | Yes, if gates pass |
| Unknown / unmatched person region | No; leave unknown; do not invent a character |
| Detail-only crop without face/body evaluation | Only if the requested role is detail and evidence supports that role; never as a substitute for face or body identity |

A `CanonReference` must continue to point at a **depiction** (character + media +
optional region), with role and provenance—not at an unlabeled shared frame.

## Multi-character handling

1. Detect distinct person regions in the image (or abstain if detection fails).
2. For each region, attempt match to an **existing** active character using
   approved references only as identity evidence sources.
3. Evaluate **face and body separately**. A face-only score cannot certify a body
   reference; a body-only score cannot certify a face reference.
4. If a region matches one character and gates pass for a role, the machine may
   append that role’s approved reference from that crop.
5. Other people in the same picture do not block a clean crop for a different
   matched character, provided regions do not overlap enough to contaminate the
   crop (overlap → abstain for those regions).
6. Ordinary multi-character **depiction links** may still be proposed or accepted
   under sorting rules without promoting anyone to canon.

## Hard abstain rules (in force now)

Abstain (write nothing to canon; queue for human review) when any of these hold:

- Person count, regions, or crops cannot be determined cleanly
- Two or more candidate characters remain plausible for the same region
- Lookalike / cross-character mix risk is not ruled out by the method
- Face or body (whichever role is being approved) is occluded, truncated, tiny,
  motion-blurred, or contaminated by another person
- Region overlaps another person enough that the crop is not character-pure
- Identity is `unknown`, or gender is unknown under owner character policy
- Matching would require creating a new character or inferring gender
- Evidence uses non-canon sources (folder names, unapproved media, accepted
  sorting suggestions, ratings, or generated outputs not yet in canon)
- Target bytes, reference fingerprints, or canon revision evidence is stale
- Method did not produce separate face/body results when the role needs them
- Numeric gates for the active method are still **unset** (see below)
- Owner character policy would block acceptance of the identity

Abstentions and evidence must be retained for audit. Abstain is success for
safety, not a failed run to retry until something sticks.

## Numeric gates (unset until lock-in)

No invented identity percentage is authoritative. Before any live auto-canon
writer is enabled:

1. Choose model/provider/runtime with the owner.
2. Run a small held-out benchmark (solo, multi-character, lookalikes, unknowns,
   crops, wardrobe/pose changes) against approved references only.
3. Record false promotions, missed promotions, abstentions, face vs body errors,
   and cost/latency.
4. Owner explicitly locks numeric accept/abstain thresholds per method version
   into local configuration outside Git (and notes them in a later decision).

Until step 4, implementations may detect/propose only; they must not write canon.

## Attribution, limits, and undo

- Actor: `machine` plus method, model, preprocessing, and policy versions
- Each promotion: immutable revision, parent revision, rationale, evidence
  hashes, character ID, media ID, crop, role, and abstain alternatives considered
- Preserve existing references unless the owner later authorizes replacement
  rules; default is **append** with role coverage logic, not silent replace-all
- Rate-limit and allow an operator kill switch in local configuration
- Undo / correct via a new attributed revision (human or machine), preserving
  history; do not rewrite old revisions
- Accept/reject feedback may guide review queues; it is **not** automatic model
  training authorization

## Chosen engines (2026-11-06)

Update 2026-11-10: models are chosen per job (`docs/VISION_ENGINE.md`). OpenAI refused
identity matching, so the identity input is the local InsightFace face method (body: interim
DINOv2); numeric gates are locked per method version. Originally: tagging and identity both on
OpenAI **`gpt-6.1-sol`**. Auto-canon consumes identity-v1 participant matches
plus character-bound crops; it does not promote whole multi-person frames.

Bootstrap rule for the first implementation: a character must already have
human-approved **face** and **body** references before the machine may append
further face/body canon crops for that character.

Generation-plan / idea drawings under
`20_SHARED_MEDIA/Unassigned/Generation plans, ideas` are never auto-canon
sources or categorize targets (`generation_plan_excluded`).

## Still separately authorized

- Installing or connecting a model/provider
- Uploading private media off-machine
- Paid API calls (including Sol tag/identity batches)
- Training on the collection
- Changing owner character policy
- Enabling the live writer after benchmark lock-in (`auto_canon.writer_enabled`
  plus locked numeric gates in local config)

## Related docs

- `docs/VISION_ENGINE.md` — exact model, APIs, cost, operator CLI
- `docs/VISUAL_IDENTITY.md` — canon records and face/body separation
- `docs/ASSISTED_SORTING.md` — proposal/review boundary and AI options
- `docs/CHARACTER_REFERENCE_CROPS.md` — human one-click crop approval path
- `docs/WORLD_MEDIA_REVIEW.md` — offline observation review (not canon)
