# Modifications

Changes made after the `v0` release, newest first.

## 2026-10-16

### Bug fixes

- **Missing wins and waits** (`src/core/engine/winChecker.ts`):
  - **The bug**: the win check processed tiles in the order they were given, not sorted. It always takes the first remaining tile and only tries a run that *starts* there. When the tile being tested was added at the end of the hand (a discard you might win on, or a wait the tenpai helper is checking), a run that tile should start was missed. For example, holding 4p5p, the 3p that makes 3-4-5 was not recognised.
  - **Symptoms**:
    - the tenpai helper left out some waits;
    - the Win button could fail to appear for a valid discard;
    - edge, closed and single wait tai could be judged wrongly.
  - Self-draws were not affected, because drawn tiles are sorted into the hand.
  - **Fix**: tiles are sorted before the search.
- **Inflated tai from guessed pungs** (`src/core/scoring/scoring.ts`):
  - **The bug**: scoring treated any three identical tiles in the hand as a pung, so runs could be counted as pungs and wrongly add three concealed pungs or all pungs.
  - **Fix**: the hand is now split into 5 sets + 1 pair in every possible way (`decompose()`), each split is scored, and the highest one counts.
  - **Pungs completed by a discard**: a pung completed by the winning discard no longer counts as concealed.
- **Edge / closed / single wait** (`src/core/engine/winContext.ts`): these 1-tai items now only score when that tile was the **only** wait (獨聽), which is the usual Taiwanese rule.

### Settlement screen

- **Payment breakdown**: every payment now shows how it adds up. For example: `North → East  15 tai: 50 + 15 × 20 = 350 (hand 2 + dealer 13)`. A note explains dealer tai.
- **Why amounts reached 300+**: amounts such as 310–350 were correct under the current rules. When the winner or the payer is the dealer, each payment gets 1 dealer tai plus 2 for each dealer streak, and draws also extend the streak. In the games that prompted this, North kept the deal 6 times, adding 11–13 tai per payment. The settlement used to show only the hand's tai, so the totals looked wrong.
- **Wording**: the hand total is now labelled "牌型 N 台" (hand tai) to separate it from dealer tai.
- **Phones**: on small or short screens the settlement uses smaller banners, avatars, tiles and text.
- **Phone settlement redesigned** (screens ≤ 700 px wide or ≤ 600 px tall):
  - **Animation**: the win animation plays full screen first. After about 2.2 seconds the banners fold away and the settlement card takes over.
  - **Card header**: a one-line summary with avatar, "胡！" / "自摸！", name and points won.
  - **Landscape layout**: two columns. The left column shows the winning hand on one line plus the tai items; the right column lists the other players, one per line, with avatar, name, points and the discarded winning tile.
  - **Collapsed sections**: "How it adds up" and "Everyone's tiles" start collapsed on phones. They stay open on desktop.
  - **Footer**: the tile check is one small line next to the Next hand button.
  - **Portrait**: one column.
  - The card is fixed in the centre, so it no longer pushes the banners off screen during the animation.
  - The desktop layout is unchanged. Cache version `v18`.
- **Phone settlement, second pass: tabs and a pinned button**:
  - **Why**: phones still had to scroll to reach Next hand and everyone's tiles. `100vh` on mobile browsers includes the address bar, so the card's bottom was cut off, and expanding everyone's tiles made the card taller than the screen.
  - **Tabs**: the card now has three tabs: 結果 (result), 所有人的牌 (everyone's tiles) and 算式 (how it adds up). Only one shows at a time and each fits on one screen. A new hand always opens on the result tab.
  - **Pinned footer**: Next hand and the tile check stay at the bottom of the card on every tab.
  - **Height**: the card height uses `100dvh`, the visible height, so the browser's toolbars no longer push the button off screen.
  - The desktop layout is unchanged. Cache version `v19`.
- **Automatic next hand after 10 seconds**:
  - When a hand is settled, the server starts a countdown (`NEXT_HAND_SECONDS`, default 10, where `0` turns it off). When it runs out, the server starts the next hand for everyone, so the game continues even if the host is away. After the last hand of a match, it starts a new match beginning with a seat draw.
  - **On screen**: the host's button shows the remaining seconds, "下一局 (8)", and can still be pressed early. Other players see "8 秒後自動開始下一局" (next hand in 8 seconds).
  - **Server restart**: a room restored while showing a settlement gets a fresh countdown.
  - **Data**: the settlement includes `nextDeadline`. Rooms store `settings.nextHandSeconds`.
- **Phone settlement, third pass: no flicker, fixed size**:
  - **Tab switching**: switching tabs now only changes which section is visible. The screen is no longer redrawn, so it does not flicker.
  - **Fixed size**: the card has a fixed height (the visible screen height, up to 440 px), so switching tabs does not resize it. Only the middle area scrolls if its content is too long.
  - **Tab labels**: they stay on one line and shrink on narrow screens.
  - Cache version `v20`.
- **Tile check shown only on failure**: the settlement no longer shows the "tile check ✓" line when everything is fine. It appears only if the count is wrong, in red, listing the problems. The check still runs on every hand, and failures are still logged on the server.

### Tests

- New `src/core/scoring/scoring.test.ts` (6 tests):
  - a win is detected when the tile is appended last;
  - both ends of a two-sided wait are listed;
  - a pung completed by a discard is not concealed;
  - runs are not mistaken for pungs;
  - `111222333` scores as three concealed pungs;
  - an edge wait scores only when it is the sole wait.
- **Unit tests**: all 14 pass.
- **End-to-end**: seven hands were played against a local server. Every payment matched `base + tai × per-tai`, including the dealer tai, and the tile check passed each time.

### Files changed

| File | Change |
| --- | --- |
| `src/core/engine/winChecker.ts` | Sort before searching; new `decompose()` and `winningTileTypes()` |
| `src/core/engine/winContext.ts` | Wait-type tai only on a sole wait |
| `src/core/scoring/scoring.ts` | Score every split of the hand, keep the best |
| `src/core/scoring/scoring.test.ts` | New regression tests |
| `src/online/client.ts`, `src/online/i18n.ts` | Payment breakdown on the settlement screen |
| `online.css` | Payment breakdown styles; compact settlement on phones |
| `sw.js` | Cache version `v17` |

### Status

- Deployed to production on 2026-10-16.
- Included in tag `v0.0.1`.

## 2026-10-15

Baseline: tag `v0` (commit `98d3484`).

### Gameplay and UI

- **Drawn tile set apart**: the tile you just drew now sits about half a tile's width away from the rest of your hand on both phone and desktop, so it is easy to tell apart.
- **Win animation and settlement merged into one screen** (`resultOverlay()` in `src/online/client.ts`). From top to bottom:
  1. **Winner banner**:
     - Shows the winner's happy avatar, "胡！" or "自摸！", their name and the points won this hand (for example +170).
     - It slides in and stays on screen instead of disappearing.
  2. **Winning hand**:
     - Shows each winner's exposed sets and concealed tiles, so everyone can check the hand is valid, followed by the tai items and the total.
     - A 0-tai hand is labelled "屁胡".
     - With several winners on one discard, each winner gets a row.
     - **Self-draw**: the winning tile is placed at the far right of the hand, separated by a gap and marked with a gold frame.
     - **Win on a discard**: the winning tile is placed next to the discarder's crying face, labelled "放槍".
  3. **The other players**: each shows their avatar and this hand's points. Players who pay have a shocked, crying face that shakes; players who pay nothing show 0.
  4. **Everyone's tiles**: see the next item.
  5. **Tile check**: the result of the tile count for this hand (see "Server").
  6. **Next hand**: a button for the host; other players see a waiting message.
- **All hands revealed at the end of a hand**:
  - The settlement screen has an "Everyone's tiles" section with every player's exposed sets, concealed tiles and flowers. It starts open after a draw game.
  - Opponents' hands are also turned face up on the table behind the settlement screen.
- **Animations no longer restart on re-render**: the settlement screen remembers when its animation started. A server update arriving mid-animation continues it from the same point instead of replaying it, and after 4 seconds the screen stays still.

### Server

- **End-of-hand snapshot**: every player's concealed tiles are sent once a hand has ended. The settlement now also includes:
  - `winningTile` and `winFrom`: the tile that won and the player who discarded it (no `winFrom` on a self-draw);
  - `details`: tai items for each winner, so multiple winners each get their own breakdown;
  - `audit`: the result of the tile check below.
- **Tile check** (`src/core/engine/audit.ts`, `auditTiles`):
  - Counts every tile in the wall, dead wall, hands, exposed sets, discards and flowers.
  - Verifies 144 tiles in total, 108 suits, 28 honors and 8 flowers; every suit and honor type appears exactly 4 times, every flower once, and no tile id appears twice.
  - The result is shown on the settlement screen. A failed check is also logged as `[audit] room=… tile check failed: …`.
- **Hidden files**: the static file server now refuses any path segment that starts with `.` (for example `.env`, `.gittoken`, `.git`).

### Security and repository

- **`.gitignore`**: added `*token`, so local token files are never committed.
- **`.dockerignore`**: added `*token`, `**/*token` and `.git`, so tokens and Git history are not copied into the Docker image.

### Tests

- **New file** `src/core/engine/audit.test.ts`:
  - A fresh deal has 144 tiles (108 / 28 / 8).
  - The tile count stays intact through 200 turns with chows and pongs.
  - A lost or duplicated tile is detected.
- **Results**: all 8 unit tests pass.
- **End-to-end**: three hands were played against a local server (a win on a discard, a self-draw, and a 0-tai win). In each one:
  - all four hands were sent once the hand ended;
  - the winning tile and the discarder were correct;
  - the tile check passed.

### Files changed

| File | Change |
| --- | --- |
| `src/core/engine/audit.ts` | New: tile check |
| `src/core/engine/audit.test.ts` | New: tests for the tile check |
| `online-server.mjs` | Reveal hands at the end of a hand; add `winningTile`, `winFrom`, `details` and `audit` to the settlement; refuse paths starting with a dot |
| `src/online/protocol.ts` | New settlement fields |
| `src/online/client.ts` | Merged settlement screen, animation resume, opponents' hands revealed on the table |
| `src/online/i18n.ts` | Strings for the settlement screen (中文 / English) |
| `online.css` | Settlement screen styles, gap before the drawn tile |
| `sw.js` | Cache version `v16` |
| `.gitignore`, `.dockerignore` | Exclude token files |

### Status

- Deployed to production on 2026-10-16.
- Included in tag `v0.0.1`.
