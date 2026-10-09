# Connecting Unity C# to this Backend

The API is plain HTTP + JSON, so Unity talks to it with **UnityWebRequest** and
parses responses with **JsonUtility** (built into Unity — no packages needed).

```
┌──────────────┐   HTTP/JSON    ┌─────────────────────┐   SQLite
│  Unity C#    │ ─────────────► │  Express backend    │ ◄──── data/echoes.db
│ (game client)│ ◄───────────── │  localhost:3000/api │
└──────────────┘   responses    └─────────────────────┘
```

---

## 1. Run the backend

```bash
npm start        # http://localhost:3000
```

Open http://localhost:3000/ (testing dashboard) — the **Request log** tab shows
every request/response so you can copy exact JSON into Unity while debugging.

**Which address do I use?**

| Where Unity runs | `baseUrl` |
|---|---|
| Unity Editor / desktop build on the same machine | `http://localhost:3000` |
| Android emulator | `http://10.0.2.2:3000` |
| Real device on the same Wi-Fi | `http://<your-LAN-IP>:3000` (e.g. `http://192.168.1.20:3000`) |

Notes:
- **CORS does not apply** — Unity is not a browser.
- Android blocks plain `http` unless you add
  `android:usesCleartextTraffic="true"` to `AndroidManifest.xml`.
- iOS App Transport Security likewise blocks `http` — prefer `https` for release builds.

---

## 2. Data classes (JsonUtility)

`JsonUtility` matches **exact field names**, so keep the snake_case names from
the API. Also: JsonUtility cannot parse a *top-level array* — that is why every
list in this API is wrapped in an object (`{ "players": [...] }`, `{ "facts": [...] }`).

```csharp
using System;

[Serializable] public class PlayerEnvelope   { public PlayerState player; }

[Serializable] public class PlayerState
{
    public string id;
    public string name;
    public string current_era;
    public string created_at;
    public string updated_at;
    public Clue[] clues;
    public QuestProgress[] quests;
    public EraSwitch last_era_switch;
    public int memory_count;
}

[Serializable] public class Clue
{
    public string clue_key;
    public string label;
    public string from_era;
    public string created_at;
}

[Serializable] public class QuestProgress
{
    public string quest_id;
    public string title;
    public string status;          // "in_progress" | "completed"
    public int current_step;
    public int total_steps;
    public string started_at;
    public string completed_at;
    public string[] steps;
}

[Serializable] public class EraSwitch
{
    public int id;
    public string from_era;
    public string to_era;
    public string switched_at;
    public string reason;
}

[Serializable] public class ProgressEnvelope  { public QuestRow progress; }

[Serializable] public class QuestRow          // raw progress row from the API
{
    public int id;
    public string player_id;
    public string quest_id;
    public string status;
    public int current_step;
    public string started_at;
    public string completed_at;
}

[Serializable] public class MemoriesEnvelope
{
    public NpcInfo npc;
    public int total;
    public string query;
    public MemoryItem[] memories;
}

[Serializable] public class NpcInfo   { public string id; public string name; public string era; }

[Serializable] public class MemoryItem
{
    public int id;
    public string npc_id;
    public string player_id;
    public string action;
    public string choice;
    public string era;
    public int importance;
    public string created_at;
    public int score;
}

[Serializable] public class CreatePlayerRequest { public string name; public string id; }

[Serializable] public class TravelRequest  { public string to_era; public string reason; }

[Serializable] public class MemoryRequest
{
    public string player_id;
    public string action;
    public string choice;
    public int importance;
    public string era;
}

// Standard error envelope: { "error": { "code", "message", "details" } }
[Serializable] public class ErrorEnvelope  { public ApiError error; }
[Serializable] public class ApiError       { public string code; public string message; }
```

---

## 3. Reusable HTTP client (single MonoBehaviour)

Create `ApiClient.cs`, attach it to an empty GameObject in your first scene:

```csharp
using System;
using System.Collections;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

public class ApiClient : MonoBehaviour
{
    public static ApiClient Instance { get; private set; }

    // Same machine: localhost. Device on Wi-Fi: http://192.168.x.x:3000
    public string baseUrl = "http://localhost:3000";

    void Awake()
    {
        if (Instance != null) { Destroy(gameObject); return; }
        Instance = this;
        DontDestroyOnLoad(gameObject);
    }

    // ---------- low-level helpers (coroutines) ----------
    public IEnumerator Get(string path, Action<string> onOk, Action<string> onErr)
        => Send(UnityWebRequest.Get(baseUrl + path), onOk, onErr);

    public IEnumerator Post(string path, string json, Action<string> onOk, Action<string> onErr)
    {
        var request = new UnityWebRequest(baseUrl + path, "POST");
        request.uploadHandler   = new UploadHandlerRaw(Encoding.UTF8.GetBytes(json ?? "{}"));
        request.downloadHandler = new DownloadHandlerBuffer();
        request.SetRequestHeader("Content-Type", "application/json");
        return Send(request, onOk, onErr);
    }

    IEnumerator Send(UnityWebRequest request, Action<string> onOk, Action<string> onErr)
    {
        yield return request.SendWebRequest();

        if (request.result == UnityWebRequest.Result.Success)
        {
            onOk?.Invoke(request.downloadHandler.text);
        }
        else
        {
            // The backend always answers with { "error": { "code", "message" } }.
            string body = request.downloadHandler?.text;
            string message = null;
            if (!string.IsNullOrEmpty(body))
            {
                try { message = JsonUtility.FromJson<ErrorEnvelope>(body)?.error?.message; }
                catch { /* fall through */ }
            }
            onErr?.Invoke(message ?? $"HTTP {request.responseCode}: {request.error}");
        }
        request.Dispose();
    }
}
```

---

## 4. Typed API calls

```csharp
using System;
using UnityEngine;

public static class GameApi
{
    static IEnumerator Call(string method, string path, string json,
                            Action<string> onOk, Action<string> onErr)
        => method == "GET"
            ? ApiClient.Instance.Get(path, onOk, onErr)
            : ApiClient.Instance.Post(path, json, onOk, onErr);

    public static IEnumerator CreatePlayer(string name, Action<PlayerState> onOk, Action<string> onErr)
    {
        var body = JsonUtility.ToJson(new CreatePlayerRequest { name = name });
        yield return Call("POST", "/api/players", body,
            raw => onOk(JsonUtility.FromJson<PlayerEnvelope>(raw).player), onErr);
    }

    public static IEnumerator GetPlayer(string id, Action<PlayerState> onOk, Action<string> onErr)
        => Call("GET", $"/api/players/{id}", null,
            raw => onOk(JsonUtility.FromJson<PlayerEnvelope>(raw).player), onErr);

    public static IEnumerator Travel(string playerId, string toEra, Action<PlayerState> onOk, Action<string> onErr)
    {
        var body = JsonUtility.ToJson(new TravelRequest { to_era = toEra });
        yield return Call("POST", $"/api/players/{playerId}/travel", body,
            raw => onOk(JsonUtility.FromJson<PlayerEnvelope>(raw).player), onErr);
    }

    public static IEnumerator StartQuest(string playerId, string questId,
                                         Action<QuestRow> onOk, Action<string> onErr)
        => Call("POST", $"/api/players/{playerId}/quests/{questId}/start", "{}",
            raw => onOk(JsonUtility.FromJson<ProgressEnvelope>(raw).progress), onErr);

    public static IEnumerator AdvanceQuest(string playerId, string questId,
                                           Action<QuestRow> onOk, Action<string> onErr)
        => Call("POST", $"/api/players/{playerId}/quests/{questId}/advance", "{}",
            raw => onOk(JsonUtility.FromJson<ProgressEnvelope>(raw).progress), onErr);

    public static IEnumerator Remember(string npcId, MemoryRequest memory,
                                       Action<MemoryItem> onOk, Action<string> onErr)
    {
        yield return Call("POST", $"/api/npcs/{npcId}/memories", JsonUtility.ToJson(memory),
            raw => onOk(JsonUtility.FromJson<MemoryEnvelope>(raw).memory), onErr);
    }
}

[Serializable] public class MemoryEnvelope { public MemoryItem memory; }
```

---

## 5. Playing a full turn (example MonoBehaviour)

```csharp
using System.Collections;
using UnityEngine;

public class GameFlow : MonoBehaviour
{
    PlayerState player;
    const string QuestId = "memory_of_stone";

    IEnumerator Start()
    {
        // 1. Create (or on later sessions: fetch) the player
        yield return GameApi.CreatePlayer("Arjun", p => player = p, LogErr);

        // 2. Full save-game state → clues, quests, era, memories count
        yield return GameApi.GetPlayer(player.id, p => player = p, LogErr);
        Debug.Log($"era={player.current_era}, clues={player.clues.Length}");

        // 3. Start "The Memory of Stone"
        yield return GameApi.StartQuest(player.id, QuestId,
            pr => Debug.Log($"quest {pr.status} step {pr.current_step}"), LogErr);

        // 4. Time travel to historical Vijayanagara
        yield return GameApi.Travel(player.id, "historical_vijayanagara",
            p => Debug.Log($"now in {p.current_era}"), LogErr);

        // 5. NPC remembers the player's action
        yield return GameApi.Remember("aruna_stonecutter", new MemoryRequest
        {
            player_id = player.id,
            action = "touched the stele gently",
            choice = "asked about the inscription",
            importance = 4,
            era = "historical_vijayanagara",
        }, m => Debug.Log($"Aruna remembers: {m.action} (importance {m.importance})"), LogErr);

        // 6. Advance the quest step by step, then complete
        for (int i = 0; i < 5; i++)
            yield return GameApi.AdvanceQuest(player.id, QuestId, _ => { }, LogErr);

        // …and so on.
    }

    void LogErr(string message) => Debug.LogError($"API error: {message}");
}
```

---

## 6. Handling the guard-rail errors (409s)

The backend rejects illegal moves deterministically. Branch on `error.code`
instead of message text:

```csharp
void HandleError(string json)
{
    var err = JsonUtility.FromJson<ErrorEnvelope>(json)?.error;
    switch (err?.code)
    {
        case "ALREADY_IN_ERA":        Debug.Log("Already in this era."); break;
        case "QUEST_ALREADY_STARTED": Debug.Log("Quest already running."); break;
        case "QUEST_STEPS_REMAINING":
            Debug.Log($"Finish the remaining steps first: {err.message}");
            break;
        case "CLUE_ALREADY_FOUND":    Debug.Log("Clue already in the inventory."); break;
        default:                      Debug.LogError(err?.message ?? "Unknown error"); break;
    }
}
```

(To use this, keep the raw response in a variant of the client callbacks — the
`ApiClient.Send` above already extracts just the message.)

---

## 7. Checklist before you ship

- [ ] `baseUrl` matches where the server runs (Editor vs. device).
- [ ] Android manifest allows cleartext HTTP (dev only — use HTTPS for release).
- [ ] Save `player.id` between sessions (PlayerPrefs) and `GET /api/players/:id`
      to restore state — the backend is the source of truth, not the device.
- [ ] Treat 409 responses as *game-state feedback*, not crashes.
- [ ] Show `facts` with their `source_title` / `source_url` in-game so players
      can see what is history and what is story (`verification: "fiction"`).
