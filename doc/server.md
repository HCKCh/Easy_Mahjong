# Game server (`online-server.mjs`, `persistence.mjs`)

One Node.js process serves static files, the WebSocket endpoint and the game logic. It needs no npm packages at runtime: the WebSocket handshake and framing (`wsAccept`, `parseFrames`, `sendFrame`) and the Redis protocol (`persistence.mjs`) are written on top of `node:http`, `node:net` and `node:crypto`.

## HTTP endpoints

| Path | Purpose |
| --- | --- |
| `/` and static files | Serves the project directory (`index.html`, `online.html`, `dist/…`, `online.css`…) with `Cache-Control: no-store` |
| `/ws` | WebSocket upgrade. If `ALLOWED_ORIGINS` is set, other origins get a 403. |
| `/healthz` | `{"ok":true,"stage":…,"rooms":N,"persistence":"redis"}`, used by the Docker health check |
| `/api/leaderboard` | `{"matches":[…]}` with the last 10 finished or abandoned matches |

## Wire protocol

The message types are in `src/online/protocol.ts`. Every message is one JSON object per WebSocket text frame.

**Client → server**

| Message | When |
| --- | --- |
| `HELLO {clientId, name}` | First message on every connection. If the client is already in a room, it is reattached to its seat. |
| `CREATE_ROOM {name, settings:{aiCount, base, perTai, ronMode, reactionSeconds}}` | Opens a room. The creator sits in seat 1, and `aiCount` (0–3) AI players take the next seats. |
| `JOIN_ROOM {code, name}` | Takes the first empty seat. If there is none, it replaces an AI. |
| `SET_NAME {name}` | Renames the player at any time, including during a game. |
| `SET_AVATAR {avatar}` | Picks avatar 0–7. Rejected if another seat in the room already uses it. `CREATE_ROOM` and `JOIN_ROOM` also take a preferred `avatar`; if it is taken, the first free one is given instead. AI players get the remaining avatars. |
| `SET_READY`, `FILL_BOTS`, `START_GAME` | Lobby actions. Only the host can fill seats with AI or start the game. |
| `PICK_WIND {index}` | Flips one of the four face-down wind tiles during the seat draw. |
| `ACTION {action: DISCARD / DECLARE_READY / SELF_DRAW / CONCEALED_KONG / ADDED_KONG, tileId}` | Moves on your own turn |
| `ACTION {action: REACTION, optionIndex}` / `ACTION {action: PASS}` | Answers a call prompt (chow, pong, kong or win) |
| `NEXT_HAND`, `LEAVE_ROOM`, `PING` | Starts the next hand (host only), leaves the room, or keeps the connection alive |

**Server → client**: `WELCOME {clientId}`, `SNAPSHOT {snapshot}`, `ERROR {message}`, `LEFT`, `PONG`.

### Snapshots

The server never sends a delta. After every change it sends each player a complete `RoomSnapshot` built for that viewer by `snapshot(room, clientId)`:

- **Room**: status, code, host and settings.
- **Players**: for each seat, the name, kind (human or AI), connection status, whether they declared ready, their exposed melds, flowers and discards, and the *number* of concealed tiles. Only the viewer's own snapshot includes their concealed tiles.
- **Game**: the phase, whose turn it is, the dealer, the number of tiles left in the wall and dead wall, and the totals.
- **Your options**: the viewer's current call prompt with its deadline, and the self-draw and kong moves available to them.
- **Settlement**: the settlement of the last hand, once it ends.
- **Seat draw**: the seat-draw state, while it is running.

## Room lifecycle

### Lobby

- Seats are numbered 1–4 in join order (`east`, `south`, `west`, `north` are only internal slot names at this point).
- The host can fill empty seats with AI.
- `START_GAME` needs four occupied seats, and every human except the host must be ready.

### Seat draw (`status: 'wind'`)

`beginWindDraw` shuffles four wind tiles face down. Then:

1. Players flip a tile **one at a time in join order** (seat 1, 2, 3, 4). The server rejects a pick from anyone whose turn it is not.
2. AI players pick automatically after `BOT_DELAY_MS + 300` ms. A human has 15 seconds; if the time runs out, the server picks a random remaining tile for them.
3. When all four tiles are flipped, the result is shown for 2.5 seconds. `finishWindDraw` then moves each player to the seat of the wind they drew (East becomes the first dealer), renames AI players after their new seats, creates the match and deals.

The seat-draw timers are not saved. If the server restarts during a draw, the room goes back to the lobby. A seat draw also runs at the start of every new match.

### Playing

`advance(room)` is the server's single game loop. Each call schedules at most one step with `setTimeout`:

- **`awaiting_draw`**: draws a tile for the player whose turn it is.
- **`awaiting_discard`**:
  - **AI**: `botOwnTurn` self-draws if possible, otherwise declares a kong if it has one, otherwise discards using `chooseDiscard`.
  - **Human who declared ready**: the drawn tile is discarded automatically (`autoPlays`). If the drawn tile completes the hand, the server waits so the player can choose to win.
  - **Any other human**: the server waits for their action.
- **`awaiting_reactions` / `awaiting_kong_reactions`**: `beginReactionWindow` collects the AI decisions immediately and starts a `reactionSeconds` timer for humans who have a legal call. `settlePending` resolves the window when every answer is in or the timer expires.

AI steps use `BOT_DELAY_MS` so players can follow the game; human steps use `HUMAN_DELAY_MS`.

### Hand end and match end

- `settleIfEnded` scores the hand (`settleCurrentHand`), applies the payments to `room.totals` and sets `status: 'ended'`. The host starts the next hand with `NEXT_HAND`.
- When the match itself is over (after South 4), `recordResult` writes it to the leaderboard. The next `NEXT_HAND` starts a fresh match, beginning with a new seat draw.

### Leaving and cleanup

- **Leaving**: a human who leaves the lobby frees the seat. A human who leaves mid-game is replaced by an AI, so the game continues. When the last human leaves, the room is deleted; if a match was in progress, it is recorded as unfinished.
- **Idle rooms**: `cleanupRooms` runs every minute. It closes rooms idle for `ROOM_IDLE_SECONDS` and tells connected players why. Rooms with nobody connected are deleted after `ROOM_TTL_SECONDS`.
- **Watchdog**: every 2 seconds it looks for a game where the server is supposed to act but nothing has happened for `STALL_MS`. It logs the room and the last 20 AI actions, then calls `advance` again.

## AI (`src/web/bot.ts`, `src/web/aiMath.ts`)

- `shantenOf` runs a depth-first search over the 34 tile types. It counts complete melds, partial melds and a pair to estimate how far the hand is from ready.
- `effectiveTiles` lists every tile type that would lower the shanten number and counts how many copies are still unseen.
- **`chooseDiscard`** keeps the hand with the lowest shanten and the most useful tiles. On a tie, it prefers to throw isolated honors, terminals and tiles already visible on the table.
- **`chooseReaction`** always wins when it can. It claims a chow or pong only if the hand gets closer to ready, or stays as close with at least 2 more useful tiles. It claims a kong if that does not make the hand worse.

The server logs every AI action (`[ai] ROOM seat action …`, unless `AI_LOG=0`) and keeps the last 300 per room for stall reports.

## Persistence (`persistence.mjs`)

- `createPersistence({driver})` returns a `FileStore` or a `RedisStore`. Both have the same interface: `save`, `remove`, `loadAll`, `loadResults` and `pushResult`.
- **File**: each room is saved to `data/rooms/<CODE>.json` by writing a temporary file and renaming it. The leaderboard is `data/results.json`.
- **Redis**: each room is saved as `SET mj:room:<CODE> … EX ttl`. Rooms are restored at startup with `SCAN`. The leaderboard is a capped list (`LPUSH` + `LTRIM` on `mj:results`).
- `schedulePersist` debounces saves to one every 40 ms per room. Every `broadcast` also triggers a save, so the stored state matches what players have seen.
