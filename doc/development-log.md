# How it was built

The project grew in stages. Each stage kept the previous one working and added a layer on top. The stage labels below come from version markers and comments in the code.

## Stage 1: rules engine

**Goal**: a correct Taiwanese 16-tile engine with no user interface.

- The tile set, shuffle and deal, with flowers replaced from a 16-tile dead wall.
- The turn state machine (`awaiting_draw → awaiting_discard → awaiting_reactions`), built as pure functions that change a `GameState`. Because the functions have no timers and take an optional random-number generator, tests can be deterministic.
- An event log (`state.events`) that records every draw, discard, call and win. Scoring reads this log later to find facts the final hand cannot show, such as a heavenly win or winning on the last tile.

### Stage 1.5: calls and room rules

- **Win detection with melds**: `isWinningHandWithMelds` counts each exposed meld as one of the five required melds.
- **One reaction window per discard**: `settleDiscardReactionWindow` collects one decision from each opponent and then applies priority (win > kong > pong > chow).
- **Room rules**: one winner or several on one discard, and temporary furiten after passing on a win.
- **Kongs**: added kongs, with a separate reaction window so another player can rob the kong.

## Stage 2: playable offline game

- **Scoring and payments**: `scoreTaiwanHand` has one table of tai values. Payments add the dealer and dealer-streak bonus.
- **Full matches**: `match.ts` plays the East and South rounds with dealer rotation and dealer streaks.
- **AI**: shanten-based decisions (`aiMath.ts`, `bot.ts`).
- **Offline single-player app** (`src/web/app.ts`, still available as `solo-classic.html`):
  - a local controller that runs the AI;
  - replays and career statistics saved in `localStorage`;
  - synthesized sound.

## Stage 3: online multiplayer

**Main decision**: make the server authoritative. The client never holds other players' tiles, and every action is checked by the same engine code. The cost is that each action makes a round trip to the server. In exchange, players cannot cheat, there is one source of truth, and reconnecting is trivial: the server simply sends a fresh snapshot.

- **Stage 3.2: mobile-first friend rooms**
  - room codes, QR and LINE invites;
  - a portrait lobby and a landscape table;
  - AI fills empty seats;
  - Redis or JSON persistence, so rooms survive restarts;
  - HTTPS/WSS behind Caddy.
- **Stage 3.3: mobile UX polish**
  - SVG tile faces;
  - draw and discard animations, and big call characters;
  - vibration patterns;
  - Web Share and LINE sharing;
  - support for reduced-motion settings.
- **Stage 3.3.1: deployment and fixes**
  - a hardened Docker deployment on EC2: non-root, read-only filesystem, all capabilities dropped, Redis only on the internal network;
  - the AI move log and a watchdog for stalled games;
  - idle-room cleanup and the leaderboard;
  - the tenpai helper, chow buttons that show their tiles, and the drawn tile set apart on the right.

## Recent changes

- **Rename**: players can change their name in the lobby or during a game.
- **Seat draw (抓風) before dealing**:
  - Lobby seats are only the join order.
  - Players then flip face-down wind tiles one at a time in that order, and the result decides their seats (East deals first).
  - Only after that are the tiles dealt.
- **One entry point**: "VS AI" and "Friend room" became the same room with an AI count of 0–3. Three AI players start the game immediately. `solo.html` now redirects to `online.html` so old links keep working.
- **Declare ready (聽牌)**:
  - Declaring ready adds 1 tai.
  - Afterwards the hand is locked: no chow, pong or kong, and drawn tiles are discarded automatically until the player wins.
  - Engine rules: `declareReady`, `isReadyDeclared` and the `declared_ready` scoring item. Unit test: `src/core/engine/ready.test.ts`.
- **Tenpai counts**: the number of tiles left now only subtracts tiles visible on the table, not the player's own hand.
- **Flowers**: flowers are shown as small tiles next to each player's melds. The matching-flower table was also corrected: West is autumn and bamboo (#3), North is winter and chrysanthemum (#4).
- **Languages**: a 中文 / EN toggle on every screen and on the home page (`src/online/i18n.ts`).
- **Documentation**: an English README and this `doc/` folder.
- **Avatars**: eight original chibi avatars, unique within a room. The win animation shows the winners' happy faces and all losers' shocked faces.
- **Call buttons**: pong and kong buttons show their tiles, like chow buttons already did.
- **No flicker**: the tenpai hint and the drawn tile no longer replay their entry animation on every server update. The waits are only recomputed when your own hand changes; the "tiles left" numbers update quietly.
- **Bigger desktop table**: on desktop the table fills the space beside the side panel, and all tiles are larger.

## Development workflow

```bash
npm run build                 # tsc: src/ → dist/ (the server imports dist/)
PORT=8080 npm run serve       # local server, file persistence
npm test                      # vitest unit tests (src/**/*.test.ts)
```

- **Changing the engine or the client**: rebuild with `npm run build`. The server and the browser both load the compiled `dist/` files.
- **Changing `online-server.mjs`**: restart the server. Rooms are restored from storage.
- **Deploying**: run `docker compose up -d --build app`. The image copies the already built `dist/` folder, so build first.
- **Changing cached files**: bump the `CACHE` version in `sw.js`, so installed PWAs drop old files.

Server changes can be tested end to end with a small script that opens several `WebSocket` connections to a local server (Node 22 includes `WebSocket` as a global). Each connection plays as one player: create a room, join, rename, start, draw seats. The script then checks the snapshots that come back.
