# Living Universe: bug and optimisation scan, and next-gen plan (2026-11-11, evening)

Scope: the current source in `app/`, `mcp/`, `ops/`, `tests/` and a read-only look at the live
catalogue (`%LOCALAPPDATA%\LivingUniverse\desktop-catalogue`). Nothing was changed: no code, no
database write, no paid call, no install.

How it was checked: full test run (256 of 256 pass, 50 s), reading the server core, the play
engine, the world engine and the AI provider line by line, pattern searches over the rest, and
timed queries with `EXPLAIN QUERY PLAN` on the live database opened read-only. Modules only
searched, not read in full: the media library, imports, rename, MCP gateway, mobile.

This plan builds on `docs/FEJLESZTESI_TERV_2026-11-11.md` (sections A–D there). Where the two
differ, the reason is given. `AGENTS.md` and `DECISIONS.md` override both.

---

## 1. Bugs

### 1.1 Confirmed by reading the code

| # | Where | What goes wrong | Fix |
|---|---|---|---|
| B1 | `app/play-mode.mjs:498` `end()`, `:479` `groupEnd()` | Ending a conversation has no lock and does not re-check the status after the AI summary returns. A double click, or a retry after a slow answer, pays for two summaries and writes two world events, two sets of memories and two level steps. `talk()` has a lock (`inFlight`), `end()` does not. A `talk` and an `end` on the same conversation can also interleave, leaving a line in a closed conversation. | Take the same `inFlight` lock in `end()`; inside the transaction close with `UPDATE … WHERE id=? AND status='open'` and stop if no row changed; make the `talk` transaction re-check `status='open'`. Test with two parallel `end` calls on a mock provider: exactly one event, one level revision. |
| B2 | `app/play-mode.mjs:132` `closeStale()` with `app/public/play.js:132` | A conversation that started before midnight is closed as "left unfinished" as soon as the date changes: the play screen polls `/api/play` once a minute, `overview()` calls `closeStale()`, and that closes every open conversation whose `world_day` is before today. The next line is refused ("This conversation has ended"), and no summary, memory or level change is saved. | Count a conversation as stale only when its last line is older than a few hours (for example 3), not by date alone. Offer "save point without AI" for stale ones so the lines are not lost to memory. |
| B3 | `app/world-engine.mjs:69-72` `ask()` | A call that times out or whose stream is cut is reported as "may still be billed", but nothing is added to `world_usage`. Repeated timeouts can pass the daily cap without the cap noticing. | On `AI_UNCERTAIN`, record the reserved estimate (marked uncertain) before rethrowing. Show uncertain spend separately on the Élő világ page. |
| B4 | `app/play-mode.mjs:174` `itemAction` drop | Dropping an item when Palor has no current place reads `here.id` of `null`: a generic 500 instead of a clear message. | Same guard as the create branch (`Palor is nowhere yet`, 409). |
| B5 | `app/server.mjs:530` and `:550-559` | An unexpected error is only printed when `LU_DEBUG` is set, so a real 500 leaves no trace anywhere. There is no `SIGINT`/`SIGTERM` handler and no `unhandledRejection` handler: stopping the scheduled task or Ctrl+C skips `app.close()` (no WAL checkpoint, a running generation is not settled), and one stray rejection ends the process. | Always append unexpected errors (time, route, stack, no request bodies) to a size-capped log in `dataDir\logs`; show the last ones in the system-status panel. Add signal handlers that call `app.close()`, and an `unhandledRejection` handler that logs. |
| B6 | `app/server.mjs:83`, `package.json` `start` | `npm start` or `node app/server.mjs` without `LIVING_UNIVERSE_DATA` opens `%LOCALAPPDATA%\LivingUniverse\universe.sqlite`. That file exists (4 KB plus a 1.3 MB WAL from 2026-11-08) and is an empty catalogue; the live one is in `desktop-catalogue`. Anything started that way shows an empty world and writes into the wrong database. | One place decides the data folder (the `.cmd`, the MCP profile and `npm start` all use it). Refuse to start on an empty catalogue when `desktop-catalogue\universe.sqlite` exists, with a message naming the right launcher. Archive the stale file after the owner confirms. |
| B7 | `app/server.mjs:519-524` media route | A zero-byte media file gives `end=-1`; `createReadStream({start:0,end:-1})` throws after the headers are sent and the connection is dropped. | Answer zero-byte files with 200 and an empty body before opening a stream. |
| B8 | `app/server.mjs:439` media search | `%` and `_` typed into search act as wildcards (a search for `100%` matches everything containing `100`). | Escape them and add `ESCAPE '\'`. |

### 1.2 Likely, not reproduced

| # | Where | Risk | Fix |
|---|---|---|---|
| B9 | `app/play-mode.mjs:392` (`maxTokens` 400), `app/world-ai.mjs:51,61` | One answer carries the reply (up to 4 sentences), mood, beat, spark and three suggested lines, all in Hungarian, inside 400 output tokens. `finish_reason` is never read. If the model hits the limit, the JSON is cut, `parseJson` returns `null`, and the player gets "The character did not answer" after a paid call (in streaming mode after already seeing the text). | Read `finish_reason`; when it is `length`, keep the `reply` recovered by `partialJsonString` and default the other fields. Raise the limit to about 600. Log how often it happens. |
| B10 | `app/world-ai.mjs:54-67` | The stream loop only handles complete lines. If the provider's last `data: [DONE]` arrives without a final newline, it stays in the buffer and a complete answer is thrown away as "uncertain". | After the loop, process what is left in the buffer. Add a mock-stream test without the trailing newline. |
| B11 | `app/play-mode.mjs:330-344,406` | Starting a talk without `conversation_id` never checks for an already open conversation with that character, so two open conversations with one person are possible (two tabs, phone plus in person). | Reuse the open one per character and channel, or refuse with 409. |

### 1.3 Checked and sound

- Nested transactions with savepoints; async callbacks are refused (`server.mjs:124`).
- Media and figure paths are checked against the real root before every read.
- Loopback host check, origin check, CSP without inline script, body size limits.
- Parallel AI calls reserve their worst-case price, so they cannot pass the cap together.
- All four timers (world engine, snapshots, figure and background watchers) catch their own errors.
- Streamed text is cleaned of control characters and tags on the server; the client writes it with `textContent`.
- The JSON backup includes the play and world tables.

---

## 2. Optimisation

### 2.1 What the measurements say

Live catalogue: 39 MB, 1,917 media, 77 characters, 102 tables, 24 explicit indexes.

| Query (hot paths) | Time |
|---|---|
| Character list with media counts (`/api/state`) | 0.9 ms |
| Inbox count | 0.8 ms |
| Media page for one character (48 rows) | 1.1 ms |
| Text search (`LIKE`, 5 fields) | 2.7 ms |
| Best picture per place (`placeImages`) | 3.8 ms |
| Play queries over `world_events`, memories, lines | under 0.1 ms |

**The database is not the bottleneck.** Every hot query is under 4 ms. The index migration and
PRAGMA tuning planned as A3 in the Hungarian plan would not be felt at this size; do them only
if a later baseline shows a slow query. The game tables are almost empty (4 memories at most
per character, 2.8 KB of dialogue), so play-side query cost cannot be judged yet: it has to be
re-measured after real play, because several play queries scan `world_events` with
`json_extract`/`json_each` and will grow with history.

**Update after the endpoint baseline (`docs/PERF_BASELINE.md`, same evening):** whole requests
tell a different story than single queries. Three endpoints are slow in the application layer,
not in SQL: `/api/play/journal` 107 ms warm and 546 ms cold, `/api/world-review` 127 ms, and the
library's first page 50 ms (each of the 48 cards runs about ten detail lookups). These go to
Phase 1 as step 1.7, ahead of compression; everything else answers in under 15 ms.

### 2.2 Where the time and bytes really go

| # | Finding | Evidence | Change |
|---|---|---|---|
| O1 | Pictures: every grid and card loads the original file from OneDrive, and each image is revalidated on every view. | `server.mjs:521-523` (`no-cache`), no thumbnail module exists | Section A1 of the Hungarian plan as written (thumbnail cache outside OneDrive, immutable URLs). Still the largest visible gain. |
| O2 | Static files: about 480 KB of JS/CSS (`i18n.js` 185 KB, `style.css` 83 KB, `play.js` 73 KB, `client.js` 64 KB) is read from disk and sent uncompressed with no cache header on every page load. | `server.mjs:526-527` | A2: gzip/brotli once per file version, content-hash URLs, `immutable`. Then split `i18n.js` per screen. |
| O3 | Character profiles are stored as one JSON text per character: 3.8 MB in 37 records, the largest 312 KB. 63 % of it is old proposals, 8 % history. Every cast load parses all of it (19 ms measured for the parse alone, at most once a second while playing), `get()` re-parses the shared template once per character, and every profile save rewrites the whole record. It also grows with every proposal. | `ghost-profile.mjs:52-55`, `world-engine.mjs:87-95`, measured on the live data | Move `proposals` and `history` to their own tables (new reversible migration, backup first); keep `values` small. Cache the cast until a profile or template write changes a version counter, instead of for one second. |
| O4 | The play screen fetches the full overview (about 150 places with pictures, all positions) once a minute to learn one number, the unread-message count. | `play.js:132` | A small `/api/play/unread` endpoint. Also removes the trigger of B2. |
| O5 | `place()` works out everybody's position with several queries per character, then mood, activity and intimacy stage per person present; `talkOnce` calls the whole of `place()` only to check that the character is there. | `play-mode.mjs:90-113,180-209,344` | Compute positions once per request and pass them down; a light `isHere(cid)` for the talk check. |
| O6 | The dialogue prompt puts the changing text (place, weekday, day part) at the very start of the system message and sends the profile (up to 48 fields of 700 characters) in the user message every turn. Provider prompt caching needs an unchanged prefix, so nothing is cached. | `play-mode.mjs:356,380-391`; `usage.cached` is already read in `world-ai.mjs:43` | Fixed rules and the profile first, the changing part last. Log cached tokens per call. Expect lower latency and input cost on turns 2+. |
| O7 | A character is given his last 12 memories, whatever they are about. | `world-engine.mjs:167` | Not a speed problem today, a quality limit tomorrow. See phase 2. |
| O8 | JSON export builds the whole database in memory; restore accepts 50 MB. The export is already over 10 MB (profiles plus picture analysis) and grows with both. | `server.mjs:277,508` | Stream the export table by table; raise or remove the restore limit with streaming parse; or make the SQLite snapshot the main backup and keep JSON for portability. |
| O9 | The schema is defined in three places: numbered migrations, `CREATE TABLE IF NOT EXISTS` inside about 14 modules (42 statements), and `ALTER TABLE` checks at start-up. `user_version` is still 1. | grep over `app/` | One migration runner with a version table; module-level creates stay for old databases but are mirrored in a numbered migration (A3.3 of the Hungarian plan). |
| O10 | `server.mjs` is 73 KB with one request handler and lines of several hundred characters; every module is offered every request in turn. | `server.mjs:255-531` | A small route table (method + pattern → handler) when a module is next touched; no big-bang rewrite. |

Already done since the morning plan: streamed replies (A5.1), the first split of `play-mode.mjs`
(A6, partly: it is still 69 KB), media placement, translation guard.

---

## 3. What "next gen" means here

Today the game is: a map, places with people, a live chat with one AI character, relationship
levels, a journal, pictures chosen from the library. That is a good visual novel with an AI
writer. A next-generation living-world game is one where:

1. **Characters remember and change.** They recall the right thing at the right moment, form
   opinions, keep promises and grudges.
2. **The world moves without the player and pulls him in.** Characters contact Palor, plans
   collide, news travels between people according to who knows whom.
3. **Choices have lasting consequences**, and the player can branch and compare timelines.
4. **Every scene looks like its characters**, with pictures made for the moment that stay
   on-model.
5. **It feels instant and is cheap to run**, and one click restores any earlier state.

Items 1–3 are mostly software and prompt design on top of what exists. Item 4 depends on
measured model quality and cannot be promised (PROJECT_VISION). Item 5 is phases 0–1.

---

## 4. Roadmap

Each phase is a set of small, separately working increments. Before each step: code checkpoint
(`node ops/code-checkpoint.mjs create --label …`); after it: tests, a DECISIONS entry.
Schema changes only as new reversible migrations after a verified backup. Tests use synthetic
data and the mock provider. Sizes: S = under an hour, M = one session, L = several sessions.

### Phase 0: trust the foundation

| Step | Content | Size |
|---|---|---|
| 0.1 | B1 lock and status re-check for ending conversations, with a parallel-call test | S |
| 0.2 | B2 stale rule by last activity; O4 unread endpoint | S |
| 0.3 | B3 uncertain spend recorded; B9 `finish_reason` and reply salvage; B10 buffer tail | M |
| 0.4 | B5 error log, signal handlers, last errors in system status | M |
| 0.5 | B6 single data-folder rule; refuse the empty stale catalogue | S |
| 0.6 | B4, B7, B8, B11 | S |
| 0.7 | `ops/perf-baseline.mjs` on a database copy → `docs/PERF_BASELINE.md` (A0) | M |

Done when: all tests green including the new ones; a deliberately thrown error appears in the
log and the status panel; a conversation survives midnight in a clock-controlled test.

### Phase 1: feels instant

| Step | Content | Size |
|---|---|---|
| 1.1 | O1 thumbnails and immutable image URLs (A1) | L |
| 1.2 | O2 compression and content-hash URLs (A2.1–2.2) | M |
| 1.3 | O3 profile storage split and version-based cast cache | M |
| 1.4 | O5 positions once per request | S |
| 1.5 | O6 prompt order for provider caching, cached-token logging | S |
| 1.6 | i18n and view lazy loading (A2.3–2.4) | M |
| 1.7 | Profile and fix the three slow endpoints from the baseline: journal, media review list, library page (batch the per-card lookups) | M |

Done when (against the 0.7 baseline): image bytes of the first library page down by 80 % or
more; second visit sends no image requests; first-load transfer down by 60 % or more;
`/api/play/place` warm time halved; cached input tokens above zero from the second turn of a
conversation (measured in an owner-approved probe).

### Phase 2: characters that remember

The core of the next-gen claim. Free and local unless marked.

| Step | Content | Size |
|---|---|---|
| 2.1 | **Memory retrieval.** Each memory gets importance (1–5, set in the summary call that already runs, no extra call), people and place links, and last-recalled time. Recall for a prompt = score of recency, importance and relevance to the current person, place and last lines. Relevance first by SQLite FTS5 over memory text (built in, no install). | M |
| 2.2 | **Rolling conversation summary.** Past 20 lines, older lines are folded into a short running summary kept with the conversation (made in the next reply call's budget or at the save point), so long talks stay coherent. | M |
| 2.3 | **Open threads.** Promises, questions left open, plans ("I'll call you Friday") are extracted at the save point into a small table with a due day. They enter the prompt when due and let the character bring them up or be hurt when they lapse. Generalises the existing date and missed-date logic. | M |
| 2.4 | **Reflection.** When a character has gathered enough new memories, one call condenses them into a few beliefs about people ("Palor keeps his word", with the memories it rests on). Beliefs are subjective, can be wrong, are stored apart from objective events, and are shown to the admin only. | M |
| 2.5 | **Who knows what.** A fact from an event is known to its participants; it spreads when two people who know each other meet in a world round (the GM decides, capped per round). Prompts get only what that character knows. This is the Participant/Admin boundary applied between characters, and it makes gossip, secrets and being found out possible. | L |
| 2.6 | **Dialogue quality checks.** A fixed set of synthetic conversations run on the mock provider checks prompt assembly (budget, boundaries, no Palor-private notes, no explicit fields outside an intimate scene). A real-provider run of the same set is an owner-approved, costed step. | M |
| 2.7 | Optional later: semantic recall with a local embedding model. Needs owner approval for the install and a benchmark against FTS5 (AGENTS: model choice by measured quality). | L |

Done when: with 200 synthetic memories, a prompt contains the three that concern the present
person and place and stays inside a fixed token budget; a promise made in one conversation is
mentioned in a later one; a secret told to A reaches B only through a recorded meeting.

### Phase 3: a world that plays back

| Step | Content | Size |
|---|---|---|
| 3.1 | **Game time (owner decision D1).** Today the world clock is the wall clock: a day part lasts six real hours, and travel minutes change nothing. Option: a game clock that advances by actions (travel, talk, wait, sleep), with the world engine run per game day part under the same cost cap. | L |
| 3.2 | **Schedules.** Turn each profile's weekly routine into a per-day-part schedule table once (owner-reviewed), so "who is where" is stable, explainable and free, and the AI is used for exceptions. | M |
| 3.3 | **Characters take the initiative.** They message, invite, turn up, or cancel, driven by level, open threads and their goals; a cap per day so the phone does not flood. Extends the existing world messages. | M |
| 3.4 | **Story threads.** The game master keeps a few named threads (a conflict, a secret, a plan) with a stage, the people involved and what would move them on. Rounds advance threads instead of producing unrelated events; the journal groups by thread. Serious turns still wait for the owner, as now. | L |
| 3.5 | **Consequences.** Relationship levels between characters react to what they learn (2.5): jealousy, loyalty, reputation in a group. Shown as reasons in the relationship history. | M |
| 3.6 | **Timelines.** Build named branches on the existing rewind: keep a save point as a branch, switch between branches, compare journals. The vision asks for this; rewind already has the compensating-revision base. | L |
| 3.7 | **Things to do besides talking (owner decision D2).** Shared activities at a place (train together, eat, work, go somewhere) as short scenes with outcomes; optional light resources (time, energy, money). The v1 design said no stats, so this needs an explicit yes. | L |

Done when: a week of game time can be played in one evening with stable costs; at least one
thread starts, develops over several days and ends through the player's actions; a branch
taken from a save point leaves the original timeline untouched.

### Phase 4: presentation

| Step | Content | Size |
|---|---|---|
| 4.1 | Design tokens, components and the decluttered conversation screen (C1, C3, C4) | L |
| 4.2 | Navigation in five groups, settings page, action-only home (C2, C5) | M |
| 4.3 | Avatars (B1–B5) | L |
| 4.4 | Moment pictures: gate first with table tests, then the free MCP route (D1–D3a, D5–D7) | L |
| 4.5 | Figure expression from the reply's mood with a short crossfade; scene transitions; time-of-day tint | M |
| 4.6 | Sound: ambient loops per place kind and a few interface sounds from owner-supplied or freely licensed files (decision D3) | M |
| 4.7 | Voices: spoken replies. Paid cloud speech or a local model, both needing owner approval and a per-character voice choice (decision D4) | L |
| 4.8 | Play on the phone (C6) | L |

### Phase 5: visual identity

Unchanged in principle from `DEVELOPMENT_PLAN.md` sections 2–4 and `docs/AUTO_CANON.md`; listed
so it is not lost behind game work.

| Step | Content |
|---|---|
| 5.1 | Finish the held-out identity benchmark (face and body scored separately); record numbers in DECISIONS |
| 5.2 | Owner sets the numeric gates; enabling the auto-canon writer stays a separate explicit step |
| 5.3 | Moment pictures and avatars scored against approved references, advisory only, never canon |
| 5.4 | Evidence-based comparison of reference conditioning against a character LoRA (training needs separate authorization) |
| 5.5 | Multi-character binding and confusion checks; then video keyframes |

### Phase 6: platform, done alongside

- One migration runner and a documented schema (O9).
- Route table and smaller modules as files are touched (O10); `play-mode.mjs` down to the
  conversation core.
- Streaming export and restore (O8).
- JSON contracts for every AI answer in one place, with validation and counted failures.
- A local-model adapter behind the existing `complete()` contract, compared on the 2.6 set
  before any switch (AGENTS: recorded in DECISIONS with its benchmark).
- A small "engine room" page: latency, cost per conversation, cache hits, truncations, errors.

### Suggested order

Phase 0 → 1.1–1.5 → 2.1–2.3 → 4.1 → 3.1–3.3 → 2.4–2.5 → 3.4–3.6 → 4.3–4.4 → the rest.
Reason: fix what can lose data or money, then make it fast, then put the effort where the game
is thinnest (memory and initiative) before more screens.

---

## 5. Decisions needed from the owner

| # | Question | Blocks |
|---|---|---|
| D1 | Real-time clock (as now) or a game clock moved by actions? | 3.1, and how 3.2–3.4 are tuned |
| D2 | Activities and light resources (time, energy, money), or conversation only? | 3.7 |
| D3 | Sound: yes or no; whose files? | 4.6 |
| D4 | Voices: none, cloud (paid), or local (install)? | 4.7 |
| D5 | May the stale empty database in `%LOCALAPPDATA%\LivingUniverse\universe.sqlite` be archived? | 0.5 |
| D6 | The seven open questions in section 8 of the Hungarian plan (avatar style, paid routes, icons, `sharp`, navigation) | 1.1, 4.x |

## 6. Rules that stay fixed through all of this

Canon is never written by play features. Content level is decided on the server by the
existing gate. Adult male characters only; no new characters and no invented biography or
appearance. No paid call, install or upload to a new provider without explicit approval;
uncertain billed calls are never retried automatically. Live data, caches and thumbnails stay
outside OneDrive. No promise of perfect identity or reproducibility.
