# Developer documentation

These pages explain what each part of the code does and how the project was built. Read them in this order:

1. [Architecture](architecture.md): the big picture, how a move travels from a tap to every player's screen, and where state lives.
2. [Game engine](game-engine.md): `src/core`, including tiles, the turn state machine, win detection, scoring and payments.
3. [Game server](server.md): `online-server.mjs` and `persistence.mjs`, covering rooms, the wire protocol, the seat draw, AI scheduling and storage.
4. [Browser client](client.md): `src/online/client.ts`, the AI and tenpai helpers in `src/web`, rendering, sound and the PWA.
5. [How it was built](development-log.md): the stages the project went through and the design decisions behind them.
6. [Modifications](modification.md): dated list of changes made after the `v0` release.

For setup and deployment, see the main [README](../README.md) and [DEPLOYMENT.md](../DEPLOYMENT.md).

## File map

| Path | Role |
| --- | --- |
| `src/core/types/mahjong.ts` | Shared types: `Tile`, `Meld`, `GameState`, `GameEvent` |
| `src/core/engine/tiles.ts` | The 144-tile set, shuffle, `tileKey` |
| `src/core/engine/hand.ts` | Sorting and counting helpers |
| `src/core/engine/game.ts` | Deal, draw, discard, flower replacement |
| `src/core/engine/actions.ts` | Reactions (chow/pong/kong/win), kongs, self-draw, reaction settlement |
| `src/core/engine/winChecker.ts` | Is this a winning hand? (5 melds + 1 pair) |
| `src/core/engine/winContext.ts` | Derives scoring flags from the event log (edge wait, last tile, heavenly win…) |
| `src/core/scoring/scoring.ts` | Tai items and payment calculation |
| `src/core/match/match.ts` | A full match: East and South rounds, dealer rotation |
| `src/core/rules/*.ts` | Fixed Taiwanese constants and adjustable room rules |
| `src/online/protocol.ts` | Client ↔ server message types |
| `src/online/client.ts` | The whole browser UI (start screen, lobby, seat draw, table) |
| `src/online/i18n.ts` | Chinese / English strings and translation of server text |
| `src/web/bot.ts`, `aiMath.ts` | AI decision making (shanten / effective tiles) |
| `src/web/tenpai.ts` | Tenpai helper used by the UI |
| `src/**/*.test.ts` | Unit tests (vitest): tenpai helper, declare-ready rules, tile audit, win detection and scoring |
| `src/core/engine/audit.ts` | Tile check: all 144 tiles accounted for, none lost or duplicated |
| `src/web/tileView.ts` | Tile labels and SVG tile faces |
| `src/web/sound.ts` | Synthesized sound effects |
| `src/web/app.ts` + `controller.ts`, `session.ts`, `replay.ts`, `stats.ts` | Legacy offline single-player app (`solo-classic.html`) |
| `online-server.mjs` | HTTP + WebSocket game server |
| `persistence.mjs` | File / Redis storage and leaderboard |
| `server.mjs` | Legacy static-only server from the offline stage (not used in production) |
| `index.html`, `online.html`, `solo.html` | Home page, game page, redirect from the old VS-AI URL |
| `sw.js`, `manifest.webmanifest` | PWA service worker and manifest |
| `online.css`, `styles.css` | Styles for the game page / the home page and legacy app |
