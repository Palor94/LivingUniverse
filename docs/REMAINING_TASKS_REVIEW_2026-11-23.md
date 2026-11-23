# Remaining-task review, 2026-11-23

The owner deferred perception uncertainty/imperfect recall: first make ordinary information handling dependable. Preserve the completed Claude story behavior.

## Active-character schedules

Audited the actual Play roster: 74 active NPCs. Initially 73 had saved weekly entries and none had pending schedule proposals. Filled 44 previously empty weekday cells for nine characters using explicit locations, weekday/day-part statements and activities in their saved routines. Added two existing workplace links supported by the same source. Each write checked the current grid and source, retained every existing cell, and was read back; no existing private/secret activity or seasonal entry was replaced. Private before/after grids and source text remain in the local reports directory, outside Git and OneDrive.

Moon Ihan remains flexible by the owner's explicit instruction; no filming weekdays or accommodation are invented. An explicit flexible flag makes this distinguishable from an unaudited missing grid. Unspecified homes and workplaces remain unknown. A complete audit is not a claim that every character has 28 known weekly cells.

Reliability fixes: schedule proposals now bind their source profile, known places and current schedule. Changed-source acceptance refuses without deleting the pending proposal. Acceptance and save are transactional, and missing grids cannot silently clear a schedule. The editor submits the displayed schedule version to prevent stale-tab overwrites.

## Clock and event scheduling

Retain owner decision D1 for active play: game time equals real time plus action time. Preserve the newer parallel owner decision C (2026-11-23): unless continuous world-engine mode is enabled, a break advances only to the next 07:00 and then holds; play resumes from that held time. Travel uses travel minutes; a line adds four minutes; waiting advances to the next part and sleeping to 07:00. World-day boundaries use 06:00. Weekly routines, appointments, daily plans, conditional hidden events and the existing world-round scheduler cover the defined cases; no additional generic event queue or continuous paid simulation was enabled.

Fixed two inconsistencies: a warmed clock cache could ignore restored database state, and rewind reset the simulation cursor without moving the game clock. The database is now authoritative, including after transaction rollback and restore. Invalid saved clock data is reported rather than silently reset. Explicit owner rewind rebases game time; undo restores the exact previous clock state. A content fingerprint prevents unsafe undo after new branch writes, including writes with repeated/earlier game timestamps. Newest rewind selection uses insertion order rather than potentially repeated game timestamps. Real-day AI cost accounting is unchanged.

## Real-response character test

Five synthetic male profiles × five situations, current actual Play prompt builder and selected `grok-4.20-non-reasoning`. No private catalogue data/images uploaded and no live conversations inserted. Exact prompts, provider/model, prices, maximum output sizes and request list were frozen into a local plan. Pre-dispatch durable reservations and an exclusive receipt prevent duplicate dispatch; failures/uncertain billing stop without retries.

The first approved batch cost $0.0655494. Its preparation mistakenly reused open fixture conversations, contaminating later scenarios with mock history. Retain that receipt as an invalid independent-comparison run. The corrected harness starts every case without earlier fixture history; regression tests explicitly check this. The owner then instructed continuation after the additional $0.25 proposal. The corrected frozen batch completed 25/25 for $0.0521083. Combined actual spend: $0.1176577. Neither batch was retried automatically.

Corrected lexical distinctness means: help 0.9569, criticism 0.9791, boundary 0.9597, promise 0.9705, knowledge 0.9337. These are word-set differences, not reply-quality or factual-accuracy percentages, and no historical live baseline exists for a before/after improvement claim.

Manual review supports the owner's concern: the sarcastic character repeats the same opening card phrase in all five cases; the taciturn character repeatedly substitutes tree/farm talk; several replies substitute personal goals for the requested factual distinction or review. The next conversation-quality work should measure direct response to the latest question and supported facts, before adding deliberate uncertainty or forgetting. These findings do not justify changing private character biographies or canon.

Current list prices checked against [xAI's pricing](https://docs.x.ai/developers/pricing): $1.25/M input and $2.50/M output for the selected model. Input reservations used a conservative UTF-8-byte bound with overhead; no cache discount assumed.

## Body verification: trial completed, reliable automatic identity still open

Expanded the installed DINO appearance benchmark to 24 approved body references, 22 usable: 29 same-character and 201 different-character pairs. At 0.8, hit rate 10.3%, false-alarm rate 4.0%; at 0.9, no true hits and 1.0% false alarms. These rates do not support automatic body identity acceptance.

With explicit owner installation approval, downloaded the pinned MediaPipe Tasks Vision 1.2.3 runtime and Pose Landmarker Full float16/1 model outside OneDrive; successful artifact download 18,197,181 bytes. The owner later raised the download allowance to 1,000 MB. Public Google model URL, size and MD5 were frozen before approval. The downstream model card's SHA-256 differed from Google's packaging; the Google bytes matched the frozen size/MD5 and were independently SHA-256 recorded as `5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1`. SDK SRI verified; no install scripts, private upload, training or paid model call.

The candidate measures torso/silhouette ratios independently of facial identity. It abstains on multiple people, unclear torso, unsuitable view/posture and occluding arms. This is a pose/shape advisory candidate, not an identity-recognition model; see [Google's documentation](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker) and the linked model card for intended use and limitations.

The bounded 24-reference trial produced five usable measurements, three posture/view abstentions, two arm-occlusion abstentions and 14 local WASM aborts. Failed runtime instances were discarded before proceeding to other references; no score was manufactured. There were zero usable positive pairs and nine negative pairs, so sensitivity cannot be measured. No threshold selected, no live pipeline switch, no automatic pass/canon writer. The existing independent human face/body review remains available. The new candidate must not be advertised as a reliable body-identity solution.

## Validation and evidence

Final combined Windows suite: 621/621 passed, including the preserved break-cap behavior and the Creator/player activity boundary. Added tests cover stale schedule/source protection, failed approval retention, independent real-test fixtures and paid budgets/no-retry, clock rollback/restore/rewind/new-branch guard, and independent torso/silhouette measurement abstentions. Operational data, frozen plans, receipts, private grids and benchmark details live under `%LOCALAPPDATA%/LivingUniverse/reports`; database backups under the local desktop catalogue's `backups`. No private profile records, media or models added to Git.

Final deployment/read-back: built-in restart completed; live code changes 0, SQLite integrity/FK OK, 81 characters and 2291 media preserved. All 44 saved additions verified, Moon flexible flag and three existing known-place links verified. Current story/world/clock settings unchanged. Real browser tests at 1366/375 px confirmed the flexible label and HTTP 409 on an outdated editor save, preserving the newer secret cell in the synthetic catalogue.

A diagnostic repeat on the same bounded reference set using the model’s single-pose option gave the same coverage and failures; switching that option did not establish a usable replacement. The original and single-pose reports are retained separately. A concrete guard improvement was made in the existing human-review tool and benchmark: even an approved crop abstains from a body score when multiple faces are detected within it. Independent target-face clarity cannot override ambiguous reference scope. The added cropped-crowd regression and related checks passed (10/10 focused checks after the 618-test full run).

Parallel-update compatibility: preserved the new break-cap/notePlay work, including its seen/away metadata. Clock actions now carry an action revision; the rewind guard compares offset/action revision rather than heartbeat metadata, so an ordinary play-screen read after 15 seconds does not falsely block undo. The combined clock, restore, rewind and fact-gate checks passed (14/14).

The newer break cap also exposed old test fixtures that jump the injected clock by entire logical weeks. Those four fixtures now explicitly disable wall-clock break capping through an in-process test option; production defaults are unchanged. Promise lapse, secret discovery and whisper expiry assertions remain intact rather than being weakened. Combined policy/chronology checks: 27/27 passed.

Creator-time boundary: schedule and whereabouts administration no longer records player activity or wakes only-while-playing world rounds. A seeded-clock regression verifies both read and write paths leave the clock untouched; real Play still records activity. Combined focused boundary/policy checks: 10/10 passed.

Final live verification after combined-policy restart: PID changed, code.restart_needed=false, SQLite integrity/foreign keys OK, 81 characters and 2291 media preserved. Creator schedule/whereabouts reads left the persisted clock and world/story settings unchanged; Moon remains explicitly flexible. No running/stuck jobs or newly logged errors. Final full test count: 621/621.
