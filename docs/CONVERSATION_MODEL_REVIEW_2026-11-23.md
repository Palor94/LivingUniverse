# Conversation relevance and next body trial

Owner scope: apply the recommended conversation fixes, compare Grok 4.7 with the existing model, and attempt the recommended local SAM 3D Body trial. Public download allowance is now **5 GB = 5,000,000,000 bytes**. Private uploads, training, canon writes and paid GPU rental remain outside this scope.

## Conversation implementation

The existing character voice reminder is preserved. One-to-one, phone and group prompts now end with a shared response-priority block: react meaningfully to the latest question/request/action, including a characterful refusal or disagreement, before introducing a personal goal. Card examples describe style rather than a reusable answer. Plans, promises, assumptions and hearsay must remain separate from experienced events; unknown knowledge and Palor's feelings/decisions/consent must not be invented. An opener still allows spontaneous character initiative. Agenda guidance follows the same ordering, without removing motives or replacing the written-story system.

Further correction after the frozen trial: response priority is also a system instruction. The old system wording restricted Palor knowledge to stored relationships/memories, excluding current speech; it now explicitly permits the current conversation and message as sources. A just-spoken promise is a known utterance even when the parties had never met; its performance is still future/unproven. A heard claim is not automatically a verified event. This `current-question-first-v2-current-turn-knowledge` correction is covered by synthetic prompt regressions but has **not** had a new paid reply-quality run; the frozen paid requests below remain v1.

The Grok 4.7 adapter uses `reasoning_effort: low`; `none` is unsupported by the [official model documentation](https://docs.x.ai/developers/models/grok-4.7). Grok 4.3's supported `none` setting remains distinct. The live selected model is not switched by a benchmark.

## Frozen comparison and cost handling

The owner explicitly approved up to **$0.90** for 50 finite synthetic requests, expiring 24 hours after plan creation: five synthetic male profiles, five independent scenarios per model. No private character data/images or live conversations are used. Each job reserves its conservative input/output budget before dispatch, and an uncertain billed outcome is never retried or resumed.

- `question-first-grok420-2026-11-23.json`: 25 planned jobs, 700 output-token cap, estimate $0.1061575, reservation $0.255725; SHA-256 `9a2bf9cf2c97c8ebdbf3fa6ed163f20f56192e8dad3e5a1c90cbaaa6f796d88b`.
- `question-first-grok47-2026-11-23.json`: 25 planned jobs, low reasoning, 2000 total output-token cap including reasoning, estimate $0.399852, reservation $0.63916; SHA-256 `0792d0f41eb0443ef25bfce48ebcbffa5545306d8d59b55128df5a832915e44f`.

The Grok 4.20 batch stopped on job 2 after one successful reply costing $0.00304685; the second call returned `AI_UNCERTAIN`. Its $0.01114625 reservation remains consumed for budget accounting, while its actual bill is unknown. The other 23 jobs were not sent. Grok 4.7 is its own separately frozen model arm, not a retry or substituted request. The original pre-fix baseline and flawed first batch remain retained separately; no historical receipt is overwritten.

Grok 4.7 completed **25/25**, costing **$0.14858**. Known new-run cost including the one 4.20 reply: **$0.15162685**; uncertain 4.20 billing is additional and retains the $0.01114625 reservation, within the approved $0.90 total. No retries or replacement calls. Manual review of the frozen v1 replies:

- Help/criticism mostly receive relevant acceptance, clarification or refusal rather than a goal-only response. This is an observation, not a statistically established improvement.
- Béla's exact repeated card opening occurred in 5/5 historical baseline replies and 0/5 new replies. Café/cup action motifs still recur across the cast.
- Promise distinction: **1/5 passes** under the explicit rubric “acknowledge the just-spoken promise AND keep future help distinct from performed help.” Three replies deny/dismiss the just-spoken promise; one substitutes tree talk. This is a substantive failure, not character distinctness.
- Undisclosed third-party secrets: **3/5 passes**; one substitutes his own secrets, and the terse character gives an opaque “Nyírfák… Rólad semmit.”
- Lexical difference by scenario: .9660 / .9347 / .9407 / .9019 / .9192. These are not factual-quality scores.

The corrected-prompt 4.20 arm is incomplete; historical baseline and new arm differ in both model and prompt. Therefore this cannot isolate a model effect or establish a complete controlled comparison. Keep the existing live model selection. The factual quality task remains open; no claim that Grok 4.7 solves basic information relaying. Local `question-first-manual-review-2026-11-23.json` records rubric, per-case decisions and limitations without another judge-model cost.

## SAM 3D Body feasibility

Selected candidate: official `facebook/sam-3d-body-vith`, approximately 2.39 GB for checkpoint/config/MHR assets. [Meta's installation guide](https://github.com/facebookresearch/sam-3d-body/blob/b5c765a0d89d789985e186d396315e7590887b94/INSTALL.md) requires model-specific Hugging Face access. The owner submitted that request; the authenticated page was observed saying it awaits repository-author review. No weights have been downloaded and no private media has been sent.

Source pinned to `b5c765a0d89d789985e186d396315e7590887b94`, archive SHA-256 `58886285808df91b36f27216a58f76af7fc4770e1f94a3be612334ca69d64ef1`. Public source download: **23,503,590 bytes**, staged under `%LOCALAPPDATA%/LivingUniverse/vision-sam3d-body-vith-trial-v1`. The download ledger also counts the previous 18,197,181-byte MediaPipe artifacts and reserves 1 MB for metadata. No dependencies, checkpoints or source are placed in OneDrive/Git. The public plan is `ops/sam3d-body-plan.mjs`; the source-only preflight refuses archive path escapes, links, changed hashes and cap overflow, and reuses verified downloaded bytes without downloading again.

Host: approximately 16.5 GB RAM, integrated AMD Radeon graphics, no detected NVIDIA GPU; only system Python 3.15 is installed whereas upstream recommends Python 3.11. Although the demo selects CPU when CUDA is absent, the pinned estimator and model contain hard-coded CUDA transfers (including `recursive_to(batch, "cuda")`, ray conditioning and hand indices). CPU portability must be addressed and actually smoke-tested before any claim of local compatibility. Optional detector/segmentor/FOV modules can be omitted for approved single-person crops, but that does not remove the core CUDA issues. Avoid downloading the full optional GPU stack while access is pending.

SAM is a candidate body-shape estimator, not a validated identity recognizer. Reuse at most the approved 24-reference offline scope; keep face/body separate and abstain on ambiguous person/crop attribution. Reliable body identity remains open until a real held-out trial supports it. No model/pipeline or canon gate is changed by this source audit.

## Validation and deployment

622/622 tests passed after the final v2 correction, including preserved long-talk voices, current-question priority/current-message knowledge in one-to-one/phone/group routes, and supported reasoning settings in regular/streaming calls. Additional frozen-plan checks reject changed reasoning settings and malformed expiry before dispatch. A verified predeployment SQLite backup is retained outside OneDrive. Built-in restart completed (PID 10232 → 26360); live code.restart_needed=false, integrity_check OK and foreign_key_check empty. All 81 characters and 2291 media remain; persisted world/story/clock settings are unchanged and selected model remains grok-4.20-non-reasoning. No running/stuck jobs or newly logged errors. No private live conversation was dispatched for verification. Model-answer reliability and the gated body trial remain open in the task manager.
