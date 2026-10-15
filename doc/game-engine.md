# Game engine (`src/core`)

The engine is a set of pure functions that change a `GameState` object in place. It has no timers, networking or randomness of its own; `createGame` takes an optional `rng` so tests can be deterministic.

## Tiles (`engine/tiles.ts`)

The set has 144 tiles:

| Group | Tiles | Count |
| --- | --- | --- |
| Suits | characters (萬), dots (筒) and bamboo (索), ranks 1–9, 4 copies each | 108 |
| Winds | East, South, West, North, 4 copies each | 16 |
| Dragons | red (中), green (發) and white (白), 4 copies each | 12 |
| Flowers | plum, orchid, bamboo and chrysanthemum, plus spring, summer, autumn and winter, 1 each | 8 |

- Every physical tile has a unique `id`, such as `dots-5-2`.
- `tileKey(tile)` gives the tile's *type*, such as `dots:5`. The engine compares tiles by `tileKey` and moves them around by `id`.

## Constants (`rules/taiwan.ts`, `rules/roomRules.ts`)

- **Fixed rules**:
  - 16-tile hands, so a winning hand has 17 tiles: 5 melds and 1 pair.
  - A 16-tile dead wall.
  - Chow is only allowed from the previous player.
- **Room rules**:
  - `ronMode` is `single` or `multiple`, which decides whether several players can win on one discard.
  - `missedWinPolicy` is `until_next_draw` (temporary furiten) or `none`.
  - `minTai` is the minimum hand value.

## The turn state machine (`engine/game.ts`, `engine/actions.ts`)

```text
                 drawTile                 discardTile
awaiting_draw ─────────────► awaiting_discard ─────────────► awaiting_reactions
      ▲                         │  ▲   │                         │
      │                         │  │   │ declareAddedKong        │ settleDiscardReactionWindow
      │                         │  │   ▼                         │
      │                         │  │ awaiting_kong_reactions     ├─ win ───────────► ended
      │                         │  │   │ nobody robs → kong +    ├─ chow/pong/kong ─► awaiting_discard (claimer)
      │                         │  └───┘ replacement draw        └─ all pass ──────► awaiting_draw (next seat)
      │                         │
      │                         ├─ declareSelfDraw ─► ended
      │                         └─ declareConcealedKong ─► replacement draw, stays in awaiting_discard
      └──────────────── wall empty on draw ─► ended (wall_exhausted)
```

### Dealing and flowers

`createGame` shuffles the tiles and works through them in this order:

1. Sets aside 16 tiles as the dead wall.
2. Deals 16 tiles to each seat, plus one extra tile to the dealer.
3. Replaces flowers seat by seat (`normalizeFlowers`). Each flower moves to the player's flower area, and a replacement is drawn from the dead wall, repeating as needed.
4. Starts the game in `awaiting_discard` for the dealer.

When the dead wall runs out, replacements come from the tail of the live wall. If both walls are empty, the hand ends as a draw.

### Reactions

`getReactionOptions(state, seat)` lists the legal responses to the last discard:

- **pong** (two matching tiles in hand) and **kong** (three matching tiles).
- **chow**, only for the next player. Up to three combinations: the discard as the low, middle or high tile of the run.
- **win**, if the hand plus the discard is complete, the player is not in temporary furiten, and the hand is valid with its existing melds.

`settleDiscardReactionWindow` takes one decision from each of the three opponents and:

1. Checks each decision against the legal options, so a client cannot claim tiles it doesn't have.
2. Handles wins first. If there are several, it takes them in seat order from the discarder, keeping only the first in `single` mode.
3. Puts anyone who passed on a legal win into temporary furiten until their next draw.
4. Otherwise chooses the highest-priority call (kong > pong > chow; on a tie, the seat closest after the discarder).
5. If everybody passed, moves to `awaiting_draw` for the next seat.

### Declaring ready (聽牌)

`declareReady(state, seat, tileId)` is a discard that also announces tenpai:

- **Checks**: `canDeclareReady` confirms that removing that tile leaves a hand that is one tile away from winning (`isTenpai`).
- **Recording**: the seat is added to `state.declaredReady`, and a `READY_DECLARED` event is logged.

From then on the hand is locked:

- `getReactionOptions` only offers win or pass.
- Concealed and added kongs throw an error.
- `discardTile` only accepts the tile that was just drawn.

If the hand wins, `deriveWinFlags` sets `declaredReady`, which is worth 1 tai. Automatic discarding is the server's job; see [server.md](server.md).

### Kongs

| Kong | Function | What happens |
| --- | --- | --- |
| Concealed | `declareConcealedKong` | Four of a kind from the hand, then an immediate replacement draw |
| Exposed | Claimed with `claimDiscard` | Three in hand plus the discard, then a replacement draw |
| Added | `declareAddedKong` | Upgrades an existing pong. First opens an `awaiting_kong_reactions` window. If another player can win on that tile, they may rob the kong (`claimRobKong`). Otherwise `finalizeAddedKong` completes the kong and draws a replacement. |

## Win detection (`engine/winChecker.ts`)

`isWinningHandWithMelds(concealed, melds)`:

- Each exposed meld counts as one of the five required melds.
- The concealed part must therefore hold exactly `(5 − melds) × 3 + 2` tiles.
- A recursive search on tile counts then tries to split the concealed tiles into triplets and runs, plus exactly one pair.

## Scoring (`scoring/scoring.ts`, `engine/winContext.ts`)

`deriveWinFlags` reads the game's **event log** (`state.events`) and state to find facts that the final hand alone cannot show:

- declared ready;

- kong blossom (winning on a replacement tile);
- robbing a kong;
- edge, closed or single wait;
- winning on the last tile;
- heavenly, earthly or human win;
- eight flowers.

`scoreTaiwanHand` then builds a list of tai items:

| Tai | Items |
| --- | --- |
| 1 | Declared ready 聽牌, self-draw 自摸, concealed hand 門清, seat wind 門風, round wind 圈風, dragon pung 三元台, matching flower 正花, kong blossom 槓上開花, robbing a kong 搶槓, edge 邊張 / closed 中洞 / single 單吊 wait, last tile 海底 |
| 2 | All chows 平糊, all exposed 全求, three concealed pungs 三暗坎 |
| 3 | Concealed self-draw 門清自摸 (replaces the 1+1 above) |
| 4 | All pungs 碰碰胡, small three dragons 小三元, half flush 湊一色, dealer-ready flower 配牌花糊, earthly ready 地聽 |
| 5 | Four concealed pungs 四暗坎 |
| 8 | Big three dragons 大三元, full flush 清一色, all honors 字一色, five concealed pungs 五暗坎, small four winds 小四喜, eight flowers 八仙過海, seven-rob-one 七搶一, human win 人糊 |
| 16 | Earthly win 地糊, big four winds 大四喜 |
| 24 | Heavenly win 天糊 |

The values live in one table (`mahjongoTaiwanProfile`), so a different house profile can be swapped in.

Matching flowers (正花) score 1 tai each. Each seat matches the flowers with its number: East #1 (spring, plum), South #2 (summer, orchid), West #3 (autumn, bamboo), North #4 (winter, chrysanthemum). Collecting all eight flowers is a separate 8-tai item. Seven-robs-one, dealer-ready flower and earthly ready exist in the table, but the engine does not detect them automatically yet.

### Payments

The amount for each payment is `base + tai × perTai`.

- **Who pays**: on a discard win only the discarder pays. On a self-draw all three other players pay.
- **Dealer bonus**: when the winner or the payer is the dealer, `1 + 2 × dealerContinuations` extra tai are added (莊 and 連莊 / 拉莊).
- **Multiple winners**: when several players win on one discard, each winner is paid separately.

## A full match (`match/match.ts`)

- `createMatch` starts the East round, hand 1, with East as dealer. A match covers the East and South rounds.
- `settleCurrentHand` scores the hand that just ended, records it in `history` and moves the match forward:
  - If the dealer wins, or the hand ends in a draw, the dealer keeps the deal (`dealerContinuations++`).
  - Otherwise the deal passes to the next seat. After the 4th dealer the round wind advances, and after South 4 the match status becomes `ended`.
- `startNextHand` deals a new game for the current dealer.
