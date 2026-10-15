# Architecture

## Overview

```text
┌──────────────── Browser ────────────────┐            ┌──────────────── Node.js ─────────────────┐
│ online.html                              │            │ online-server.mjs                         │
│  └ dist/online/client.ts (UI)            │  WebSocket │  ├ rooms: Map<code, Room>                 │
│     ├ renders RoomSnapshot               │ ◄────────► │  ├ dist/core (engine, authoritative)      │
│     ├ dist/web/tenpai.ts (hints)         │    /ws     │  ├ dist/web/bot.js (AI decisions)         │
│     └ dist/web/tileView.ts, sound.ts     │            │  └ persistence.mjs ──► Redis or JSON files │
└──────────────────────────────────────────┘            └───────────────────────────────────────────┘
```

The design is **server authoritative**:

- The server owns the wall, every hand and the turn order.
- A client receives a `RoomSnapshot` that shows its own concealed tiles and only *counts* for everyone else's, so a modified client cannot see other hands.
- Every action a client sends (discard, call, kong, win) goes through the same engine functions that enforce the rules. An illegal action is rejected with an `ERROR` message.

## One engine, two consumers

`src/core` is plain TypeScript with no DOM or Node APIs. `npm run build` compiles it to `dist/core`, and two consumers use it:

- **The server** imports the compiled JavaScript directly, for example `import { discardTile } from './dist/core/engine/game.js'`.
- **The browser** imports the same modules for the tenpai helper, which runs `isWinningHandWithMelds` on the player's own hand.

There is no bundler. The browser loads native ES modules from `dist/`.

## Life of a discard

1. The player taps a tile twice. `client.ts` plays the throw animation and sends `{type:'ACTION', action:'DISCARD', tileId}`.
2. `handleMessage` in `online-server.mjs` checks that it is that player's turn and calls `discardTile(game, seat, tileId)`. The phase becomes `awaiting_reactions`.
3. `broadcast(room)` sends each connected player their own personalized snapshot, then saves the room (debounced to once every 40 ms).
4. `advance(room)` schedules the next server step. In a reaction window, `beginReactionWindow`:
   - asks every AI for its decision immediately (`chooseReaction`);
   - finds the humans who have a legal call and gives them `reactionSeconds` to answer.
5. When every decision is in, or the timer expires, `settlePending` calls `settleDiscardReactionWindow`. It applies priority (win > kong > pong > chow) and the single-win or multiple-win rule.
6. `advance` continues with the next draw. If the next seat belongs to an AI, `botOwnTurn` makes its move after `BOT_DELAY_MS`.

## Where state lives

| State | Location | Survives restart? |
| --- | --- | --- |
| Rooms, seats, match, totals | `rooms` map in memory, mirrored to Redis or JSON | Yes (restored on boot) |
| Pending reaction timers, AI timers | In memory only | No (the watchdog re-advances the game after restart) |
| Seat draw in progress | In memory only | No (the room returns to the lobby) |
| Leaderboard (last 10 matches) | Redis list `mj:results` or `data/results.json` | Yes |
| Player id, name, sound / haptics / AI-count preferences | Browser `localStorage` | Per device |

## Room lifecycle

```text
lobby ──START_GAME──► wind (seat draw) ──all 4 drawn──► playing ──hand ends──► ended
  ▲                       ▲                                ▲                       │
  │                       └──── match finished, NEXT_HAND ─┼───────────────────────┤
  │                                                        └──── NEXT_HAND ────────┘
  └── room destroyed when the last human leaves, it idles too long, or its TTL expires
```

## Robustness features

- **Reconnect**: the client keeps a `clientId` in `localStorage` and sends it in `HELLO`. The server reattaches the socket to the same seat.
- **Players who leave mid-game**: an AI takes over the seat, so the match can keep going.
- **Watchdog**: every 2 s the server looks for games where the server is supposed to act but nothing happened for `STALL_MS`. It logs the last 20 AI actions and pushes the game forward.
- **Idle cleanup**: rooms idle for `ROOM_IDLE_SECONDS` are closed, and connected players are told why.
