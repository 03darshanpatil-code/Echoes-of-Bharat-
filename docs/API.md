# API Reference

Base URL: `http://localhost:3000/api`

- All requests and responses are **JSON** (`Content-Type: application/json`).
- Timestamps are ISO-8601 UTC (`2026-10-09T19:05:42.025Z`).
- Every error uses one shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [{ "field": "name", "issue": "is required" }]
  }
}
```

| HTTP status | `code` | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Bad input — `details` lists every problem |
| 400 | `INVALID_JSON` | Body is not valid JSON |
| 404 | `NOT_FOUND` | Player / quest / NPC / fact does not exist |
| 409 | `PLAYER_EXISTS`, `QUEST_EXISTS` | Id already taken |
| 409 | `CLUE_ALREADY_FOUND` | Clue already collected by this player |
| 409 | `ALREADY_IN_ERA` | Player is already in the target era |
| 409 | `QUEST_ALREADY_STARTED`, `QUEST_NOT_STARTED` | Illegal start/advance |
| 409 | `QUEST_STEPS_REMAINING` | Completing before all steps are done |
| 409 | `QUEST_ALREADY_COMPLETED` | Quest is finished — progress locked |
| 500 | `INTERNAL_ERROR` | Unexpected server bug (never leaks details) |

Ids for players/quests: `a–z`, `0–9`, `_`, `-` (3–64 chars). Omit the id and the
server generates one (`p_…` / `q_…`).

---

## Health & eras

### `GET /api/health`

```bash
curl http://localhost:3000/api/health
```

```json
{
  "status": "ok",
  "time": "2026-10-09T19:05:30.487Z",
  "era_config": ["present_hampi", "historical_vijayanagara"]
}
```

### `GET /api/eras`

```json
{
  "eras": [
    {
      "id": "present_hampi",
      "name": "Present-Day Hampi",
      "description": "The ruins as they stand today: boulder fields, broken temples, and tourists. Starting era for new players."
    },
    {
      "id": "historical_vijayanagara",
      "name": "Historical Vijayanagara",
      "description": "The Vijayanagara capital as a living city — the era the player travels back to. All characters here are fictional."
    }
  ]
}
```

---

## Players & player state

### `POST /api/players`

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string ≤ 80 | yes | Display name |
| `id` | string (id format) | no | Server generates if omitted |
| `era` | era id | no | Default `present_hampi` |

```bash
curl -X POST http://localhost:3000/api/players \
  -H 'Content-Type: application/json' \
  -d '{"name": "Arjun", "id": "arjun"}'
```

```json
{
  "player": {
    "id": "arjun",
    "name": "Arjun",
    "current_era": "present_hampi",
    "created_at": "2026-10-09T19:05:42.025Z",
    "updated_at": "2026-10-09T19:05:42.025Z"
  }
}
```

Errors: `400` invalid name/era · `409 PLAYER_EXISTS` duplicate id.

### `GET /api/players/:playerId` — full state (save-game in one call)

```bash
curl http://localhost:3000/api/players/arjun
```

```json
{
  "player": {
    "id": "arjun",
    "name": "Arjun",
    "current_era": "historical_vijayanagara",
    "created_at": "2026-10-09T19:05:42.025Z",
    "updated_at": "2026-10-09T19:05:43.624Z",
    "clues": [
      {
        "clue_key": "stele-fragment",
        "label": "A carved fragment of the stele",
        "from_era": "historical_vijayanagara",
        "created_at": "2026-10-09T19:05:43.624Z"
      }
    ],
    "quests": [
      {
        "quest_id": "memory_of_stone",
        "title": "The Memory of Stone",
        "status": "completed",
        "current_step": 5,
        "started_at": "2026-10-09T19:05:42.467Z",
        "completed_at": "2026-10-09T19:05:43.289Z",
        "total_steps": 5,
        "steps": [
          "Examine the weathered inscription among the ruins",
          "Ask Meera about the broken stone marker",
          "Travel to Historical Vijayanagara",
          "Speak with Aruna the Stonecutter",
          "Return to Present-Day Hampi with the memory"
        ]
      }
    ],
    "last_era_switch": {
      "id": 1,
      "player_id": "arjun",
      "from_era": "present_hampi",
      "to_era": "historical_vijayanagara",
      "switched_at": "2026-10-09T19:05:42.238Z",
      "reason": "quest start"
    },
    "memory_count": 1
  }
}
```

`GET /api/players` lists all players (array of player rows).

### `POST /api/players/:playerId/clues` — collect a clue

| Field | Type | Required |
|---|---|---|
| `clue_key` | string ≤ 60 | yes (unique per player) |
| `label` | string ≤ 200 | yes |
| `from_era` | era id | no |

```bash
curl -X POST http://localhost:3000/api/players/arjun/clues \
  -H 'Content-Type: application/json' \
  -d '{"clue_key": "stele-fragment", "label": "A carved fragment of the stele", "from_era": "historical_vijayanagara"}'
```

```json
{
  "clue": {
    "clue_key": "stele-fragment",
    "label": "A carved fragment of the stele",
    "from_era": "historical_vijayanagara",
    "created_at": "2026-10-09T19:05:43.624Z"
  }
}
```

Second identical call → `409 CLUE_ALREADY_FOUND`.

---

## Time travel (era switching)

### `POST /api/players/:playerId/travel`

| Field | Type | Required |
|---|---|---|
| `to_era` | era id | yes |
| `reason` | string ≤ 200 | no (stored in history) |

```bash
curl -X POST http://localhost:3000/api/players/arjun/travel \
  -H 'Content-Type: application/json' \
  -d '{"to_era": "historical_vijayanagara", "reason": "quest start"}'
```

```json
{
  "player": {
    "id": "arjun",
    "name": "Arjun",
    "current_era": "historical_vijayanagara",
    "created_at": "2026-10-09T19:05:42.025Z",
    "updated_at": "2026-10-09T19:05:42.239Z"
  }
}
```

Errors: `400` unknown era · `409 ALREADY_IN_ERA` (already there) · `404` unknown player.

### `GET /api/players/:playerId/travel-history`

```json
{
  "history": [
    {
      "id": 1,
      "player_id": "arjun",
      "from_era": "present_hampi",
      "to_era": "historical_vijayanagara",
      "switched_at": "2026-10-09T19:05:42.238Z",
      "reason": "quest start"
    }
  ]
}
```

---

## Quests

Seeded quest **“The Memory of Stone”** (`memory_of_stone`, 5 steps, `content_type: "fiction"`).

### `GET /api/quests` / `GET /api/quests/:questId`

```json
{
  "quests": [
    {
      "id": "memory_of_stone",
      "title": "The Memory of Stone",
      "description": "A broken inscription in present-day Hampi remembers a story nobody wrote down. Follow it back to the living city and return with the full memory.",
      "content_type": "fiction",
      "steps_json": "[\"Examine the weathered inscription among the ruins\", …]",
      "created_at": "2026-10-09T19:05:01.819Z",
      "steps": ["Examine the weathered inscription among the ruins", "…", "…", "…", "…"]
    }
  ]
}
```

### `POST /api/quests` — create a quest

| Field | Type | Required |
|---|---|---|
| `title` | string ≤ 120 | yes |
| `steps` | non-empty array of strings | yes |
| `id` | id format | no |
| `description` | string ≤ 500 | no |

```bash
curl -X POST http://localhost:3000/api/quests \
  -H 'Content-Type: application/json' \
  -d '{"id": "river_echo", "title": "The River\'s Echo", "steps": ["Find the ferry", "Cross at dusk"]}'
```

```json
{
  "quest": {
    "id": "river_echo",
    "title": "The River's Echo",
    "description": "",
    "content_type": "fiction",
    "steps_json": "[\"Find the ferry\",\"Cross at dusk\"]",
    "created_at": "2026-10-09T19:20:00.000Z",
    "steps": ["Find the ferry", "Cross at dusk"]
  }
}
```

Quests are **story content**: always stored as `content_type: "fiction"`.

### Quest progression (state machine)

```
(not started) --start--> in_progress(step 0)
in_progress  --advance--> in_progress(step+1, capped at last step)
in_progress  --complete--> completed   (only if every step is done)
completed    --advance/complete--> 409 QUEST_ALREADY_COMPLETED
```

**`POST /api/players/:playerId/quests/:questId/start`**

```bash
curl -X POST http://localhost:3000/api/players/arjun/quests/memory_of_stone/start -d '{}' -H 'Content-Type: application/json'
```

```json
{
  "progress": {
    "id": 1,
    "player_id": "arjun",
    "quest_id": "memory_of_stone",
    "status": "in_progress",
    "current_step": 0,
    "started_at": "2026-10-09T19:05:42.467Z",
    "completed_at": null
  }
}
```

**`POST …/advance`** — optional body `{"step": N}` jumps to an explicit step
(valid `0…steps.length`); without it, advances by +1 (capped at the end).

```json
{ "progress": { "id": 1, "current_step": 1, "status": "in_progress", "…": "…" } }
```

**`POST …/complete`** — succeeds only when `current_step == total steps`:

```json
{
  "progress": {
    "id": 1,
    "player_id": "arjun",
    "quest_id": "memory_of_stone",
    "status": "completed",
    "current_step": 5,
    "started_at": "2026-10-09T19:05:42.467Z",
    "completed_at": "2026-10-09T19:05:43.289Z"
  }
}
```

Too early → `409 QUEST_STEPS_REMAINING`:

```json
{
  "error": {
    "code": "QUEST_STEPS_REMAINING",
    "message": "Finish all steps first — 3 remaining",
    "details": [{ "field": "current_step", "issue": "is 2, total is 5" }]
  }
}
```

**`GET /api/players/:playerId/quests`** — every started quest's progress.

---

## NPC memory

NPCs are **fictional characters** (`content_type: "fiction"`):

```json
{
  "npcs": [
    { "id": "aruna_stonecutter", "name": "Aruna the Stonecutter", "era": "historical_vijayanagara", "role": "Royal-quarter stonecutter who carves inscriptions", "content_type": "fiction" },
    { "id": "leela_ferrywoman", "…": "…" },
    { "id": "meera_guide", "…": "…" },
    { "id": "kabir_tea_seller", "…": "…" }
  ]
}
```

### `POST /api/npcs/:npcId/memories` — record what the player did

| Field | Type | Required | Notes |
|---|---|---|---|
| `player_id` | string | yes | must exist |
| `action` | string ≤ 300 | yes | what the player did |
| `choice` | string ≤ 300 | no | what the player chose |
| `era` | era id | no | defaults to the NPC's era |
| `importance` | 1–5 | no | default 1 |

```bash
curl -X POST http://localhost:3000/api/npcs/aruna_stonecutter/memories \
  -H 'Content-Type: application/json' \
  -d '{"player_id": "arjun", "action": "touched the stele gently", "choice": "asked about the inscription", "importance": 4, "era": "historical_vijayanagara"}'
```

```json
{
  "memory": {
    "id": 1,
    "npc_id": "aruna_stonecutter",
    "player_id": "arjun",
    "action": "touched the stele gently",
    "choice": "asked about the inscription",
    "era": "historical_vijayanagara",
    "importance": 4,
    "created_at": "2026-10-09T19:05:43.403Z"
  }
}
```

### `GET /api/npcs/:npcId/memories` — retrieve the relevant ones

Query params: `player_id` (recommended), `query` (words to rank against),
`era`, `limit` (1–100, default 20).

**Relevance is deterministic — no AI:**

```
score = importance (1–5)
      + 5 × (query words found in action/choice)
      + 2 if the memory's era == the NPC's era
ties   → newer memory first
```

```bash
curl "http://localhost:3000/api/npcs/aruna_stonecutter/memories?player_id=arjun&query=inscription"
```

```json
{
  "npc": { "id": "aruna_stonecutter", "name": "Aruna the Stonecutter", "era": "historical_vijayanagara" },
  "total": 1,
  "query": "inscription",
  "memories": [
    {
      "id": 1,
      "npc_id": "aruna_stonecutter",
      "player_id": "arjun",
      "action": "touched the stele gently",
      "choice": "asked about the inscription",
      "era": "historical_vijayanagara",
      "importance": 4,
      "created_at": "2026-10-09T19:05:43.403Z",
      "score": 11
    }
  ]
}
```

`GET /api/players/:playerId/memories` returns everything a player triggered
across all NPCs (debug view, newest first).

---

## Historical facts

Verified facts always carry a source; fiction never does.

### `GET /api/facts`

Query params: `verification` = `verified` *(default)* | `fiction` | `all`,
`era` = `historical_vijayanagara` | `present_hampi` | `both`.

```bash
curl "http://localhost:3000/api/facts"
```

```json
{
  "verification": "verified",
  "summary": { "verified": 8, "fiction": 2 },
  "facts": [
    {
      "id": 1,
      "statement": "Hampi was the last capital of the last great Hindu Kingdom of Vijayanagar.",
      "era": "historical_vijayanagara",
      "verification": "verified",
      "source_title": "Group of Monuments at Hampi — UNESCO World Heritage Centre",
      "source_url": "https://whc.unesco.org/en/list/241/",
      "created_at": "2026-10-09T19:05:01.819Z"
    }
  ]
}
```

### `POST /api/facts`

| Field | Type | Required |
|---|---|---|
| `statement` | string ≤ 500 | yes |
| `era` | `historical_vijayanagara` \| `present_hampi` \| `both` | yes |
| `verification` | `verified` \| `fiction` | yes |
| `source_title` | string ≤ 200 | **yes when verified** |
| `source_url` | http(s) URL | **yes when verified** |

```bash
curl -X POST http://localhost:3000/api/facts \
  -H 'Content-Type: application/json' \
  -d '{
    "statement": "Hampi is situated on the southern bank of the river Tungabhadra.",
    "era": "both",
    "verification": "verified",
    "source_title": "Hampi (1986), Karnataka — Archaeological Survey of India",
    "source_url": "https://asi.nic.in/pages/WorldHeritageHampi"
  }'
```

Rules enforced server-side:

- `verified` without both source fields → `400` (details list `source_title`, `source_url`).
- `fiction` with source fields → they are **stripped**, stored as `NULL`.
- Bad URL (not http/https) → `400` on `source_url`.

---

## Testing with curl (cheat sheet)

```bash
B=http://localhost:3000/api
J='Content-Type: application/json'

curl -s $B/health
curl -s -X POST $B/players -H "$J" -d '{"name":"Arjun","id":"arjun"}'
curl -s $B/players/arjun
curl -s -X POST $B/players/arjun/travel -H "$J" -d '{"to_era":"historical_vijayanagara","reason":"quest start"}'
curl -s -X POST $B/players/arjun/quests/memory_of_stone/start -H "$J" -d '{}'
curl -s -X POST $B/players/arjun/quests/memory_of_stone/advance -H "$J" -d '{}'
curl -s -X POST $B/players/arjun/quests/memory_of_stone/complete -H "$J" -d '{}'   # 409 until all steps done
curl -s -X POST $B/npcs/aruna_stonecutter/memories -H "$J" -d '{"player_id":"arjun","action":"touched the stele","importance":4}'
curl -s "$B/npcs/aruna_stonecutter/memories?player_id=arjun&query=stele"
curl -s "$B/facts?verification=all"
```
