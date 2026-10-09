# Echoes of Bharat — Game Backend

A small, persistent backend for **Echoes of Bharat**, a 3D historical time-travel game.
It powers player state, NPC memory, quests, era switching, and sourced historical facts —
**no AI API key required**, all game rules are deterministic code.

Built for a solo beginner: plain Node.js + Express + SQLite (zero native dependencies),
modular folders, documented JSON APIs a **Unity C#** client can call over HTTP, plus a
browser **testing dashboard** so you can exercise every feature by hand.

> This repository contains **only the backend**. The 3D game itself lives in Unity.

## Technology stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js ≥ 22.5 | Built-in SQLite module — no native packages to compile |
| Web framework | Express 5 | The project's only dependency; simple, well-documented routing |
| Database | SQLite (`node:sqlite`) | Single file (`data/echoes.db`), persistent, zero setup |
| Frontend (dashboard) | Plain HTML/CSS/JS | No build step; every button calls the same API Unity uses |
| Tests | `node:test` + `fetch` | Built into Node — no test framework to install |

## Quick start

```bash
npm install     # one dependency: express
npm start       # API + dashboard on http://localhost:3000
```

Then open:

| URL | What it is |
|---|---|
| http://localhost:3000/ | Testing dashboard (click through every feature) |
| http://localhost:3000/api/health | Health check |
| [`docs/API.md`](docs/API.md) | Full API reference with example requests/responses |
| [`docs/UNITY.md`](docs/UNITY.md) | How to call these APIs from Unity C# |

## Features

1. **Player state** — id, current era, quest progress, collected clues.
   `GET /api/players/:id` returns everything in one call.
2. **NPC memory** — save what a player *did* and *chose*; retrieve the relevant
   memories per NPC with a deterministic relevance score (importance + query
   matches + era match — no embeddings, no AI).
3. **Quest system** — create, start, step through, and complete quests.
   Seeded with **"The Memory of Stone"** (5 steps, marked as fiction).
   Guard rails return `409` for illegal moves (double-start, completing early…).
4. **Time travel** — switch between **Historical Vijayanagara** and
   **Present-Day Hampi**; every switch is logged with a timestamp and reason.
5. **Historical facts** — statements stored with `source_title` + `source_url`.
   The API strictly separates `verified` facts (source required) from
   `fiction` story content (sources stripped). **No invented citations** —
   the seeded facts come from two authoritative pages (UNESCO, ASI).
6. **Testing dashboard** — test NPC memories, quest progression, era switching,
   and facts manually in the browser, with a request log you can copy into Unity.

## Project structure

```
├── data/                  # SQLite database (created on first run, git-ignored)
├── docs/
│   ├── API.md             # Every endpoint with example requests/responses
│   └── UNITY.md           # Unity C# integration guide
├── public/                # Testing dashboard (static HTML/CSS/JS)
├── scripts/
│   └── reset-db.js        # npm run reset → delete + reseed the database
├── src/
│   ├── app.js             # Express app: middleware + route wiring
│   ├── server.js          # Entry point: `npm start`
│   ├── config.js          # Port, DB path (env-overridable)
│   ├── data/
│   │   └── eras.js        # The two game eras (game configuration)
│   ├── db/
│   │   ├── database.js    # SQLite connection + schema
│   │   └── seed.js        # Seeded NPCs, quest, and sourced facts
│   ├── lib/
│   │   ├── errors.js      # ApiError + error codes (400/404/409/500)
│   │   └── validate.js    # Tiny request validator (collects all issues)
│   ├── middleware/
│   │   └── errorHandler.js# One JSON error shape for the whole API
│   ├── routes/
│   │   └── index.js       # All HTTP routes, grouped by feature
│   └── services/          # The game rules (pure logic, easy to unit test)
│       ├── playerService.js   # players, clues, era switching
│       ├── questService.js    # quest state machine
│       ├── memoryService.js   # NPC memory + relevance scoring
│       └── factService.js     # verified/fiction separation
└── tests/                 # 45 automated tests (node:test + fetch)
```

**Rule of thumb:** routes parse input → services apply game rules → database stores.
Adding a feature = one service function + one route + a test.

## Environment variables

See [`.env.example`](.env.example). All values have safe defaults — the app runs
with zero configuration.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port for the API + dashboard |
| `DB_PATH` | `./data/echoes.db` | SQLite file (`:memory:` = throwaway, used by tests) |
| `LOG_REQUESTS` | `1` | Per-request log lines; set `0` to silence |

No API keys or secrets are required to run this project.

## Database setup & migrations

There is nothing to install or configure: the SQLite database is **created and
seeded automatically** the first time the server (or tests) start. Schema changes
are plain SQL in [`src/db/database.js`](src/db/database.js) (`CREATE TABLE IF
NOT EXISTS` — safe to re-run).

Tables: `players`, `clues`, `quests`, `quest_progress`, `era_switches`,
`npcs`, `memories`, `facts`. Seed data (4 fictional NPCs, "The Memory of Stone"
quest, 8 verified facts + 2 fiction snippets) is inserted idempotently by
[`src/db/seed.js`](src/db/seed.js).

```bash
npm run reset   # delete data/echoes.db and recreate it from scratch
```

The database file is git-ignored (it contains your local play-test state).

## API endpoints (summary)

Full details with example requests and responses: [`docs/API.md`](docs/API.md).

| Method & path | Purpose |
|---|---|
| `GET /api/health` | Health check |
| `GET /api/eras` | The two game eras |
| `POST /api/players` · `GET /api/players/:id` | Create player · full state |
| `POST /api/players/:id/clues` | Collect a clue (once) |
| `POST /api/players/:id/travel` · `GET …/travel-history` | Time travel + log |
| `GET /api/quests` · `POST /api/quests` | List / create quests |
| `POST /api/players/:pid/quests/:qid/start \| advance \| complete` | Quest state machine |
| `GET /api/npcs` | NPC roster |
| `POST /api/npcs/:id/memories` · `GET …/memories` | Record / retrieve NPC memories |
| `GET /api/facts` · `POST /api/facts` | Verified-by-default facts |

Example:

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

## Connecting the backend to Unity (C#)

Unity talks to the API with `UnityWebRequest` and parses JSON with `JsonUtility` —
full copy-paste code (HTTP client, `[Serializable]` models, a complete gameplay
flow, and error handling) is in [`docs/UNITY.md`](docs/UNITY.md). Short version:

```csharp
// Editor / desktop build on the same machine:
public string baseUrl = "http://localhost:3000";

using (var request = UnityWebRequest.Get(baseUrl + "/api/players/arjun"))
{
    yield return request.SendWebRequest();
    var state = JsonUtility.FromJson<PlayerEnvelope>(request.downloadHandler.text);
}
```

Key points: save `player.id` in PlayerPrefs and `GET /api/players/:id` to restore
a session; treat `409` responses as game-state feedback (already in this era,
quest step locked) rather than crashes; use your machine's LAN IP (or
`10.0.2.2` for the Android emulator) when testing on a device.

## Testing

```bash
npm test          # 45 tests against an in-memory database
```

The suite covers the core features end-to-end over real HTTP: player state,
clue uniqueness, the full quest lifecycle (including every 409 guard), era
switching + history, NPC memory ranking, and the verified/fiction split.

Manual testing lives at **http://localhost:3000/** — the *Request log* tab
records every request/response so you can paste them straight into Unity.

## Deterministic rules (no AI key)

| Rule | Behaviour |
|---|---|
| Relevance score | `importance + 5×query-word matches + 2 (same era as NPC)`, ties → newest first |
| Quest transitions | start → advance (capped at last step) → complete only when all steps done |
| Era switch | allowed only to the *other* era; logs `from → to`, reason, timestamp |
| Clues | one per player (`409 CLUE_ALREADY_FOUND` on duplicates) |
| Facts | `verified` requires source title + URL; `fiction` never stores sources |

## Historical facts policy

Seeded verified facts were transcribed from pages fetched from:

- [Group of Monuments at Hampi — UNESCO World Heritage Centre](https://whc.unesco.org/en/list/241/)
- [Hampi (1986), Karnataka — Archaeological Survey of India](https://asi.nic.in/pages/WorldHeritageHampi)

When adding facts (`POST /api/facts`), fetch the source page first and keep the
wording close to the original. Never add a statement you cannot link to a real,
reachable source page. Fictional story content must use `verification: "fiction"`.

## Current limitations

- **No authentication** — anyone who can reach the port can write data. Fine for
  local development; add player tokens before exposing it to the internet.
- **Single server, single file** — SQLite is perfect for development and small
  playtests, but not for many concurrent players (consider Postgres later).
- **No save deletion/update endpoints** — players and progress are append-only
  by design; `npm run reset` clears everything.
- **Timestamps are server-UTC only** — no per-era or in-game clock yet.
- **Facts are added by hand** — there is no bulk import or editorial review flow.

## Future development plans

- Player auth tokens so saves cannot be tampered with or crossed between players.
- NPC dialogue endpoint that blends stored memories + era facts into deterministic
  greeting lines.
- More quests that weave verified facts into their clue steps.
- A hosted deployment (HTTPS) so phones and other machines can connect.
- Migration to PostgreSQL if the player base grows beyond SQLite's comfort zone.

## Exporting to GitHub

Everything repo-ready: `.gitignore` excludes `node_modules/`, `data/*.db*`,
`*.log` and `.env`; there are no secrets and no API keys in the project.
