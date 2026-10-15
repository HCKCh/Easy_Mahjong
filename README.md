# 東西南北麻將托兒所 · Four Winds Mahjong Nursery

**東西南北麻將托兒所** (Four Winds Mahjong Nursery) is a mobile-first, browser-based **Taiwanese 16-tile mahjong** game. Open a table, choose how many AI players you want (0–3), and invite friends with a room code, a LINE message or a QR code. AI players fill any empty seat.

The server is authoritative: it shuffles, deals and validates every move. The browser only renders the table and sends actions. Players who disconnect are reconnected to their own seat automatically.

## Features

- **One entry point**: choose 0–3 AI players when you create a room. With 3 AI the game starts right away; with fewer, you wait in a lobby for friends.
- **Seat draw (抓風)**: before dealing, players take turns in join order to flip a face-down wind tile, which decides their seat. Whoever draws East is the first dealer.
- **Full Taiwanese rules**:
  - Calls: chow, pong, exposed, concealed and added kongs, and robbing a kong.
  - Wins: self-draw and winning on another player's discard.
  - Flowers are shown on the table, and flowers and kong replacements are drawn automatically from the dead wall.
- **East and South rounds**: dealer rotation, dealer streaks (連莊), tai (fan) scoring and payments. Everyone starts with 1000 points.
- **House rules**:
  - Base stake and per-tai stake.
  - Single or multiple winners on one discard.
  - Reaction timer.
  - Temporary furiten: if you pass on a win, you cannot win until your next draw.
- **Tenpai helper**: shows which tiles you are waiting on and how many are still unseen on the table. On your turn, it marks the discards that would put you in tenpai.
- **Declare ready (聽牌, +1 tai)**: optionally lock your hand once you are in tenpai. Drawn tiles are then discarded for you until you win.
- **AI opponents**: choose discards by shanten and effective tile count, and decide whether to call chow, pong or kong.
- **Mobile experience**:
  - Portrait lobby, landscape table and fullscreen mode.
  - Installable PWA.
  - Synthesized sound effects (Web Audio) and haptic feedback.
- **Sharing**: Web Share, LINE, QR code and copy room code.
- **Avatars**: each player picks one of 8 original chibi avatars (no duplicates within a room). When a hand is won, an anime-style animation shows the winner's face and every losing player's shocked face.
- **Names and leaderboard**: players can rename themselves at any time, and the home page lists the last 10 matches.
- **中文 / English**: a toggle on every screen. The first visit follows the browser language.
- **Persistence**: rooms are saved to Redis or JSON files and are restored after a server restart.

## Architecture

```text
Browser (TypeScript, no framework)  ──WebSocket /ws──>  online-server.mjs (Node.js, zero runtime deps)
   src/online/client.ts                                   ├─ dist/core       game engine (compiled TS)
                                                          ├─ dist/web/bot.js AI
                                                          └─ persistence.mjs Redis / JSON files
```

- `src/core` is a pure TypeScript engine with no DOM access. The server and the browser share it.
- The WebSocket server, the static file server and the Redis client are written on Node.js built-ins. The server needs **no npm packages at runtime**.
- The only dev dependencies are `typescript` and `vitest`.

Developer documentation lives in [doc/](doc/README.md).

## Quick start (local)

Requires Node.js 20 or newer.

```bash
npm install
npm run build          # compile src/ into dist/
PORT=8080 npm run serve
```

Open <http://localhost:8080>. Phones on the same Wi-Fi can join at `http://<your-computer-ip>:8080`.

If `PERSISTENCE_DRIVER` is not set, rooms are stored in `data/rooms/*.json`.

```bash
npm test                      # unit tests (vitest)
curl localhost:8080/healthz   # {"ok":true,...}
```

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `80` | HTTP / WebSocket port |
| `PERSISTENCE_DRIVER` | `file` | `file` or `redis` |
| `DATA_DIR` | `./data/rooms` | Storage directory for the `file` driver |
| `REDIS_URL` | `redis://127.0.0.1:6379/0` | Redis connection string (password supported) |
| `ROOM_TTL_SECONDS` | `86400` | How long a room with nobody connected is kept |
| `ROOM_IDLE_SECONDS` | `3600` | Close rooms idle for this long; `0` disables |
| `BOT_DELAY_MS` | `450` | Delay between AI actions |
| `HUMAN_DELAY_MS` | `30` | Server step delay when a human is to act |
| `STALL_MS` | `6000` | Watchdog: log and re-advance a game with no progress for this long |
| `AI_LOG` | on | Set to `0` to silence the AI move log |
| `ALLOWED_ORIGINS` | empty (any) | Comma-separated list of allowed WebSocket origins |

## Production deployment (Docker)

`docker-compose.yml` runs three services:

```text
Internet --443--> Caddy (HTTPS/WSS, Let's Encrypt) --> app:5173 --> Redis
```

### Secrets and `.env`

Real secrets live only in `.env` on the server. `.gitignore` excludes `.env`, so it is never committed. `.env.example` is the template, with placeholders only.

1. Create the file and make it readable only by you:

   ```bash
   cp .env.example .env
   chmod 600 .env
   ```

2. Generate a Redis password. Use any one of these commands; each prints 64 random hex characters:

   ```bash
   openssl rand -hex 32
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   python3 -c "import secrets; print(secrets.token_hex(32))"
   ```

   Paste the result after `REDIS_PASSWORD=` in `.env`. Hex characters need no escaping inside the `redis://` URL that Docker Compose builds from the password.

3. Set `DOMAIN` to a domain whose DNS points to your server's public IP. With no domain yet, use `<ip-with-dashes>.sslip.io`, for example `203-0-113-10.sslip.io`. Caddy gets a Let's Encrypt certificate for this name automatically, so no certificate files need to be created by hand.

4. Start everything:

   ```bash
   docker compose up -d --build
   ```

**Changing the Redis password later.** Redis reads the password when it starts, so recreate both containers after editing `.env`. Saved rooms are kept, because they are stored in the `redis_data` volume:

```bash
docker compose up -d --force-recreate redis app
```

**If a password leaks** (for example, `.env` was committed by mistake):

1. Generate a new password and recreate the containers as shown above.
2. Remove the file from Git history; deleting it in a new commit is not enough.

Never commit `.env`, `data/` (saved rooms and player names) or anything under `node_modules/`.

After changing code, rebuild only the app:

```bash
npm run build
docker compose up -d --build app
```

- Expose only ports 80 and 443. Never expose 5173 or 6379.
- Do not run `docker compose down -v`: it deletes the saved rooms and the TLS certificates.

[DEPLOYMENT.md](DEPLOYMENT.md) has the full guide.

## Project layout

```text
src/core/          Game engine: tiles, hands, win detection, actions, scoring, match (rounds)
src/online/        Browser client (client.ts) and wire protocol (protocol.ts)
src/web/           AI, tenpai helper, tile rendering, sound; plus the legacy single-player app
online-server.mjs  Game server: HTTP + WebSocket + rooms + AI scheduling
persistence.mjs    Redis / JSON-file storage and leaderboard
index.html         Home page and leaderboard
online.html        Game page: create/join, lobby, seat draw, table
rules.html         How-to-play page: tiles, calls, tai table, payments (中文 / English)
doc/               Developer documentation
```

## Glossary

| Term | Meaning |
| --- | --- |
| 台 (tai) | Scoring unit; a hand's value is the sum of its tai |
| 底 / 台 | Base stake / stake per tai |
| 莊 / 連莊 | Dealer / dealer keeps the deal |
| 抓風 | Drawing wind tiles to decide seats |
| 聽牌 (tenpai) | One tile away from a winning hand |
| 自摸 / 放槍 | Self-draw win / dealing in (discarding the winning tile) |

## License

No license has been chosen yet.
