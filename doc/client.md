# Browser client (`src/online/client.ts`)

The client is a single TypeScript module with no framework. It keeps the latest `RoomSnapshot` from the server in memory. On every change, `render()` rebuilds `#online-app` from template strings, and `bind()` reattaches the click handlers. The game state is small and changes a few times per second at most, so this simple approach is fast enough and easy to follow.

## Screens

`render()` picks one screen:

| Condition | Screen |
| --- | --- |
| No snapshot (not in a room) | `startScreen()`: nickname, AI-count picker (0–3), create room, join with a code |
| `status === 'lobby'` | `lobby()`: room code, share / QR / LINE buttons, seats 1–4, ready / rename / fill with AI / start |
| `status === 'wind'` | `windScreen()`: the turn order, four face-down tiles (clickable only on your turn) and a countdown |
| Otherwise | `game()`: the table, plus `settlement()` when a hand has ended |

When the AI count is 3, `autoStart` sends `START_GAME` as soon as the room exists, so playing against AI takes one tap.

## The table

`game()` puts the viewer at the bottom and places the other seats around them with `relativePos`.

- **Opponents**: a name badge, face-down tiles (only a count is known), exposed melds and flowers.
- **Centre**: the current hand, the tiles left and the stakes.
- **Discards**: a discard area for each seat, with the latest discard highlighted.
- **Your area**:
  - **Name badge**: shows your dealer (莊) and declared-ready (聽) markers.
  - **Tiles**: your flowers and melds, then your hand with the drawn tile set apart on the right.
  - **Hints and actions**: the tenpai hint and the action buttons.
- **Menus**: on desktop, a side panel shows the room, scores, game info and house rules. On phones the same content is in a sheet behind the ☰ button.

### Discarding

Tap a tile once to select it and tap it again to discard it. The client plays a short throw animation (`pendingDiscardId`) and then sends `DISCARD`. The server decides whether the move is legal.

### Tenpai helper and declaring ready

`tenpaiInfo` (cached per hand) uses `src/web/tenpai.ts`:

- `waitsFor`: when you are waiting, it shows which tiles complete the hand.
- `discardsToTenpai`: on your turn, it marks every discard that leaves you ready (gold bar on the tile). When you select one of those tiles, the hint shows what you would wait on, and a **Declare ready (+1 tai)** button appears.

The "tiles left" count only subtracts tiles everyone can see: all players' discards and exposed melds. Your own concealed tiles are not counted.

After you declare ready, your hand is locked:

- the server discards each drawn tile for you;
- you can only choose to win (or pass) on other players' discards;
- if a drawn tile completes your hand, play pauses so you can choose self-draw or throw that tile.

### Calls

When the snapshot contains a `prompt`, the reaction card shows Pass and one button per legal call, with a countdown to the server deadline. A chow button shows the three tiles it would make, with the claimed tile highlighted, so players can tell several chow options apart.

## Avatars (`src/online/avatars.ts`)

There are eight original chibi avatars, drawn as parametric SVG: hair colour and style, eye colour and one accessory each. Every avatar has two moods:

- `happy`: used in the lobby, next to names on the table and for winners.
- `shock`: wide eyes, tears and a sweat drop, used for players who lose.

Players choose an avatar on the start screen (remembered in `localStorage`) and can change it in the lobby. Avatars already taken in the room are greyed out and show who has them.

When a hand is won, the cut-in shows each winner's avatar on a slanted banner. Below it, it shows the shocked avatar of every player who pays: the discarder on a discard win, or all three other players on a self-draw.

## Feedback

- `feedbackForSnapshot` compares the previous and next snapshot. It plays a sound and vibrates when a tile is drawn or discarded, a call or win happens, or a prompt appears, and it shows a big centred character (吃 / 碰 / 槓 / 胡 / 聽) briefly.
- `src/web/sound.ts` synthesizes every sound with the Web Audio API, so there are no audio files.
- Vibration uses `navigator.vibrate`, which iOS Safari ignores.
- Sound and haptics settings are saved in `localStorage`.

## Tile faces (`src/web/tileView.ts`)

Each tile face is an inline SVG: circles for dots, sticks for bamboo, Chinese numerals with 萬 for characters, and large characters for honors and flowers. The game needs no image files and works offline as a PWA.

## Languages (`src/online/i18n.ts`)

The UI is available in Traditional Chinese and English.

- **Choosing the language**: the first visit follows the browser language. The 中文 / EN button switches it, and the choice is saved in `localStorage` under `tw-mj-lang`. The home page reads the same key.
- **UI text**: every string goes through `t(key, vars)`, with both languages kept side by side in one dictionary.
- **Text from the server**: errors, hand labels such as `東1局`, scoring item names and default AI names are in Chinese (or English, for engine errors). `serverText`, `roundText`, `scoreLabel` and `playerName` translate them on the client, so the server and the saved data stay language-neutral.
- **Tile names**: `tileName` gives English names such as `5 Dot`, `East` and `Red Dragon`. The tile faces stay traditional.

## Connection handling

- `connect()` opens `ws(s)://<host>/ws` and sends `HELLO` with the `clientId` saved in `localStorage`.
- If the connection drops, it retries every 3 seconds. It also reconnects when the browser comes back online or the tab becomes visible again.

## PWA

- `manifest.webmanifest` and `sw.js` make the game installable.
- The service worker uses network first and falls back to its cache, so updates arrive right away and the app shell still opens offline.
- When cached files change, bump `CACHE` in `sw.js`.
