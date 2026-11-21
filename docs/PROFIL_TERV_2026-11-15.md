# Plan: every profiled character lives in the world (2026-11-15)

Goal (owner): everyone except the 13 characters with no profile at all gets a full
Szellemprofil and a routine, and takes part in the Living World as much as possible.
Status: steps 1–3 done 2026-11-15 (proposals accepted by the owner; 85 place links); steps 4–6 open.

## Missing places (D2: list only, for the owner)

Owner (2026-11-15): not everyone has to be on the map at night; Palor does not know them well
enough to know where they live. So the list below needs no action; homes are added only when
the owner asks. Raul (and Doyoon, formerly Hyunjin, who has no profile yet) live in a Budapest hotel while
travelling; Raul's profile says so, Doyoon's note waits for his profile.
Homes the tree does not have (off the map at night, which is fine):
Gábor (flat in Székesfehérvár), Kevin, Kristóf, Krisztián, Matt, Zsolti, Serge, Ricsi (flats in Budapest), Raul (rented
flat, Budapest), Tamás (a town near Budapest), Ádám (Székesfehérvár).
Done on the owner's word (2026-11-15): Jessi lives with Jonas ("Jonas háza - Jessi szobája");
Gyuszi has "Gyuszi háza" in Káloz with "Gyuszi háza - Nappali". Their backgrounds and doors
are ChatGPT orders.
Other places the routines mention that the tree lacks: Albert's, Krisztián's and Valentin's
offices, Jessi's training school, Laci's workplace, the Székesfehérvár university (Ádám),
the Székesfehérvár police station as a place of its own (only "Fogdacella" exists).

## Where we are (read-only check of the live database, 2026-11-15)

- 38 characters already have a weekly routine and act in world rounds.
- 22 have a Szellemprofil but no routine: Albert, Ghor-Ka, Gyuszi, Gábor, Jessi,
  Jocó bácsi, Kazuto, Kevin, Kristóf, Krisztián, Laci, Matt, Raul - Brazil utazó, Ren,
  Ricsi, Serge, Tamás, Valentin, Zsolti, Zsombor, Zzap, Ádám.
  - Zsombor is complete (30 fields) except `weekly_routine`.
  - The other 21 have 14–17 fields (Laci 7) and all lack the same six:
    speech, goals, weekly_routine, habits, fears, conflicts.
    Gábor, Jessi, Kristóf, Ricsi also lack residence; Ghor-Ka and Zzap lack occupation.
  - 17 of them have no relationship at all; only Kevin, Kristóf, Tamás, Ádám know Palor.
  - None has a linked world place, so none can be met in Play yet.
- Second batch (owner, later the same day): Csanád, Dávid, Grix, Doyoon, Gunwoo, Matyi,
  Szilárd, Hajun, Máté, Wonjae, Moon Ihan, Jiwan, Tóni (names as renamed 2026-11-15) got full
  profile proposals too; places for them follow after acceptance, as in step 3.

## Rules this plan keeps

- Everything written is a proposal (`kind: hypothesis`, visibility `creator`, source names
  the method and date). Nothing is accepted without the owner (per character or
  "Mindet elfogadom"). No canon, appearance or picture change.
- No female characters; every new text keeps the character policy (server validation runs).
- DECISIONS 2026-11-09 says "never invent goals, routines". Filling fields the existing text
  does not support needs the owner's go-ahead (decision D1 below).
- No paid call without an estimate and the owner's OK. A catalogue backup before each write batch.
- Private profile text is not sent to a new provider.

## Steps

### 1. Backup and baseline
Catalogue backup (`before-profile-fill-2026-11-xx.sqlite`) and a code checkpoint.

### 2. Fill the six missing fields (22 characters)
- Claude drafts, per character, from what the catalogue already holds: the approved
  Szellemprofil values, older profile text and relationship notes. Same method as the
  29 profiles of 2026-11-10. No pictures are viewed. No paid call.
- `weekly_routine` is written against places that exist in the tree (named exactly), with
  workday/weekend and day parts (reggel, délután, este, éjszaka), so the position rule and
  the place suggester can use it.
- Where nothing in the text supports a field, it stays empty and goes on a list for the
  owner, unless D1 allows a creative draft.
- Delivered through the existing proposal API (`propose`, one proposal per character),
  with a JSON journal in the catalogue folder. The owner reviews and accepts in the app.
- Zsombor: only `weekly_routine`.

### 3. Places (home, work, routine)
- After acceptance: run "Javaslat a profilokból" (now covers these characters).
- Claude matches the remaining residence/occupation/routine text to existing tree places
  and adds them as suggested places (source `suggested`, editable, removable).
- Places that do not exist in the tree are listed, not created (like Dezső's Érd).
  Characters without a home place are absent at night, which is the existing rule.

### 4. Relationships
- 17 characters know nobody. A world round lets them meet strangers, but level changes need
  a known pair, so isolated characters stay flat.
- Claude proposes relationship notes only where the profiles support them: same workplace,
  same home building, shared history named in either text. The owner accepts them.
- Starting levels from the new notes: the existing "propose levels" call (Grok, paid but
  tiny: one batch of ≤ 60 pairs, about USD 0.001). Run only with the owner's OK.

### 5. Into the world
- Accepted goals or routine make a character act automatically (`autonomous()`), no switch.
- Cost: an agent turn is about 3,500 input and 300 output tokens, so about USD 0.001 at the
  world model's prices. 22 more characters × 4 day parts is at most about USD 0.08 a day,
  less with world tiers (distant characters act every other day part). The daily cap
  (USD 1.5) stays. The engine stays in "only while I play" mode.

### 6. Check
- `npm run sandbox` (live-DB copy) with the mock provider: one simulated day; every new
  character has an intention, a position, and can be talked to; no female-policy refusal.
- Play readiness screen: places, home, figures per character.
- One real round on the sandbox only with the owner's OK (cost as above).

## Decisions for the owner

Answered 2026-11-15: D1 (b) drafts for review; D2 list only; D3 text-supported plus
shared-place acquaintances, all as proposals.

- **D1: invented details.** Where the existing text says nothing about goals, routine,
  fears and the rest: (a) leave the field empty and list it, or (b) Claude writes a
  plausible draft marked as a hypothesis for review. (b) lifts the 2026-11-09
  "never invent goals, routines" rule for these drafts only.
- **D2: missing places.** Places named in profiles but absent from the tree: list only, or
  create them in the tree as unplaced proposals.
- **D3: relationships for the isolated 17.** Only text-supported ones, or also proposed
  neighbour/coworker acquaintances from shared places.
