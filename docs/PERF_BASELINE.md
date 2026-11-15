# Performance baseline

Measured 2026-11-14 15:14 UTC with `node ops/perf-baseline.mjs` on AMD Ryzen 7 7730U with Radeon Graphics, Node v26.13.0.
A copy of the live catalogue (characters 80, media 2023, world_events 65, play_lines 126, character_memories 73); 10 warm runs per endpoint after one cold call.
No AI call, no thumbnail or duplicate scan. Re-run after each optimisation step and compare.

## Endpoints

| Endpoint | What | Status | Size | Cold ms | Warm median ms | Warm p95 ms |
|---|---|---|---|---|---|---|
| `/api/state` | App shell: characters, counts | 200 | 115.3 KB | 17.8 | 11.5 | 13.2 |
| `/api/media?offset=0` | Library, first page | 200 | 90.3 KB | 85.5 | 83.6 | 113.4 |
| `/api/media?inbox=1&offset=0` | Rendezésre vár, first page | 200 | 0.0 KB | 8.6 | 6.6 | 7.5 |
| `/api/locations` | Locations | 200 | 69.7 KB | 20.7 | 18.8 | 19.8 |
| `/api/world-review` | Media review list | 200 | 12.8 KB | 256.5 | 11.9 | 13.1 |
| `/api/play` | Play overview (map) | 200 | 83.6 KB | 84.9 | 8.2 | 9.9 |
| `/api/play/place/<current>` | Play place (current) | 200 | 8.1 KB | 16.6 | 14.1 | 16.3 |
| `/api/play/unread` | Play unread check | 200 | 0.0 KB | 1.0 | 0.5 | 0.7 |
| `/api/play/journal` | Play journal | 200 | 41.6 KB | 624.6 | 4.2 | 5.2 |
| `/api/play/relationships` | Play relationships | 200 | 9.6 KB | 107.3 | 4.4 | 6.1 |
| `/api/play/relationship/<id>` | Play relationship detail | 200 | 0.6 KB | 2.1 | 1.4 | 2.1 |
| `/api/world-engine` | World engine page | 200 | 77.6 KB | 9.8 | 7.5 | 8.7 |
| `POST /api/play/travel + GET /api/play` | Play step: travel + GET /api/play (client before C1) | 200 | 89.9 KB | 49.2 | 37.4 | 45.2 |
| `POST /api/play/travel` | Play step: travel only (client after C1) | 200 | 6.3 KB | 25.4 | 22.9 | 29.6 |

## Static files (app/public)

Total 1154 KB raw, 368 KB if gzip-compressed (served uncompressed today).

| File | Raw KB | Gzip KB |
|---|---|---|
| i18n.js | 222.2 | 68.5 |
| play.js | 125.9 | 38.6 |
| style.css | 113.0 | 25.6 |
| client.js | 69.6 | 19.6 |
| location-canvas.js | 40.1 | 13.0 |
| ghost-profile.js | 36.5 | 12.0 |
| world-review.js | 35.6 | 11.6 |
| world-engine.js | 27.2 | 8.1 |
| image-workshop.js | 27.1 | 8.3 |
| enhancements.js | 24.9 | 7.8 |
| play-map.js | 24.5 | 9.0 |
| quick-tag.js | 23.5 | 6.7 |

## 2026-11-14 Play speed (C1–C3)

Warm medians on a backup copy, same PC, before → after (runs vary ±30% on this laptop; a third
run gave 12.0 / 35.0 ms for the first two rows while the PC was busy):

| What | Before | After |
|---|---|---|
| `GET /api/play` (overview) | 18.4 ms (11.9 in an earlier run) | 8.2 ms |
| `GET /api/play/place/<current>` | 23.4 ms (16.1 in an earlier run) | 14.1 ms |
| Play step as the client does it | travel + overview: 36.1 ms, 85 KB | travel only: 22.9 ms, 6.3 KB |

C1: the trip answer carries a small state delta (people's places, clock, items) and the client no
longer reloads the overview after a step. C2: entry-room index built once per tree load. C3:
`positions()` cached until any write, another day part or another cast.
