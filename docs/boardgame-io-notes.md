# boardgame.io v0.50.2 Notes for MyUNO

Hard-won knowledge from building the UNO game. Read this before
touching game.js, main.jsx, or server.js -- the code alone won't
tell you why things are written the way they are.

## The Move Signature Bug (THE Root Cause)

boardgame.io v0.50.2 calls every move function like this internally:

    const context = { ...GetAPIs(state), G: state.G, ctx: state.ctx, playerID };
    return fn(context, ...args);

The FIRST ARGUMENT is a single context object `{ G, ctx, playerID, events, random, ... }`.
It is NOT `(G, ctx)`. If you write `playCard: (G, ctx, cardId) => { ... }`, then:
  - `G` is the whole context object (not game state)
  - `ctx` is `cardId` (the first user arg)
  - `G.hands` is undefined, `ctx.currentPlayer` is undefined

Every move silently fails. No error in console. `_stateID` stays 0.
Immer swallows the TypeError internally.

CORRECT: `playCard: ({ G, ctx, playerID, events }, cardId, chosenColor) => { ... }`
WRONG:   `playCard: (G, ctx, cardId, chosenColor) => { ... }`

Same applies to `setup`, `endIf`, and all hooks -- all receive the
destructured context object as the first argument.

## Immer: In-Place Mutation Works

The ImmerPlugin wraps moves with `produce(context.G, (G) => { move({ ...context, G }, ...args) })`.
You CAN mutate G in place (splice, push, assign). You do NOT need to
return a new G object. Both approaches work, but mutation is simpler
for card games where you're constantly splicing arrays.

## events.endTurn() -- Not ctx.events.endTurn()

`events` is a top-level property of the context object. It is NOT
on `ctx`. Access flow events as `events.endTurn()`, `events.setPhase()`, etc.

## turn.maxMoves -- Don't Set It

We omit `maxMoves` from the turn config. If you set `maxMoves: 1`,
the turn auto-ends after ANY move, including `sayUno` which should
NOT end the turn. Our moves call `events.endTurn()` manually when
appropriate (after playing a card, after drawing, after passing).

The tic-tac-toe example uses `maxMoves: 1` because every move ends
the turn. Our game has non-turn-ending moves (sayUno), so we can't.

## Bot Gets Stuck If Draw Doesn't End Turn

The bot plays exactly ONE move per state change. If `drawCard`
doesn't call `events.endTurn()`, the bot draws a card and then
gets stuck -- it's still the current player but the chain stops
because no further state change triggers another bot move.

FIX: `drawCard` calls `events.endTurn()` after drawing. This is
the "draw-and-pass" simplification: you draw a card and your turn
ends automatically. No separate "Pass" button needed.

A more complex flow (draw-then-play-if-playable) would require
phases/stages, which complicate v0.50 local mode. Not worth it
for a simple UNO implementation.

## Bot Imports

- `RandomBot`, `MCTSBot` are exported from `boardgame.io` (main module)
- `Bot` (base class) is NOT exported from the ES module
- `Local` is exported from `boardgame.io/multiplayer`
- To make a custom bot, extend `RandomBot` (which extends `Bot`)
- The custom `UnoBot` in `uno-bot.js` does this

## Local() Multiplayer vs Plain Local Mode

Two modes, opposite isActive behavior:

PLAIN LOCAL (no multiplayer option):
  - `isActive` may be false even on your turn
  - Fallback needed: `isMyTurn = isActive || currentPlayer === pid`
  - Player perspective follows the current turn (hot-seat)

LOCAL() MULTIPLAYER (with bots):
  - `isActive` is true ONLY when it's your turn
  - No fallback -- use `isMyTurn = isActive || false`
  - With `playerID="0"`, you always see Player 0's hand
  - Bot plays automatically when it's the bot's turn

We use Local() multiplayer for single-player mode because it gives
proper perspective (you always see your hand) and the bot works.

## playerID String vs Int

`playerID` arrives as a STRING ("0", "1") from boardgame.io.
`G.hands` keys are INTEGERS (set during setup with `hands[0] = [...]`).
`G.hands["0"]` returns undefined in JavaScript.

Always `parseInt(playerID)` before indexing into hands.

In the opponents loop, compare `i === pid` (int to int), NOT
`i === playerID` (int to string -- 0 !== "0", so Player 0 shows
as your own opponent).

## Multiplayer Server Setup

### ESM Import Fix
`import { Server } from 'boardgame.io/server'` fails with
`ERR_UNSUPPORTED_DIR_IMPORT` when package.json has `"type": "module"`.
Use: `import { Server } from 'boardgame.io/dist/cjs/server.js'`

### CORS Origins Required
Since boardgame.io@0.45, CORS is NOT enabled by default. You MUST
pass `origins` to the Server config. Without it, the Lobby's fetch
requests fail silently with "Failed to fetch" (no CORS headers, browser
blocks the response).

We use `origins: ['http://localhost:3000', 'http://127.0.0.1:3000',
'http://beleg:3000', 'http://localhost:8001', 'http://beleg:8001']`.

### Port 8001 (Not 8000)
Port 8000 is used by OCManager (uvicorn). We use 8001 for the UNO server.

### Dynamic Server URL
The lobby uses `window.location.hostname` to build the server URL
dynamically. If you access the page from `http://beleg:3000`, the
lobby talks to `http://beleg:8001`. If from `http://localhost:3000`,
it talks to `http://localhost:8001`. This avoids CORS mismatches.

### minPlayers/maxPlayers
The Lobby's create-match form needs `minPlayers` and `maxPlayers` on
the game config to show player count options in the dropdown.

## Mode Toggle

The page has a fixed toggle in the top-right corner: "vs Bot" (red)
and "Multiplayer" (green). URL `?mode=lobby` also works but the button
is the primary interface. Without `?`, `mode=lobby` is a path not a
query param and silently loads single-player mode.

## Debugging Game State

Access the game state through React's fiber tree (browser console):

    var root = document.getElementById('root');
    var key = Object.keys(root).find(k => k.startsWith('__reactContainer'));
    // Walk fiber tree looking for memoizedProps.G and memoizedProps.ctx

Check if `_stateID` increments after a move. If it doesn't, the move
was rejected or threw internally. This is the primary diagnostic for
"moves not working" issues.

## Version Mismatch

package.json says `^0.51.0` but 0.50.2 is installed. npm reports this
as invalid. It works fine -- the API is the same for our purposes.
Don't bother upgrading unless there's a specific v0.51 feature needed.

## Files Changed (This Session)

- `src/game.js` -- Move signatures fixed to destructured `{ G, ctx, playerID, events }`.
  Added `minPlayers`/`maxPlayers`. Added `ai.enumerate`. `drawCard` now ends turn.
- `src/board.jsx` -- `isActive` only (no fallback). `parseInt(playerID)` for opponents loop.
  Removed Pass button. Doubled hand card size (120x168px).
- `src/uno-bot.js` -- Custom bot extending RandomBot. Prefers action cards, saves wilds,
  picks best color for wilds.
- `src/main.jsx` -- Local() multiplayer with UnoBot for single-player. Lobby mode for
  multiplayer. Mode toggle UI. Dynamic server URL.
- `src/server/server.js` -- Fixed ESM import. Port 8001. CORS origins. Added beleg hostname.
- `Makefile` -- Updated port comment to 8001.
- `README.md` -- Multiplayer instructions.