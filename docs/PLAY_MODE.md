# Play mode v1 — agreed design (2026-11-08)

Owner decisions from the design conversation. Build in small, tested increments.
Project rules in `AGENTS.md` still apply (no invented characters or biographies,
Participant vs Creator knowledge boundary, adults only, no female characters,
no paid calls by default).

## Screens

1. **Map** — the creator's locations as nodes with routes between them.
   Clicking a place shows who is there and the travel time; travelling
   advances the existing story clock. Bottom bar: day/time, Relationships,
   Journal.
2. **Place** — full-screen background = a location-reference photo of that
   place. Characters present appear as photo cards. Action buttons on the
   right: talk to X, look around, move on.
3. **Scene** — full-screen *own photo* chosen by tags (characters + location
   tag, e.g. Attila + Palor + Vonat). Dialogue shown as **comic speech
   bubbles** next to the speaker, positioned from the confirmed p1/p2 of the
   world-review analysis (exact region when present — ~85 pictures — else the
   left/centre/right description). **Fallback:** visual-novel text bar at the
   bottom with the speaker's small face portrait (from approved face
   references) and name; Back / History buttons. Fine-tuning comes later.

Layout ideas came from screenshots of other games; take structure only, never
their art, characters or interface look.

## Routes

- Derived automatically from the location tree (location canvas hierarchy):
  each place connects to its parent; siblings connect through the parent.
- Places not yet in the tree (e.g. Erdő, Tó, Tópart) go to a separate
  "not yet on the map" list — never guessed. They join once placed in the tree.
- The creator can add or remove routes by hand (store manual routes
  separately from derived ones; hierarchy is never itself a travel route).

## Content rules for v1

- **Who is where:** set by the creator (e.g. "Attila: Vonat, mornings"). No
  automatic placement.
- **Dialogue (decided 2026-11-09):** an AI plays the characters live. The player
  types Palor's lines; the character answers in their own voice from profile,
  speech style, memories and relationship (`scenePack`, participant knowledge
  only). Provider: Grok first, swappable adapter (local model later). Paid calls
  only after local configuration, with cost display and a daily cap.
- **Memories (decided 2026-11-09):** saved automatically during play, no
  approval step. Each conversation ends in a save point; **rewind** restores
  memories, relationships, clock and positions to a save point via compensating
  revisions (undoable). See DECISIONS.md 2026-11-09.
- **Autonomous world (decided 2026-11-09):** Concordia-style game master +
  character agents, built in Node. 1:1 clock with dramatic compression and a
  quiet/eventful pacing rhythm; off-screen summaries, catch-up after the app
  was closed, "Mi történt, amíg távol voltál" digest. Only characters with a
  Szellemprofil act on their own. Off by default, daily cost cap. Relationship
  closeness levels per pair, starting levels confirmed once by the owner.
  See DECISIONS.md 2026-11-09.
- **Groups** (`character_groups`: Hajléktalanok, Kamionosok, Random
  generáltak, Robin Morningwood, Vonatos fiatal srácok) appear as background
  crowds, not as people you hold a conversation with.
- **No stats** (health, libido, money, inventory) in v1.
- Characters in a picture = participants with a confirmed character, numbered
  1, 2… in their original order. People left unpicked in Gyors címkézés are
  marked "not_character" (background figures) and never get speech bubbles.
- Pictures tagged **Kollázs** (group "Kép típusa") are never used as scenes;
  they remain in galleries and can be cropped for references.
- Pictures: location tags (each location has a matching structured tag) say
  where a picture happens; confirmed p1/p2 identities say who is where in it.

## Prerequisites already built

- Gyors címkézés screen (identity p1/p2 confirmation + ⌖ location tagging).
- Group records (`character_groups`, migration 026).
- Hungarian UI via `app/public/i18n.js`.

## Status 2026-11-10

Built: full-screen Play (map → town → place scene), VN figures, photo scenes with bubbles, phone, journal, relationships with history and invitations, rewind, intimacy protocol, image protocol (docs/IMAGE_PROTOCOL.md), world engine with tempo and run log. See DECISIONS.md 2026-11-09/10.

